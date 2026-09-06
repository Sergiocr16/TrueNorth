import { describe, expect, it } from 'vitest';
import {
  AT_RISK_GAP_POINTS,
  OVERDUE_LOAD_TASKS,
  PLAN_IGNORED_DAYS,
  PLAN_SLIPPING_ITEMS,
  SILENT_OWNER_TASKS,
  STALE_TASK_DAYS,
  computeSignals,
  expectedProgressPct,
  healthFrom,
  idleDays,
  isOverdue,
  lastMovementAt,
  progressGap,
} from './signals';
import { NOTION_TASK_STATUS, taskStatusFromNotion } from './notion-status';
import * as fixtures from './fixtures';
import type { DailyPlan, GithubRepo, Objective, Project, PullRequest, Signal, Task, User } from './types';

const TODAY = new Date('2026-09-03T00:00:00');

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: 't1',
    companyId: 'c1',
    projectId: 'p1',
    code: 'TAR-001',
    title: 'Task',
    status: 'todo',
    priority: 'medium',
    dueDate: null,
    assigneeUserIds: ['u1'],
    dependsOn: [],
    source: 'app',
    ...overrides,
  };
}

function objective(overrides: Partial<Objective> = {}): Objective {
  return {
    id: 'o1',
    companyId: 'c1',
    title: 'Objective',
    expectedResult: '',
    startDate: '2026-01-01',
    targetDate: '2026-12-31',
    priority: 'medium',
    ownerUserId: 'u1',
    progressPct: 50,
    status: 'on_track',
    indicators: [],
    ...overrides,
  };
}

function project(overrides: Partial<Project> = {}): Project {
  return {
    id: 'p1',
    companyId: 'c1',
    name: 'Project',
    description: '',
    visibility: 'company',
    objectiveIds: ['o1'],
    memberUserIds: ['u1'],
    ownerUserId: 'u1',
    startDate: '2026-01-01',
    targetDate: '2026-12-31',
    progressPct: 50,
    status: 'on_track',
    source: 'app',
    ...overrides,
  };
}

const users: User[] = [
  {
    id: 'u1',
    displayName: 'A',
    email: 'a@x.com',
    initials: 'A',
    timezone: 'America/Costa_Rica',
    notifyHour: 6,
    locale: 'es',
    theme: 'system',
    reduceTransparency: false,
  },
  {
    id: 'u2',
    displayName: 'B',
    email: 'b@x.com',
    initials: 'B',
    timezone: 'America/Costa_Rica',
    notifyHour: 6,
    locale: 'es',
    theme: 'system',
    reduceTransparency: false,
  },
];

describe('expected progress', () => {
  it('is linear across the window', () => {
    // Half the year gone by 2 July on a 1 Jan to 31 Dec window.
    expect(expectedProgressPct('2026-01-01', '2026-12-31', new Date('2026-07-02T00:00:00'))).toBe(50);
  });

  it('clamps before the start and after the target', () => {
    expect(expectedProgressPct('2026-06-01', '2026-12-31', new Date('2026-01-01T00:00:00'))).toBe(0);
    expect(expectedProgressPct('2026-01-01', '2026-02-01', new Date('2026-09-03T00:00:00'))).toBe(100);
  });

  it('treats a zero-length window as finished', () => {
    expect(expectedProgressPct('2026-09-03', '2026-09-03', TODAY)).toBe(100);
  });
});

describe('health', () => {
  it('is on track when the gap is inside the tolerance', () => {
    const item = { startDate: '2026-01-01', targetDate: '2026-12-31', progressPct: 60 };
    expect(progressGap(item, new Date('2026-07-02T00:00:00'))).toBeLessThanOrEqual(
      AT_RISK_GAP_POINTS,
    );
    expect(healthFrom(item, new Date('2026-07-02T00:00:00'))).toBe('on_track');
  });

  it('is at risk once the gap passes the tolerance', () => {
    const item = { startDate: '2026-01-01', targetDate: '2026-12-31', progressPct: 20 };
    expect(healthFrom(item, new Date('2026-07-02T00:00:00'))).toBe('at_risk');
  });

  it('is late once the target date has passed', () => {
    const item = { startDate: '2026-01-01', targetDate: '2026-08-01', progressPct: 90 };
    expect(healthFrom(item, TODAY)).toBe('late');
  });

  it('is done at full progress even past the date', () => {
    const item = { startDate: '2026-01-01', targetDate: '2026-08-01', progressPct: 100 };
    expect(healthFrom(item, TODAY)).toBe('done');
  });
});

describe('overdue', () => {
  it('ignores tasks with no due date and finished tasks', () => {
    expect(isOverdue(task({ dueDate: null }), TODAY)).toBe(false);
    expect(isOverdue(task({ dueDate: '2026-01-01', status: 'done' }), TODAY)).toBe(false);
  });

  it('does not count a task due today as overdue', () => {
    expect(isOverdue(task({ dueDate: '2026-09-03' }), TODAY)).toBe(false);
  });

  it('counts a past due date', () => {
    expect(isOverdue(task({ dueDate: '2026-09-02' }), TODAY)).toBe(true);
  });
});

const repo = (overrides: Partial<GithubRepo> = {}): GithubRepo => ({
  id: 'gh_api',
  companyId: 'c1',
  owner: 'aditum',
  name: 'api',
  fullName: 'aditum/api',
  repoId: 1,
  projectId: 'p1',
  baseBranch: 'development',
  lastSyncAt: null,
  lastFullSyncAt: null,
  lastSyncError: null,
  counts: { open: 0, awaiting: 0, changesRequested: 0, approved: 0 },
  createdBy: 'u1',
  createdAt: '2026-01-01',
  ...overrides,
});

const pull = (overrides: Partial<PullRequest> = {}): PullRequest => ({
  id: 'gh_api_42',
  companyId: 'c1',
  repoId: 'gh_api',
  number: 42,
  title: 'Portal de proveedores',
  url: 'https://github.com/aditum/api/pull/42',
  state: 'open',
  draft: false,
  baseRef: 'development',
  headRef: 'feature/TAR-001',
  authorLogin: 'dev',
  authorUserId: 'u1',
  reviewerLogins: [],
  reviewerUserIds: [],
  peopleUserIds: ['u1'],
  createdAt: '2026-08-25T10:00:00Z',
  updatedAt: '2026-08-25T10:00:00Z',
  mergedAt: null,
  closedAt: null,
  lastPushAt: '2026-08-25T10:00:00Z',
  reviewState: 'none',
  lastReviewAt: null,
  lastReviewBy: null,
  lastAuthorActivityAt: '2026-08-25T10:00:00Z',
  taskCode: 'TAR-001',
  taskId: 't1',
  projectId: 'p1',
  syncedAt: '2026-09-03T00:00:00Z',
  ...overrides,
});

describe('pull request signals (ADR-010)', () => {
  const finished = ['Pruebas QA', 'Lista para deploy'];
  const run = (extra: {
    tasks?: Task[];
    pullRequests?: PullRequest[];
    repos?: GithubRepo[];
    approverUserIds?: string[];
    finishedStatuses?: string[];
  }) =>
    computeSignals({
      today: TODAY,
      objectives: [objective()],
      projects: [project()],
      tasks: extra.tasks ?? [],
      users,
      pullRequests: extra.pullRequests ?? [],
      repos: extra.repos ?? [repo()],
      approverUserIds: extra.approverUserIds ?? ['u2'],
      finishedStatuses: extra.finishedStatuses ?? finished,
    });
  const byId = (signals: Signal[], id: string) => signals.find((s) => s.id === id);

  it('says a task in a finished status owes a pull request, only where one can exist', () => {
    const done = task({ status: 'in_progress', notionStatus: 'Pruebas QA', statusChangedAt: '2026-08-30T10:00:00Z' });
    const missing = byId(run({ tasks: [done] }), 'pr_missing:t1');
    expect(missing?.severity).toBe('info');
    expect(missing?.userId).toBe('u1');
    expect(missing?.summary.es).toBe('Task (TAR-001) está en Pruebas QA hace 4 días y no tiene pull request hacia development');
    expect(missing?.data).toEqual({ days: 4, status: 'Pruebas QA' });

    // Any pull request for the task, toward any branch, satisfies it.
    expect(byId(run({ tasks: [done], pullRequests: [pull({ baseRef: 'project/x' })] }), 'pr_missing:t1')).toBeUndefined();
    expect(byId(run({ tasks: [done], pullRequests: [pull({ state: 'merged' })] }), 'pr_missing:t1')).toBeUndefined();
    // A closed, unmerged one does not.
    expect(byId(run({ tasks: [done], pullRequests: [pull({ state: 'closed' })] }), 'pr_missing:t1')).toBeDefined();
    // No repository for the project, a status outside the list, done, or too fresh: silent.
    expect(byId(run({ tasks: [done], repos: [repo({ projectId: 'other' })] }), 'pr_missing:t1')).toBeUndefined();
    expect(byId(run({ tasks: [task({ ...done, notionStatus: 'En curso' })] }), 'pr_missing:t1')).toBeUndefined();
    expect(byId(run({ tasks: [task({ ...done, status: 'done', notionStatus: 'Finalizada' })] }), 'pr_missing:t1')).toBeUndefined();
    expect(byId(run({ tasks: [task({ ...done, statusChangedAt: '2026-09-03T08:00:00Z' })] }), 'pr_missing:t1')).toBeUndefined();
  });

  it('hands a pull request waiting for review to the approvers, critical after a week, never a draft', () => {
    const waiting = byId(run({ tasks: [task()], pullRequests: [pull()] }), 'pr_awaiting_review:gh_api_42');
    expect(waiting?.severity).toBe('critical');
    expect(waiting?.userIds).toEqual(['u2']);
    expect(waiting?.taskId).toBe('t1');
    expect(waiting?.summary.es).toBe('#42 Portal de proveedores de Task (TAR-001) lleva 9 días esperando revisión');
    expect(waiting?.data).toMatchObject({ days: 9, number: 42, url: 'https://github.com/aditum/api/pull/42' });

    const fresh = pull({ lastPushAt: '2026-09-02T10:00:00Z' });
    expect(byId(run({ pullRequests: [fresh] }), 'pr_awaiting_review:gh_api_42')).toBeUndefined();
    const threeDays = pull({ lastPushAt: '2026-08-31T10:00:00Z' });
    expect(byId(run({ pullRequests: [threeDays] }), 'pr_awaiting_review:gh_api_42')?.severity).toBe('warning');
    expect(byId(run({ pullRequests: [pull({ draft: true })] }), 'pr_awaiting_review:gh_api_42')).toBeUndefined();
    // Toward a project branch it is still waiting, and says so.
    const stacked = byId(run({ pullRequests: [pull({ baseRef: 'project/passkeys' })] }), 'pr_awaiting_review:gh_api_42');
    expect(stacked?.summary.es).toContain('(hacia project/passkeys)');
  });

  it('falls back to the requested reviewers when no approver role is set, and never asks the author', () => {
    const own = pull({ reviewerUserIds: ['u3', 'u1'] });
    const signal = byId(run({ pullRequests: [own], approverUserIds: [] }), 'pr_awaiting_review:gh_api_42');
    expect(signal?.userIds).toEqual(['u3']);
    expect(byId(run({ pullRequests: [pull()], approverUserIds: [] }), 'pr_awaiting_review:gh_api_42')).toBeUndefined();
    expect(byId(run({ pullRequests: [pull()], approverUserIds: ['u1'] }), 'pr_awaiting_review:gh_api_42')).toBeUndefined();
  });

  it('turns changes requested into the author’s signal until they push or answer', () => {
    const asked = pull({
      reviewState: 'changes_requested',
      lastReviewAt: '2026-08-30T10:00:00Z',
      lastReviewBy: 'u2',
      lastAuthorActivityAt: '2026-08-25T10:00:00Z',
    });
    const signal = byId(run({ pullRequests: [asked] }), 'pr_changes_requested:gh_api_42');
    expect(signal?.severity).toBe('warning');
    expect(signal?.userId).toBe('u1');
    expect(signal?.summary.es).toContain('pidió cambios hace 4 días y no hay respuesta del autor');
    expect(byId(run({ pullRequests: [asked] }), 'pr_awaiting_review:gh_api_42')).toBeUndefined();

    const answered = pull({ ...asked, lastAuthorActivityAt: '2026-09-01T10:00:00Z' });
    expect(byId(run({ pullRequests: [answered] }), 'pr_changes_requested:gh_api_42')).toBeUndefined();
  });

  it('asks the approvers to merge what they approved', () => {
    const approved = pull({ reviewState: 'approved', lastReviewAt: '2026-08-31T10:00:00Z', lastReviewBy: 'u2' });
    const signal = byId(run({ pullRequests: [approved] }), 'pr_approved_unmerged:gh_api_42');
    expect(signal?.severity).toBe('warning');
    expect(signal?.userIds).toEqual(['u2']);
    expect(signal?.summary.es).toContain('está aprobado hace 3 días y sin fusionar');
    expect(byId(run({ pullRequests: [pull({ ...approved, state: 'merged' })] }), 'pr_approved_unmerged:gh_api_42')).toBeUndefined();
  });
});

describe('computeSignals', () => {
  it('raises a gap signal with the numbers behind it', () => {
    const signals = computeSignals({
      today: TODAY,
      objectives: [objective({ progressPct: 10 })],
      projects: [project()],
      tasks: [task()],
      users,
    });
    const gap = signals.find((s) => s.kind === 'progress_gap');
    expect(gap).toBeDefined();
    expect(gap!.data?.actual).toBe(10);
    expect(gap!.summary.es).toContain('por detrás');
    expect(gap!.summary.en).toContain('behind');
  });

  it('flags a project that serves no objective but still consumes work', () => {
    const signals = computeSignals({
      today: TODAY,
      objectives: [objective()],
      projects: [project({ objectiveIds: [] })],
      tasks: [task()],
      users,
    });
    expect(signals.some((s) => s.kind === 'orphan_project')).toBe(true);
  });

  it('does not flag an orphan project with no open work', () => {
    const signals = computeSignals({
      today: TODAY,
      objectives: [objective()],
      projects: [project({ objectiveIds: [] })],
      tasks: [task({ status: 'done' })],
      users,
    });
    expect(signals.some((s) => s.kind === 'orphan_project')).toBe(false);
  });

  it('flags an objective with no active work', () => {
    const signals = computeSignals({
      today: TODAY,
      objectives: [objective()],
      projects: [project()],
      tasks: [task({ status: 'done' })],
      users,
    });
    expect(signals.some((s) => s.kind === 'empty_objective')).toBe(true);
  });

  it('names the blocker on a blocked task', () => {
    const blocker = task({ id: 't1', code: 'TAR-001' });
    const blocked = task({ id: 't2', code: 'TAR-002', dependsOn: ['t1'], status: 'blocked' });
    const signals = computeSignals({
      today: TODAY,
      objectives: [objective()],
      projects: [project()],
      tasks: [blocker, blocked],
      users,
    });
    const signal = signals.find((s) => s.kind === 'blocked_task');
    expect(signal?.summary.es).toContain('TAR-001');
  });

  it('separates due today from overdue', () => {
    const signals = computeSignals({
      today: TODAY,
      objectives: [objective()],
      projects: [project()],
      tasks: [
        task({ id: 't1', code: 'TAR-001', dueDate: '2026-09-03' }),
        task({ id: 't2', code: 'TAR-002', dueDate: '2026-08-20' }),
      ],
      users,
    });
    expect(signals.find((s) => s.kind === 'due_today')?.taskId).toBe('t1');
    expect(signals.find((s) => s.kind === 'overdue_task')?.taskId).toBe('t2');
  });

  // Late is not stuck. The overdue signal says whether the owner has moved
  // the task lately, so the model can tell "ask for a date" from "chase".
  it('says whether an overdue task is still moving, judged by its owner', () => {
    const comment = (authorUserId: string, createdAt: string) => ({
      id: `c-${authorUserId}`,
      authorUserId,
      authorName: authorUserId,
      createdAt,
      text: 'avance',
    });
    const signals = computeSignals({
      today: TODAY,
      objectives: [objective()],
      projects: [project()],
      tasks: [
        // The owner wrote on it yesterday: late but moving.
        task({
          id: 'moving',
          dueDate: '2026-08-20',
          status: 'in_progress',
          statusChangedAt: '2026-07-01T00:00:00Z',
          comments: [comment('u1', '2026-09-02T10:00:00Z')],
          lastCommentAt: '2026-09-02T10:00:00Z',
          lastCommentBy: 'u1',
        }),
        // Only somebody else asked about it: a question, not progress.
        task({
          id: 'silent',
          dueDate: '2026-08-20',
          status: 'in_progress',
          statusChangedAt: '2026-07-01T00:00:00Z',
          comments: [comment('u2', '2026-09-02T10:00:00Z')],
          lastCommentAt: '2026-09-02T10:00:00Z',
          lastCommentBy: 'u2',
        }),
        // Nothing known about its movement at all: no claim either way.
        task({ id: 'unknown', dueDate: '2026-08-20', status: 'in_progress' }),
      ],
      users,
    });
    const moving = signals.find((s) => s.id === 'overdue:moving');
    expect(moving?.summary.es).toContain('pero el responsable la movió hace 1 día');
    expect(moving?.data).toMatchObject({ days: 14, progressDays: 1, moving: 1 });

    const silent = signals.find((s) => s.id === 'overdue:silent');
    expect(silent?.summary.es).toContain('sin avance del responsable hace 64 días');
    expect(silent?.data).toMatchObject({ progressDays: 64, moving: 0 });

    const unknown = signals.find((s) => s.id === 'overdue:unknown');
    expect(unknown?.summary.es).toBe('Task (TAR-001) lleva 14 días vencida');
    expect(unknown?.data).toEqual({ days: 14 });
  });

  it('flags unassigned work in flight, and undated tasks', () => {
    const signals = computeSignals({
      today: TODAY,
      objectives: [objective()],
      projects: [project()],
      tasks: [task({ status: 'in_progress', assigneeUserIds: [], dueDate: null })],
      users,
    });
    expect(signals.some((s) => s.kind === 'unassigned_task')).toBe(true);
    expect(signals.some((s) => s.kind === 'undated_task')).toBe(true);
  });

  // The backlog is full of things nobody has started, and those have no owner
  // by design. Flagging each one would bury the unassigned task that matters.
  it('does not flag an unstarted task for having no owner', () => {
    const signals = computeSignals({
      today: TODAY,
      objectives: [objective()],
      projects: [project()],
      tasks: [task({ status: 'todo', assigneeUserIds: [] })],
      users,
    });
    expect(signals.some((s) => s.kind === 'unassigned_task')).toBe(false);
  });

  it('flags a person carrying well above the team average', () => {
    const many = Array.from({ length: 6 }, (_, i) =>
      task({ id: `a${i}`, code: `TAR-A${i}`, assigneeUserIds: ['u1'] }),
    );
    const few = [task({ id: 'b1', code: 'TAR-B1', assigneeUserIds: ['u2'] })];
    const signals = computeSignals({
      today: TODAY,
      objectives: [objective()],
      projects: [project()],
      tasks: [...many, ...few],
      users,
    });
    const workload = signals.find((s) => s.kind === 'workload');
    expect(workload?.userId).toBe('u1');
  });

  it('produces the same signals for the same input', () => {
    const input = {
      today: TODAY,
      objectives: fixtures.objectives,
      projects: fixtures.projects,
      tasks: fixtures.tasks,
      users: fixtures.users,
    };
    expect(computeSignals(input)).toEqual(computeSignals(input));
  });
});

describe('Notion status mapping', () => {
  it('covers every status ADITUM uses', () => {
    expect(Object.keys(NOTION_TASK_STATUS)).toHaveLength(15);
  });

  it('treats a dependency status as blocked', () => {
    expect(taskStatusFromNotion('Depende de otra TAR')).toBe('blocked');
  });

  it('treats both completion statuses as done', () => {
    expect(taskStatusFromNotion('Finalizada')).toBe('done');
    expect(taskStatusFromNotion('Archivadas')).toBe('done');
  });

  it('falls back to todo for an unknown label', () => {
    expect(taskStatusFromNotion('Algo nuevo')).toBe('todo');
    expect(taskStatusFromNotion(undefined)).toBe('todo');
  });
});

describe('ADITUM fixtures', () => {
  it('every plan item cites a signal that actually exists', () => {
    const signals = computeSignals({
      today: TODAY,
      objectives: fixtures.objectives,
      projects: fixtures.projects,
      tasks: fixtures.tasks,
      users: fixtures.users,
    });
    const ids = new Set(signals.map((s) => s.id));
    for (const item of fixtures.todaysPlan.items) {
      expect(item.signalIds.some((id) => ids.has(id))).toBe(true);
    }
  });

  it('keeps the plan within the three-to-five item contract', () => {
    expect(fixtures.todaysPlan.items.length).toBeGreaterThanOrEqual(3);
    expect(fixtures.todaysPlan.items.length).toBeLessThanOrEqual(5);
  });
});

/* ------------------------------------------------------------------ */
/* Follow-up signals                                                   */
/* ------------------------------------------------------------------ */

function plan(userId: string, date: string, feedback: DailyPlan['feedback'] = {}): DailyPlan {
  return {
    id: `${date}_${userId}_r1`,
    companyId: 'c1',
    userId,
    roleId: 'r1',
    date,
    headline: 'Headline',
    why: 'Why',
    items: [],
    consequenceIfNotDone: 'Something',
    deliveredAt: `${date}T06:00:00-06:00`,
    stale: false,
    feedback,
  };
}

/** Signals are found by id, which is also the contract the model cites. */
function find(signals: ReturnType<typeof computeSignals>, id: string) {
  return signals.find((s) => s.id === id);
}

function run(overrides: {
  tasks?: Task[];
  projects?: Project[];
  objectives?: Objective[];
  planHistory?: DailyPlan[];
}) {
  return computeSignals({
    today: TODAY,
    objectives: overrides.objectives ?? [],
    projects: overrides.projects ?? [],
    tasks: overrides.tasks ?? [],
    users,
    planHistory: overrides.planHistory,
  });
}

describe('task movement', () => {
  it('takes the latest of every stamp it has', () => {
    const t = task({
      statusChangedAt: '2026-08-20T09:00:00-06:00',
      lastCommentAt: '2026-08-28T15:00:00-06:00',
      updatedAt: '2026-08-22T11:00:00-06:00',
    });
    expect(lastMovementAt(t)).toBe('2026-08-28T15:00:00-06:00');
    expect(idleDays(t, TODAY)).toBe(6);
  });

  // Not knowing when something moved is not the same as knowing it has not.
  // A task synced for the first time yesterday must not read as abandoned.
  it('says nothing when there is no stamp at all', () => {
    expect(lastMovementAt(task())).toBeNull();
    expect(idleDays(task(), TODAY)).toBeNull();
  });
});

describe('stalled work', () => {
  it('flags a task in flight that has not moved', () => {
    const signals = run({
      tasks: [task({ status: 'in_progress', statusChangedAt: '2026-08-20T09:00:00-06:00' })],
    });
    const signal = find(signals, 'stale_task:t1');
    expect(signal?.kind).toBe('stale_task');
    expect(signal?.userId).toBe('u1');
    expect(signal?.data?.days).toBe(14);
  });

  // One stale task among hundreds is normal. Only the pile is worth a badge.
  it('keeps a single stalled task at info severity', () => {
    const signals = run({
      tasks: [task({ status: 'in_progress', statusChangedAt: '2026-08-20T09:00:00-06:00' })],
    });
    expect(find(signals, 'stale_task:t1')?.severity).toBe('info');
  });

  it('leaves alone work that moved inside the window', () => {
    // Four days back, one inside the five-day threshold.
    const signals = run({
      tasks: [task({ status: 'in_progress', statusChangedAt: '2026-08-30T09:00:00-06:00' })],
    });
    expect(find(signals, 'stale_task:t1')).toBeUndefined();
  });

  it('ignores work nobody has started and work that is finished', () => {
    const old = '2026-07-01T09:00:00-06:00';
    const signals = run({
      tasks: [
        task({ id: 'todo', status: 'todo', statusChangedAt: old }),
        task({ id: 'done', status: 'done', statusChangedAt: old }),
      ],
    });
    expect(find(signals, 'stale_task:todo')).toBeUndefined();
    expect(find(signals, 'stale_task:done')).toBeUndefined();
  });

  it('makes the person the story once several of their tasks stall', () => {
    const old = '2026-08-01T09:00:00-06:00';
    const tasks = Array.from({ length: SILENT_OWNER_TASKS }, (_, i) =>
      task({ id: `t${i}`, status: 'in_progress', statusChangedAt: old }),
    );
    const signals = run({ tasks });
    const signal = find(signals, 'silent_owner:u1');
    expect(signal?.severity).toBe('warning');
    expect(signal?.data?.count).toBe(SILENT_OWNER_TASKS);
  });

  it('does not blame a person for a single stalled task', () => {
    const signals = run({
      tasks: [task({ status: 'in_progress', statusChangedAt: '2026-08-01T09:00:00-06:00' })],
    });
    expect(find(signals, 'silent_owner:u1')).toBeUndefined();
  });
});

describe('unanswered comments', () => {
  it('puts the debt on the person responsible when somebody else asked', () => {
    const signals = run({
      tasks: [
        task({
          status: 'in_progress',
          assigneeUserIds: ['u1'],
          lastCommentAt: '2026-08-28T15:00:00-06:00',
          lastCommentBy: 'u2',
        }),
      ],
    });
    const signal = find(signals, 'comment_unanswered:t1');
    expect(signal?.userId).toBe('u1');
    expect(signal?.summary.es).toContain('nadie respondió');
  });

  // A silent conversation is not late work: what marks a task as behind is its
  // own state. `info` keeps it off the badge, out of *Avisos* and away from the
  // health compass, all of which count everything above `info`.
  it('does not count as a flag: an unanswered comment is not a delay', () => {
    const signals = run({
      tasks: [
        task({
          status: 'in_progress',
          assigneeUserIds: ['u1'],
          lastCommentAt: '2026-08-28T15:00:00-06:00',
          lastCommentBy: 'u2',
        }),
      ],
    });
    expect(find(signals, 'comment_unanswered:t1')?.severity).toBe('info');
    expect(signals.filter((s) => s.severity !== 'info')).toHaveLength(0);
  });

  // The other direction is the one Sergio cares about: somebody asked for help
  // and the person leading the project never came back.
  it('puts it on whoever leads the project when the assignee asked', () => {
    const signals = run({
      projects: [project({ id: 'p1', ownerUserId: 'u2' })],
      tasks: [
        task({
          projectId: 'p1',
          status: 'in_progress',
          assigneeUserIds: ['u1'],
          lastCommentAt: '2026-08-28T15:00:00-06:00',
          lastCommentBy: 'u1',
        }),
      ],
    });
    expect(find(signals, 'comment_unanswered:t1')?.userId).toBe('u2');
  });

  it('says nothing when the only person who could answer is the one who asked', () => {
    const signals = run({
      projects: [project({ id: 'p1', ownerUserId: 'u1' })],
      tasks: [
        task({
          projectId: 'p1',
          status: 'in_progress',
          assigneeUserIds: ['u1'],
          lastCommentAt: '2026-08-28T15:00:00-06:00',
          lastCommentBy: 'u1',
        }),
      ],
    });
    expect(find(signals, 'comment_unanswered:t1')).toBeUndefined();
  });

  it('gives a fresh comment time to be answered', () => {
    const signals = run({
      tasks: [
        task({
          status: 'in_progress',
          lastCommentAt: '2026-09-03T08:00:00-06:00',
          lastCommentBy: 'u2',
        }),
      ],
    });
    expect(find(signals, 'comment_unanswered:t1')).toBeUndefined();
  });
});

describe('nobody chasing the work', () => {
  it('flags the project lead when other people\'s tasks sit still', () => {
    const old = '2026-08-01T09:00:00-06:00';
    const tasks = Array.from({ length: SILENT_OWNER_TASKS }, (_, i) =>
      task({ id: `t${i}`, projectId: 'p1', status: 'in_progress', assigneeUserIds: ['u1'], statusChangedAt: old }),
    );
    const signals = run({ projects: [project({ id: 'p1', ownerUserId: 'u2' })], tasks });
    const signal = find(signals, 'no_followup:u2:p1');
    expect(signal?.userId).toBe('u2');
    expect(signal?.data?.count).toBe(SILENT_OWNER_TASKS);
  });

  // A lead sitting on their own work is `silent_owner`, not a follow-up failure.
  it('does not count the lead\'s own tasks against them twice', () => {
    const old = '2026-08-01T09:00:00-06:00';
    const tasks = Array.from({ length: SILENT_OWNER_TASKS }, (_, i) =>
      task({ id: `t${i}`, projectId: 'p1', status: 'in_progress', assigneeUserIds: ['u2'], statusChangedAt: old }),
    );
    const signals = run({ projects: [project({ id: 'p1', ownerUserId: 'u2' })], tasks });
    expect(find(signals, 'no_followup:u2:p1')).toBeUndefined();
    expect(find(signals, 'silent_owner:u2')).toBeDefined();
  });
});

describe('engagement with the plan', () => {
  it('notices a run of plans nobody ever marked', () => {
    const history = Array.from({ length: PLAN_IGNORED_DAYS }, (_, i) =>
      plan('u1', `2026-08-${String(28 + i).padStart(2, '0')}`),
    );
    expect(find(run({ planHistory: history }), 'plan_ignored:u1')?.data?.days).toBe(
      PLAN_IGNORED_DAYS,
    );
  });

  it('says nothing once somebody marks even one item', () => {
    const history = Array.from({ length: PLAN_IGNORED_DAYS }, (_, i) =>
      plan('u1', `2026-08-${String(28 + i).padStart(2, '0')}`),
    );
    history[0]!.feedback = { 0: 'done' };
    expect(find(run({ planHistory: history }), 'plan_ignored:u1')).toBeUndefined();
  });

  it('counts skipped actions across the window', () => {
    const feedback = Object.fromEntries(
      Array.from({ length: PLAN_SLIPPING_ITEMS }, (_, i) => [i, 'skipped' as const]),
    );
    const signals = run({ planHistory: [plan('u1', '2026-09-02', feedback)] });
    expect(find(signals, 'plan_slipping:u1')?.data?.count).toBe(PLAN_SLIPPING_ITEMS);
  });

  // These need other people's plans, which only the engine can read.
  it('produces nothing at all without plan history', () => {
    const signals = run({});
    expect(signals.filter((s) => s.kind === 'plan_ignored')).toHaveLength(0);
    expect(signals.filter((s) => s.kind === 'plan_slipping')).toHaveLength(0);
  });
});

describe('people, not tasks', () => {
  it('flags somebody with nothing assigned at all', () => {
    const signals = run({ tasks: [task({ assigneeUserIds: ['u1'] })] });
    expect(find(signals, 'no_owned_work:u2')).toBeDefined();
    expect(find(signals, 'no_owned_work:u1')).toBeUndefined();
  });

  it('flags a pile of overdue work as one signal about the person', () => {
    const tasks = Array.from({ length: OVERDUE_LOAD_TASKS }, (_, i) =>
      task({ id: `t${i}`, dueDate: '2026-08-01', assigneeUserIds: ['u1'] }),
    );
    const signal = find(run({ tasks }), 'overdue_load:u1');
    expect(signal?.severity).toBe('warning');
    expect(signal?.data?.count).toBe(OVERDUE_LOAD_TASKS);
  });
});

describe('projects that stopped moving', () => {
  it('reads the progress trail rather than the dates', () => {
    const signals = run({
      projects: [
        project({ id: 'p1', progressPct: 40, history: [{ date: '2026-08-01', value: 40 }] }),
      ],
    });
    expect(find(signals, 'stale_progress:p1')?.data?.days).toBe(33);
  });

  // Without a trail there is nothing to compare, and silence is the honest answer.
  it('says nothing about a project with no history yet', () => {
    const signals = run({ projects: [project({ id: 'p1', progressPct: 40 })] });
    expect(find(signals, 'stale_progress:p1')).toBeUndefined();
  });
});
