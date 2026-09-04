/**
 * Domain types for TrueNorth.
 *
 * These mirror the Firestore document shapes described in docs/adr. They are the
 * single contract shared by the web app, the Cloud Functions and the Raspberry Pi
 * worker, so nothing here may change without an ADR.
 */

export type Locale = 'es' | 'en';

export type ThemePreference = 'system' | 'light' | 'dark';

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

export interface Membership {
  userId: string;
  companyId: string;
  /** Job title, e.g. "CTO". */
  roleTitle: string;
  /** Editable free text. This is what makes recommendations role-aware. */
  roleDescription: string;
  access: AccessLevel;
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
  notionPageId?: string;
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
  assigneeUserId: string | null;
  dependsOn: string[];
  source: RecordSource;
  notionPageId?: string;
  syncedAt?: string;
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
  | 'stale_progress';

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
  userId?: string;
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

export interface CompanyAnalysis {
  id: string;
  companyId: string;
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

export interface WorkerHeartbeat {
  id: string;
  lastHeartbeatAt: string;
  version: string;
  hostname: string;
  jobsInFlight: number;
}
