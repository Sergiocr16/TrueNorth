import type { NotionSchema, NotionSourceKind, SuggestedSource } from '@truenorth/core';

/**
 * Shapes shared by the Notion routes and the store. Types only: this file is
 * imported by the browser for its types and must never pull in server code.
 */

/** What `POST /api/notion/inspect` returns. */
export interface InspectResult {
  databaseId: string;
  dataSourceId: string;
  title: string;
  /** Every data source in the database; the first is used unless one is named. */
  dataSources: { id: string; name: string }[];
  schema: NotionSchema;
  suggested: SuggestedSource;
  kind: NotionSourceKind;
}

/** What one source's sync did, or why it did not. */
export interface SyncReport {
  sourceId: string;
  title: string;
  mode: 'incremental' | 'full' | 'skipped';
  pages: number;
  written: number;
  deleted: number;
  peopleCreated: number;
  commentsFetched: number;
  error?: string;
  durationMs: number;
}
