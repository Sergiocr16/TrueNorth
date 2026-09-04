import type { TaskStatus, HealthStatus, Priority, NotionSource, Task } from './types';

/**
 * ADITUM's "Tareas Software" database exposes fifteen status options across
 * three Notion groups. TrueNorth reasons over four internal states, so the map
 * below is the contract between the two. Changing it requires an ADR: the
 * signal engine, the daily plan and the voice-update writer all depend on it.
 *
 * Since ADR-008 it is the *known default*, not the only map: every registered
 * Notion source carries its own `statusMap`, built from the database's own
 * status groups by `defaultStatusMap()` and edited from the app. This constant
 * is what that default resolves to for the one database it describes, and it
 * is pinned by a test so the contract survives as a golden case.
 */
export const NOTION_TASK_STATUS: Record<string, TaskStatus> = {
  // to_do group
  'Sin empezar': 'todo',
  'Requiere Cambios': 'todo',
  'En Prod Para informar al cliente': 'todo',
  'En Prod pero ocupa revisión': 'todo',
  'No se encuentra el error': 'todo',
  // in_progress group
  'En curso': 'in_progress',
  'Pruebas - Desarrollo': 'in_progress',
  'Pruebas QA': 'in_progress',
  'Revisión Tecnica': 'in_progress',
  'Lista para deploy': 'in_progress',
  'Tarea pendiente entrega': 'in_progress',
  'Bug - Incidente': 'in_progress',
  'Depende de otra TAR': 'blocked',
  // complete group
  Finalizada: 'done',
  Archivadas: 'done',
};

/**
 * Statuses that mean the work is moving but something is wrong with it. These
 * raise a stability signal even though the task is technically in progress,
 * which is exactly the CTO's area of responsibility.
 */
export const NOTION_TROUBLE_STATUSES = new Set([
  'Bug - Incidente',
  'Requiere Cambios',
  'No se encuentra el error',
  'En Prod pero ocupa revisión',
]);

export const NOTION_PROJECT_STATUS: Record<string, HealthStatus> = {
  'Trabajo acumulado': 'on_track',
  Planificación: 'on_track',
  'En curso': 'on_track',
  'En pausa': 'at_risk',
  Finalizada: 'done',
  Cancelado: 'done',
};

/** Notion project statuses that do not count as active progress. */
export const NOTION_INACTIVE_PROJECT_STATUSES = new Set(['En pausa', 'Trabajo acumulado']);

export const NOTION_PRIORITY: Record<string, Priority> = {
  Baja: 'low',
  Media: 'medium',
  Alta: 'high',
  Máxima: 'max',
  Urgente: 'max',
};

/* ------------------------------------------------------------------ */
/* Per-source maps                                                     */
/* ------------------------------------------------------------------ */

/** A status-like property as the schema describes it. */
export interface NotionStatusProperty {
  type: 'status' | 'select';
  options: { name: string; group?: 'to_do' | 'in_progress' | 'complete' }[];
}

/** Words in a label that mean the work is waiting on something else. */
const BLOCKED_WORDS = /depende|bloquead|blocked|esperando|waiting/i;
/** For a plain select, which has no groups: labels that clearly mean done. */
const DONE_WORDS = /aprobad|finaliz|hecho|done|cerrad|archiv|completad|realizado/i;
/** For a plain select: labels that clearly mean in flight. */
const IN_PROGRESS_WORDS = /en pruebas|en curso|progreso|progress|en desarrollo|revisi/i;

/**
 * The status map a source starts with.
 *
 * A `status` property tells us its groups, and Notion's three groups are our
 * three states plus one: to-do, in progress and complete. Blocked has no group
 * in Notion, so a label that says it is waiting on something gets it by name.
 * A plain `select` says nothing about meaning; it starts as all to-do, with
 * the obvious words recognised, and the admin corrects the rest on screen.
 */
export function defaultStatusMap(property: NotionStatusProperty): Record<string, TaskStatus> {
  const map: Record<string, TaskStatus> = {};
  for (const option of property.options) {
    let state: TaskStatus;
    if (property.type === 'status') {
      state =
        option.group === 'complete'
          ? 'done'
          : option.group === 'in_progress'
            ? 'in_progress'
            : 'todo';
      if (state !== 'done' && BLOCKED_WORDS.test(option.name)) state = 'blocked';
    } else {
      state = DONE_WORDS.test(option.name)
        ? 'done'
        : BLOCKED_WORDS.test(option.name)
          ? 'blocked'
          : IN_PROGRESS_WORDS.test(option.name)
            ? 'in_progress'
            : 'todo';
    }
    map[option.name] = state;
  }
  return map;
}

/** The internal state of a label under one source's map. Unknown labels are to-do. */
export function statusFor(
  source: Pick<NotionSource, 'statusMap'>,
  label: string | null | undefined,
): TaskStatus {
  if (!label) return 'todo';
  return source.statusMap[label] ?? 'todo';
}

/** The priority of a label under one source's map, then the known defaults. */
export function priorityFor(
  source: Pick<NotionSource, 'priorityMap'>,
  label: string | null | undefined,
): Priority {
  if (!label) return 'medium';
  return source.priorityMap?.[label] ?? NOTION_PRIORITY[label] ?? 'medium';
}

/**
 * The labels a task may take in the app: its source's, when it came from
 * Notion, or the four internal states when it did not. A backlog task offered
 * the task table's labels would be a lie the sync could not write back.
 */
export function statusOptionsFor(
  task: Pick<Task, 'source' | 'sourceId'>,
  sources: Pick<NotionSource, 'id' | 'statusMap'>[],
): string[] {
  if (task.source === 'notion' && task.sourceId) {
    const source = sources.find((s) => s.id === task.sourceId);
    if (source) return Object.keys(source.statusMap);
  }
  return ['todo', 'in_progress', 'blocked', 'done'];
}

/** The ADITUM default. Fixtures and tests only; live tasks go through `statusFor`. */
export function taskStatusFromNotion(label: string | undefined): TaskStatus {
  if (!label) return 'todo';
  return NOTION_TASK_STATUS[label] ?? 'todo';
}

export function priorityFromNotion(label: string | undefined): Priority {
  if (!label) return 'medium';
  return NOTION_PRIORITY[label] ?? 'medium';
}

/** Weight used when ordering plan items. Higher wins. */
export const PRIORITY_WEIGHT: Record<Priority, number> = {
  max: 4,
  high: 3,
  medium: 2,
  low: 1,
};
