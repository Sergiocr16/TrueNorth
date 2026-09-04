'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { Risk, Signal } from '@truenorth/core';
import { LargeTitle, ROUTES, Screen } from '../../components/shell';
import { Card, SectionLabel, TextButton } from '../../components/ui';
import {
  AddRow,
  DestructiveRow,
  EditSheet,
  FieldGroup,
  SelectField,
  TextAreaField,
  useConfirm,
} from '../../components/form';
import { Chevron } from '../../components/icons';
import { usePreferences } from '../../lib/preferences';
import { makeRisk, useRiskCount, useStore } from '../../lib/store';

/**
 * Risks is the inverse of Today: instead of what to do, it shows what the
 * signal engine found wrong, grouped by kind, each row linking to its source.
 */
export default function RisksPage() {
  const { t, locale } = usePreferences();
  const store = useStore();
  const riskCount = useRiskCount();
  const [editing, setEditing] = useState<Risk | null>(null);
  const [isNew, setIsNew] = useState(false);

  const { signals, risks } = store;

  const groups: { title: string; items: Signal[] }[] = [
    {
      title: t.risks.overdue,
      items: signals.filter((s) => s.kind === 'overdue_task' || s.kind === 'due_today'),
    },
    { title: t.risks.blocked, items: signals.filter((s) => s.kind === 'blocked_task') },
    { title: t.risks.orphans, items: signals.filter((s) => s.kind === 'orphan_project') },
    {
      title: t.risks.emptyObjectives,
      items: signals.filter((s) => s.kind === 'empty_objective'),
    },
  ];

  const severityLabel = (severity: Risk['severity']) =>
    locale === 'es'
      ? { low: 'Baja', medium: 'Media', high: 'Alta' }[severity]
      : { low: 'Low', medium: 'Medium', high: 'High' }[severity];

  return (
    <Screen riskCount={riskCount}>
      <LargeTitle title={t.risks.title} subtitle={store.company.name} />

      {groups.map((group) => (
        <div key={group.title} className="mx-4 mt-4">
          <SectionLabel>
            {group.title}
            {group.items.length > 0 ? ` · ${group.items.length}` : ''}
          </SectionLabel>
          <Card className="overflow-hidden">
            {group.items.length === 0 ? (
              <p className="px-4 py-3.5 text-[15px] text-[var(--ter)]">{t.risks.none}</p>
            ) : (
              group.items.map((signal, index) => {
                const href = signal.projectId
                  ? `${ROUTES.projects}/${signal.projectId}`
                  : signal.objectiveId
                    ? `${ROUTES.objectives}/${signal.objectiveId}`
                    : null;
                const body = (
                  <>
                    <div className="min-w-0 flex-1">
                      <div className="text-[17px] leading-snug text-[var(--ink)]">
                        {signal.summary[locale]}
                      </div>
                      <div className="mt-0.5 text-[13px] text-[var(--ter)]">
                        {t.today.signal}: {signal.kind}
                      </div>
                    </div>
                    <span
                      className="mt-1 h-2 w-2 shrink-0 rounded-full"
                      style={{
                        background:
                          signal.severity === 'critical' ? 'var(--red)' : 'var(--amber)',
                      }}
                      aria-hidden
                    />
                    {href ? (
                      <span className="mt-1 text-[var(--ter)]">
                        <Chevron />
                      </span>
                    ) : null}
                  </>
                );
                const className = `flex items-start gap-3 px-4 py-3 ${
                  index === group.items.length - 1 ? '' : 'tn-hairline'
                }`;
                return href ? (
                  <Link key={signal.id} href={href} className={`${className} tn-press`}>
                    {body}
                  </Link>
                ) : (
                  <div key={signal.id} className={className}>
                    {body}
                  </div>
                );
              })
            )}
          </Card>
        </div>
      ))}

      <div className="mx-4 mt-4">
        <SectionLabel>{t.risks.decisions}</SectionLabel>
        <Card className="overflow-hidden">
          {risks.map((risk, index) => {
            const owner = store.users.find((u) => u.id === risk.ownerUserId);
            return (
              <button
                key={risk.id}
                type="button"
                onClick={() => {
                  setIsNew(false);
                  setEditing(risk);
                }}
                className={`tn-press flex w-full items-start gap-3 px-4 py-3 text-left ${
                  index === risks.length - 1 ? '' : 'tn-hairline'
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="text-[17px] leading-snug text-[var(--ink)]">
                    {risk.description}
                  </div>
                  <div className="mt-0.5 text-[13px] text-[var(--ter)]">
                    {severityLabel(risk.severity)}
                    {owner ? ` · ${owner.displayName}` : ''}
                  </div>
                </div>
                <span className="mt-1 text-[var(--ter)]">
                  <Chevron />
                </span>
              </button>
            );
          })}
          <AddRow
            label={locale === 'es' ? 'Agregar riesgo' : 'Add risk'}
            onClick={() => {
              setIsNew(true);
              setEditing(makeRisk(store.company.id, store.currentUser.id));
            }}
          />
        </Card>
      </div>

      {editing ? (
        <RiskEditor
          risk={editing}
          isNew={isNew}
          onCancel={() => setEditing(null)}
          onSave={(risk) => {
            store.upsertRisk(risk);
            setEditing(null);
          }}
          onDelete={
            isNew
              ? undefined
              : () => {
                  store.deleteRisk(editing.id);
                  setEditing(null);
                }
          }
        />
      ) : null}
    </Screen>
  );
}

function RiskEditor({
  risk,
  isNew,
  onCancel,
  onSave,
  onDelete,
}: {
  risk: Risk;
  isNew: boolean;
  onCancel: () => void;
  onSave: (risk: Risk) => void;
  onDelete?: () => void;
}) {
  const { t, locale } = usePreferences();
  const store = useStore();
  const [draft, setDraft] = useState(risk);
  const [confirming, arm, disarm] = useConfirm();

  return (
    <EditSheet
      open
      title={isNew ? (locale === 'es' ? 'Nuevo riesgo' : 'New risk') : t.risks.title}
      onCancel={onCancel}
      onSave={() => onSave(draft)}
      canSave={draft.description.trim().length > 0}
    >
      <FieldGroup>
        <TextAreaField
          label={locale === 'es' ? 'Descripción' : 'Description'}
          value={draft.description}
          onChange={(description) => setDraft({ ...draft, description })}
          rows={3}
          isLast
        />
      </FieldGroup>

      <FieldGroup>
        <SelectField
          label={locale === 'es' ? 'Severidad' : 'Severity'}
          value={draft.severity}
          options={
            locale === 'es'
              ? [
                  { value: 'low', label: 'Baja' },
                  { value: 'medium', label: 'Media' },
                  { value: 'high', label: 'Alta' },
                ]
              : [
                  { value: 'low', label: 'Low' },
                  { value: 'medium', label: 'Medium' },
                  { value: 'high', label: 'High' },
                ]
          }
          onChange={(severity) => setDraft({ ...draft, severity })}
        />
        <SelectField
          label={t.objectives.owner}
          value={draft.ownerUserId ?? ''}
          options={[
            { value: '', label: t.projects.unassigned },
            ...store.users.map((user) => ({ value: user.id, label: user.displayName })),
          ]}
          onChange={(value) => setDraft({ ...draft, ownerUserId: value || null })}
        />
        <SelectField
          label={locale === 'es' ? 'Proyecto' : 'Project'}
          value={draft.projectId ?? ''}
          options={[
            { value: '', label: '—' },
            ...store.projects.map((project) => ({ value: project.id, label: project.name })),
          ]}
          onChange={(value) => setDraft({ ...draft, projectId: value || undefined })}
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
                    ? 'Eliminar riesgo'
                    : 'Delete risk'
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
