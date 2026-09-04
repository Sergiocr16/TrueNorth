import type { NotionSchema } from './notion-map';

/**
 * ADITUM's databases as the API describes them, recorded on 2026-09-04. These
 * are what `suggestMapping` is tested against, so a change in Notion that
 * breaks the mapping shows up here first.
 */

const group = (name: string, g: 'to_do' | 'in_progress' | 'complete') => ({ name, group: g });

export const tareasSoftware: NotionSchema = {
  title: 'Tareas Software',
  properties: [
    { name: '', type: 'unique_id' },
    { name: 'Complejidad', type: 'multi_select', options: [{ name: '1' }, { name: '3' }] },
    { name: 'Completado al', type: 'number', numberFormat: 'percent' },
    { name: 'Descripción', type: 'rich_text' },
    {
      name: 'Estado',
      type: 'status',
      options: [
        group('En Prod Para informar al cliente', 'to_do'),
        group('Requiere Cambios', 'to_do'),
        group('En Prod pero ocupa revisión', 'to_do'),
        group('No se encuentra el error', 'to_do'),
        group('Sin empezar', 'to_do'),
        group('Depende de otra TAR', 'in_progress'),
        group('Pruebas - Desarrollo', 'in_progress'),
        group('Lista para deploy', 'in_progress'),
        group('Revisión Tecnica', 'in_progress'),
        group('Bug - Incidente', 'in_progress'),
        group('Pruebas QA', 'in_progress'),
        group('Tarea pendiente entrega', 'in_progress'),
        group('En curso', 'in_progress'),
        group('Finalizada', 'complete'),
        group('Archivadas', 'complete'),
      ],
    },
    { name: 'Fecha de publicación', type: 'date' },
    { name: 'Fecha límite', type: 'date' },
    { name: 'Nombre de tarea', type: 'title' },
    { name: 'PRs de GitHub', type: 'relation', relationDataSourceId: '1bab831e-9e89-49c7-8f2b-c020c9ffbfa1' },
    {
      name: 'Prioridad',
      type: 'select',
      options: [{ name: 'Media' }, { name: 'Baja' }, { name: 'Alta' }, { name: 'Máxima' }],
    },
    { name: 'Proyecto', type: 'relation', relationDataSourceId: '8d78f073-359d-45c6-9726-36cf961eb340' },
    { name: 'Resumen', type: 'rich_text' },
    { name: 'Sprint', type: 'relation', relationDataSourceId: '33d924bd-1ef2-48e3-9c3f-c39b89ffd2e7' },
    { name: 'Subtareas', type: 'relation', relationDataSourceId: 'e0b0a979-7c1c-4b53-97fa-22ea36b428fc' },
    { name: 'Tarea principal', type: 'relation', relationDataSourceId: 'e0b0a979-7c1c-4b53-97fa-22ea36b428fc' },
    { name: 'Test Plan', type: 'relation', relationDataSourceId: 'efa76de7-b865-4e7f-9273-6dffba3c32f5' },
    { name: 'Tipo', type: 'select', options: [{ name: 'Hotfix' }, { name: 'Feature' }] },
    { name: 'Veces en Bug', type: 'number' },
    { name: 'responsable', type: 'people' },
    { name: 'Última edición', type: 'last_edited_time' },
    { name: 'Última edición por', type: 'last_edited_by' },
  ],
};

export const backlogSoftware: NotionSchema = {
  title: 'Backlog Software',
  properties: [
    { name: '', type: 'unique_id' },
    { name: 'Cliente Afectado', type: 'rich_text' },
    { name: 'Descripción', type: 'rich_text' },
    {
      name: 'Estado',
      type: 'status',
      options: [
        group('Para definir doc', 'to_do'),
        group('Error en el desarrollo', 'to_do'),
        group('Workaround Necesita Afinarse', 'to_do'),
        group('Por documentar', 'to_do'),
        group('No se puede reproducir el error', 'to_do'),
        group('Sin empezar', 'to_do'),
        group('Necesita más información', 'to_do'),
        group('Lista para desarrollar', 'to_do'),
        group('En desarrollo', 'in_progress'),
        group('Desarrollo realizado', 'complete'),
        group('Finalizada', 'complete'),
        group('Archivadas', 'complete'),
      ],
    },
    { name: 'Fecha de publicación', type: 'date' },
    { name: 'Fecha límite', type: 'date' },
    {
      name: 'Módulo',
      type: 'multi_select',
      options: [{ name: 'Contabilidad' }, { name: 'General' }, { name: 'Cobros' }],
    },
    { name: 'Nombre de tarea', type: 'title' },
    {
      name: 'Prioridad',
      type: 'select',
      options: [{ name: 'Urgente' }, { name: 'Alta' }, { name: 'Media' }, { name: 'Baja' }],
    },
    { name: 'Resumen', type: 'rich_text' },
    {
      name: 'Rol afectado',
      type: 'multi_select',
      options: [{ name: 'Administrador' }, { name: 'Residente' }],
    },
    { name: 'Subtareas', type: 'relation', relationDataSourceId: '30cddbac-34cb-81b0-8620-000b5bfdb838' },
    { name: 'Tarea principal', type: 'relation', relationDataSourceId: '30cddbac-34cb-81b0-8620-000b5bfdb838' },
    { name: 'Tareas Software', type: 'relation', relationDataSourceId: 'e0b0a979-7c1c-4b53-97fa-22ea36b428fc' },
    { name: 'Tipo', type: 'select', options: [{ name: 'Bug' }, { name: 'Missing Feature' }] },
    { name: 'responsable', type: 'people' },
    { name: 'Última edición', type: 'last_edited_time' },
  ],
};

export const testDePruebas: NotionSchema = {
  title: '🧪 Test de Pruebas',
  properties: [
    { name: 'Cobertura criterios', type: 'number' },
    { name: 'Criterios cubiertos', type: 'checkbox' },
    { name: 'Datos sembrados', type: 'checkbox' },
    {
      name: 'Estado',
      type: 'select',
      options: [
        { name: 'Pendiente' },
        { name: 'En pruebas' },
        { name: 'Aprobado por dev' },
        { name: 'Rechazado' },
      ],
    },
    { name: 'Fecha', type: 'date' },
    { name: 'Nombre', type: 'title' },
    { name: 'Responsable', type: 'people' },
    { name: 'Responsive movil OK', type: 'checkbox' },
    { name: 'Sin regresiones', type: 'checkbox' },
    { name: 'TAR', type: 'relation', relationDataSourceId: 'e0b0a979-7c1c-4b53-97fa-22ea36b428fc' },
    { name: 'UI/UX conforme', type: 'checkbox' },
  ],
};

export const proyectos: NotionSchema = {
  title: 'Proyectos',
  properties: [
    {
      name: 'Estado',
      type: 'status',
      options: [
        group('Trabajo acumulado', 'to_do'),
        group('Planificación', 'in_progress'),
        group('En curso', 'in_progress'),
        group('En pausa', 'in_progress'),
        group('Cancelado', 'complete'),
        group('Finalizada', 'complete'),
      ],
    },
    { name: 'Fechas', type: 'date' },
    { name: 'Finalización', type: 'rollup', rollupFunction: 'percent_per_group', numberFormat: 'percent' },
    { name: 'Nombre del proyecto', type: 'title' },
    { name: 'Propietario', type: 'people' },
    { name: 'Tareas', type: 'relation', relationDataSourceId: 'e0b0a979-7c1c-4b53-97fa-22ea36b428fc' },
  ],
};
