import { signalsForUser } from './signals';
import type { Project, Signal, Task } from './types';

/**
 * Visibility, re-applied in code.
 *
 * The security rules decide what a person may read from the browser. The
 * engine reads with the Admin SDK, which the rules do not apply to, so before
 * a person's prompt is built the same visibility is enforced here. These
 * mirror the `projects` read rule in firestore.rules and are tested against
 * the same cases.
 */

/** Company-wide projects for everyone; private or shared ones only for the people on them. */
export function visibleProjects(projects: Project[], userId: string): Project[] {
  return projects.filter(
    (p) => p.visibility === 'company' || p.memberUserIds.includes(userId),
  );
}

/**
 * A task on a project the person cannot see is invisible even when it is
 * assigned to them: the assignment alone would reveal the project exists.
 */
export function visibleTasks(tasks: Task[], projects: Project[], userId: string): Task[] {
  const allowed = new Set(visibleProjects(projects, userId).map((p) => p.id));
  return tasks.filter((t) => t.projectId === null || allowed.has(t.projectId));
}

/** The signals that concern one person, minus any that would leak a hidden project. */
export function visibleSignals(signals: Signal[], projects: Project[], userId: string): Signal[] {
  const mine = visibleProjects(projects, userId);
  const allowed = new Set(mine.map((p) => p.id));
  return signalsForUser(signals, userId, mine).filter(
    (s) => !s.projectId || allowed.has(s.projectId),
  );
}

/**
 * Signals about each person, grouped, for a manager who is reading the team.
 *
 * `visibleSignals` answers "what concerns me?"; this answers "what may I see
 * about everybody else?". The difference matters: a signal about a private
 * project the manager is not on must not reach them, even when it is about
 * somebody they manage. The engine runs with admin credentials, so this is the
 * only thing standing between a private project and a follow-up message that
 * quotes it.
 */
export function teamSignals(
  signals: Signal[],
  projects: Project[],
  managerUid: string,
): Map<string, Signal[]> {
  const allowed = new Set(visibleProjects(projects, managerUid).map((p) => p.id));
  const byUser = new Map<string, Signal[]>();

  for (const signal of signals) {
    if (signal.projectId && !allowed.has(signal.projectId)) continue;
    const concerned = signal.userIds?.length ? signal.userIds : signal.userId ? [signal.userId] : [];
    for (const userId of concerned) {
      byUser.set(userId, [...(byUser.get(userId) ?? []), signal]);
    }
  }

  return byUser;
}
