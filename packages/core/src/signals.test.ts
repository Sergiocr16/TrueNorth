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
import type { DailyPlan, Objective, Project, Task, User } from './types';

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
