import 'server-only';

import type { NotionComment, NotionPage, NotionUser } from '@truenorth/core';

/**
 * A thin client for the Notion API. Plain `fetch`, no SDK: the handful of
 * calls the sync makes are easier to read than a dependency, and the shapes
 * we consume are typed in @truenorth/core so the mapping runs under tests.
 *
 * Pinned to the 2025-09-03 version, the one with *data sources*: a database
 * is a container, and what is queried is the data source inside it. The older
 * version queried the database directly and breaks the day a database gains
 * a second data source.
 */

export const NOTION_VERSION = '2025-09-03';
const BASE = 'https://api.notion.com/v1';

/** Notion allows about three requests a second; this keeps a little under. */
const MIN_GAP_MS = 340;
const RETRIES = 3;

export interface NotionDatabase {
  id: string;
  title: { plain_text: string }[];
  data_sources: { id: string; name: string }[];
}

/** A data source object: the schema of a table, keyed by property name. */
export interface NotionDataSource {
  id: string;
  name?: string;
  title?: { plain_text: string }[];
  properties: Record<string, NotionRawProperty>;
}

export interface NotionRawProperty {
  id: string;
  name: string;
  type: string;
  status?: {
    options: { id: string; name: string }[];
    groups: { id: string; name: string; option_ids: string[] }[];
  };
  select?: { options: { id: string; name: string }[] };
  number?: { format?: string };
  rollup?: { function?: string };
  relation?: { data_source_id?: string; database_id?: string };
}

export interface QueryBody {
  filter?: unknown;
  sorts?: unknown[];
  page_size?: number;
  start_cursor?: string;
}

interface Page<T> {
  results: T[];
  has_more: boolean;
  next_cursor: string | null;
}

export class NotionError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
  ) {
    super(message);
    this.name = 'NotionError';
  }
}

/** Whether the server can talk to Notion at all. */
export function notionConfigured(): { ok: boolean; detail: string } {
  return process.env.NOTION_TOKEN
    ? { ok: true, detail: 'NOTION_TOKEN is set' }
    : {
        ok: false,
        detail:
          'NOTION_TOKEN is not set. Create an internal integration at notion.so/my-integrations, share each database with it, and put the secret in /etc/truenorth/env.',
      };
}

export class NotionClient {
  private lastStart = 0;

  constructor(private readonly token: string = process.env.NOTION_TOKEN ?? '') {
    if (!this.token) throw new NotionError(notionConfigured().detail, 0, 'notion_not_configured');
  }

  private async throttle(): Promise<void> {
    const wait = this.lastStart + MIN_GAP_MS - Date.now();
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    this.lastStart = Date.now();
  }

  private async request<T>(path: string, init: RequestInit = {}, attempt = 1): Promise<T> {
    await this.throttle();
    const response = await fetch(`${BASE}${path}`, {
      ...init,
      headers: {
        authorization: `Bearer ${this.token}`,
        'notion-version': NOTION_VERSION,
        'content-type': 'application/json',
        ...(init.headers ?? {}),
      },
    });

    if (response.ok) return (await response.json()) as T;

    const body = (await response.json().catch(() => ({}))) as { message?: string; code?: string };
    const retryable = response.status === 429 || response.status >= 500;
    if (retryable && attempt < RETRIES) {
      const after = Number(response.headers.get('retry-after'));
      const delay = Number.isFinite(after) && after > 0 ? after * 1000 : 1000 * 2 ** attempt;
      await new Promise((resolve) => setTimeout(resolve, delay));
      return this.request<T>(path, init, attempt + 1);
    }
    throw new NotionError(
      body.message ?? `Notion ${response.status} on ${path}`,
      response.status,
      body.code,
    );
  }

  private async paginate<T>(
    fetchPage: (cursor: string | undefined) => Promise<Page<T>>,
    onPage?: (items: T[]) => Promise<void> | void,
  ): Promise<T[]> {
    const all: T[] = [];
    let cursor: string | undefined;
    do {
      const page = await fetchPage(cursor);
      all.push(...page.results);
      if (onPage) await onPage(page.results);
      cursor = page.has_more && page.next_cursor ? page.next_cursor : undefined;
    } while (cursor);
    return all;
  }

  database(id: string): Promise<NotionDatabase> {
    return this.request<NotionDatabase>(`/databases/${id}`);
  }

  dataSource(id: string): Promise<NotionDataSource> {
    return this.request<NotionDataSource>(`/data_sources/${id}`);
  }

  /** Every page of a query, following the cursor. */
  queryAll(dataSourceId: string, body: QueryBody = {}): Promise<NotionPage[]> {
    return this.paginate<NotionPage>((cursor) =>
      this.request<Page<NotionPage>>(`/data_sources/${dataSourceId}/query`, {
        method: 'POST',
        body: JSON.stringify({ page_size: 100, ...body, ...(cursor ? { start_cursor: cursor } : {}) }),
      }),
    );
  }

  /** The unresolved comments on a page. Resolved ones are not returned by the API. */
  comments(pageId: string): Promise<NotionComment[]> {
    return this.paginate<NotionComment>((cursor) =>
      this.request<Page<NotionComment>>(
        `/comments?block_id=${pageId}&page_size=100${cursor ? `&start_cursor=${cursor}` : ''}`,
      ),
    );
  }

  /** Everybody in the workspace, so a comment author's id becomes a name. */
  users(): Promise<NotionUser[]> {
    return this.paginate<NotionUser>((cursor) =>
      this.request<Page<NotionUser>>(`/users?page_size=100${cursor ? `&start_cursor=${cursor}` : ''}`),
    );
  }
}
