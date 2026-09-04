import { describe, expect, it } from 'vitest';
import { shareHealthy, shareQuiet, shareUnflagged } from './health';
import type { Signal, Task } from './types';

const task = (id: string, status: Task['status'] = 'todo'): Task => ({
  id, companyId: 'c', projectId: null, code: id, title: id, status, priority: 'low',
  dueDate: null, assigneeUserIds: [], dependsOn: [], source: 'app',
});
const signal = (o: Partial<Signal>): Signal => ({
  id: 'x', kind: 'overdue_task', severity: 'warning', summary: { es: '', en: '' }, ...o,
});

describe('health shares', () => {
  it('counts on-track and done as healthy', () => {
    expect(shareHealthy([{ status: 'on_track' }, { status: 'done' }, { status: 'late' }, { status: 'at_risk' }])).toBe(0.5);
  });

  // Nothing to judge is not the same as everything wrong: an empty list points north.
  it('treats an empty list as fully healthy', () => {
    expect(shareHealthy([])).toBe(1);
    expect(shareUnflagged([], [])).toBe(1);
    expect(shareQuiet([], [])).toBe(1);
  });

  it('ignores done tasks and info signals when counting flagged work', () => {
    const tasks = [task('a', 'in_progress'), task('b', 'in_progress'), task('c', 'done')];
    const signals = [signal({ taskId: 'a' }), signal({ taskId: 'b', severity: 'info' }), signal({ taskId: 'c' })];
    expect(shareUnflagged(tasks, signals)).toBe(0.5);
  });

  it('counts everybody a signal names, not only the first', () => {
    const signals = [signal({ userId: 'u1', userIds: ['u1', 'u2'] })];
    expect(shareQuiet(['u1', 'u2', 'u3', 'u4'], signals)).toBe(0.5);
  });
});
