import type { HealthStatus, Signal, Task } from './types';

/**
 * A screen's health as one number between 0 and 1, for the compass in the
 * corner: south is nothing right, north is nothing wrong. Each is a plain
 * share, so a person can check it against the list below it.
 */

/** Objectives or projects: the share that is on track or done. */
export function shareHealthy(items: { status: HealthStatus }[]): number {
  if (items.length === 0) return 1;
  const good = items.filter((i) => i.status === 'on_track' || i.status === 'done').length;
  return good / items.length;
}

/** Open tasks that no warning or critical signal points at. */
export function shareUnflagged(tasks: Task[], signals: Signal[]): number {
  const open = tasks.filter((t) => t.status !== 'done');
  if (open.length === 0) return 1;
  const flagged = new Set(
    signals.filter((s) => s.severity !== 'info' && s.taskId).map((s) => s.taskId),
  );
  return open.filter((t) => !flagged.has(t.id)).length / open.length;
}

/** People that no warning or critical signal is about. */
export function shareQuiet(userIds: string[], signals: Signal[]): number {
  if (userIds.length === 0) return 1;
  const loud = new Set(
    signals
      .filter((s) => s.severity !== 'info')
      .flatMap((s) => (s.userIds?.length ? s.userIds : s.userId ? [s.userId] : [])),
  );
  return userIds.filter((id) => !loud.has(id)).length / userIds.length;
}
