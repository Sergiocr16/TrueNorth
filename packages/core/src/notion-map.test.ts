import { describe, expect, it } from 'vitest';
import { NOTION_TASK_STATUS, defaultStatusMap } from './notion-status';
import {
  flattenComments,
  mappingHash,
  notionDocId,
  pageToProject,
  pageToTask,
  parseNotionId,
  suggestMapping,
  tableFromSearch,
  type NotionPage,
} from './notion-map';
import { backlogSoftware, proyectos, tareasSoftware, testDePruebas } from './notion-schemas.fixture';
import type { NotionSource, Task } from './types';

const TAREAS_ID = '7ebdc9f1-b0c6-4a99-95e4-7560e9a80211';

describe('parseNotionId', () => {
  it('reads a database url with a slug and a view parameter', () => {
    expect(
      parseNotionId('https://www.notion.so/aditum/Tareas-7ebdc9f1b0c64a9995e47560e9a80211?v=04573206f8d04ae28393f0212d9a9292'),
    ).toBe(TAREAS_ID);
  });

  it('reads the app.notion.com form and a dashed uuid', () => {
    expect(parseNotionId('https://app.notion.com/p/7ebdc9f1b0c64a9995e47560e9a80211?pvs=204')).toBe(TAREAS_ID);
    expect(parseNotionId(TAREAS_ID)).toBe(TAREAS_ID);
    expect(parseNotionId('7EBDC9F1B0C64A9995E47560E9A80211')).toBe(TAREAS_ID);
  });

  it('refuses anything that does not contain an id', () => {
    expect(parseNotionId('')).toBeNull();
    expect(parseNotionId('Tareas Software')).toBeNull();
  });
});

describe('tableFromSearch', () => {
  it('reads a data source, keeping the database above it', () => {
    expect(
      tableFromSearch({
        object: 'data_source',
        id: 'e0b0a979-7c1c-4b53-97fa-22ea36b428fc',
        name: 'Tareas Software',
        database_parent: { database_id: TAREAS_ID },
      }),
    ).toEqual({
      databaseId: TAREAS_ID,
      dataSourceId: 'e0b0a979-7c1c-4b53-97fa-22ea36b428fc',
      title: 'Tareas Software',
    });
  });

  it('reads a database, whose data source is not known yet', () => {
    expect(
      tableFromSearch({
        object: 'database',
        id: TAREAS_ID,
        title: [{ plain_text: 'Tareas ' }, { plain_text: 'Software' }],
        parent: { type: 'page_id', page_id: 'p1' },
      }),
    ).toEqual({ databaseId: TAREAS_ID, dataSourceId: null, title: 'Tareas Software' });
  });

  it('leaves out pages, deleted tables and anything without an id', () => {
    expect(tableFromSearch({ object: 'page', id: 'x' })).toBeNull();
    expect(tableFromSearch({ object: 'database', id: TAREAS_ID, in_trash: true })).toBeNull();
    expect(tableFromSearch({ object: 'database', id: TAREAS_ID, archived: true })).toBeNull();
    expect(tableFromSearch({ id: '' } as { id: string })).toBeNull();
  });

  it('names a table with no title rather than showing it blank', () => {
    expect(tableFromSearch({ object: 'database', id: TAREAS_ID, title: [] })?.title).toBe('(sin nombre)');
  });
});

describe('suggestMapping', () => {
  it('maps Tareas Software the way the ADR-gated constant does', () => {
    const suggested = suggestMapping(tareasSoftware);
    expect(suggested.kind).toBe('tasks');
    expect(suggested.properties).toEqual({
      title: 'Nombre de tarea',
      status: 'Estado',
      assignee: 'responsable',
      dueDate: 'Fecha límite',
      priority: 'Prioridad',
      project: 'Proyecto',
      parent: 'Tarea principal',
      code: '',
    });
    expect(suggested.statusType).toBe('status');
    // The golden case: the database's own groups plus the blocked label
    // reproduce the contract exactly, fifteen entries and all.
    expect(suggested.statusMap).toEqual(NOTION_TASK_STATUS);
    expect(suggested.priorityMap).toEqual({ Media: 'medium', Baja: 'low', Alta: 'high', Máxima: 'max' });
    expect(suggested.warnings).toEqual([]);
  });

  it('maps the backlog with its own vocabulary and no project relation', () => {
    const suggested = suggestMapping(backlogSoftware);
    expect(suggested.properties.project).toBeUndefined();
    expect(suggested.properties.code).toBe('');
    expect(suggested.statusMap['Lista para desarrollar']).toBe('todo');
    expect(suggested.statusMap['En desarrollo']).toBe('in_progress');
    expect(suggested.statusMap['Desarrollo realizado']).toBe('done');
    expect(suggested.priorityMap?.Urgente).toBe('max');
  });

  it('warns about a status kept in a plain select and guesses the obvious labels', () => {
    const suggested = suggestMapping(testDePruebas);
    expect(suggested.statusType).toBe('select');
    expect(suggested.properties.assignee).toBe('Responsable');
    expect(suggested.properties.dueDate).toBe('Fecha');
    expect(suggested.statusMap).toEqual({
      Pendiente: 'todo',
      'En pruebas': 'in_progress',
      'Aprobado por dev': 'done',
      Rechazado: 'todo',
    });
    expect(suggested.warnings.some((w) => /select/.test(w))).toBe(true);
  });

  it('recognises a projects database by its progress rollup', () => {
    const suggested = suggestMapping(proyectos);
    expect(suggested.kind).toBe('projects');
    expect(suggested.properties.progress).toBe('Finalización');
    expect(suggested.properties.assignee).toBe('Propietario');
    expect(suggested.projectStatusMap?.['En pausa']).toBe('at_risk');
    expect(suggested.projectStatusMap?.Finalizada).toBe('done');
  });
});

describe('defaultStatusMap', () => {
  it('sends a waiting label to blocked whatever group Notion put it in', () => {
    expect(
      defaultStatusMap({
        type: 'status',
        options: [{ name: 'Esperando cliente', group: 'to_do' }, { name: 'Hecho', group: 'complete' }],
      }),
    ).toEqual({ 'Esperando cliente': 'blocked', Hecho: 'done' });
  });
});

/* ------------------------------------------------------------------ */
/* Pages                                                               */
/* ------------------------------------------------------------------ */

const source: NotionSource = {
  id: 'ns_tareas',
  companyId: 'c1',
  kind: 'tasks',
  title: 'Tareas Software',
  databaseId: TAREAS_ID,
  dataSourceId: 'e0b0a979-7c1c-4b53-97fa-22ea36b428fc',
  properties: suggestMapping(tareasSoftware).properties,
  statusType: 'status',
  statusMap: { ...NOTION_TASK_STATUS },
  priorityMap: { Media: 'medium', Baja: 'low', Alta: 'high', Máxima: 'max' },
  mappingHash: 'x',
  lastSyncAt: null,
  lastFullSyncAt: null,
  lastSyncError: null,
  counts: { pages: 0, open: 0, unmatchedPeople: 0 },
  createdBy: 'u1',
  createdAt: '2026-09-01T00:00:00Z',
};

const people = [
  { id: 'u_marco', displayName: 'Marco Jiménez' },
  { id: 'u_adriana', displayName: 'Adriana Vargas', notionUserId: 'n-adriana' },
  { id: 'u_lucia', displayName: 'Lucía Mora' },
  { id: 'u_lucia2', displayName: 'Lucía Pérez' },
];

const PAGE_ID = '3acddbac-34cb-81e6-b4c0-ea280b95217b';
const PROJECT_PAGE = '1190223e-55aa-42e9-95c8-5d7a82bf79dd';

function page(overrides: Partial<NotionPage['properties']> = {}, extra: Partial<NotionPage> = {}): NotionPage {
  return {
    id: PAGE_ID,
    last_edited_time: '2026-08-29T16:40:00.000Z',
    created_time: '2026-08-01T10:00:00.000Z',
    properties: {
      'Nombre de tarea': { type: 'title', title: [{ plain_text: 'Portal de proveedores ' }, { plain_text: 'con link seguro' }] },
      Estado: { type: 'status', status: { name: 'En curso' } },
      responsable: { type: 'people', people: [{ id: 'n-marco', name: 'marco jimenez', type: 'person' }] },
      'Fecha límite': { type: 'date', date: { start: '2026-09-03', end: null } },
      Prioridad: { type: 'select', select: { name: 'Máxima' } },
      Proyecto: { type: 'relation', relation: [{ id: PROJECT_PAGE }] },
      'Tarea principal': { type: 'relation', relation: [] },
      '': { type: 'unique_id', unique_id: { prefix: 'TAR', number: 966 } },
      ...overrides,
    },
    ...extra,
  };
}

const ctx = { companyId: 'c1', people, now: '2026-09-04T08:00:00.000Z' };

describe('pageToTask', () => {
  it('reads the task the way the app shows it', () => {
    const { task, unmatched } = pageToTask(page(), source, ctx);
    expect(task.id).toBe(notionDocId(PAGE_ID));
    expect(task.code).toBe('TAR-966');
    expect(task.title).toBe('Portal de proveedores con link seguro');
    expect(task.status).toBe('in_progress');
    expect(task.notionStatus).toBe('En curso');
    expect(task.priority).toBe('max');
    expect(task.dueDate).toBe('2026-09-03');
    expect(task.assigneeUserIds).toEqual(['u_marco']);
    expect(task.source).toBe('notion');
    expect(task.sourceId).toBe('ns_tareas');
    expect(task.notionPageId).toBe('3acddbac34cb81e6b4c0ea280b95217b');
    expect(task.notionLastEditedAt).toBe('2026-08-29T16:40:00.000Z');
    expect(task.statusChangedAt).toBe(ctx.now);
    expect(unmatched).toEqual([]);
  });

  it('keeps the status clock when the label did not move, and stamps it when it did', () => {
    const previous: Task = {
      ...pageToTask(page(), source, ctx).task,
      statusChangedAt: '2026-08-21T10:14:00.000Z',
    };
    const same = pageToTask(page(), source, { ...ctx, previous });
    expect(same.task.statusChangedAt).toBe('2026-08-21T10:14:00.000Z');

    const moved = pageToTask(
      page({ Estado: { type: 'status', status: { name: 'Pruebas QA' } } }),
      source,
      { ...ctx, previous },
    );
    expect(moved.task.statusChangedAt).toBe(ctx.now);
    expect(moved.task.status).toBe('in_progress');
  });

  it('maps a blocked label and an unknown one', () => {
    expect(pageToTask(page({ Estado: { type: 'status', status: { name: 'Depende de otra TAR' } } }), source, ctx).task.status).toBe('blocked');
    expect(pageToTask(page({ Estado: { type: 'status', status: { name: 'Algo nuevo' } } }), source, ctx).task.status).toBe('todo');
    expect(pageToTask(page({ Estado: { type: 'status', status: null } }), source, ctx).task.notionStatus).toBeUndefined();
  });

  it('resolves people by id, by name, and reports the ones it cannot place', () => {
    const { task, unmatched } = pageToTask(
      page({
        responsable: {
          type: 'people',
          people: [
            { id: 'n-adriana', name: 'A. V.', type: 'person' },
            { id: 'n-lucia', name: 'Lucía', type: 'person' },
            { id: 'n-bot', name: 'Automation', type: 'bot' },
            { id: 'n-nuevo', name: 'Diego Solano', type: 'person' },
          ],
        },
      }),
      source,
      ctx,
    );
    expect(task.assigneeUserIds).toEqual(['u_adriana']);
    // Two Lucías on the team: a bare "Lucía" is nobody, and it is reported.
    expect(unmatched.map((p) => p.id)).toEqual(['n-lucia', 'n-nuevo']);
  });

  it('links the project only when it was synced from a projects source', () => {
    const unknown = pageToTask(page(), source, ctx);
    expect(unknown.task.projectId).toBeNull();
    const known = pageToTask(page(), source, { ...ctx, projectIds: new Set([notionDocId(PROJECT_PAGE)]) });
    expect(known.task.projectId).toBe(notionDocId(PROJECT_PAGE));
  });

  it('turns the parent relation into a dependency and copes with missing values', () => {
    const { task } = pageToTask(
      page({
        'Tarea principal': { type: 'relation', relation: [{ id: PROJECT_PAGE }] },
        'Fecha límite': { type: 'date', date: null },
        Prioridad: { type: 'select', select: null },
        'Nombre de tarea': { type: 'title', title: [] },
      }),
      source,
      ctx,
    );
    expect(task.dependsOn).toEqual([notionDocId(PROJECT_PAGE)]);
    expect(task.dueDate).toBeNull();
    expect(task.priority).toBe('medium');
    expect(task.title).toBe('(sin título)');
  });

  it('carries stored comments over, because the page object does not have them', () => {
    const previous: Task = {
      ...pageToTask(page(), source, ctx).task,
      commentCount: 2,
      lastCommentAt: '2026-08-30T10:00:00.000Z',
      lastCommentBy: 'u_adriana',
      comments: [{ id: 'c1', authorUserId: 'u_adriana', authorName: 'Adriana', createdAt: '2026-08-30T10:00:00.000Z', text: 'hola' }],
    };
    const { task } = pageToTask(page(), source, { ...ctx, previous });
    expect(task.commentCount).toBe(2);
    expect(task.comments?.[0]?.text).toBe('hola');
  });
});

describe('pageToProject', () => {
  const projectSource: NotionSource = {
    ...source,
    id: 'ns_proyectos',
    kind: 'projects',
    title: 'Proyectos',
    properties: suggestMapping(proyectos).properties,
    projectStatusMap: suggestMapping(proyectos).projectStatusMap,
  };
  const projectPage: NotionPage = {
    id: PROJECT_PAGE,
    last_edited_time: '2026-08-29T16:40:00.000Z',
    properties: {
      'Nombre del proyecto': { type: 'title', title: [{ plain_text: 'Portal de proveedores' }] },
      Estado: { type: 'status', status: { name: 'En curso' } },
      Fechas: { type: 'date', date: { start: '2026-06-01', end: '2026-09-30' } },
      Finalización: { type: 'rollup', rollup: { type: 'number', number: 0.46 } },
      Propietario: { type: 'people', people: [{ id: 'n-marco', name: 'Marco Jiménez', type: 'person' }] },
    },
  };

  it('reads dates, progress and owner, and starts the history', () => {
    const { project } = pageToProject(projectPage, projectSource, ctx);
    expect(project.startDate).toBe('2026-06-01');
    expect(project.targetDate).toBe('2026-09-30');
    expect(project.progressPct).toBe(46);
    expect(project.ownerUserId).toBe('u_marco');
    expect(project.memberUserIds).toEqual(['u_marco']);
    expect(project.visibility).toBe('company');
    expect(project.sourceId).toBe('ns_proyectos');
    expect(project.history).toEqual([{ date: '2026-09-04', value: 46 }]);
    expect(project.status).toBe('at_risk');
  });

  it('appends one reading per day only when the progress moved', () => {
    const first = pageToProject(projectPage, projectSource, ctx).project;
    const unchanged = pageToProject(projectPage, projectSource, { ...ctx, previous: first, now: '2026-09-05T08:00:00.000Z' }).project;
    expect(unchanged.history).toHaveLength(1);
    const moved = pageToProject(
      { ...projectPage, properties: { ...projectPage.properties, Finalización: { type: 'rollup', rollup: { type: 'number', number: 0.5 } } } },
      projectSource,
      { ...ctx, previous: unchanged, now: '2026-09-05T08:00:00.000Z' },
    ).project;
    expect(moved.history).toEqual([
      { date: '2026-09-04', value: 46 },
      { date: '2026-09-05', value: 50 },
    ]);
  });

  it('marks a finished project done whatever the dates say', () => {
    const done = pageToProject(
      { ...projectPage, properties: { ...projectPage.properties, Estado: { type: 'status', status: { name: 'Finalizada' } } } },
      projectSource,
      ctx,
    ).project;
    expect(done.status).toBe('done');
  });
});

describe('flattenComments', () => {
  it('flattens text, orders by time and resolves the author to the team', () => {
    const comments = flattenComments(
      [
        { id: 'c2', created_time: '2026-08-30T10:00:00.000Z', created_by: { id: 'n-adriana' }, rich_text: [{ plain_text: '¿Sigue ' }, { plain_text: 'para el 30?' }] },
        { id: 'c1', created_time: '2026-08-29T10:00:00.000Z', created_by: { id: 'n-x', name: 'Cliente' }, rich_text: [{ plain_text: 'Urge' }] },
      ],
      people,
      [{ id: 'n-adriana', name: 'Adriana Vargas' }],
    );
    expect(comments.map((c) => c.id)).toEqual(['c1', 'c2']);
    expect(comments[1]).toEqual({
      id: 'c2',
      authorUserId: 'u_adriana',
      authorName: 'Adriana Vargas',
      createdAt: '2026-08-30T10:00:00.000Z',
      text: '¿Sigue para el 30?',
    });
    expect(comments[0]?.authorUserId).toBeNull();
    expect(comments[0]?.authorName).toBe('Cliente');
  });
});

describe('mappingHash', () => {
  it('is stable under key order and changes with any property', () => {
    const a = mappingHash({ title: 'T', status: 'E', assignee: 'r' });
    const b = mappingHash({ status: 'E', assignee: 'r', title: 'T' });
    expect(a).toBe(b);
    expect(mappingHash({ title: 'T', status: 'E', assignee: 'Responsable' })).not.toBe(a);
  });
});
