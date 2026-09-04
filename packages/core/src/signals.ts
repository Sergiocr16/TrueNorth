import type {
  HealthStatus,
  Objective,
  Project,
  Signal,
  Task,
  User,
} from './types';

/**
 * The signal engine. Everything a plan cites is computed here, deterministically
 * and with tests, so a recommendation can always be traced back to real data.
 * The model never sees raw records: it sees these signals.
 */

/** A gap wider than this many points flips an item from on track to at risk. */
export const AT_RISK_GAP_POINTS = 15;

/** Days without a progress change before work counts as stale. */
export const STALE_DAYS = 7;

export interface SignalContext {
  today: Date;
  objectives: Objective[];
  projects: Project[];
  tasks: Task[];
  users: User[];
}

function toDate(value: string): Date {
  return new Date(`${value}T00:00:00`);
}

function daysBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / 86_400_000);
}

/**
 * Expected progress is linear across the window: if 60 % of the days are gone,
 * 60 % of the work should be done. Crude on purpose, and easy for a person to
 * check against their own intuition.
 */
export function expectedProgressPct(startDate: string, targetDate: string, today: Date): number {
  const start = toDate(startDate);
  const end = toDate(targetDate);
  const total = daysBetween(start, end);
  if (total <= 0) return 100;
  const elapsed = daysBetween(start, today);
  return Math.max(0, Math.min(100, Math.round((elapsed / total) * 100)));
}

/** Positive means behind schedule, negative means ahead. */
export function progressGap(
  item: { startDate: string; targetDate: string; progressPct: number },
  today: Date,
): number {
  return expectedProgressPct(item.startDate, item.targetDate, today) - item.progressPct;
}

export function healthFrom(
  item: { startDate: string; targetDate: string; progressPct: number },
  today: Date,
): HealthStatus {
  if (item.progressPct >= 100) return 'done';
  if (toDate(item.targetDate) < today) return 'late';
  return progressGap(item, today) > AT_RISK_GAP_POINTS ? 'at_risk' : 'on_track';
}

export function isOverdue(task: Task, today: Date): boolean {
  if (task.status === 'done' || !task.dueDate) return false;
  return toDate(task.dueDate) < today;
}

export function isDueToday(task: Task, today: Date): boolean {
  if (task.status === 'done' || !task.dueDate) return false;
  return daysBetween(toDate(task.dueDate), today) === 0;
}

/**
 * Computes every signal for one company. Private projects must already be
 * filtered out by the caller: this runs with admin credentials and does not
 * enforce visibility itself.
 */
export function computeSignals(ctx: SignalContext): Signal[] {
  const { today, objectives, projects, tasks, users } = ctx;
  const signals: Signal[] = [];
  const openTasks = tasks.filter((t) => t.status !== 'done');

  for (const objective of objectives) {
    if (objective.status === 'done') continue;
    const gap = progressGap(objective, today);
    if (gap > AT_RISK_GAP_POINTS) {
      const expected = expectedProgressPct(objective.startDate, objective.targetDate, today);
      signals.push({
        id: `gap:${objective.id}`,
        kind: 'progress_gap',
        severity: healthFrom(objective, today) === 'late' ? 'critical' : 'warning',
        summary: {
          es: `${objective.title} va ${gap} pts por detrás de lo esperado`,
          en: `${objective.title} is ${gap} pts behind plan`,
        },
        objectiveId: objective.id,
        data: { gap, expected, actual: objective.progressPct },
      });
    }

    const servingProjects = projects.filter((p) => p.objectiveIds.includes(objective.id));
    const hasActiveWork = servingProjects.some((p) =>
      openTasks.some((t) => t.projectId === p.id),
    );
    if (!hasActiveWork) {
      signals.push({
        id: `empty:${objective.id}`,
        kind: 'empty_objective',
        severity: 'warning',
        summary: {
          es: `${objective.title} no tiene ninguna tarea activa`,
          en: `${objective.title} has no active work`,
        },
        objectiveId: objective.id,
      });
    }
  }

  for (const project of projects) {
    if (project.objectiveIds.length === 0 && openTasks.some((t) => t.projectId === project.id)) {
      signals.push({
        id: `orphan:${project.id}`,
        kind: 'orphan_project',
        severity: 'warning',
        summary: {
          es: `${project.name} consume trabajo pero no sirve a ningún objetivo`,
          en: `${project.name} consumes work but serves no objective`,
        },
        projectId: project.id,
      });
    }
  }

  for (const task of tasks) {
    if (task.status === 'done') continue;

    if (isOverdue(task, today)) {
      const days = daysBetween(toDate(task.dueDate!), today);
      signals.push({
        id: `overdue:${task.id}`,
        kind: 'overdue_task',
        severity: days > 7 ? 'critical' : 'warning',
        summary: {
          es: `${task.code} lleva ${days} ${days === 1 ? 'día' : 'días'} vencida`,
          en: `${task.code} is ${days} ${days === 1 ? 'day' : 'days'} overdue`,
        },
        taskId: task.id,
        projectId: task.projectId ?? undefined,
        userId: task.assigneeUserId ?? undefined,
        data: { days },
      });
    }

    if (isDueToday(task, today)) {
      signals.push({
        id: `due_today:${task.id}`,
        kind: 'due_today',
        severity: 'warning',
        summary: {
          es: `${task.code} vence hoy`,
          en: `${task.code} is due today`,
        },
        taskId: task.id,
        projectId: task.projectId ?? undefined,
        userId: task.assigneeUserId ?? undefined,
      });
    }

    if (task.status === 'blocked' || task.dependsOn.length > 0) {
      const blockers = task.dependsOn
        .map((id) => tasks.find((t) => t.id === id))
        .filter((t): t is Task => Boolean(t) && t!.status !== 'done');
      if (task.status === 'blocked' || blockers.length > 0) {
        const names = blockers.map((b) => b.code).join(', ');
        signals.push({
          id: `blocked:${task.id}`,
          kind: 'blocked_task',
          severity: 'warning',
          summary: {
            es: names
              ? `${task.code} está bloqueada por ${names}`
              : `${task.code} está bloqueada`,
            en: names ? `${task.code} is blocked by ${names}` : `${task.code} is blocked`,
          },
          taskId: task.id,
          projectId: task.projectId ?? undefined,
          userId: task.assigneeUserId ?? undefined,
        });
      }
    }

    if (!task.assigneeUserId) {
      signals.push({
        id: `unassigned:${task.id}`,
        kind: 'unassigned_task',
        severity: 'info',
        summary: {
          es: `${task.code} no tiene responsable`,
          en: `${task.code} has no owner`,
        },
        taskId: task.id,
        projectId: task.projectId ?? undefined,
      });
    }

    if (!task.dueDate) {
      signals.push({
        id: `undated:${task.id}`,
        kind: 'undated_task',
        severity: 'info',
        summary: {
          es: `${task.code} no tiene fecha límite`,
          en: `${task.code} has no due date`,
        },
        taskId: task.id,
        projectId: task.projectId ?? undefined,
      });
    }
  }

  // Workload: flag anyone carrying more than 1.5x the team average.
  const perUser = new Map<string, number>();
  for (const task of openTasks) {
    if (!task.assigneeUserId) continue;
    perUser.set(task.assigneeUserId, (perUser.get(task.assigneeUserId) ?? 0) + 1);
  }
  const counts = [...perUser.values()];
  if (counts.length > 1) {
    const average = counts.reduce((a, b) => a + b, 0) / counts.length;
    for (const [userId, count] of perUser) {
      if (count > average * 1.5) {
        const user = users.find((u) => u.id === userId);
        const name = user?.displayName ?? userId;
        signals.push({
          id: `workload:${userId}`,
          kind: 'workload',
          severity: 'info',
          summary: {
            es: `${name} tiene ${count} tareas abiertas, sobre el promedio de ${Math.round(average)}`,
            en: `${name} has ${count} open tasks, above the ${Math.round(average)} average`,
          },
          userId,
          data: { count, average: Math.round(average) },
        });
      }
    }
  }

  return signals;
}

/** Signals that concern one person: their tasks, their projects, their load. */
export function signalsForUser(signals: Signal[], userId: string, projects: Project[]): Signal[] {
  const ownedProjectIds = new Set(
    projects.filter((p) => p.ownerUserId === userId || p.memberUserIds.includes(userId)).map((p) => p.id),
  );
  return signals.filter(
    (s) =>
      s.userId === userId ||
      (s.projectId && ownedProjectIds.has(s.projectId)) ||
      s.kind === 'progress_gap' ||
      s.kind === 'orphan_project',
  );
}
