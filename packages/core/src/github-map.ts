import type { KnownPerson } from './people';
import type { GithubRepo, PullRequest, ReviewState, Role, Task } from './types';

/**
 * GitHub, mapped: raw API shapes in, records out, no I/O.
 *
 * The sync on the server fetches; everything that decides what a pull request
 * *means* — which task it is for, whether it is waiting on a review or on its
 * author, who is an approver — lives here, under tests, the way Notion's
 * mapping does in notion-map.ts.
 */

/* ------------------------------------------------------------------ */
/* Raw API shapes, only the fields the mapping reads                    */
/* ------------------------------------------------------------------ */

export interface GithubUserRef {
  login: string;
  /** "User", "Bot", "Organization". */
  type?: string;
}

export interface GithubRepoSummary {
  id: number;
  name: string;
  full_name: string;
  owner: { login: string };
  default_branch: string;
  private: boolean;
  pushed_at: string | null;
  archived?: boolean;
}

export interface GithubPull {
  id: number;
  number: number;
  title: string;
  body: string | null;
  html_url: string;
  state: 'open' | 'closed';
  draft: boolean;
  user: GithubUserRef;
  created_at: string;
  updated_at: string;
  merged_at: string | null;
  closed_at: string | null;
  base: { ref: string };
  head: { ref: string; sha: string };
  requested_reviewers?: GithubUserRef[];
}

export interface GithubReview {
  id: number;
  user: GithubUserRef;
  state: 'APPROVED' | 'CHANGES_REQUESTED' | 'COMMENTED' | 'DISMISSED' | 'PENDING';
  submitted_at: string | null;
}

export interface GithubComment {
  id: number;
  user: GithubUserRef;
  created_at: string;
}

/* ------------------------------------------------------------------ */
/* Defaults                                                             */
/* ------------------------------------------------------------------ */

/** What "development finished, a pull request is owed" looks like in ADITUM's Notion. */
export const DEFAULT_FINISHED_STATUSES: readonly string[] = [
  'Pruebas - Desarrollo',
  'Revisión Tecnica',
  'Pruebas QA',
  'Lista para deploy',
  'Desarrollo realizado',
];

/** The roles whose holders approve, when nobody configured it: the one called CTO. */
export function defaultApproverRoleIds(roles: Pick<Role, 'id' | 'name'>[]): string[] {
  return roles.filter((r) => /^cto$/i.test(r.name.trim())).map((r) => r.id);
}

/* ------------------------------------------------------------------ */
/* Identity                                                             */
/* ------------------------------------------------------------------ */

export function githubDocId(repoId: string, number: number): string {
  return `gh_${repoId}_${number}`;
}

/** Copilot and friends review too; none of it is a person's word. */
export function isBot(user: GithubUserRef | null | undefined): boolean {
  if (!user) return true;
  return user.type === 'Bot' || /\[bot\]$/i.test(user.login);
}

/**
 * The task code a pull request names, from its branch first — `feature/TAR-966`
 * is how ADITUM branches — then its title ("TAR-966 | …"), then its body.
 */
export function taskCodeFrom(...texts: (string | null | undefined)[]): string | null {
  for (const text of texts) {
    const match = text?.match(/\bTAR-?(\d+)\b/i);
    if (match) return `TAR-${match[1]}`;
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Review state                                                         */
/* ------------------------------------------------------------------ */

export interface ReviewVerdict {
  state: ReviewState;
  /** When the deciding review was submitted. */
  at: string | null;
  /** Who submitted it. */
  by: string | null;
}

/**
 * What the reviews add up to, GitHub's way: each reviewer's latest decisive
 * review counts (a comment after an approval leaves the approval standing, a
 * dismissal clears it); any request for changes outweighs any approval. The
 * author's own reviews and bots' are not reviews.
 */
export function reviewStateFrom(reviews: GithubReview[], authorLogin: string): ReviewVerdict {
  const latest = new Map<string, { state: 'APPROVED' | 'CHANGES_REQUESTED'; at: string }>();
  let commentedAt: { at: string; by: string } | null = null;
  const sorted = [...reviews]
    .filter((r) => r.submitted_at && !isBot(r.user) && r.user.login.toLowerCase() !== authorLogin.toLowerCase())
    .sort((a, b) => (a.submitted_at as string).localeCompare(b.submitted_at as string));
  for (const review of sorted) {
    const login = review.user.login.toLowerCase();
    const at = review.submitted_at as string;
    if (review.state === 'APPROVED' || review.state === 'CHANGES_REQUESTED') {
      latest.set(login, { state: review.state, at });
    } else if (review.state === 'DISMISSED') {
      latest.delete(login);
    } else if (review.state === 'COMMENTED') {
      commentedAt = { at, by: login };
    }
  }
  const decisive = [...latest.entries()];
  const changes = decisive.filter(([, v]) => v.state === 'CHANGES_REQUESTED').sort((a, b) => b[1].at.localeCompare(a[1].at))[0];
  if (changes) return { state: 'changes_requested', at: changes[1].at, by: changes[0] };
  const approved = decisive.filter(([, v]) => v.state === 'APPROVED').sort((a, b) => b[1].at.localeCompare(a[1].at))[0];
  if (approved) return { state: 'approved', at: approved[1].at, by: approved[0] };
  if (commentedAt) return { state: 'commented', at: commentedAt.at, by: commentedAt.by };
  return { state: 'none', at: null, by: null };
}

/* ------------------------------------------------------------------ */
/* Pull request → record                                                */
/* ------------------------------------------------------------------ */

export interface PullExtras {
  reviews: GithubReview[];
  /** When the head commit was made, when known. */
  headCommitAt: string | null;
  /** The author's latest comment on the pull request, when known. */
  authorCommentAt: string | null;
}

export interface PullMapContext {
  companyId: string;
  /** Open and closed tasks by code, so a branch resolves to a task and its project. */
  tasksByCode: Map<string, Pick<Task, 'id' | 'projectId'>>;
  /** Team member id per GitHub login, lowercased, for everybody the sync could match. */
  userIdByLogin: Map<string, string>;
  now: string;
}

export function pullToRecord(
  pull: GithubPull,
  extras: PullExtras,
  repo: Pick<GithubRepo, 'id' | 'projectId'>,
  ctx: PullMapContext,
): { record: PullRequest; unmatchedLogins: string[] } {
  const unmatched = new Set<string>();
  const resolve = (login: string): string | null => {
    const id = ctx.userIdByLogin.get(login.toLowerCase()) ?? null;
    if (!id) unmatched.add(login);
    return id;
  };

  const authorLogin = pull.user.login;
  const authorUserId = isBot(pull.user) ? null : resolve(authorLogin);

  const verdict = reviewStateFrom(extras.reviews, authorLogin);
  const reviewerLogins = [
    ...new Set(
      [
        ...(pull.requested_reviewers ?? []).filter((u) => !isBot(u)).map((u) => u.login),
        ...extras.reviews
          .filter((r) => !isBot(r.user) && r.user.login.toLowerCase() !== authorLogin.toLowerCase())
          .map((r) => r.user.login),
      ],
    ),
  ];
  const reviewerUserIds = [...new Set(reviewerLogins.map(resolve).filter((id): id is string => Boolean(id)))];

  const taskCode = taskCodeFrom(pull.head.ref, pull.title, pull.body);
  const task = taskCode ? ctx.tasksByCode.get(taskCode) : undefined;

  const lastPushAt = extras.headCommitAt;
  const lastAuthorActivityAt = [lastPushAt, extras.authorCommentAt]
    .filter((v): v is string => Boolean(v))
    .sort()
    .pop() ?? null;

  const record: PullRequest = {
    id: githubDocId(repo.id, pull.number),
    companyId: ctx.companyId,
    repoId: repo.id,
    number: pull.number,
    title: pull.title.trim(),
    url: pull.html_url,
    state: pull.merged_at ? 'merged' : pull.state === 'closed' ? 'closed' : 'open',
    draft: Boolean(pull.draft),
    baseRef: pull.base.ref,
    headRef: pull.head.ref,
    authorLogin,
    authorUserId,
    reviewerLogins,
    reviewerUserIds,
    peopleUserIds: [...new Set([authorUserId, ...reviewerUserIds].filter((id): id is string => Boolean(id)))],
    createdAt: pull.created_at,
    updatedAt: pull.updated_at,
    mergedAt: pull.merged_at,
    closedAt: pull.closed_at,
    lastPushAt,
    reviewState: verdict.state,
    lastReviewAt: verdict.at,
    lastReviewBy: verdict.by ? (ctx.userIdByLogin.get(verdict.by) ?? null) : null,
    lastAuthorActivityAt,
    taskCode,
    taskId: task?.id ?? null,
    projectId: task?.projectId ?? repo.projectId ?? null,
    syncedAt: ctx.now,
  };
  return { record, unmatchedLogins: [...unmatched] };
}

/** The people a set of pull requests names, for `knownPeople`-style lookups. */
export function loginsOn(pulls: GithubPull[], reviews: Map<number, GithubReview[]>): string[] {
  const logins = new Set<string>();
  for (const pull of pulls) {
    if (!isBot(pull.user)) logins.add(pull.user.login);
    for (const u of pull.requested_reviewers ?? []) if (!isBot(u)) logins.add(u.login);
    for (const r of reviews.get(pull.number) ?? []) if (!isBot(r.user)) logins.add(r.user.login);
  }
  return [...logins];
}

export type { KnownPerson };
