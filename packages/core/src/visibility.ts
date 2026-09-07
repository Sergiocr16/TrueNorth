import type { DayResolution } from './schedule';
import { PRIORITY_WEIGHT } from './notion-status';
import { computeSignals, signalsForUser } from './signals';
import type {
  DailyPlan,
  GithubRepo,
  Membership,
  NotionSource,
  Objective,
  ObjectiveScope,
  Project,
  PullRequest,
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
 * when its source is one the person's active role reads. Since ADR-009 a role
 * may read a source only through the person's own assignments: of such a
 * source, a task is visible when it names them and a project when they are on
 * it. And visibility is no longer a filter over company-wide signals but a
 * recomputation from the visible subset, because a workload or an "empty
 * objective" is an aggregate, and an aggregate over hidden data still tells
 * you about the hidden data.
 */

const NONE: ReadonlySet<string> = new Set();

/** The sources a role reads, ignoring ids of sources that no longer exist. */
export function roleSourceIds(
  role: Pick<Role, 'sourceIds'> | null | undefined,
  sources: Pick<NotionSource, 'id'>[],
): ReadonlySet<string> {
  const existing = new Set(sources.map((s) => s.id));
  return new Set((role?.sourceIds ?? []).filter((id) => existing.has(id)));
}

/**
 * The sources a role reads only through the person's own assignments: the
 * intersection of `assignedOnlySourceIds` with what the role reads at all, so
 * an id that lingers after a source left the role means nothing.
 */
export function roleAssignedOnlyIds(
  role: Pick<Role, 'sourceIds' | 'assignedOnlySourceIds'> | null | undefined,
  sources: Pick<NotionSource, 'id'>[],
): ReadonlySet<string> {
  const reads = roleSourceIds(role, sources);
  return new Set((role?.assignedOnlySourceIds ?? []).filter((id) => reads.has(id)));
}

/**
 * Company-wide app projects for everyone; private or shared ones only for the
 * people on them; Notion projects only through a source the role reads — and,
 * when the role reads that source assigned-only, only the ones the person is on.
 */
export function visibleProjects(
  projects: Project[],
  userId: string,
  sourceIds: ReadonlySet<string>,
  assignedOnly: ReadonlySet<string> = NONE,
): Project[] {
  return projects.filter((p) =>
    p.source === 'notion'
      ? Boolean(p.sourceId && sourceIds.has(p.sourceId)) &&
        (!assignedOnly.has(p.sourceId as string) || p.memberUserIds.includes(userId))
      : p.visibility === 'company' || p.memberUserIds.includes(userId),
  );
}

/**
 * A task from a hidden source is invisible even when assigned to the person.
 * A task on a hidden *app* project is invisible too: the assignment alone
 * would reveal a private project exists. A task on a Notion project the role
 * does not read is kept but detached from it — a page id is not a secret the
 * way a private project is, and the work is still the person's. Of a source
 * the role reads assigned-only, a task is visible only when it names the
 * person: an unowned backlog item there is as hidden as somebody else's.
 */
export function visibleTasks(
  tasks: Task[],
  projects: Project[],
  userId: string,
  sourceIds: ReadonlySet<string>,
  assignedOnly: ReadonlySet<string> = NONE,
): Task[] {
  const visible = new Set(
    visibleProjects(projects, userId, sourceIds, assignedOnly).map((p) => p.id),
  );
  const notionProjects = new Set(projects.filter((p) => p.source === 'notion').map((p) => p.id));
  const out: Task[] = [];
  for (const t of tasks) {
    if (t.source === 'notion') {
      if (!(t.sourceId && sourceIds.has(t.sourceId))) continue;
      if (assignedOnly.has(t.sourceId) && !t.assigneeUserIds.includes(userId)) continue;
    }
    if (t.projectId === null || visible.has(t.projectId)) {
      out.push(t);
    } else if (notionProjects.has(t.projectId)) {
      out.push({ ...t, projectId: null });
    }
  }
  return out;
}

/**
 * A pull request is readable while its repository is on the role — a
 * repository is a source like a Notion database (ADR-010) — and, when the
 * role reads that repository assigned-only, while it names the person as
 * author or reviewer.
 */
export function visiblePullRequests(
  pullRequests: PullRequest[],
  userId: string,
  sourceIds: ReadonlySet<string>,
  assignedOnly: ReadonlySet<string> = NONE,
): PullRequest[] {
  return pullRequests.filter(
    (pr) => sourceIds.has(pr.repoId) && (!assignedOnly.has(pr.repoId) || pr.peopleUserIds.includes(userId)),
  );
}

/* ------------------------------------------------------------------ */
/* Scope: everything one person in one role may see, signals included  */
/* ------------------------------------------------------------------ */

/** The scope an objective was written with; the ones written before ADR-013 are general. */
export function objectiveScope(objective: Pick<Objective, 'scope'>): ObjectiveScope {
  return objective.scope === 'role' ? 'role' : 'general';
}

/** Whether an objective counts for a person in a role: general ones always, role ones only in that role. */
export function objectiveApplies(objective: Pick<Objective, 'scope' | 'roleId'>, roleId: string | null): boolean {
  return objectiveScope(objective) === 'general' || (roleId !== null && objective.roleId === roleId);
}

/** The objectives active for a role (ADR-013). The rest exist, but are somebody else's. */
export function activeObjectives<T extends Pick<Objective, 'scope' | 'roleId'>>(objectives: T[], roleId: string | null): T[] {
  return objectives.filter((o) => objectiveApplies(o, roleId));
}

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
  /** GitHub repositories registered as sources (ADR-010). */
  repos?: GithubRepo[];
  pullRequests?: PullRequest[];
  /** Roles whose holders review and merge pull requests. */
  approverRoleIds?: string[];
  /** Notion status labels that mean development finished and a pull request is owed. */
  finishedStatuses?: string[];
  /** The day itself, for the role the scope is computed for (ADR-012). */
  day?: DayResolution;
}

export interface Scoped {
  /** The role the scope was computed for; null when the id matches none. */
  role: Role | null;
  sourceIds: string[];
  /** Among `sourceIds`, the ones this role reads only through the person's assignments. */
  assignedOnlySourceIds: string[];
  /** Among `sourceIds`, the GitHub repositories. */
  repoIds: string[];
  pullRequests: PullRequest[];
  /** The people who review and merge, visible or not: an approver signal names them. */
  approverUserIds: string[];
  /**
   * True when the company has sources this role does not read, or reads only
   * through assignments: either way, part of the work is out of view.
   */
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
  const repos = input.repos ?? [];
  const allSources = [...input.sources, ...repos];
  const sourceIds = roleSourceIds(role, allSources);
  const assignedOnly = roleAssignedOnlyIds(role, allSources);
  // Partial is about the work: a repository the role does not read hides
  // pull requests, not tasks, and says nothing about an objective's work.
  const partial = input.sources.some((s) => !sourceIds.has(s.id) || assignedOnly.has(s.id));

  const projects = visibleProjects(input.projects, userId, sourceIds, assignedOnly);
  const tasks = visibleTasks(input.tasks, input.projects, userId, sourceIds, assignedOnly);
  const pullRequests = visiblePullRequests(input.pullRequests ?? [], userId, sourceIds, assignedOnly);
  const approverRoleIds = new Set(input.approverRoleIds ?? []);
  const approverUserIds = input.members
    .filter((m) => m.membership.roleIds.some((id) => approverRoleIds.has(id)))
    .map((m) => m.id);

  const involved = new Set<string>([userId]);
  for (const t of tasks) for (const id of t.assigneeUserIds) involved.add(id);
  for (const p of projects) {
    involved.add(p.ownerUserId);
    for (const id of p.memberUserIds) involved.add(id);
  }
  for (const pr of pullRequests) for (const id of pr.peopleUserIds) involved.add(id);
  const users = input.members.filter((m) => involved.has(m.id));

  const viewer = input.members.find((m) => m.id === userId);
  const isManager = viewer ? viewer.membership.access !== 'member' : false;
  const planHistory = input.planHistory.filter((plan) =>
    isManager ? involved.has(plan.userId) : plan.userId === userId,
  );

  // Only the objectives that count for this role (ADR-013): a gap or an
  // empty objective of another role is not this role's signal.
  const objectives = activeObjectives(input.objectives, roleId);

  const signals = computeSignals({
    today: input.today,
    objectives,
    projects,
    tasks,
    users,
    planHistory,
    pullRequests,
    repos: repos.filter((r) => sourceIds.has(r.id)),
    approverUserIds,
    finishedStatuses: input.finishedStatuses,
    day: input.day,
  }).filter((s) => !(partial && s.kind === 'empty_objective'));

  return {
    role,
    sourceIds: [...sourceIds],
    assignedOnlySourceIds: [...assignedOnly],
    repoIds: repos.filter((r) => sourceIds.has(r.id)).map((r) => r.id),
    pullRequests,
    approverUserIds,
    partial,
    objectives,
    projects,
    tasks,
    users,
    planHistory,
    signals,
  };
}

/**
 * Open, unowned tasks the person could take, out of a scope already free of
 * hidden data: app tasks and tasks of the sources the role sees whole, highest
 * priority first. Nothing from an assigned-only source can be here — of those
 * the person only ever sees their own — so a plan built from this list never
 * hands somebody work their role could not have seen.
 */
export function pickableTasks(scope: Pick<Scoped, 'tasks' | 'assignedOnlySourceIds'>): Task[] {
  const assignedOnly = new Set(scope.assignedOnlySourceIds);
  return scope.tasks
    .filter(
      (t) =>
        t.status !== 'done' &&
        t.assigneeUserIds.length === 0 &&
        !(t.source === 'notion' && t.sourceId && assignedOnly.has(t.sourceId)),
    )
    .sort((a, b) => PRIORITY_WEIGHT[b.priority] - PRIORITY_WEIGHT[a.priority]);
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
