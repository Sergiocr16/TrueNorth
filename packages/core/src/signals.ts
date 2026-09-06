import type {
  DailyPlan,
  GithubRepo,
  HealthStatus,
  Objective,
  Project,
  PullRequest,
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

/** Days a task may sit without moving or being talked about. */
export const STALE_TASK_DAYS = 5;

/** Days a comment may go unanswered before somebody owes a reply. */
export const UNANSWERED_COMMENT_DAYS = 2;

/** Stalled tasks on one person before the person, not the task, is the problem. */
export const SILENT_OWNER_TASKS = 3;

/** Consecutive plans with no verdict at all before the plan is being ignored. */
export const PLAN_IGNORED_DAYS = 3;

/** Items marked skipped across the window before the plan is slipping. */
export const PLAN_SLIPPING_ITEMS = 4;

/** Overdue tasks on one person before the pile, not each task, is the signal. */
export const OVERDUE_LOAD_TASKS = 3;
/** A task in a "development finished" status owes a pull request after this many days. */
export const PR_MISSING_DAYS = 1;
/** An open pull request with nothing decisive from a reviewer is waiting after this many days. */
export const PR_REVIEW_DAYS = 2;
/** Changes requested and nothing from the author for this long is the author's turn overdue. */
export const PR_CHANGES_DAYS = 2;
/** Approved and still open for this long is a merge owed. */
export const PR_MERGE_DAYS = 2;
/** A pull request waiting this long turns critical. */
export const PR_CRITICAL_DAYS = 7;

export interface SignalContext {
  today: Date;
  objectives: Objective[];
  projects: Project[];
  tasks: Task[];
  users: User[];
  /** Pull requests in view, from the repositories the role reads (ADR-010). */
  pullRequests?: PullRequest[];
  repos?: GithubRepo[];
  /** Who reviews and merges: an approver signal is addressed to them. */
  approverUserIds?: string[];
  /** Notion status labels that mean development finished and a pull request is owed. */
  finishedStatuses?: string[];
  /**
   * Recent plans for everybody, newest first. The engine reads a week of them;
   * the browser only ever has its own, so these signals are a server affair.
   */
  planHistory?: DailyPlan[];
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

/** Whole days between the calendar day of a timestamp and today. */
function daysSince(timestamp: string, today: Date): number | null {
  const at = new Date(timestamp);
  if (Number.isNaN(at.getTime())) return null;
  return daysBetween(new Date(at.getFullYear(), at.getMonth(), at.getDate()), today);
}

/**
 * The last time anything happened to a task: a status change, a comment, an
 * edit. Null when we have never seen it move, which is not the same as stale —
 * a task synced yesterday for the first time has no history yet, and claiming
 * it has been sitting for a month would be a lie.
 */
export function lastMovementAt(task: Task): string | null {
  const stamps = [
    task.statusChangedAt,
    task.lastCommentAt,
    task.updatedAt,
    task.notionLastEditedAt,
  ].filter((value): value is string => Boolean(value));
  if (stamps.length === 0) return null;
  return stamps.reduce((latest, value) => (value > latest ? value : latest));
}

/** Days a task has gone without moving, or null when we cannot tell. */
export function idleDays(task: Task, today: Date): number | null {
  const at = lastMovementAt(task);
  return at ? daysSince(at, today) : null;
}

/**
 * When the task last showed progress *from its owner*, as opposed to any
 * activity at all. A status change and an edit to the page count; so does a
 * comment, but only one written by somebody responsible for the task —
 * somebody else's comment is a question, not an advance. This is what tells
 * "late but moving" from "late and silent": a task past its date whose owner
 * wrote on it yesterday is not the same problem as one nobody has touched.
 */
export function lastProgressAt(task: Task): string | null {
  const who = new Set(owners(task));
  const ownComments = (task.comments ?? [])
    .filter((c) => c.authorUserId && who.has(c.authorUserId))
    .map((c) => c.createdAt);
  // The stored comments are the last few; the summary stamp covers the case
  // where the owner's word is the latest one and the list was not kept.
  if (task.lastCommentAt && task.lastCommentBy && who.has(task.lastCommentBy)) {
    ownComments.push(task.lastCommentAt);
  }
  const stamps = [task.statusChangedAt, task.updatedAt, task.notionLastEditedAt, ...ownComments].filter(
    (value): value is string => Boolean(value),
  );
  if (stamps.length === 0) return null;
  return stamps.reduce((latest, value) => (value > latest ? value : latest));
}

/** Days since the owner last showed progress, or null when we cannot tell. */
export function progressDays(task: Task, today: Date): number | null {
  const at = lastProgressAt(task);
  return at ? daysSince(at, today) : null;
}

/** Everyone responsible for a task. Notion allows several; so do we. */
export function owners(task: Task): string[] {
  return task.assigneeUserIds ?? [];
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
/**
 * How a task is named in a summary: what it is, then its code. A summary is
 * read on the Risks screen and quoted in a follow-up, and a code alone names
 * a task only to whoever already knows it (CLAUDE.md: never render only the
 * code). Falls back to whichever of the two exists.
 */
function taskName(task: Pick<Task, 'code' | 'title'>): string {
  const title = task.title.trim();
  const code = task.code.trim();
  if (title && code) return `${title} (${code})`;
  return title || code || 'una tarea';
}

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
      // Late is not the same as stuck. The date says late; whether the owner
      // has moved it since says whether to chase or to ask for a new date.
      const progress = progressDays(task, today);
      const moving = progress !== null && progress <= STALE_TASK_DAYS;
      const clause =
        progress === null
          ? { es: '', en: '' }
          : moving
            ? {
                es: `, pero el responsable la movió hace ${progress} ${progress === 1 ? 'día' : 'días'}`,
                en: `, but its owner moved it ${progress} ${progress === 1 ? 'day' : 'days'} ago`,
              }
            : {
                es: ` y sin avance del responsable hace ${progress} días`,
                en: ` with no progress from its owner in ${progress} days`,
              };
      signals.push({
        id: `overdue:${task.id}`,
        kind: 'overdue_task',
        severity: days > 7 ? 'critical' : 'warning',
        summary: {
          es: `${taskName(task)} lleva ${days} ${days === 1 ? 'día' : 'días'} vencida${clause.es}`,
          en: `${taskName(task)} is ${days} ${days === 1 ? 'day' : 'days'} overdue${clause.en}`,
        },
        taskId: task.id,
        projectId: task.projectId ?? undefined,
        userId: owners(task)[0],
        userIds: owners(task),
        data: {
          days,
          ...(progress !== null ? { progressDays: progress, moving: moving ? 1 : 0 } : {}),
        },
      });
    }

    if (isDueToday(task, today)) {
      signals.push({
        id: `due_today:${task.id}`,
        kind: 'due_today',
        severity: 'warning',
        summary: {
          es: `${taskName(task)} vence hoy`,
          en: `${taskName(task)} is due today`,
        },
        taskId: task.id,
        projectId: task.projectId ?? undefined,
        userId: owners(task)[0],
        userIds: owners(task),
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
              ? `${taskName(task)} está bloqueada por ${names}`
              : `${taskName(task)} está bloqueada`,
            en: names ? `${taskName(task)} is blocked by ${names}` : `${taskName(task)} is blocked`,
          },
          taskId: task.id,
          projectId: task.projectId ?? undefined,
          userId: owners(task)[0],
          userIds: owners(task),
        });
      }
    }

    // Only work in flight needs an owner. ADITUM's backlog is full of items
    // nobody has started, and those are unassigned by design: flagging each
    // one would bury the few that matter.
    if (owners(task).length === 0 && task.status !== 'todo') {
      signals.push({
        id: `unassigned:${task.id}`,
        kind: 'unassigned_task',
        severity: 'info',
        summary: {
          es: `${taskName(task)} no tiene responsable`,
          en: `${taskName(task)} has no owner`,
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
          es: `${taskName(task)} no tiene fecha límite`,
          en: `${taskName(task)} has no due date`,
        },
        taskId: task.id,
        projectId: task.projectId ?? undefined,
      });
    }
  }

  // Workload: flag anyone carrying more than 1.5x the team average.
  const perUser = new Map<string, number>();
  for (const task of openTasks) {
    for (const userId of owners(task)) {
      perUser.set(userId, (perUser.get(userId) ?? 0) + 1);
    }
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

  /* ---------------------------------------------------------------- */
  /* Follow-up: is the work, and the conversation around it, moving?    */
  /* ---------------------------------------------------------------- */

  const nameOf = (userId: string | null | undefined): string =>
    users.find((u) => u.id === userId)?.displayName ?? 'alguien';

  // Work in flight that has stopped moving. Each one is `info` on purpose: on a
  // board of two hundred tasks a few stale ones are normal, and a badge that
  // counts them stops meaning anything. What is not normal is one person
  // holding several, which is the aggregate two blocks down.
  const stalledPerAssignee = new Map<string, number>();
  for (const task of tasks) {
    if (task.status !== 'in_progress' && task.status !== 'blocked') continue;
    const idle = idleDays(task, today);
    if (idle === null || idle < STALE_TASK_DAYS) continue;

    signals.push({
      id: `stale_task:${task.id}`,
      kind: 'stale_task',
      severity: 'info',
      summary: {
        es: `${taskName(task)} lleva ${idle} días sin moverse ni recibir comentarios`,
        en: `${taskName(task)} has not moved or been commented on in ${idle} days`,
      },
      taskId: task.id,
      projectId: task.projectId ?? undefined,
      userId: owners(task)[0],
      userIds: owners(task),
      data: { days: idle },
    });

    for (const userId of owners(task)) {
      stalledPerAssignee.set(userId, (stalledPerAssignee.get(userId) ?? 0) + 1);
    }
  }

  // A comment nobody answered. Which way it points matters: if the last word
  // came from somebody other than the person responsible, the responsible one
  // owes a reply; if it came from them, whoever leads the project does.
  //
  // `info`, like a stale task and for the same reason: an unanswered comment is
  // not the work running late. What says a task is behind is its own state —
  // its due date and its status — and a conversation that went quiet can sit on
  // top of a task that is perfectly on time. Counting it as a warning put it in
  // the badge, in *Avisos* and against the health compass, which made the
  // numbers read worse than the board actually was. It stays visible under
  // *ver menores* and still reaches the engine, which is where a pending reply
  // is worth raising.
  for (const task of tasks) {
    if (task.status === 'done' || !task.lastCommentAt) continue;
    const idle = daysSince(task.lastCommentAt, today);
    if (idle === null || idle < UNANSWERED_COMMENT_DAYS) continue;

    const fromAssignee = Boolean(task.lastCommentBy) && owners(task).includes(task.lastCommentBy!);
    const lead = projects.find((p) => p.id === task.projectId)?.ownerUserId;
    // Nobody owes themselves an answer: whoever wrote the last comment is not
    // the one who has to reply to it.
    const owes = (fromAssignee ? [lead, ...owners(task)] : owners(task)).filter(
      (id): id is string => Boolean(id) && id !== task.lastCommentBy,
    );
    if (owes.length === 0) continue;

    const author = nameOf(task.lastCommentBy);
    signals.push({
      id: `comment_unanswered:${task.id}`,
      kind: 'comment_unanswered',
      severity: 'info',
      summary: {
        es: `${author} comentó en ${taskName(task)} hace ${idle} días y nadie respondió`,
        en: `${author} commented on ${taskName(task)} ${idle} days ago and nobody replied`,
      },
      taskId: task.id,
      projectId: task.projectId ?? undefined,
      userId: owes[0],
      userIds: owes,
      data: { days: idle, author },
    });
  }

  // Several of somebody's tasks stalled at once: the person is the story now,
  // not any one task.
  for (const [userId, count] of stalledPerAssignee) {
    if (count < SILENT_OWNER_TASKS) continue;
    signals.push({
      id: `silent_owner:${userId}`,
      kind: 'silent_owner',
      severity: 'warning',
      summary: {
        es: `${nameOf(userId)} tiene ${count} tareas en curso sin movimiento hace más de ${STALE_TASK_DAYS} días`,
        en: `${nameOf(userId)} has ${count} tasks in flight untouched for over ${STALE_TASK_DAYS} days`,
      },
      userId,
      data: { count },
    });
  }

  // The one Sergio described: whoever leads a project is not chasing the work
  // other people owe on it.
  for (const project of projects) {
    if (!project.ownerUserId) continue;
    const neglected = tasks.filter(
      (t) =>
        t.projectId === project.id &&
        (t.status === 'in_progress' || t.status === 'blocked') &&
        owners(t).length > 0 &&
        !owners(t).includes(project.ownerUserId) &&
        (idleDays(t, today) ?? 0) >= STALE_TASK_DAYS,
    );
    if (neglected.length < SILENT_OWNER_TASKS) continue;
    signals.push({
      id: `no_followup:${project.ownerUserId}:${project.id}`,
      kind: 'no_followup',
      severity: 'warning',
      summary: {
        es: `${nameOf(project.ownerUserId)} lidera ${project.name}, donde ${neglected.length} tareas de otras personas llevan días sin seguimiento`,
        en: `${nameOf(project.ownerUserId)} leads ${project.name}, where ${neglected.length} of other people's tasks have gone days without follow-up`,
      },
      projectId: project.id,
      userId: project.ownerUserId,
      data: { count: neglected.length },
    });
  }

  // Engagement with the plan itself. Only the engine ever has other people's
  // plans, so these never fire in the browser.
  if (ctx.planHistory && ctx.planHistory.length > 0) {
    const byUser = new Map<string, DailyPlan[]>();
    for (const plan of ctx.planHistory) {
      byUser.set(plan.userId, [...(byUser.get(plan.userId) ?? []), plan]);
    }

    for (const [userId, plans] of byUser) {
      const recent = [...plans].sort((a, b) => b.date.localeCompare(a.date));
      const untouched = recent.filter(
        (plan) => Object.keys(plan.feedback ?? {}).length === 0,
      );
      if (recent.length >= PLAN_IGNORED_DAYS && untouched.length === recent.length) {
        signals.push({
          id: `plan_ignored:${userId}`,
          kind: 'plan_ignored',
          severity: 'info',
          summary: {
            es: `${nameOf(userId)} no marcó nada en sus últimos ${recent.length} planes`,
            en: `${nameOf(userId)} has not marked anything on their last ${recent.length} plans`,
          },
          userId,
          data: { days: recent.length },
        });
      }

      const skipped = recent.reduce(
        (total, plan) =>
          total +
          Object.values(plan.feedback ?? {}).filter((verdict) => verdict === 'skipped').length,
        0,
      );
      if (skipped >= PLAN_SLIPPING_ITEMS) {
        signals.push({
          id: `plan_slipping:${userId}`,
          kind: 'plan_slipping',
          severity: 'info',
          summary: {
            es: `${nameOf(userId)} dejó pasar ${skipped} acciones de sus planes recientes`,
            en: `${nameOf(userId)} skipped ${skipped} actions across their recent plans`,
          },
          userId,
          data: { count: skipped },
        });
      }
    }
  }

  // Somebody with nothing assigned is invisible to every other signal here.
  for (const user of users) {
    const mine = openTasks.filter((t) => owners(t).includes(user.id));
    if (mine.length === 0) {
      signals.push({
        id: `no_owned_work:${user.id}`,
        kind: 'no_owned_work',
        severity: 'info',
        summary: {
          es: `${user.displayName} no tiene ninguna tarea abierta asignada`,
          en: `${user.displayName} has no open task assigned`,
        },
        userId: user.id,
      });
    }

    const overdue = mine.filter((t) => isOverdue(t, today));
    if (overdue.length >= OVERDUE_LOAD_TASKS) {
      signals.push({
        id: `overdue_load:${user.id}`,
        kind: 'overdue_load',
        severity: 'warning',
        summary: {
          es: `${user.displayName} acumula ${overdue.length} tareas vencidas`,
          en: `${user.displayName} is carrying ${overdue.length} overdue tasks`,
        },
        userId: user.id,
        data: { count: overdue.length },
      });
    }
  }

  // Projects whose progress bar has not moved. Objectives keep a history too,
  // but their gap is already covered by progress_gap above.
  for (const project of projects) {
    if (project.status === 'done' || project.progressPct >= 100) continue;
    const last = project.history?.[project.history.length - 1];
    if (!last) continue;
    const idle = daysBetween(toDate(last.date), today);
    if (idle < STALE_DAYS) continue;
    signals.push({
      id: `stale_progress:${project.id}`,
      kind: 'stale_progress',
      severity: 'warning',
      summary: {
        es: `${project.name} no cambia de avance hace ${idle} días`,
        en: `${project.name} has not changed progress in ${idle} days`,
      },
      projectId: project.id,
      userId: project.ownerUserId,
      data: { days: idle },
    });
  }

  /* ---------------------------------------------------------------- */
  /* Pull requests: the developer opens and answers, the approver       */
  /* reviews and merges (ADR-010)                                        */
  /* ---------------------------------------------------------------- */

  const pulls = ctx.pullRequests ?? [];
  const repos = ctx.repos ?? [];
  const approvers = ctx.approverUserIds ?? [];
  const finished = new Set(ctx.finishedStatuses ?? []);
  const prName = (pr: PullRequest): string => `#${pr.number} ${pr.title}`;
  const taskOf = (pr: PullRequest): Task | undefined => tasks.find((t) => t.id === pr.taskId);
  const repoOf = (pr: PullRequest): GithubRepo | undefined => repos.find((r) => r.id === pr.repoId);

  // Development finished, no pull request. Only where a pull request can
  // exist — the task's project has a repository — and only on the statuses
  // the company says mean "done coding"; `done` itself never counts, a
  // finished task with no code is the normal case for most work.
  const reposByProject = new Map<string, GithubRepo[]>();
  for (const repo of repos) {
    if (!repo.projectId) continue;
    reposByProject.set(repo.projectId, [...(reposByProject.get(repo.projectId) ?? []), repo]);
  }
  for (const task of tasks) {
    if (task.status === 'done' || !task.notionStatus || !finished.has(task.notionStatus)) continue;
    if (!task.projectId || !reposByProject.has(task.projectId)) continue;
    const has = pulls.some((pr) => pr.taskId === task.id && (pr.state === 'open' || pr.state === 'merged'));
    if (has) continue;
    const since = task.statusChangedAt ? daysSince(task.statusChangedAt, today) : null;
    if (since === null || since < PR_MISSING_DAYS) continue;
    const base = reposByProject.get(task.projectId)?.[0]?.baseBranch ?? 'development';
    signals.push({
      id: `pr_missing:${task.id}`,
      kind: 'pr_missing',
      severity: 'info',
      summary: {
        es: `${taskName(task)} está en ${task.notionStatus} hace ${since} ${since === 1 ? 'día' : 'días'} y no tiene pull request hacia ${base}`,
        en: `${taskName(task)} has been in ${task.notionStatus} for ${since} ${since === 1 ? 'day' : 'days'} with no pull request toward ${base}`,
      },
      taskId: task.id,
      projectId: task.projectId,
      userId: owners(task)[0],
      userIds: owners(task),
      data: { days: since, status: task.notionStatus },
    });
  }

  for (const pr of pulls) {
    if (pr.state !== 'open') continue;
    const task = taskOf(pr);
    const label = task ? `${prName(pr)} de ${taskName(task)}` : prName(pr);
    const labelEn = task ? `${prName(pr)} for ${taskName(task)}` : prName(pr);
    const author = nameOf(pr.authorUserId);
    const common = {
      taskId: pr.taskId ?? undefined,
      projectId: pr.projectId ?? undefined,
    };
    // Whoever reviews: the approver roles' holders, or the requested reviewers
    // when nobody is configured. Never the author.
    const reviewers = (approvers.length > 0 ? approvers : pr.reviewerUserIds).filter((id) => id !== pr.authorUserId);

    if (pr.reviewState === 'changes_requested' && pr.lastReviewAt) {
      // The author's turn: changes asked, and no push nor comment since.
      const answered = pr.lastAuthorActivityAt !== null && pr.lastAuthorActivityAt > pr.lastReviewAt;
      const days = daysSince(pr.lastReviewAt, today) ?? 0;
      if (!answered && days >= PR_CHANGES_DAYS && pr.authorUserId) {
        const reviewer = nameOf(pr.lastReviewBy);
        signals.push({
          id: `pr_changes_requested:${pr.id}`,
          kind: 'pr_changes_requested',
          severity: 'warning',
          summary: {
            es: `${label}: ${reviewer} pidió cambios hace ${days} días y no hay respuesta del autor`,
            en: `${labelEn}: ${reviewer} requested changes ${days} days ago and the author has not answered`,
          },
          ...common,
          userId: pr.authorUserId,
          userIds: [pr.authorUserId],
          data: { days, number: pr.number, url: pr.url, reviewer },
        });
      }
      continue;
    }

    if (pr.reviewState === 'approved' && pr.lastReviewAt) {
      const days = daysSince(pr.lastReviewAt, today) ?? 0;
      if (days >= PR_MERGE_DAYS && reviewers.length > 0) {
        signals.push({
          id: `pr_approved_unmerged:${pr.id}`,
          kind: 'pr_approved_unmerged',
          severity: days >= PR_CRITICAL_DAYS ? 'critical' : 'warning',
          summary: {
            es: `${label} está aprobado hace ${days} días y sin fusionar`,
            en: `${labelEn} has been approved for ${days} days and is not merged`,
          },
          ...common,
          userId: reviewers[0],
          userIds: reviewers,
          data: { days, number: pr.number, url: pr.url, author },
        });
      }
      continue;
    }

    // Nothing decisive from a reviewer: the approvers' turn, once it has sat
    // a while since the last review, push or opening. Drafts are not asking.
    if (pr.draft) continue;
    const waitingSince = pr.lastReviewAt ?? pr.lastPushAt ?? pr.createdAt;
    const days = daysSince(waitingSince, today) ?? 0;
    if (days < PR_REVIEW_DAYS || reviewers.length === 0) continue;
    const base = repoOf(pr)?.baseBranch;
    signals.push({
      id: `pr_awaiting_review:${pr.id}`,
      kind: 'pr_awaiting_review',
      severity: days >= PR_CRITICAL_DAYS ? 'critical' : 'warning',
      summary: {
        es: `${label} lleva ${days} días esperando revisión${base && pr.baseRef !== base ? ` (hacia ${pr.baseRef})` : ''}`,
        en: `${labelEn} has been waiting for review for ${days} days${base && pr.baseRef !== base ? ` (toward ${pr.baseRef})` : ''}`,
      },
      ...common,
      userId: reviewers[0],
      userIds: reviewers,
      data: { days, number: pr.number, url: pr.url, author },
    });
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
      s.userIds?.includes(userId) ||
      (s.projectId && ownedProjectIds.has(s.projectId)) ||
      s.kind === 'progress_gap' ||
      s.kind === 'orphan_project',
  );
}
