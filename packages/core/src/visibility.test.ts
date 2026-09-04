import { describe, expect, it } from 'vitest';
import type { Project, Signal, Task } from './types';
import { teamSignals, visibleProjects, visibleSignals, visibleTasks } from './visibility';

const project = (
  id: string,
  visibility: Project['visibility'],
  memberUserIds: string[],
): Project => ({
  id,
  companyId: 'c',
  name: id,
  description: '',
  visibility,
  objectiveIds: [],
  memberUserIds,
  ownerUserId: memberUserIds[0] ?? 'nobody',
  startDate: '2026-01-01',
  targetDate: '2026-12-31',
  progressPct: 0,
  status: 'on_track',
  source: 'app',
});

const task = (id: string, projectId: string | null, assignee: string | null): Task => ({
  id,
  companyId: 'c',
  projectId,
  code: id.toUpperCase(),
  title: id,
  status: 'todo',
  priority: 'medium',
  dueDate: null,
  assigneeUserIds: assignee ? [assignee] : [],
  dependsOn: [],
  source: 'app',
});

const signal = (id: string, extra: Partial<Signal>): Signal => ({
  id,
  kind: 'overdue_task',
  severity: 'warning',
  summary: { es: id, en: id },
  ...extra,
});

const projects = [
  project('p_company', 'company', ['ana']),
  project('p_private', 'private', ['ana']),
  project('p_shared', 'shared', ['ana', 'bob']),
];
const ids = <T extends { id: string }>(items: T[]) => items.map((i) => i.id);

describe('visibleProjects', () => {
  it('shows company-wide projects to everyone', () => {
    expect(ids(visibleProjects(projects, 'carla'))).toEqual(['p_company']);
  });

  it('shows private and shared projects only to the people on them', () => {
    expect(ids(visibleProjects(projects, 'bob'))).toEqual(['p_company', 'p_shared']);
    expect(ids(visibleProjects(projects, 'ana'))).toEqual(['p_company', 'p_private', 'p_shared']);
  });
});

describe('visibleTasks', () => {
  const tasks = [
    task('t1', 'p_company', null),
    task('t2', 'p_private', 'bob'),
    task('t3', null, 'bob'),
    task('t4', 'p_shared', 'ana'),
  ];

  it('hides a task on a hidden project even when it is assigned to the person', () => {
    expect(ids(visibleTasks(tasks, projects, 'bob'))).toEqual(['t1', 't3', 't4']);
  });

  it('keeps tasks that belong to no project', () => {
    expect(ids(visibleTasks(tasks, projects, 'carla'))).toEqual(['t1', 't3']);
  });
});

describe('visibleSignals', () => {
  const signals = [
    signal('overdue:t2', { taskId: 't2', projectId: 'p_private', userId: 'bob' }),
    signal('overdue:t3', { taskId: 't3', userId: 'bob' }),
    signal('orphan:p_private', { kind: 'orphan_project', projectId: 'p_private' }),
    signal('gap:o1', { kind: 'progress_gap', objectiveId: 'o1' }),
    signal('overdue:t4', { taskId: 't4', projectId: 'p_shared', userId: 'ana' }),
  ];

  it('drops signals that would reveal a hidden project, even ones about the person', () => {
    expect(ids(visibleSignals(signals, projects, 'bob'))).toEqual([
      'overdue:t3',
      'gap:o1',
      'overdue:t4',
    ]);
  });

  it('keeps every project signal for somebody on every project', () => {
    // Everything but the signal about bob's project-less task, which is his alone.
    expect(ids(visibleSignals(signals, projects, 'ana'))).toEqual([
      'overdue:t2',
      'orphan:p_private',
      'gap:o1',
      'overdue:t4',
    ]);
  });
});

describe('teamSignals', () => {
  // A manager reading their team still cannot see inside a private project they
  // are not on. The engine runs with admin credentials, so this filter is the
  // only thing between a hidden project and a follow-up message quoting it.
  it('hides a signal from a private project the manager is not on', () => {
    const projects = [
      project('p_open', 'company', []),
      project('p_secret', 'private', ['bob']),
    ];
    const signals: Signal[] = [
      { id: 's_open', kind: 'overdue_task', severity: 'warning', summary: { es: '', en: '' }, projectId: 'p_open', userId: 'bob' },
      { id: 's_secret', kind: 'overdue_task', severity: 'warning', summary: { es: '', en: '' }, projectId: 'p_secret', userId: 'bob' },
    ];

    const forAlice = teamSignals(signals, projects, 'alice');
    expect(forAlice.get('bob')?.map((s) => s.id)).toEqual(['s_open']);

    const forBob = teamSignals(signals, projects, 'bob');
    expect(forBob.get('bob')?.map((s) => s.id)).toEqual(['s_open', 's_secret']);
  });

  it('groups by the person the signal is about', () => {
    const projects = [project('p_open', 'company', [])];
    const signals: Signal[] = [
      { id: 's1', kind: 'workload', severity: 'info', summary: { es: '', en: '' }, userId: 'bob' },
      { id: 's2', kind: 'workload', severity: 'info', summary: { es: '', en: '' }, userId: 'carla' },
      { id: 's3', kind: 'silent_owner', severity: 'warning', summary: { es: '', en: '' }, userId: 'bob' },
    ];
    const grouped = teamSignals(signals, projects, 'alice');
    expect([...grouped.keys()].sort()).toEqual(['bob', 'carla']);
    expect(grouped.get('bob')).toHaveLength(2);
  });

  // Company-wide signals belong to the analysis, not to anybody's follow-up.
  it('drops signals that are about nobody in particular', () => {
    const signals: Signal[] = [
      { id: 's_gap', kind: 'progress_gap', severity: 'warning', summary: { es: '', en: '' }, objectiveId: 'o1' },
    ];
    expect(teamSignals(signals, [], 'alice').size).toBe(0);
  });
});
