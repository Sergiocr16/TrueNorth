import { computeSignals, signalsForUser } from './signals';
import type {
  DailyPlan,
  Membership,
  NotionSource,
  Objective,
  Project,
  Role,
  Signal,
  Task,
  User,
} from './types';

/**
 * Visibility, re-applied in code.
 *
 * The security rules decide what a person may read from the browser. The
 * engine reads with the Admin SDK, which the rules do not apply to, so before
 * a person's prompt is built the same visibility is enforced here. These
 * mirror the `projects` and `tasks` read rules in firestore.rules and are
 * tested against the same cases.
 *
 * Since ADR-008 the unit of visibility is the role: a Notion record is visible
 * when its source is one the person's active role reads. And visibility is no
 * longer a filter over company-wide signals but a recomputation from the
 * visible subset, because a workload or an "empty objective" is an aggregate,
 * and an aggregate over hidden data still tells you about the hidden data.
 */

/** The sources a role reads, ignoring ids of sources that no longer exist. */
export function roleSourceIds(
  role: Pick<Role, 'sourceIds'> | null | undefined,
  sources: Pick<NotionSource, 'id'>[],
): ReadonlySet<string> {
  const existing = new Set(sources.map((s) => s.id));
  return new Set((role?.sourceIds ?? []).filter((id) => existing.has(id)));
}

/**
 * Company-wide app projects for everyone; private or shared ones only for the
 * people on them; Notion projects only through a source the role reads.
 */
export function visibleProjects(
  projects: Project[],
  userId: string,
  sourceIds: ReadonlySet<string>,
): Project[] {
  return projects.filter((p) =>
    p.source === 'notion'
      ? Boolean(p.sourceId && sourceIds.has(p.sourceId))
      : p.visibility === 'company' || p.memberUserIds.includes(userId),
  );
}

/**
 * A task from a hidden source is invisible even when assigned to the person.
 * A task on a hidden *app* project is invisible too: the assignment alone
 * would reveal a private project exists. A task on a Notion project the role
 * does not read is kept but detached from it — a page id is not a secret the
 * way a private project is, and the work is still the person's.
 */
export function visibleTasks(
  tasks: Task[],
  projects: Project[],
  userId: string,
  sourceIds: ReadonlySet<string>,
): Task[] {
  const visible = new Set(visibleProjects(projects, userId, sourceIds).map((p) => p.id));
  const notionProjects = new Set(projects.filter((p) => p.source === 'notion').map((p) => p.id));
  const out: Task[] = [];
  for (const t of tasks) {
    if (t.source === 'notion' && !(t.sourceId && sourceIds.has(t.sourceId))) continue;
    if (t.projectId === null || visible.has(t.projectId)) {
      out.push(t);
    } else if (notionProjects.has(t.projectId)) {
      out.push({ ...t, projectId: null });
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Scope: everything one person in one role may see, signals included  */
/* ------------------------------------------------------------------ */

export interface ScopeInput {
  today: Date;
  objectives: Objective[];
  projects: Project[];
  tasks: Task[];
  sources: NotionSource[];
  roles: Role[];
  members: (User & { membership: Membership })[];
  /** A week of plans for everybody, newest first. */
  planHistory: DailyPlan[];
}

export interface Scoped {
  /** The role the scope was computed for; null when the id matches none. */
  role: Role | null;
  sourceIds: string[];
  /** True when the company has sources this role does not read. */
  partial: boolean;
  objectives: Objective[];
  projects: Project[];
  tasks: Task[];
  /** The people who appear in the visible subset, plus the viewer. */
  users: (User & { membership: Membership })[];
  /** Managers: the plans of `users`. Members: their own only, as the rules allow. */
  planHistory: DailyPlan[];
  /** Computed over exactly the above; nothing hidden went into any of them. */
  signals: Signal[];
}

/**
 * What one person in one role can see, and the signals that follow from it.
 *
 * Two deliberate choices. `users` is restricted to the people who own
 * something visible, so `no_owned_work` never fires about somebody whose
 * work is entirely in a source this role cannot read, and a manager's
 * follow-up only ever covers the people in their view. And `empty_objective`
 * is dropped when the view is partial: "no active work serves this
 * objective" cannot be asserted from part of the work.
 */
export function scopeFor(input: ScopeInput, userId: string, roleId: string | null): Scoped {
  const role = input.roles.find((r) => r.id === roleId) ?? null;
  const sourceIds = roleSourceIds(role, input.sources);
  const partial = input.sources.some((s) => !sourceIds.has(s.id));

  const projects = visibleProjects(input.projects, userId, sourceIds);
  const tasks = visibleTasks(input.tasks, input.projects, userId, sourceIds);

  const involved = new Set<string>([userId]);
  for (const t of tasks) for (const id of t.assigneeUserIds) involved.add(id);
  for (const p of projects) {
    involved.add(p.ownerUserId);
    for (const id of p.memberUserIds) involved.add(id);
  }
  const users = input.members.filter((m) => involved.has(m.id));

  const viewer = input.members.find((m) => m.id === userId);
  const isManager = viewer ? viewer.membership.access !== 'member' : false;
  const planHistory = input.planHistory.filter((plan) =>
    isManager ? involved.has(plan.userId) : plan.userId === userId,
  );

  const signals = computeSignals({
    today: input.today,
    objectives: input.objectives,
    projects,
    tasks,
    users,
    planHistory,
  }).filter((s) => !(partial && s.kind === 'empty_objective'));

  return {
    role,
    sourceIds: [...sourceIds],
    partial,
    objectives: input.objectives,
    projects,
    tasks,
    users,
    planHistory,
    signals,
  };
}

/** The signals that concern the viewer, out of a scope already free of hidden data. */
export function visibleSignals(scope: Scoped, userId: string): Signal[] {
  return signalsForUser(scope.signals, userId, scope.projects);
}

/**
 * Signals about each person, grouped, for a manager reading the team.
 *
 * `visibleSignals` answers "what concerns me?"; this answers "what may I see
 * about everybody else?". The scope already did the hiding, so this only
 * groups — and a person with nothing visible is simply absent.
 */
export function teamSignals(scope: Scoped): Map<string, Signal[]> {
  const byUser = new Map<string, Signal[]>();
  for (const signal of scope.signals) {
    const concerned = signal.userIds?.length ? signal.userIds : signal.userId ? [signal.userId] : [];
    for (const userId of concerned) {
      byUser.set(userId, [...(byUser.get(userId) ?? []), signal]);
    }
  }
  return byUser;
}
