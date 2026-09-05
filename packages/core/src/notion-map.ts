import { defaultStatusMap, NOTION_PRIORITY, NOTION_PROJECT_STATUS, priorityFor, statusFor } from './notion-status';
import { matchPerson, type KnownPerson } from './people';
import { healthFrom } from './signals';
import type {
  HealthStatus,
  NotionPropertyMap,
  NotionSource,
  NotionSourceKind,
  Priority,
  Project,
  Task,
  TaskComment,
  TaskStatus,
} from './types';

/**
 * Notion pages → TrueNorth records, as pure functions.
 *
 * The sync on the server fetches; this file decides what a page means, given
 * the source's mapping. Nothing here touches the network, so every case —
 * a status that is a plain select, a unique id with no name, a person Notion
 * knows and the team does not — is a unit test over a recorded page.
 */

/* ------------------------------------------------------------------ */
/* The slice of the Notion API we read                                 */
/* ------------------------------------------------------------------ */

export interface NotionRichText {
  plain_text: string;
}

export interface NotionPerson {
  id: string;
  name?: string;
  type?: 'person' | 'bot';
  person?: { email?: string };
}

/** One property value on a page, in the shapes we know how to read. */
export type NotionPropertyValue =
  | { id?: string; type: 'title'; title: NotionRichText[] }
  | { id?: string; type: 'rich_text'; rich_text: NotionRichText[] }
  | { id?: string; type: 'status'; status: { name: string } | null }
  | { id?: string; type: 'select'; select: { name: string } | null }
  | { id?: string; type: 'multi_select'; multi_select: { name: string }[] }
  | { id?: string; type: 'people'; people: NotionPerson[] }
  | { id?: string; type: 'date'; date: { start: string; end: string | null } | null }
  | { id?: string; type: 'relation'; relation: { id: string }[] }
  | { id?: string; type: 'unique_id'; unique_id: { prefix: string | null; number: number } }
  | { id?: string; type: 'number'; number: number | null }
  | { id?: string; type: 'checkbox'; checkbox: boolean }
  | { id?: string; type: 'last_edited_time'; last_edited_time: string }
  | {
      id?: string;
      type: 'rollup';
      rollup: { type: 'number'; number: number | null } | { type: string };
    };

/**
 * A page as the API returns it. Properties of types we do not read (formulas,
 * files, last_edited_by…) are present at runtime; the sync only ever indexes
 * the ones the mapping names, so the union above is all it needs to know.
 */
export interface NotionPage {
  id: string;
  url?: string;
  created_time?: string;
  last_edited_time: string;
  archived?: boolean;
  in_trash?: boolean;
  properties: Record<string, NotionPropertyValue>;
}

export interface NotionComment {
  id: string;
  created_time: string;
  created_by: { id: string; name?: string };
  rich_text: NotionRichText[];
}

export interface NotionUser {
  id: string;
  name?: string;
  type?: 'person' | 'bot';
}

/**
 * What the workspace search returns about one table, whichever shape the API
 * answers with. The 2025-09-03 version answers with `data_source` objects, an
 * older one with `database` objects, and the two spell the title and the
 * parent differently — so this reads whatever is there and says what it found.
 */
export interface NotionSearchResult {
  object?: string;
  id: string;
  /** `database` objects carry a rich-text title; `data_source` objects a name. */
  title?: NotionRichText[];
  name?: string;
  parent?: { type?: string; database_id?: string; page_id?: string; workspace?: boolean };
  database_parent?: { database_id?: string };
  last_edited_time?: string;
  in_trash?: boolean;
  archived?: boolean;
}

/** One table somebody may register, as the picker lists it. */
export interface NotionTableSummary {
  /** The database the table belongs to. Equals `dataSourceId` when the API gave only one id. */
  databaseId: string;
  /** Null when the search answered with a database and its data source is not known yet. */
  dataSourceId: string | null;
  title: string;
}

/**
 * One search result as a table to offer, or null when it is not one: a page,
 * something in the trash, or an object with no id.
 */
export function tableFromSearch(result: NotionSearchResult): NotionTableSummary | null {
  if (!result?.id) return null;
  if (result.in_trash || result.archived) return null;
  if (result.object && result.object !== 'database' && result.object !== 'data_source') return null;

  const title =
    (result.title?.map((t) => t.plain_text).join('').trim() || result.name?.trim()) ?? '';
  const parentDatabase = result.database_parent?.database_id ?? result.parent?.database_id;

  // A data source knows the database above it; a database is its own answer.
  const isDataSource = result.object === 'data_source' || Boolean(parentDatabase);
  return {
    databaseId: parentDatabase ?? result.id,
    dataSourceId: isDataSource ? result.id : null,
    title: title || '(sin nombre)',
  };
}

/** A database schema, flattened from the data source object. */
export interface NotionSchema {
  title: string;
  properties: NotionSchemaProperty[];
}

export interface NotionSchemaProperty {
  name: string;
  type: string;
  /** `status` and `select` properties list their options; status ones carry the group. */
  options?: { name: string; group?: 'to_do' | 'in_progress' | 'complete' }[];
  /** `rollup` properties say what they aggregate. */
  rollupFunction?: string;
  /** `relation` properties say what they point to. */
  relationDataSourceId?: string;
  numberFormat?: string;
}

/* ------------------------------------------------------------------ */
/* Ids                                                                 */
/* ------------------------------------------------------------------ */

const HEX32 = /[0-9a-f]{32}/i;
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/**
 * A database or page id from whatever somebody pasted: a full Notion URL with
 * its slug and view parameters, a dashed uuid, or the bare 32 hex characters.
 * Returned dashed, which is how the API wants it. Null when nothing looks like
 * an id — better than guessing a database out of a random string.
 */
export function parseNotionId(input: string): string | null {
  const text = input.trim();
  if (!text) return null;
  // Strip the query string first: `?v=` carries a *view* id that also looks like one.
  const withoutQuery = text.split('?')[0] ?? text;
  const dashed = withoutQuery.match(UUID)?.[0];
  if (dashed) return dashed.toLowerCase();
  const matches = withoutQuery.match(new RegExp(HEX32.source, 'gi'));
  const bare = matches?.[matches.length - 1];
  if (!bare) return null;
  const b = bare.toLowerCase();
  return `${b.slice(0, 8)}-${b.slice(8, 12)}-${b.slice(12, 16)}-${b.slice(16, 20)}-${b.slice(20)}`;
}

/** The Firestore id of a synced page: stable across syncs and across sources. */
export function notionDocId(pageId: string): string {
  return `n_${pageId.replace(/-/g, '').toLowerCase()}`;
}

/* ------------------------------------------------------------------ */
/* Suggesting a mapping from a schema                                  */
/* ------------------------------------------------------------------ */

export interface SuggestedSource {
  kind: NotionSourceKind;
  properties: NotionPropertyMap;
  statusType: 'status' | 'select';
  statusMap: Record<string, TaskStatus>;
  priorityMap?: Record<string, Priority>;
  projectStatusMap?: Record<string, HealthStatus>;
  /** Things the admin should look at before saving. In Spanish; shown as is. */
  warnings: string[];
}

/** The first property of a type whose name matches the earliest preference. */
function pick(
  properties: NotionSchemaProperty[],
  type: string | string[],
  ...prefer: RegExp[]
): NotionSchemaProperty | undefined {
  const types = Array.isArray(type) ? type : [type];
  const candidates = properties.filter((p) => types.includes(p.type));
  for (const pattern of prefer) {
    const preferred = candidates.find((p) => pattern.test(p.name));
    if (preferred) return preferred;
  }
  return candidates[0];
}

/** Like `pick`, but a name that matches is the only acceptable answer. */
function pickStrict(
  properties: NotionSchemaProperty[],
  type: string,
  pattern: RegExp,
): NotionSchemaProperty | undefined {
  return properties.find((p) => p.type === type && pattern.test(p.name));
}

/**
 * The mapping a database most likely wants, from its own schema.
 *
 * Property *types* carry the meaning — there is one title, the people
 * property is who is responsible, the unique id is the code — and names only
 * break ties. A status property brings its groups and so its default map; a
 * plain select brings nothing, which is worth a warning rather than a guess.
 */
export function suggestMapping(schema: NotionSchema, kind?: NotionSourceKind): SuggestedSource {
  const props = schema.properties;
  const warnings: string[] = [];

  const title = pick(props, 'title');
  const status = pick(props, 'status') ?? pickStrict(props, 'select', /estado|status/i);
  const assignee = pick(props, 'people', /respons|propiet|owner|assign|encargad/i);
  const dueDate = pick(props, 'date', /l[ií]mite|realizar|due/i, /^fecha$|^date$/i, /fecha|date/i);
  const priority = pickStrict(props, 'select', /priori/i);
  const code = pick(props, 'unique_id');
  const progress = props.find(
    (p) => (p.type === 'rollup' || p.type === 'number') && p.numberFormat === 'percent',
  );
  const project = props.find(
    (p) => p.type === 'relation' && /proyecto|project/i.test(p.name),
  );
  const parent = props.find(
    (p) => p.type === 'relation' && /principal|parent|padre/i.test(p.name),
  );

  const resolvedKind: NotionSourceKind = kind ?? (progress && !code ? 'projects' : 'tasks');

  if (!title) warnings.push('La base no tiene una propiedad de título.');
  if (!status) warnings.push('No se encontró una propiedad de estado; todo se leerá como pendiente.');
  else if (status.type === 'select')
    warnings.push(
      'El estado es un select sin grupos: revisá la tabla de estados antes de guardar.',
    );
  if (!assignee) warnings.push('No hay propiedad de personas; las tareas quedarán sin responsable.');
  if (!dueDate) warnings.push('No hay propiedad de fecha; nada podrá vencer.');

  const statusOptions = status?.options ?? [];
  const statusType: 'status' | 'select' = status?.type === 'select' ? 'select' : 'status';

  const properties: NotionPropertyMap = {
    title: title?.name ?? '',
    status: status?.name ?? '',
    ...(assignee ? { assignee: assignee.name } : {}),
    ...(dueDate ? { dueDate: dueDate.name } : {}),
    ...(priority ? { priority: priority.name } : {}),
    ...(project ? { project: project.name } : {}),
    ...(parent ? { parent: parent.name } : {}),
    ...(code ? { code: code.name } : {}),
    ...(resolvedKind === 'projects' && progress ? { progress: progress.name } : {}),
  };

  const priorityMap = priority
    ? Object.fromEntries(
        (priority.options ?? []).map((o) => [o.name, NOTION_PRIORITY[o.name] ?? 'medium']),
      )
    : undefined;

  if (resolvedKind === 'projects') {
    const projectStatusMap = Object.fromEntries(
      statusOptions.map((o) => [
        o.name,
        NOTION_PROJECT_STATUS[o.name] ??
          (o.group === 'complete' ? 'done' : o.group === 'in_progress' ? 'on_track' : 'on_track'),
      ]),
    ) as Record<string, HealthStatus>;
    return {
      kind: 'projects',
      properties,
      statusType,
      statusMap: defaultStatusMap({ type: statusType, options: statusOptions }),
      projectStatusMap,
      ...(priorityMap ? { priorityMap } : {}),
      warnings,
    };
  }

  return {
    kind: 'tasks',
    properties,
    statusType,
    statusMap: defaultStatusMap({ type: statusType, options: statusOptions }),
    ...(priorityMap ? { priorityMap } : {}),
    warnings,
  };
}

/* ------------------------------------------------------------------ */
/* Reading property values                                             */
/* ------------------------------------------------------------------ */

function prop(page: NotionPage, name: string | undefined): NotionPropertyValue | undefined {
  if (name === undefined) return undefined;
  return page.properties[name];
}

function text(value: NotionPropertyValue | undefined): string {
  if (!value) return '';
  if (value.type === 'title') return value.title.map((t) => t.plain_text).join('').trim();
  if (value.type === 'rich_text') return value.rich_text.map((t) => t.plain_text).join('').trim();
  return '';
}

function label(value: NotionPropertyValue | undefined): string | null {
  if (!value) return null;
  if (value.type === 'status') return value.status?.name ?? null;
  if (value.type === 'select') return value.select?.name ?? null;
  return null;
}

function people(value: NotionPropertyValue | undefined): NotionPerson[] {
  if (!value || value.type !== 'people') return [];
  return value.people.filter((p) => p.type !== 'bot');
}

function dateRange(value: NotionPropertyValue | undefined): { start: string; end: string | null } | null {
  if (!value || value.type !== 'date' || !value.date) return null;
  return { start: value.date.start.slice(0, 10), end: value.date.end?.slice(0, 10) ?? null };
}

function relations(value: NotionPropertyValue | undefined): string[] {
  if (!value || value.type !== 'relation') return [];
  return value.relation.map((r) => r.id);
}

function uniqueId(value: NotionPropertyValue | undefined): string {
  if (!value || value.type !== 'unique_id') return '';
  const { prefix, number } = value.unique_id;
  return prefix ? `${prefix}-${number}` : String(number);
}

function percent(value: NotionPropertyValue | undefined): number | null {
  if (!value) return null;
  if (value.type === 'number') return value.number;
  if (value.type === 'rollup' && value.rollup.type === 'number') {
    return (value.rollup as { number: number | null }).number;
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Pages → records                                                     */
/* ------------------------------------------------------------------ */

export interface MapContext {
  companyId: string;
  people: KnownPerson[];
  /** What the sync already holds for this page, so change is detectable. */
  previous?: Task | Project;
  /** ISO timestamp of this sync. */
  now: string;
  /** Ids (Firestore ids, `n_…`) of projects synced from a `projects` source. */
  projectIds?: ReadonlySet<string>;
}

/** Who Notion says is on the page, resolved to the team, and who could not be. */
function resolvePeople(
  persons: NotionPerson[],
  known: KnownPerson[],
): { ids: string[]; unmatched: NotionPerson[] } {
  const ids: string[] = [];
  const unmatched: NotionPerson[] = [];
  for (const person of persons) {
    const match = matchPerson({ name: person.name ?? '', notionUserId: person.id }, known);
    if (match) {
      if (!ids.includes(match.id)) ids.push(match.id);
    } else {
      unmatched.push(person);
    }
  }
  return { ids, unmatched };
}

/**
 * A task from a page.
 *
 * `statusChangedAt` is the one derived field: Notion keeps no status history,
 * so the clock is stamped the first time we see a page and every time its
 * label differs from the one we stored (ADR-006). Comments are not on the page
 * object; the sync carries the stored ones over and refreshes them separately.
 */
export function pageToTask(
  page: NotionPage,
  source: NotionSource,
  ctx: MapContext,
): { task: Task; unmatched: NotionPerson[] } {
  const map = source.properties;
  const previous = ctx.previous && 'assigneeUserIds' in ctx.previous ? ctx.previous : undefined;

  const statusLabel = label(prop(page, map.status));
  const { ids: assigneeUserIds, unmatched } = resolvePeople(
    people(prop(page, map.assignee)),
    ctx.people,
  );
  const due = dateRange(prop(page, map.dueDate));

  const projectRelation = relations(prop(page, map.project))[0];
  const projectDocId = projectRelation ? notionDocId(projectRelation) : null;
  const projectId = projectDocId && ctx.projectIds?.has(projectDocId) ? projectDocId : null;

  const dependsOn = relations(prop(page, map.parent)).map(notionDocId);

  // Notion keeps no status history, so the clock is derived: kept while the
  // label is the one stored, restamped when it differs. The stamp is the
  // page's own last edit, never "now": a status change is an edit, so it
  // happened at or before that time, and stamping the sync's clock instead
  // made every task look freshly moved on the day it was first seen.
  const edited = page.last_edited_time ?? ctx.now;
  const statusChangedAt =
    previous && previous.notionStatus === (statusLabel ?? undefined)
      ? (previous.statusChangedAt ?? edited)
      : edited;

  const task: Task = {
    id: notionDocId(page.id),
    companyId: ctx.companyId,
    projectId,
    code: uniqueId(prop(page, map.code)),
    title: text(prop(page, map.title)) || '(sin título)',
    status: statusFor(source, statusLabel),
    ...(statusLabel ? { notionStatus: statusLabel } : {}),
    priority: priorityFor(source, label(prop(page, map.priority))),
    dueDate: due?.start ?? null,
    assigneeUserIds,
    dependsOn,
    source: 'notion',
    sourceId: source.id,
    notionPageId: page.id.replace(/-/g, ''),
    syncedAt: ctx.now,
    updatedAt: page.last_edited_time,
    notionLastEditedAt: page.last_edited_time,
    statusChangedAt,
    ...(previous?.comments ? { comments: previous.comments } : {}),
    ...(previous?.commentCount !== undefined ? { commentCount: previous.commentCount } : {}),
    ...(previous?.lastCommentAt ? { lastCommentAt: previous.lastCommentAt } : {}),
    ...(previous?.lastCommentBy !== undefined ? { lastCommentBy: previous.lastCommentBy } : {}),
  };

  return { task, unmatched };
}

/**
 * A project from a page of a `projects` source. Visibility is `company` for
 * type compatibility only: for a synced project the source is the visibility,
 * and the rules ignore the field.
 */
export function pageToProject(
  page: NotionPage,
  source: NotionSource,
  ctx: MapContext,
): { project: Project; unmatched: NotionPerson[] } {
  const map = source.properties;
  const previous = ctx.previous && 'memberUserIds' in ctx.previous ? ctx.previous : undefined;

  const statusLabel = label(prop(page, map.status));
  const { ids: owners, unmatched } = resolvePeople(people(prop(page, map.assignee)), ctx.people);
  const range = dateRange(prop(page, map.dueDate));
  const raw = percent(prop(page, map.progress));
  const progressPct = raw === null ? (previous?.progressPct ?? 0) : Math.round(raw * 100);

  const startDate = range?.start ?? previous?.startDate ?? page.created_time?.slice(0, 10) ?? ctx.now.slice(0, 10);
  const targetDate = range?.end ?? range?.start ?? previous?.targetDate ?? startDate;

  const mapped = statusLabel ? source.projectStatusMap?.[statusLabel] : undefined;
  const status: HealthStatus =
    mapped === 'done'
      ? 'done'
      : healthFrom({ startDate, targetDate, progressPct }, new Date(`${ctx.now.slice(0, 10)}T00:00:00`));

  const today = ctx.now.slice(0, 10);
  const history = previous?.history ? [...previous.history] : [];
  if (previous === undefined || previous.progressPct !== progressPct) {
    const last = history[history.length - 1];
    if (last?.date === today) last.value = progressPct;
    else history.push({ date: today, value: progressPct });
  }

  const project: Project = {
    id: notionDocId(page.id),
    companyId: ctx.companyId,
    name: text(prop(page, map.title)) || '(sin título)',
    description: '',
    visibility: 'company',
    objectiveIds: previous?.objectiveIds ?? [],
    memberUserIds: owners,
    ownerUserId: owners[0] ?? '',
    startDate,
    targetDate,
    progressPct,
    status,
    source: 'notion',
    sourceId: source.id,
    notionPageId: page.id.replace(/-/g, ''),
    history,
  };

  return { project, unmatched };
}

/** Notion comments, flattened and with their author resolved to the team. */
export function flattenComments(
  comments: NotionComment[],
  known: KnownPerson[],
  users: NotionUser[] = [],
): TaskComment[] {
  return comments
    .slice()
    .sort((a, b) => a.created_time.localeCompare(b.created_time))
    .map((comment) => {
      const user = users.find((u) => u.id === comment.created_by.id);
      const name = comment.created_by.name ?? user?.name ?? '';
      const match = matchPerson({ name, notionUserId: comment.created_by.id }, known);
      return {
        id: comment.id,
        authorUserId: match?.id ?? null,
        authorName: name || 'alguien',
        createdAt: comment.created_time,
        text: comment.rich_text.map((t) => t.plain_text).join('').trim(),
      };
    });
}

/** A stable fingerprint of a mapping, so the sync notices when it changed. */
export function mappingHash(properties: NotionPropertyMap): string {
  const entries = Object.entries(properties)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => a.localeCompare(b));
  const text = JSON.stringify(entries);
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + text.charCodeAt(i)) | 0;
  }
  return (hash >>> 0).toString(16);
}
