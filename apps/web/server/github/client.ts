import 'server-only';

import type { GithubComment, GithubPull, GithubRepoSummary, GithubReview } from '@truenorth/core';

/**
 * A thin client for the GitHub REST API. Plain `fetch`, like the Notion one:
 * the sync makes a handful of calls, and the shapes it reads are typed in
 * @truenorth/core so the mapping runs under tests.
 *
 * One token per server, from the environment — a personal token of the
 * account that owns ADITUM's repositories. GitHub allows 5 000 requests an
 * hour with it; the client keeps a gap between calls and, when the limit is
 * hit anyway, sleeps until the window resets rather than failing the run.
 */

export const GITHUB_API_VERSION = '2022-11-28';
const BASE = 'https://api.github.com';
const MIN_GAP_MS = 120;
const RETRIES = 3;
/** Never sleep longer than this on a rate-limit reset; the timer will come back. */
const MAX_RESET_WAIT_MS = 120_000;

export class GithubError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
  ) {
    super(message);
    this.name = 'GithubError';
  }
}

/** Whether the server can talk to GitHub at all. */
export function githubConfigured(): { ok: boolean; detail: string } {
  return process.env.GITHUB_TOKEN
    ? { ok: true, detail: 'GITHUB_TOKEN is set' }
    : {
        ok: false,
        detail:
          'GITHUB_TOKEN is not set. Create a personal access token with read access to pull requests and put it in /etc/truenorth/env.',
      };
}

interface PageResult<T> {
  items: T[];
  next: string | null;
}

export class GithubClient {
  private lastStart = 0;
  private readonly userCache = new Map<string, { login: string; name: string | null }>();

  constructor(private readonly token: string = process.env.GITHUB_TOKEN ?? '') {
    if (!this.token) throw new GithubError(githubConfigured().detail, 0, 'github_not_configured');
  }

  private async throttle(): Promise<void> {
    const wait = this.lastStart + MIN_GAP_MS - Date.now();
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    this.lastStart = Date.now();
  }

  private async fetchPage<T>(url: string, attempt = 1): Promise<PageResult<T>> {
    await this.throttle();
    const response = await fetch(url, {
      headers: {
        authorization: `Bearer ${this.token}`,
        accept: 'application/vnd.github+json',
        'x-github-api-version': GITHUB_API_VERSION,
        'user-agent': 'truenorth-pi',
      },
    });

    if (response.ok) {
      const items = (await response.json()) as T[];
      const link = response.headers.get('link') ?? '';
      const next = link.match(/<([^>]+)>;\s*rel="next"/)?.[1] ?? null;
      return { items, next };
    }

    const body = (await response.json().catch(() => ({}))) as { message?: string };
    const remaining = Number(response.headers.get('x-ratelimit-remaining'));
    const limited = response.status === 429 || (response.status === 403 && remaining === 0);
    const retryable = limited || response.status >= 500;
    if (retryable && attempt < RETRIES) {
      let delay = 1000 * 2 ** attempt;
      if (limited) {
        const reset = Number(response.headers.get('x-ratelimit-reset')) * 1000;
        if (Number.isFinite(reset) && reset > Date.now()) delay = Math.min(reset - Date.now() + 1000, MAX_RESET_WAIT_MS);
        const after = Number(response.headers.get('retry-after'));
        if (Number.isFinite(after) && after > 0) delay = Math.min(after * 1000, MAX_RESET_WAIT_MS);
      }
      await new Promise((resolve) => setTimeout(resolve, delay));
      return this.fetchPage<T>(url, attempt + 1);
    }
    throw new GithubError(body.message ?? `GitHub ${response.status} on ${url.slice(BASE.length)}`, response.status);
  }

  private async one<T>(path: string): Promise<T> {
    const page = await this.fetchPage<T>(`${BASE}${path}`);
    return page.items as unknown as T;
  }

  /** Every page, following the `Link` header, until `stop` says the rest is not needed. */
  private async all<T>(path: string, stop?: (items: T[]) => boolean): Promise<T[]> {
    const out: T[] = [];
    let url: string | null = `${BASE}${path}`;
    while (url) {
      const page: PageResult<T> = await this.fetchPage<T>(url);
      out.push(...page.items);
      if (stop && stop(page.items)) break;
      url = page.next;
    }
    return out;
  }

  /** Whose token this is. */
  me(): Promise<{ login: string; name: string | null }> {
    return this.one<{ login: string; name: string | null }>('/user');
  }

  /** Every repository the token can see, most recently pushed first. */
  repos(): Promise<GithubRepoSummary[]> {
    return this.all<GithubRepoSummary>(
      '/user/repos?affiliation=owner,collaborator,organization_member&sort=pushed&direction=desc&per_page=100',
    );
  }

  /**
   * Pull requests of a repository, most recently updated first, stopping at the
   * first page whose last item is older than `since`.
   */
  pulls(owner: string, name: string, since: string | null): Promise<GithubPull[]> {
    return this.all<GithubPull>(
      `/repos/${owner}/${name}/pulls?state=all&sort=updated&direction=desc&per_page=100`,
      (items) => {
        const last = items[items.length - 1];
        return Boolean(since && last && last.updated_at < since);
      },
    );
  }

  reviews(owner: string, name: string, number: number): Promise<GithubReview[]> {
    return this.all<GithubReview>(`/repos/${owner}/${name}/pulls/${number}/reviews?per_page=100`);
  }

  /** When a commit was made — the head commit's date is when the author last pushed. */
  async commitDate(owner: string, name: string, sha: string): Promise<string | null> {
    try {
      const commit = await this.one<{ commit: { committer?: { date?: string }; author?: { date?: string } } }>(
        `/repos/${owner}/${name}/commits/${sha}`,
      );
      return commit.commit.committer?.date ?? commit.commit.author?.date ?? null;
    } catch (cause) {
      if (cause instanceof GithubError && cause.status === 404) return null;
      throw cause;
    }
  }

  /** Conversation comments plus review-thread comments, together. */
  async comments(owner: string, name: string, number: number): Promise<GithubComment[]> {
    const [issue, review] = await Promise.all([
      this.all<GithubComment>(`/repos/${owner}/${name}/issues/${number}/comments?per_page=100`),
      this.all<GithubComment>(`/repos/${owner}/${name}/pulls/${number}/comments?per_page=100`),
    ]);
    return [...issue, ...review];
  }

  /** A user's profile name, for matching a login nobody claimed. Cached per client. */
  async user(login: string): Promise<{ login: string; name: string | null }> {
    const key = login.toLowerCase();
    const cached = this.userCache.get(key);
    if (cached) return cached;
    const user = await this.one<{ login: string; name: string | null }>(`/users/${encodeURIComponent(login)}`);
    this.userCache.set(key, user);
    return user;
  }
}
