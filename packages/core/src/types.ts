/**
 * Domain types for TrueNorth.
 *
 * These mirror the Firestore document shapes described in docs/adr. They are the
 * single contract shared by the web app, the Cloud Functions and the Raspberry Pi
 * worker, so nothing here may change without an ADR.
 */

export type Locale = 'es' | 'en';

/**
 * Appearance. `system` follows the device; the rest are stamped on the root as
 * `data-theme`. Light and warm are the light family; dark, midnight and amber the dark
 * one — the CSS treats each pair as one scheme with a different tint.
 */
export const THEMES = ['system', 'light', 'warm', 'ambar', 'dark', 'midnight'] as const;
export type ThemePreference = (typeof THEMES)[number];

/**
 * The accent, independent of the theme. Green is not on the list on purpose:
 * it is the colour of "done" and "on track", and an accent that means success
 * everywhere means nothing.
 */
export const ACCENTS = ['azul', 'violeta', 'naranja', 'rosa', 'grafito'] as const;
export type AccentPreference = (typeof ACCENTS)[number];

/** Access level a person has inside one company. */
export type AccessLevel = 'owner' | 'admin' | 'member';

/** Health of an objective or project, computed from the progress gap. */
export type HealthStatus = 'on_track' | 'at_risk' | 'late' | 'done';

/** Internal task status. Notion's fifteen options collapse onto these four. */
export type TaskStatus = 'todo' | 'in_progress' | 'blocked' | 'done';

/** Where a project or task came from. */
export type RecordSource = 'app' | 'notion';

export type Priority = 'low' | 'medium' | 'high' | 'max';

export type ProjectVisibility = 'company' | 'private' | 'shared';

export interface User {
  id: string;
  displayName: string;
  email: string;
  initials: string;
  timezone: string;
  /** Local hour (0-23) at which this person wants the daily plan delivered. */
  notifyHour: number;
  locale: Locale;
  theme: ThemePreference;
  reduceTransparency: boolean;
}

export interface Company {
  id: string;
  name: string;
  slug: string;
  /** Download URL of the company logo, if one has been uploaded. */
  logoUrl?: string | null;
  /** The mandatory north-star goal. Everything is prioritised against this. */
  northStar: string;
  northStarDeadline: string;
  plans: { m3: string; m6: string; m12: string };
}

/**
 * A role in the company: "CTO", "Ventas", "Soporte". Nothing is predefined;
 * each company writes its own.
 *
 * A role is what decides scope. It names the Notion sources its holders may
 * see, and everything the engine computes for a person — signals, briefing,
 * plan, follow-up — is computed from the sources of the role they have on at
 * the time. A person may hold several roles and switches between them; the
 * app never mixes two roles' data in one view.
 */
export interface Role {
  id: string;
  companyId: string;
  name: string;
  /** What the role is responsible for, in prose. The engine reads it. */
  description: string;
  /** Notion sources this role sees. Empty means app-native records only. */
  sourceIds: string[];
  /**
   * Sources, among `sourceIds`, of which this role sees only what is assigned
   * to the person: tasks that name them in `assigneeUserIds`, projects that
   * name them in `memberUserIds`. Absent or empty means every record of every
   * source, which is what roles written before ADR-009 mean. Ids that are not
   * in `sourceIds` are ignored.
   */
  assignedOnlySourceIds?: string[];
  createdAt: string;
}

export interface Membership {
  userId: string;
  companyId: string;
  /**
   * Derived: the names of this person's roles joined with " · ". Kept on the
   * document because the company switcher and the prompts read it, but never
   * edited by hand — the store rewrites it whenever roles or `roleIds` change.
   */
  roleTitle: string;
  /** This person's own responsibility, in free text, on top of what the role says. */
  roleDescription: string;
  /** The roles this person holds. Assigned by an admin; at least one. */
  roleIds: string[];
  /**
   * The role they have on right now. Only the person changes it, and only to
   * one of their own. It decides what they see and what the engine computes.
   */
  activeRoleId: string | null;
  access: AccessLevel;
  /**
   * False for somebody on the team who does not use the app. Their member
   * document has a synthetic id that matches no account, so it grants nothing;
   * it exists so they can be followed up on. Sharing access is a separate act.
   */
  hasAccount: boolean;
  /**
   * What is expected of this person, in the manager's own words.
   *
   * Prose on purpose. The facts — what moved in Notion, what was left
   * unanswered — are signals computed in code; whether those facts add up to
   * "delivering what I expect" is the judgement, and that is the model's job.
   */
  expectations: string;
  /** Notion's own user id, so a comment author maps back to this person. */
  notionUserId?: string;
  /** The register the follow-up should copy when writing to this person. */
  commsTone?: 'directo' | 'cercano' | 'formal';
}

/** One reading, so a chart can show a trend rather than a single number. */
export interface Reading {
  date: string;
  value: number;
}

export interface Indicator {
  id: string;
  name: string;
  unit: string;
  baseline: number;
  current: number;
  target: number;
  /** Whether success means the number goes up or down. */
  direction: 'up' | 'down';
  /** Appended whenever `current` changes. Empty until it does. */
  history?: Reading[];
}

export interface Objective {
  id: string;
  companyId: string;
  title: string;
  expectedResult: string;
  startDate: string;
  targetDate: string;
  priority: Priority;
  ownerUserId: string;
  progressPct: number;
  status: HealthStatus;
  indicators: Indicator[];
  /** Appended whenever `progressPct` changes, so Reports can plot the gap. */
  history?: Reading[];
}

export interface Project {
  id: string;
  companyId: string;
  name: string;
  description: string;
  visibility: ProjectVisibility;
  /** Objectives this project serves. Empty means the project is orphaned. */
  objectiveIds: string[];
  memberUserIds: string[];
  ownerUserId: string;
  startDate: string;
  targetDate: string;
  progressPct: number;
  status: HealthStatus;
  source: RecordSource;
  /** The Notion source this came from. Null for app-native projects. Written by the sync only. */
  sourceId?: string | null;
  notionPageId?: string;
  /** Appended whenever `progressPct` changes. Empty means nothing to compare. */
  history?: Reading[];
}

export interface Task {
  id: string;
  companyId: string;
  projectId: string | null;
  /** Human-facing code, e.g. "TAR-966". This is what people say out loud. */
  code: string;
  title: string;
  status: TaskStatus;
  /** The raw Notion status label, kept so the UI can show what people know. */
  notionStatus?: string;
  priority: Priority;
  dueDate: string | null;
  /**
   * Everyone responsible, as in Notion, where "Responsable" holds several
   * people and all of them own the task. Empty means nobody has it yet, which
   * for something not started is normal.
   */
  assigneeUserIds: string[];
  dependsOn: string[];
  source: RecordSource;
  /** The Notion source this came from. Null for app-native tasks. Written by the sync only. */
  sourceId?: string | null;
  notionPageId?: string;
  syncedAt?: string;

  /* Activity. This is what "it has not moved" is computed from. */

  /** Touched by any mutation in the app. Notion tasks carry Notion's own. */
  updatedAt?: string;
  /** Notion's `last_edited_time`, verbatim. */
  notionLastEditedAt?: string;
  /**
   * When the status last changed, stamped by the sync.
   *
   * Notion's API does not expose status history, so this is derived: the sync
   * compares the incoming status with the stored one and stamps the clock when
   * they differ. It therefore only tells the truth from the first sync onward.
   */
  statusChangedAt?: string;
  /** The last few comments, kept so a follow-up can quote one. */
  comments?: TaskComment[];
  commentCount?: number;
  lastCommentAt?: string;
  /** Author of the last comment, when it maps to somebody we know. */
  lastCommentBy?: string | null;
}

/** A Notion comment, flattened. Most follow-up in ADITUM happens in these. */
export interface TaskComment {
  id: string;
  /** Resolved through `Membership.notionUserId`; null when we cannot map it. */
  authorUserId: string | null;
  authorName: string;
  createdAt: string;
  /** `rich_text` flattened to plain text. */
  text: string;
}

/* ------------------------------------------------------------------ */
/* Notion sources                                                      */
/* ------------------------------------------------------------------ */

export type NotionSourceKind = 'tasks' | 'projects';

/**
 * Which Notion property feeds which internal field, by the property's name as
 * the database spells it. The empty string is a legal name: ADITUM's task
 * number is a `unique_id` property with no name at all.
 */
export interface NotionPropertyMap {
  /** type `title` */
  title: string;
  /** type `status` or `select` */
  status: string;
  /** type `people` */
  assignee?: string;
  /** type `date`; for projects the range gives start and target */
  dueDate?: string;
  /** type `select` */
  priority?: string;
  /** type `relation` to a source of kind `projects` */
  project?: string;
  /** type `relation` to the same database ("Tarea principal") → dependsOn */
  parent?: string;
  /** type `unique_id`, e.g. TAR-966 */
  code?: string;
  /** projects only: a rollup or number in percent */
  progress?: string;
}

/**
 * One Notion database the company reads. Registered by an admin from the
 * Integrations screen, read by the sync on the server, and assigned to roles.
 *
 * Every database spells its properties and its statuses differently — ADITUM's
 * backlog has "En desarrollo" where its task table has "En curso", and its test
 * table keeps status in a plain select — so the mapping lives here, per source,
 * not in a global constant.
 */
export interface NotionSource {
  id: string;
  companyId: string;
  kind: NotionSourceKind;
  /** Notion's title at registration; editable afterwards. */
  title: string;
  /** Dashed uuid of the database. */
  databaseId: string;
  /** Dashed uuid of the data source inside it; what the API is queried by. */
  dataSourceId: string;
  properties: NotionPropertyMap;
  /** A `status` property carries groups; a `select` does not, so defaults differ. */
  statusType: 'status' | 'select';
  /** Notion option name → internal state. Complete for every option seen at registration. */
  statusMap: Record<string, TaskStatus>;
  /** Kind `projects` only. */
  projectStatusMap?: Record<string, HealthStatus>;
  priorityMap?: Record<string, Priority>;
  /** Hash of `properties`; when it changes the next sync is a full one. */
  mappingHash: string;
  lastSyncAt: string | null;
  lastFullSyncAt: string | null;
  lastSyncError: string | null;
  counts: { pages: number; open: number; unmatchedPeople: number };
  createdBy: string;
  createdAt: string;
}

export interface Risk {
  id: string;
  companyId: string;
  projectId?: string;
  objectiveId?: string;
  description: string;
  severity: 'low' | 'medium' | 'high';
  ownerUserId: string | null;
  source: 'manual' | 'engine';
}

/**
 * Something going on with a person that the numbers do not show.
 *
 * These are private notes about identifiable people, kept so the follow-up
 * adapts instead of nagging somebody who is having a hard week. Only owners and
 * admins may read them; see firestore.rules. `discreet` is the safeguard that
 * makes them usable at all: it tells the engine to soften the ask without ever
 * writing the reason into a message that gets copied to the person.
 */
export interface Situation {
  id: string;
  companyId: string;
  userId: string;
  kind: 'personal' | 'carga' | 'desempeno' | 'salud' | 'motivacion' | 'otro';
  note: string;
  /** Adjust the tone, never name the reason. */
  discreet: boolean;
  startsAt: string;
  /** Null means open-ended; a past date means the situation is over. */
  endsAt: string | null;
  createdBy: string;
}

/* ------------------------------------------------------------------ */
/* Signals                                                             */
/* ------------------------------------------------------------------ */

export type SignalKind =
  | 'progress_gap'
  | 'overdue_task'
  | 'due_today'
  | 'blocked_task'
  | 'unassigned_task'
  | 'undated_task'
  | 'orphan_project'
  | 'empty_objective'
  | 'workload'
  | 'stale_progress'
  /* Follow-up: whether the work, and the conversation around it, is moving. */
  | 'stale_task'
  | 'comment_unanswered'
  | 'silent_owner'
  | 'no_followup'
  | 'plan_ignored'
  | 'plan_slipping'
  | 'no_owned_work'
  | 'overdue_load';

/**
 * A deterministic fact computed in code, never by the model. Every plan item
 * must cite at least one of these, which is what makes a recommendation
 * traceable back to real data.
 */
export interface Signal {
  id: string;
  kind: SignalKind;
  severity: 'info' | 'warning' | 'critical';
  /** Short human-readable summary, already localised by the caller. */
  summary: { es: string; en: string };
  objectiveId?: string;
  projectId?: string;
  taskId?: string;
  /** The first person this concerns; `userIds` has all of them. */
  userId?: string;
  /** Everybody this concerns, when a task has more than one responsible. */
  userIds?: string[];
  /** Raw numbers behind the signal, for display and for the prompt. */
  data?: Record<string, number | string>;
}

/* ------------------------------------------------------------------ */
/* Plans                                                               */
/* ------------------------------------------------------------------ */

export interface PlanItem {
  title: string;
  /** Why this matters today, in the person's language. */
  why: string;
  objectiveId?: string;
  projectId?: string;
  taskId?: string;
  estimatedMinutes: number;
  /** Optional hard time, e.g. "14:00". */
  deadlineTime?: string;
  signalIds: string[];
}

export type PlanItemVerdict = 'done' | 'skipped' | 'irrelevant';

export interface DailyPlan {
  id: string;
  companyId: string;
  userId: string;
  /** The role this plan was computed for. One plan per person per role per day. */
  roleId: string;
  date: string;
  headline: string;
  why: string;
  items: PlanItem[];
  consequenceIfNotDone: string;
  deliveredAt: string | null;
  stale: boolean;
  feedback: Record<number, PlanItemVerdict>;
}

export type PerspectiveKey = 'ceo' | 'coo' | 'cto' | 'cfo' | 'pm';

export interface Perspective {
  key: PerspectiveKey;
  reading: string;
}

/**
 * The day's briefing for one person in one role. Once one per company; now
 * one per person and role, computed from the sources that role sees, so two
 * people never read a briefing built from data one of them cannot open.
 */
export interface CompanyAnalysis {
  id: string;
  companyId: string;
  /** Whose briefing this is. The rules let only this person read it. */
  userId: string;
  roleId: string;
  /** The Notion sources it was computed from, for the footer of the screen. */
  sourceIds: string[];
  /** Among them, the ones read only through the person's assignments. Absent before ADR-009. */
  assignedOnlySourceIds?: string[];
  date: string;
  generatedAt: string;
  briefing: string;
  topRisks: string[];
  pendingDecisions: string[];
  perspectives: Perspective[];
  model: string;
  costUsd: number;
}

/* ------------------------------------------------------------------ */
/* Team follow-up                                                      */
/* ------------------------------------------------------------------ */

/** How a person is doing against what is expected of them. */
export type Standing = 'adelantado' | 'en_curso' | 'atrasado' | 'trabado';

export type FollowUpTone =
  | 'reconocimiento'
  | 'seguimiento'
  | 'ajuste'
  | 'apoyo'
  | 'decision';

/**
 * A signal stored alongside the follow-up, summary and all.
 *
 * Plans get away with citing ids alone because the browser recomputes the same
 * signals from data it can read. A follow-up cannot: it cites signals about
 * other people, drawn from plan history the rules keep private. So the summary
 * travels with the id, and the interface never has to resolve it.
 */
export interface CitedSignal {
  id: string;
  severity: Signal['severity'];
  summary: { es: string; en: string };
}

/** Every member gets one of these every day, whether or not a message follows. */
export interface TeamReading {
  userId: string;
  standing: Standing;
  reading: string;
  recommendation: string;
  signals: CitedSignal[];
}

/**
 * Where the follow-up goes. Most of it belongs on the Notion task, where the
 * conversation already lives; a direct message is for what spans several tasks.
 */
export type FollowUpTarget =
  | { kind: 'directo' }
  | { kind: 'comentario'; taskId: string };

export type FollowUpOutcome = 'sent' | 'dismissed';

export interface FollowUp {
  /**
   * Stable within the day's document, derived from who it is for and where it
   * goes. One person can get two on the same morning — a comment on the task
   * that is stuck and a wider word about the week — and each is decided on its
   * own, so each needs its own name.
   */
  id: string;
  userId: string;
  target: FollowUpTarget;
  tone: FollowUpTone;
  /** Ready to copy, addressed to the person. */
  message: string;
  /** Why it is being sent. For the manager's eyes; never copied. */
  why: string;
  ask: string;
  signals: CitedSignal[];
  /** The message stopped being enough; this needs a conversation. */
  escalate: boolean;
}

export interface TeamFollowUp {
  id: string;
  companyId: string;
  /** Whose follow-up this is. One document per manager per role per day. */
  managerUid: string;
  roleId: string;
  date: string;
  generatedAt: string;
  readings: TeamReading[];
  messages: FollowUp[];
  /** What the manager did with each message, keyed by the message id. */
  outcome: Record<string, FollowUpOutcome>;
  /** What was actually sent, when it was edited first. Teaches tomorrow's run. */
  sentText: Record<string, string>;
  model: string;
  costUsd: number;
}

/* ------------------------------------------------------------------ */
/* Voice updates                                                       */
/* ------------------------------------------------------------------ */

export type ChangeField = 'status' | 'dueDate' | 'note' | 'assignee';

export interface InterpretedChange {
  taskId?: string;
  taskCode?: string;
  taskTitle?: string;
  projectId?: string;
  field: ChangeField;
  from: string;
  to: string;
  /** The exact phrase from the transcript that produced this change. */
  quote: string;
  /** Set when the Notion page changed between our read and this write. */
  conflict?: boolean;
}

export type VoiceUpdateStatus = 'recording' | 'processing' | 'review' | 'applied' | 'failed';

export interface VoiceUpdate {
  id: string;
  companyId: string;
  userId: string;
  createdAt: string;
  status: VoiceUpdateStatus;
  transcript: string;
  transcriptEdited?: string;
  changes: InterpretedChange[];
  discarded: number[];
  appliedAt?: string;
  notionWriteStatus: 'pending' | 'ok' | 'conflict';
}

/* ------------------------------------------------------------------ */
/* Worker queue                                                        */
/* ------------------------------------------------------------------ */

export type JobType = 'daily' | 'replan' | 'notion_sync' | 'voice_update';

export interface Job {
  id: string;
  type: JobType;
  companyId: string;
  userId?: string;
  scheduledFor: string;
  status: 'queued' | 'leased' | 'done' | 'failed';
  leasedBy?: string;
  leaseExpiresAt?: string;
  attempts: number;
  lastError?: string;
}

/** What the last daily run did, written by the engine next to the heartbeat. */
export interface EngineRun {
  companyId: string;
  date: string;
  analysisOk: boolean;
  plansOk: number;
  plansFailed: number;
  /** Follow-up messages suggested across every manager. */
  messages?: number;
  durationMs: number;
  costUsd: number;
  error: string | null;
  /** The Notion sync that ran first, if it failed. The run goes on with yesterday's data. */
  syncError?: string | null;
}

export interface WorkerHeartbeat {
  id: string;
  /** ISO timestamp. The engine writes a server timestamp; the store converts it. */
  lastHeartbeatAt: string | null;
  version: string;
  hostname: string;
  lastRun?: EngineRun;
}
