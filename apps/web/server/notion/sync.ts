import 'server-only';

import type { DocumentReference, WriteBatch } from 'firebase-admin/firestore';
import {
  flattenComments,
  knownPeople,
  notionDocId,
  pageToProject,
  pageToTask,
  type KnownPerson,
  type NotionPage,
  type NotionPerson,
  type NotionSource,
  type NotionUser,
  type Project,
  type Task,
} from '@truenorth/core';
import { adminDb } from '../admin';
import { NotionClient, NotionError } from './client';
import type { SyncReport } from './types';

/**
 * The Notion sync: every registered source, pages in, records out.
 *
 * Deterministic and boring on purpose. The mapping is a pure function in
 * @truenorth/core; this file only decides *which* pages to read, resolves the
 * people, fetches the comments, and writes. Claude is nowhere near it
 * (ADR-004).
 *
 * Three facts shape the design. Notion keeps no status history, so the clock
 * behind "this has not moved" is stamped here when a label differs from the
 * stored one. A comment does not bump its page's `last_edited_time`, so
 * comments are refreshed on their own schedule rather than with the page. And
 * a page that was archived or deleted is not returned by a query at all, so
 * every run reads the whole source and treats absence as removal — only the
 * writing is incremental.
 */

/** Re-map and rewrite every page, not only the changed ones, at least this often. */
const FULL_SYNC_EVERY_DAYS = 7;
/** Overlap on the incremental window: Notion's timestamps are minute-grained. */
const OVERLAP_MS = 5 * 60_000;
/** Comment fetches per source per run. Beyond this, the rest waits a day. */
const COMMENTS_PER_RUN = 150;
/** Comments kept on the task document. The follow-up quotes the last one. */
const COMMENTS_KEPT = 5;
const BATCH = 400;

export interface SyncOptions {
  /** Read everything, not only what changed since the last run. */
  full?: boolean;
  /** Only this source. */
  only?: string;
}

interface Store {
  tasks: Map<string, Task>;
  projects: Map<string, Project>;
}

function isoNow(): string {
  return new Date().toISOString();
}

/** Writes in chunks: a batch holds 500 operations, and a big table has more. */
class Writer {
  private batch: WriteBatch;
  private count = 0;
  written = 0;
  deleted = 0;

  constructor(private readonly db = adminDb()) {
    this.batch = db.batch();
  }

  private async tick(): Promise<void> {
    this.count += 1;
    if (this.count >= BATCH) await this.flush();
  }

  async set(ref: DocumentReference, data: object): Promise<void> {
    this.batch.set(ref, data);
    this.written += 1;
    await this.tick();
  }

  async update(ref: DocumentReference, data: object): Promise<void> {
    this.batch.update(ref, data);
    await this.tick();
  }

  async delete(ref: DocumentReference): Promise<void> {
    this.batch.delete(ref);
    this.deleted += 1;
    await this.tick();
  }

  async flush(): Promise<void> {
    if (this.count === 0) return;
    await this.batch.commit();
    this.batch = this.db.batch();
    this.count = 0;
  }
}

/** Every source of a company, projects first so task relations resolve. */
async function loadSources(companyId: string, only?: string): Promise<NotionSource[]> {
  const snap = await adminDb().collection('companies').doc(companyId).collection('notionSources').get();
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }) as NotionSource)
    .filter((s) => !only || s.id === only)
    .sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'projects' ? -1 : 1));
}

/** What the sync already holds, by id, so change is detectable. */
async function loadStore(companyId: string): Promise<Store> {
  const base = adminDb().collection('companies').doc(companyId);
  const [tasks, projects] = await Promise.all([
    base.collection('tasks').where('source', '==', 'notion').get(),
    base.collection('projects').where('source', '==', 'notion').get(),
  ]);
  return {
    tasks: new Map(tasks.docs.map((d) => [d.id, { id: d.id, ...d.data() } as Task])),
    projects: new Map(projects.docs.map((d) => [d.id, { id: d.id, ...d.data() } as Project])),
  };
}

interface MemberRow {
  id: string;
  displayName: string;
  notionUserId?: string;
}

async function loadMembers(companyId: string): Promise<MemberRow[]> {
  const snap = await adminDb().collection('companies').doc(companyId).collection('members').get();
  return snap.docs.map((d) => {
    const m = d.data() as { displayName?: string; notionUserId?: string };
    return { id: d.id, displayName: m.displayName ?? '', notionUserId: m.notionUserId };
  });
}

function initialsFrom(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

/**
 * People Notion names that the team does not have. Each becomes a person on
 * the team without an account (ADR-006): the team populates itself, and the
 * manager's only job is to write what they expect of each one. Deterministic
 * ids make this idempotent across runs.
 */
async function createPeople(
  companyId: string,
  unmatched: NotionPerson[],
  writer: Writer,
): Promise<MemberRow[]> {
  const base = adminDb().collection('companies').doc(companyId);
  const created: MemberRow[] = [];
  const seen = new Set<string>();
  for (const person of unmatched) {
    if (!person.id || seen.has(person.id) || !person.name?.trim()) continue;
    seen.add(person.id);
    const id = `p_n${person.id.replace(/-/g, '').slice(0, 12)}`;
    await writer.set(base.collection('members').doc(id), {
      displayName: person.name.trim(),
      email: person.person?.email ?? '',
      initials: initialsFrom(person.name),
      roleTitle: '',
      roleDescription: '',
      roleIds: [],
      activeRoleId: null,
      access: 'member',
      hasAccount: false,
      expectations: '',
      notionUserId: person.id,
    });
    created.push({ id, displayName: person.name.trim(), notionUserId: person.id });
  }
  return created;
}

function knownFrom(members: MemberRow[]): KnownPerson[] {
  return knownPeople(
    members.map((m) => ({
      id: m.id,
      displayName: m.displayName,
      email: '',
      initials: '',
      timezone: 'America/Costa_Rica',
      notifyHour: 6,
      locale: 'es',
      theme: 'system',
      reduceTransparency: false,
    })),
    members.map((m) => ({
      userId: m.id,
      companyId: '',
      roleTitle: '',
      roleDescription: '',
      roleIds: [],
      activeRoleId: null,
      access: 'member',
      hasAccount: false,
      expectations: '',
      notionUserId: m.notionUserId,
    })),
  );
}

/** Runs every source of a company. A source that fails does not stop the others. */
export async function syncCompany(companyId: string, options: SyncOptions = {}): Promise<SyncReport[]> {
  const sources = await loadSources(companyId, options.only);
  if (sources.length === 0) return [];

  let client: NotionClient;
  try {
    client = new NotionClient();
  } catch (cause) {
    const error = cause instanceof Error ? cause.message : String(cause);
    return sources.map((s) => ({
      sourceId: s.id,
      title: s.title,
      mode: 'skipped' as const,
      pages: 0,
      written: 0,
      deleted: 0,
      peopleCreated: 0,
      commentsFetched: 0,
      error,
      durationMs: 0,
    }));
  }

  const store = await loadStore(companyId);
  let members = await loadMembers(companyId);
  const users = await client.users().catch(() => [] as NotionUser[]);

  const reports: SyncReport[] = [];
  for (const source of sources) {
    const report = await syncSource(companyId, source, {
      client,
      store,
      members,
      users,
      full: Boolean(options.full),
    });
    members = report.members;
    reports.push(report.report);
  }

  // Records whose source is gone are nobody's now. Only when the whole
  // company ran: a single-source run must not judge the others.
  if (!options.only) {
    const known = new Set(sources.map((s) => s.id));
    const writer = new Writer();
    const base = adminDb().collection('companies').doc(companyId);
    for (const task of store.tasks.values()) {
      if (task.sourceId && !known.has(task.sourceId)) await writer.delete(base.collection('tasks').doc(task.id));
    }
    for (const project of store.projects.values()) {
      if (project.sourceId && !known.has(project.sourceId)) {
        await writer.delete(base.collection('projects').doc(project.id));
      }
    }
    await writer.flush();
  }

  await adminDb()
    .collection('companies')
    .doc(companyId)
    .collection('integrations')
    .doc('notion')
    .set(
      {
        lastSyncAt: isoNow(),
        lastError: reports.find((r) => r.error)?.error ?? null,
      },
      { merge: true },
    );

  return reports;
}

interface SourceContext {
  client: NotionClient;
  store: Store;
  members: MemberRow[];
  users: NotionUser[];
  full: boolean;
}

async function syncSource(
  companyId: string,
  source: NotionSource,
  ctx: SourceContext,
): Promise<{ report: SyncReport; members: MemberRow[] }> {
  const started = Date.now();
  const startedIso = new Date(started).toISOString();
  const base = adminDb().collection('companies').doc(companyId);
  const sourceRef = base.collection('notionSources').doc(source.id);
  const report: SyncReport = {
    sourceId: source.id,
    title: source.title,
    mode: 'incremental',
    pages: 0,
    written: 0,
    deleted: 0,
    peopleCreated: 0,
    commentsFetched: 0,
    durationMs: 0,
  };
  let members = ctx.members;

  try {
    // 1. Mode. Full when asked, when never done, when stale, or when the
    //    mapping changed — an old mapping's records are wrong, not outdated.
    const lastFull = source.lastFullSyncAt ? new Date(source.lastFullSyncAt).getTime() : 0;
    const full =
      ctx.full ||
      !source.lastSyncAt ||
      Date.now() - lastFull > FULL_SYNC_EVERY_DAYS * 86_400_000 ||
      source.mappingHash !== (source as { syncedMappingHash?: string }).syncedMappingHash;
    report.mode = full ? 'full' : 'incremental';

    // 2. The pages. Every run reads the whole source, with no filter on
    //    `last_edited_time`.
    //
    //    That filter used to be the incremental path, and it cannot see a
    //    removal: Notion does not return an archived or deleted page from a
    //    data source query at all — not even flagged as one — so asking "what
    //    changed since Tuesday" returns a list a removal can never appear in.
    //    Somebody archived a task, the run reported zero pages, and the task
    //    stayed on the board until the weekly full read noticed it was gone.
    //    Reading the ids is the cheap half of a sync anyway: a hundred pages
    //    per request, and what actually changed is still all that gets mapped,
    //    written and asked for comments.
    const since = source.lastSyncAt
      ? new Date(new Date(source.lastSyncAt).getTime() - OVERLAP_MS).toISOString()
      : null;
    const pages = await ctx.client.queryAll(source.dataSourceId, {
      sorts: [{ timestamp: 'last_edited_time', direction: 'ascending' }],
    });
    report.pages = pages.length;

    const writer = new Writer();
    // Whatever Notion still has. An archived page that some future API version
    // does return is not one of them, and step 5 removes it either way.
    const present = pages.filter((p) => !p.archived && !p.in_trash);
    const live =
      full || !since ? present : present.filter((page) => page.last_edited_time >= since);

    // 3. People first: a pass to find who Notion names that the team lacks,
    //    create them, and only then map for real so the batch's own new
    //    people are assigned.
    const projectIds = new Set(
      [...ctx.store.projects.values()].filter((p) => p.sourceId).map((p) => p.id),
    );
    const mapOnce = (people: KnownPerson[]) =>
      live.map((page) =>
        source.kind === 'projects'
          ? pageToProject(page, source, {
              companyId,
              people,
              previous: ctx.store.projects.get(notionDocId(page.id)),
              now: startedIso,
            })
          : pageToTask(page, source, {
              companyId,
              people,
              previous: ctx.store.tasks.get(notionDocId(page.id)),
              now: startedIso,
              projectIds,
            }),
      );

    const firstPass = mapOnce(knownFrom(members));
    const unmatched = firstPass.flatMap((r) => r.unmatched);
    if (unmatched.length > 0) {
      const created = await createPeople(companyId, unmatched, writer);
      report.peopleCreated = created.length;
      members = [...members, ...created];
    }
    // A member matched by name learns their Notion id, so the next match is exact.
    for (const page of live) {
      for (const person of peopleOn(page, source)) {
        const match = knownFrom(members).find((k) => !k.notionUserId && k.displayName && nameMatches(k, person));
        if (match) {
          await writer.update(base.collection('members').doc(match.id), { notionUserId: person.id });
          members = members.map((m) => (m.id === match.id ? { ...m, notionUserId: person.id } : m));
        }
      }
    }
    const mapped = mapOnce(knownFrom(members));

    // 4. Comments, for tasks: the pages in this batch plus every stored task
    //    of this source still in flight, because a new comment does not
    //    change the page. Capped, so a big backlog costs a minute, not ten.
    if (source.kind === 'tasks') {
      const people = knownFrom(members);
      const inBatch = new Set(mapped.map((r) => ('task' in r ? r.task.id : '')));
      const candidates: Task[] = [
        ...mapped.flatMap((r) => ('task' in r && r.task.status !== 'done' ? [r.task] : [])),
        ...[...ctx.store.tasks.values()].filter(
          (t) =>
            t.sourceId === source.id &&
            !inBatch.has(t.id) &&
            (t.status === 'in_progress' || t.status === 'blocked'),
        ),
      ].slice(0, COMMENTS_PER_RUN);

      for (const task of candidates) {
        if (!task.notionPageId) continue;
        const raw = await ctx.client.comments(task.notionPageId).catch(() => null);
        if (raw === null) continue;
        report.commentsFetched += 1;
        const comments = flattenComments(raw, people, ctx.users);
        const last = comments[comments.length - 1];
        const patch = {
          comments: comments.slice(-COMMENTS_KEPT),
          commentCount: comments.length,
          ...(last ? { lastCommentAt: last.createdAt, lastCommentBy: last.authorUserId } : {}),
        };
        const inThisBatch = mapped.find((r) => 'task' in r && r.task.id === task.id);
        if (inThisBatch && 'task' in inThisBatch) Object.assign(inThisBatch.task, patch);
        else await writer.update(base.collection('tasks').doc(task.id), patch);
      }
    }

    // 5. Write what changed, then remove what Notion no longer has.
    for (const result of mapped) {
      if ('task' in result) {
        const { id, ...rest } = result.task;
        await writer.set(base.collection('tasks').doc(id), rest);
        ctx.store.tasks.set(id, result.task);
      } else {
        const { id, ...rest } = result.project;
        await writer.set(base.collection('projects').doc(id), rest);
        ctx.store.projects.set(id, result.project);
      }
    }
    const collection = source.kind === 'projects' ? 'projects' : 'tasks';
    const stored = source.kind === 'projects' ? ctx.store.projects : ctx.store.tasks;
    // Archived, deleted, or moved out of this database — Notion draws no
    // distinction a query can see, and neither do we: what it did not return
    // is not there. Exact on every run now that every run reads the whole
    // source, so a task archived at ten in the morning is gone by noon
    // instead of by next week.
    const alive = new Set(present.map((page) => notionDocId(page.id)));
    for (const record of [...stored.values()]) {
      if (record.sourceId === source.id && !alive.has(record.id)) {
        await writer.delete(base.collection(collection).doc(record.id));
        stored.delete(record.id);
      }
    }

    // 6. The stamp. `lastSyncAt` is when this run *started*, so the next
    //    incremental window overlaps whatever was edited while it ran.
    const open = [...stored.values()].filter(
      (r) => r.sourceId === source.id && r.status !== 'done',
    ).length;
    const pagesTotal = [...stored.values()].filter((r) => r.sourceId === source.id).length;
    await writer.set(sourceRef, {
      ...stripId(source),
      lastSyncAt: startedIso,
      ...(full ? { lastFullSyncAt: startedIso } : {}),
      lastSyncError: null,
      syncedMappingHash: source.mappingHash,
      counts: { pages: pagesTotal, open, unmatchedPeople: unmatched.length - report.peopleCreated },
    });
    await writer.flush();
    report.written = writer.written - 1;
    report.deleted = writer.deleted;
  } catch (cause) {
    const message =
      cause instanceof NotionError
        ? `${cause.message}${cause.code ? ` (${cause.code})` : ''}`
        : cause instanceof Error
          ? cause.message
          : String(cause);
    report.error = message;
    await sourceRef.set({ lastSyncError: message }, { merge: true }).catch(() => undefined);
  }

  report.durationMs = Date.now() - started;
  return { report, members };
}

function stripId(source: NotionSource): Omit<NotionSource, 'id'> {
  const { id: _id, ...rest } = source;
  return rest;
}

/** The people property of a page, under the source's mapping. */
function peopleOn(page: NotionPage, source: NotionSource): NotionPerson[] {
  const name = source.properties.assignee;
  if (!name) return [];
  const value = page.properties[name];
  if (!value || value.type !== 'people') return [];
  return value.people.filter((p) => p.type !== 'bot' && p.name);
}

function nameMatches(person: KnownPerson, notion: NotionPerson): boolean {
  const normalise = (s: string) =>
    s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  return normalise(person.displayName) === normalise(notion.name ?? '');
}
