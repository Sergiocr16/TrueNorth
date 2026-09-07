'use client';

import { useState } from 'react';
import type { Priority, Project, ProjectVisibility, Task, TaskStatus } from '@truenorth/core';
import { statusFor, statusOptionsFor } from '@truenorth/core';
import {
  ChipSelectField,
  DateField,
  DestructiveRow,
  EditSheet,
  FieldGroup,
  PercentField,
  SelectField,
  TextAreaField,
  TextField,
  useConfirm,
} from '../../components/form';
import { usePreferences } from '../../lib/preferences';
import { useStore } from '../../lib/store';

function priorityOptions(locale: 'es' | 'en'): { value: Priority; label: string }[] {
  return locale === 'es'
    ? [
        { value: 'low', label: 'Baja' },
        { value: 'medium', label: 'Media' },
        { value: 'high', label: 'Alta' },
        { value: 'max', label: 'Máxima' },
      ]
    : [
        { value: 'low', label: 'Low' },
        { value: 'medium', label: 'Medium' },
        { value: 'high', label: 'High' },
        { value: 'max', label: 'Max' },
      ];
}

/** Create or edit a project, including which objectives it serves. */
export function ProjectEditor({
  project,
  isNew = false,
  onCancel,
  onSave,
  onDelete,
}: {
  project: Project;
  isNew?: boolean;
  onCancel: () => void;
  onSave: (project: Project) => void;
  onDelete?: () => void;
}) {
  const { t, locale } = usePreferences();
  const { objectives, activeObjectives, roles, users } = useStore();
  const [draft, setDraft] = useState<Project>(project);
  // The objectives this role may serve, plus any the project already serves
  // from another role, so saving does not silently drop that link (ADR-013).
  const objectiveOptions = [
    ...activeObjectives,
    ...objectives.filter((o) => draft.objectiveIds.includes(o.id) && !activeObjectives.some((a) => a.id === o.id)),
  ].map((o) => ({
    value: o.id,
    label:
      o.scope === 'role' && !activeObjectives.some((a) => a.id === o.id)
        ? `${o.title} · ${t.objectives.roleScope(roles.find((r) => r.id === o.roleId)?.name ?? '—')}`
        : o.title,
  }));
  const [confirming, arm, disarm] = useConfirm();

  const visibilityOptions: { value: ProjectVisibility; label: string }[] =
    locale === 'es'
      ? [
          { value: 'company', label: 'Toda la empresa' },
          { value: 'shared', label: 'Compartido' },
          { value: 'private', label: 'Privado' },
        ]
      : [
          { value: 'company', label: 'Whole company' },
          { value: 'shared', label: 'Shared' },
          { value: 'private', label: 'Private' },
        ];

  return (
    <EditSheet
      open
      title={
        isNew
          ? locale === 'es'
            ? 'Nuevo proyecto'
            : 'New project'
          : locale === 'es'
            ? 'Editar proyecto'
            : 'Edit project'
      }
      onCancel={onCancel}
      onSave={() => onSave(draft)}
      canSave={draft.name.trim().length > 0}
    >
      <FieldGroup>
        <TextField
          label={locale === 'es' ? 'Nombre' : 'Name'}
          value={draft.name}
          onChange={(name) => setDraft({ ...draft, name })}
          placeholder={locale === 'es' ? 'Portal de proveedores' : 'Supplier portal'}
        />
        <TextAreaField
          label={locale === 'es' ? 'Descripción' : 'Description'}
          value={draft.description}
          onChange={(description) => setDraft({ ...draft, description })}
          rows={2}
          isLast
        />
      </FieldGroup>

      <FieldGroup
        footer={
          draft.objectiveIds.length === 0
            ? locale === 'es'
              ? 'Sin objetivo, este proyecto consume trabajo sin contribuir a la meta y aparecerá en Riesgos.'
              : 'Without an objective this project consumes work without serving the goal, and will show up in Risks.'
            : undefined
        }
      >
        <ChipSelectField
          label={t.projects.servesObjectives}
          options={objectiveOptions}
          selected={draft.objectiveIds}
          onChange={(objectiveIds) => setDraft({ ...draft, objectiveIds })}
          emptyHint={
            locale === 'es' ? 'Creá un objetivo primero.' : 'Create an objective first.'
          }
          isLast
        />
      </FieldGroup>

      <FieldGroup>
        <SelectField
          label={t.objectives.owner}
          value={draft.ownerUserId}
          options={users.map((user) => ({ value: user.id, label: user.displayName }))}
          onChange={(ownerUserId) => setDraft({ ...draft, ownerUserId })}
        />
        <SelectField
          label={locale === 'es' ? 'Visibilidad' : 'Visibility'}
          value={draft.visibility}
          options={visibilityOptions}
          onChange={(visibility) => setDraft({ ...draft, visibility })}
        />
        <DateField
          label={locale === 'es' ? 'Inicio' : 'Start'}
          value={draft.startDate}
          onChange={(value) => setDraft({ ...draft, startDate: value ?? draft.startDate })}
        />
        <DateField
          label={t.company.deadline}
          value={draft.targetDate}
          onChange={(value) => setDraft({ ...draft, targetDate: value ?? draft.targetDate })}
        />
        <PercentField
          label={t.objectives.actual}
          value={draft.progressPct}
          onChange={(progressPct) => setDraft({ ...draft, progressPct })}
          isLast
        />
      </FieldGroup>

      <FieldGroup
        header={locale === 'es' ? 'Compartir' : 'Sharing'}
        footer={
          draft.visibility === 'company'
            ? locale === 'es'
              ? 'Visible para toda la empresa. Cambiá la visibilidad arriba para elegir a quién.'
              : 'Visible to the whole company. Change the visibility above to pick people.'
            : locale === 'es'
              ? 'Solo estas personas lo ven. Vos decidís con quién lo compartís.'
              : 'Only these people see it. Sharing is your call.'
        }
      >
        <ChipSelectField
          label={locale === 'es' ? 'Personas con acceso' : 'People with access'}
          options={users.map((user) => ({ value: user.id, label: user.displayName }))}
          selected={draft.memberUserIds}
          onChange={(memberUserIds) =>
            setDraft({
              ...draft,
              // The owner never loses access to their own project.
              memberUserIds: memberUserIds.includes(draft.ownerUserId)
                ? memberUserIds
                : [...memberUserIds, draft.ownerUserId],
            })
          }
          emptyHint={locale === 'es' ? 'No hay nadie más todavía.' : 'Nobody else yet.'}
          isLast
        />
      </FieldGroup>

      {onDelete ? (
        <div className="mt-6">
          <div className="tn-card mx-4 overflow-hidden">
            <DestructiveRow
              label={
                confirming
                  ? locale === 'es'
                    ? 'Tocá otra vez para eliminar'
                    : 'Tap again to delete'
                  : locale === 'es'
                    ? 'Eliminar proyecto'
                    : 'Delete project'
              }
              onClick={() => {
                if (confirming) {
                  disarm();
                  onDelete();
                } else {
                  arm();
                }
              }}
            />
          </div>
          <p className="px-5 pt-2 text-[13px] leading-snug text-[var(--ter)]">
            {locale === 'es'
              ? 'Sus tareas quedan sin proyecto, no se borran.'
              : 'Its tasks lose their project, they are not deleted.'}
          </p>
        </div>
      ) : null}
    </EditSheet>
  );
}

/** Create or edit a task, with the real Notion status vocabulary. */
export function TaskEditor({
  task,
  isNew = false,
  onCancel,
  onSave,
  onDelete,
}: {
  task: Task;
  isNew?: boolean;
  onCancel: () => void;
  onSave: (task: Task) => void;
  onDelete?: () => void;
}) {
  const { t, locale } = usePreferences();
  const store = useStore();
  const [draft, setDraft] = useState<Task>(task);
  const [confirming, arm, disarm] = useConfirm();

  // A Notion task shows its own database's labels, and is not saved from
  // here: it lives in Notion, and the rules refuse the write anyway.
  const notionStatuses = statusOptionsFor(draft, store.sources);
  const fromNotion = draft.source === 'notion';
  const source = store.sources.find((s) => s.id === draft.sourceId);
  const internalOptions: { value: TaskStatus; label: string }[] = (
    ['todo', 'in_progress', 'blocked', 'done'] as const
  ).map((value) => ({ value, label: t.taskStatus[value] }));

  const candidates = store.tasks.filter((other) => other.id !== draft.id);

  return (
    <EditSheet
      open
      title={
        isNew
          ? locale === 'es'
            ? 'Nueva tarea'
            : 'New task'
          : draft.code || (locale === 'es' ? 'Editar tarea' : 'Edit task')
      }
      onCancel={onCancel}
      onSave={() => onSave(draft)}
      canSave={!fromNotion && draft.title.trim().length > 0}
    >
      <FieldGroup>
        <TextField
          label={locale === 'es' ? 'Código' : 'Code'}
          value={draft.code}
          onChange={(code) => setDraft({ ...draft, code })}
          placeholder="TAR-000"
        />
        <TextAreaField
          label={locale === 'es' ? 'Título' : 'Title'}
          value={draft.title}
          onChange={(title) => setDraft({ ...draft, title })}
          rows={2}
          isLast
        />
      </FieldGroup>

      <FieldGroup
        header={locale === 'es' ? 'Estado' : 'Status'}
        footer={fromNotion ? t.integrations.editedInNotion : undefined}
      >
        {draft.source === 'notion' ? (
          <SelectField
            label={locale === 'es' ? 'Estado en Notion' : 'Notion status'}
            value={draft.notionStatus ?? 'Sin empezar'}
            options={notionStatuses.map((status) => ({ value: status, label: status }))}
            onChange={(notionStatus) =>
              setDraft({
                ...draft,
                notionStatus,
                status: source ? statusFor(source, notionStatus) : draft.status,
              })
            }
          />
        ) : (
          <SelectField
            label={locale === 'es' ? 'Estado' : 'Status'}
            value={draft.status}
            options={internalOptions}
            onChange={(status) => setDraft({ ...draft, status })}
          />
        )}
        <SelectField
          label={locale === 'es' ? 'Prioridad' : 'Priority'}
          value={draft.priority}
          options={priorityOptions(locale)}
          onChange={(priority) => setDraft({ ...draft, priority })}
        />
        <DateField
          label={t.company.deadline}
          value={draft.dueDate}
          onChange={(dueDate) => setDraft({ ...draft, dueDate })}
        />
        <ChipSelectField
          label={t.objectives.owner}
          options={store.users.map((user) => ({ value: user.id, label: user.displayName }))}
          selected={draft.assigneeUserIds}
          onChange={(assigneeUserIds) => setDraft({ ...draft, assigneeUserIds })}
          emptyHint={t.projects.unassigned}
          isLast
        />
      </FieldGroup>

      <FieldGroup header={t.projects.dependencies}>
        <ChipSelectField
          label={t.projects.blockedBy}
          options={candidates.map((other) => ({
            value: other.id,
            label: other.code || other.title.slice(0, 18),
          }))}
          selected={draft.dependsOn}
          onChange={(dependsOn) =>
            setDraft({
              ...draft,
              dependsOn,
              status:
                dependsOn.length > 0 && draft.status !== 'done' ? 'blocked' : draft.status,
            })
          }
          emptyHint={locale === 'es' ? 'No hay otras tareas.' : 'No other tasks.'}
          isLast
        />
      </FieldGroup>

      {onDelete ? (
        <div className="mt-6">
          <div className="tn-card mx-4 overflow-hidden">
            <DestructiveRow
              label={
                confirming
                  ? locale === 'es'
                    ? 'Tocá otra vez para eliminar'
                    : 'Tap again to delete'
                  : locale === 'es'
                    ? 'Eliminar tarea'
                    : 'Delete task'
              }
              onClick={() => {
                if (confirming) {
                  disarm();
                  onDelete();
                } else {
                  arm();
                }
              }}
            />
          </div>
        </div>
      ) : null}
    </EditSheet>
  );
}
