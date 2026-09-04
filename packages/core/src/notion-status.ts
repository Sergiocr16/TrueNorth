import type { TaskStatus, HealthStatus, Priority } from './types';

/**
 * ADITUM's "Tareas Software" database exposes fifteen status options across
 * three Notion groups. TrueNorth reasons over four internal states, so the map
 * below is the contract between the two. Changing it requires an ADR: the
 * signal engine, the daily plan and the voice-update writer all depend on it.
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
};

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
