'use client';

import { useState } from 'react';
import { NOTION_TASK_STATUS, type TaskStatus } from '@truenorth/core';
import { LargeTitle, Screen } from '../../components/shell';
import { Card, SectionLabel, TaskStatusPill, TextButton } from '../../components/ui';
import { EditSheet, FieldGroup, SelectField } from '../../components/form';
import { NotionMark } from '../../components/icons';
import { usePreferences } from '../../lib/preferences';
import { useRiskCount, useStore } from '../../lib/store';

/**
 * The Notion connection. ADITUM's two live databases arrive with the mapping
 * prefilled, because the property names were confirmed in the workspace; other
 * companies pick their own.
 */
const NOTION_PROPERTIES = {
  tasks: [
    'Nombre de tarea',
    'Estado',
    'responsable',
    'Fecha límite',
    'Prioridad',
    'Proyecto',
    'Tarea principal',
    'Subtareas',
    'Tipo',
    'Sprint',
  ],
  projects: ['Nombre del proyecto', 'Propietario', 'Estado', 'Fechas', 'Finalización', 'Tareas'],
};

interface Mapping {
  status: string;
  assignee: string;
  dueDate: string;
  project: string;
}

const DEFAULT_MAPPING: Mapping = {
  status: 'Estado',
  assignee: 'responsable',
  dueDate: 'Fecha límite',
  project: 'Proyecto',
};

export default function IntegrationsPage() {
  const { t, locale } = usePreferences();
  const riskCount = useRiskCount();
  const store = useStore();
  const [mapping, setMapping] = useState<Mapping>(DEFAULT_MAPPING);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Mapping>(DEFAULT_MAPPING);

  const notionTasks = store.tasks.filter((task) => task.source === 'notion').length;
  const notionProjects = store.projects.filter((project) => project.source === 'notion').length;

  // Group the fifteen Notion labels by the internal state they collapse onto.
  const grouped = (['todo', 'in_progress', 'blocked', 'done'] as TaskStatus[]).map((internal) => ({
    internal,
    labels: Object.entries(NOTION_TASK_STATUS)
      .filter(([, value]) => value === internal)
      .map(([label]) => label),
  }));

  return (
    <Screen riskCount={riskCount}>
      <LargeTitle title={t.integrations.title} />

      <div className="mx-4 mt-3">
        <Card className="p-4">
          <div className="flex items-start gap-3.5">
            <span className="mt-0.5 shrink-0 text-[var(--ink)]">
              <NotionMark size={30} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[17px] font-semibold text-[var(--ink)]">
                {t.integrations.notion}
              </div>
              <div className="text-[15px] text-[var(--sec)]">ADITUM</div>
            </div>
            <span
              className="rounded-full px-2.5 py-1 text-[13px] font-semibold"
              style={{ background: 'var(--green-bg)', color: 'var(--green)' }}
            >
              {t.integrations.connected}
            </span>
          </div>

          <div className="tn-tabular mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-[var(--hair)] pt-3 text-[13px] text-[var(--ter)]">
            <span>
              {t.integrations.lastSync}: 05:02
            </span>
            <span>
              {notionProjects} {t.nav.projects.toLowerCase()} · {notionTasks}{' '}
              {t.projects.tasks.toLowerCase()}
            </span>
          </div>
        </Card>
      </div>

      <div className="mx-4 mt-4">
        <SectionLabel>{t.integrations.sources}</SectionLabel>
        <Card className="overflow-hidden">
          {[
            { name: 'Proyectos', kind: locale === 'es' ? 'Base de datos' : 'Database' },
            { name: 'Tareas Software', kind: locale === 'es' ? 'Base de datos' : 'Database' },
          ].map((source, index) => (
            <div
              key={source.name}
              className={`flex items-center gap-3 px-4 py-3 ${index === 1 ? '' : 'tn-hairline'}`}
            >
              <div className="min-w-0 flex-1">
                <div className="text-[17px] text-[var(--ink)]">{source.name}</div>
                <div className="text-[13px] text-[var(--ter)]">{source.kind}</div>
              </div>
              <span
                className="rounded-full px-2.5 py-0.5 text-[12px] font-semibold"
                style={{ background: 'var(--accent-bg)', color: 'var(--accent)' }}
              >
                {locale === 'es' ? 'Lectura y escritura' : 'Read and write'}
              </span>
            </div>
          ))}
        </Card>
      </div>

      <div className="mx-4 mt-4">
        <SectionLabel
          action={
            <TextButton
              onClick={() => {
                setDraft(mapping);
                setEditing(true);
              }}
            >
              {t.team.editRole}
            </TextButton>
          }
        >
          {t.integrations.mapping}
        </SectionLabel>
        <Card className="overflow-hidden">
          {(
            [
              ['status', t.integrations.fieldStatus],
              ['assignee', t.integrations.fieldAssignee],
              ['dueDate', t.integrations.fieldDueDate],
              ['project', t.integrations.fieldProject],
            ] as const
          ).map(([key, label], index) => (
            <div
              key={key}
              className={`flex items-center gap-3 px-4 py-3 ${index === 3 ? '' : 'tn-hairline'}`}
            >
              <span className="flex-1 text-[17px] text-[var(--ink)]">{label}</span>
              <span className="text-[15px] text-[var(--sec)]">{mapping[key]}</span>
            </div>
          ))}
        </Card>
        <p className="px-5 pt-2 text-[13px] leading-snug text-[var(--ter)]">
          {t.integrations.mappingHint}
        </p>
      </div>

      <div className="mx-4 mt-4">
        <SectionLabel>{t.integrations.statusMapping}</SectionLabel>
        <Card className="overflow-hidden">
          {grouped.map((group, index) => (
            <div
              key={group.internal}
              className={`px-4 py-3 ${index === grouped.length - 1 ? '' : 'tn-hairline'}`}
            >
              <TaskStatusPill status={group.internal} />
              <div className="mt-2 flex flex-wrap gap-1.5">
                {group.labels.map((label) => (
                  <span
                    key={label}
                    className="rounded-md px-2 py-0.5 text-[13px] text-[var(--sec)]"
                    style={{ background: 'var(--chip-bg)' }}
                  >
                    {label}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </Card>
        <p className="px-5 pt-2 text-[13px] leading-snug text-[var(--ter)]">
          {t.integrations.statusMappingHint}
        </p>
      </div>

      <EditSheet
        open={editing}
        title={t.integrations.mapping}
        onCancel={() => setEditing(false)}
        onSave={() => {
          setMapping(draft);
          setEditing(false);
        }}
      >
        <FieldGroup header="Tareas Software" footer={t.integrations.mappingHint}>
          <SelectField
            label={t.integrations.fieldStatus}
            value={draft.status}
            options={NOTION_PROPERTIES.tasks.map((p) => ({ value: p, label: p }))}
            onChange={(status) => setDraft({ ...draft, status })}
          />
          <SelectField
            label={t.integrations.fieldAssignee}
            value={draft.assignee}
            options={NOTION_PROPERTIES.tasks.map((p) => ({ value: p, label: p }))}
            onChange={(assignee) => setDraft({ ...draft, assignee })}
          />
          <SelectField
            label={t.integrations.fieldDueDate}
            value={draft.dueDate}
            options={NOTION_PROPERTIES.tasks.map((p) => ({ value: p, label: p }))}
            onChange={(dueDate) => setDraft({ ...draft, dueDate })}
          />
          <SelectField
            label={t.integrations.fieldProject}
            value={draft.project}
            options={NOTION_PROPERTIES.tasks.map((p) => ({ value: p, label: p }))}
            onChange={(project) => setDraft({ ...draft, project })}
            isLast
          />
        </FieldGroup>
      </EditSheet>
    </Screen>
  );
}
