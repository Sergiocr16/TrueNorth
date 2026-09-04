import { describe, expect, it } from 'vitest';
import {
  AT_RISK_GAP_POINTS,
  computeSignals,
  expectedProgressPct,
  healthFrom,
  isOverdue,
  progressGap,
} from './signals';
import { NOTION_TASK_STATUS, taskStatusFromNotion } from './notion-status';
import * as fixtures from './fixtures';
import type { Objective, Project, Task, User } from './types';

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
    assigneeUserId: 'u1',
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

  it('flags unassigned and undated tasks', () => {
    const signals = computeSignals({
      today: TODAY,
      objectives: [objective()],
      projects: [project()],
      tasks: [task({ assigneeUserId: null, dueDate: null })],
      users,
    });
    expect(signals.some((s) => s.kind === 'unassigned_task')).toBe(true);
    expect(signals.some((s) => s.kind === 'undated_task')).toBe(true);
  });

  it('flags a person carrying well above the team average', () => {
    const many = Array.from({ length: 6 }, (_, i) =>
      task({ id: `a${i}`, code: `TAR-A${i}`, assigneeUserId: 'u1' }),
    );
    const few = [task({ id: 'b1', code: 'TAR-B1', assigneeUserId: 'u2' })];
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
