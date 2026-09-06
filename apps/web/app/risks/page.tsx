'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { Risk, Signal } from '@truenorth/core';
import { notionUrl, shareUnflagged } from '@truenorth/core';
import { LargeTitle, ROUTES, Screen } from '../../components/shell';
import {
  Card,
  ChipButton,
  EmptyState,
  GlanceTile,
  SectionLabel,
  SourceBadge,
  TextButton,
} from '../../components/ui';
import {
  AddRow,
  DestructiveRow,
  EditSheet,
  FieldGroup,
  SelectField,
  TextAreaField,
  useConfirm,
} from '../../components/form';
import { Chevron, NotionMark, RiskIcon } from '../../components/icons';
import { HealthCompass } from '../../components/day-compass';
import { usePreferences } from '../../lib/preferences';
import { makeRisk, useRiskCount, useStore } from '../../lib/store';

type GroupKey = 'overdue' | 'blocked' | 'stale' | 'pulls' | 'people' | 'structure';

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

  const { signals, risks, users, projects, tasks, sources } = store;
  const [group, setGroup] = useState<GroupKey | 'all'>('all');
  const [showMinor, setShowMinor] = useState(false);

  // Every kind the engine can raise has a home here. Grouped by what a person
  // would do about it, not by where the code found it.
  const groups: { key: GroupKey; title: string; kinds: Signal['kind'][] }[] = [
    { key: 'overdue', title: t.risks.overdue, kinds: ['overdue_task', 'due_today', 'overdue_load'] },
    { key: 'blocked', title: t.risks.blocked, kinds: ['blocked_task'] },
    { key: 'stale', title: t.risks.stale, kinds: ['stale_task', 'comment_unanswered', 'stale_progress'] },
    {
      key: 'pulls',
      title: t.risks.pullRequests,
      kinds: ['pr_awaiting_review', 'pr_changes_requested', 'pr_approved_unmerged', 'pr_missing'],
    },
    { key: 'people', title: t.risks.people, kinds: ['silent_owner', 'no_followup', 'workload', 'plan_ignored', 'plan_slipping', 'no_owned_work'] },
    {
      key: 'structure',
      title: t.risks.structure,
      kinds: ['orphan_project', 'empty_objective', 'progress_gap', 'unassigned_task', 'undated_task'],
    },
  ];

  const rank = { critical: 0, warning: 1, info: 2 } as const;
  const bySeverity = (list: Signal[]) => [...list].sort((x, y) => rank[x.severity] - rank[y.severity]);

  const critical = signals.filter((s) => s.severity === 'critical').length;
  const warnings = signals.filter((s) => s.severity === 'warning').length;
  const minor = signals.filter((s) => s.severity === 'info').length;

  const visible = groups
    .filter((g) => group === 'all' || g.key === group)
    .map((g) => ({
      ...g,
      items: bySeverity(
        signals.filter((s) => g.kinds.includes(s.kind) && (showMinor || s.severity !== 'info')),
      ),
    }))
    .filter((g) => g.items.length > 0);

  const severityLabel = (severity: Risk['severity']) =>
    locale === 'es'
      ? { low: 'Baja', medium: 'Media', high: 'Alta' }[severity]
      : { low: 'Low', medium: 'Medium', high: 'High' }[severity];

  /** Where a signal points: the person, the task's project, or the objective. */
  const hrefFor = (signal: Signal) =>
    typeof signal.data?.url === 'string'
      ? signal.data.url
      : signal.projectId
      ? `${ROUTES.projects}/${signal.projectId}`
      : signal.objectiveId
        ? `${ROUTES.objectives}/${signal.objectiveId}`
        : signal.userId
          ? ROUTES.team
          : null;

  /**
   * The record a signal is about: its task, or the project when it names no
   * task. Both carry the Notion source and the page id, which is what lets a
   * row say which board it came from and open the thing itself.
   */
  const recordFor = (signal: Signal) =>
    tasks.find((candidate) => candidate.id === signal.taskId) ??
    projects.find((candidate) => candidate.id === signal.projectId);

  /** One short line of context under the summary, never the kind's code name. */
  const contextFor = (signal: Signal) => {
    const parts: string[] = [];
    // The summary already names the task ("Manejar diferencial cambiario
    // (TAR-368) lleva 211 días vencida"), so the line under it carries only
    // what the summary does not: the project, or the person.
    const task = tasks.find((candidate) => candidate.id === signal.taskId);
    const project = projects.find((candidate) => candidate.id === signal.projectId);
    if (project) parts.push(project.name);
    const person = users.find((candidate) => candidate.id === signal.userId);
    if (person && !task) parts.push(person.displayName);
    return parts.join(' · ');
  };

  return (
    <Screen riskCount={riskCount}>
      <LargeTitle
        title={t.risks.title}
        subtitle={store.company.name}
        trailing={<HealthCompass ratio={shareUnflagged(tasks, signals)} label={t.common.health} />}
      />

      <div className="mx-4 mt-3 grid grid-cols-3 gap-2.5">
        <GlanceTile value={critical} label={t.risks.glanceCritical} tone={critical > 0 ? 'red' : 'green'} />
        <GlanceTile value={warnings} label={t.risks.glanceWarnings} tone={warnings > 0 ? 'amber' : 'green'} />
        <GlanceTile value={risks.length} label={t.risks.glanceManual} tone="accent" />
      </div>

      <div className="mx-4 mt-3 flex flex-wrap gap-2">
        <ChipButton selected={group === 'all'} onClick={() => setGroup('all')}>
          {t.risks.all}
        </ChipButton>
        {groups.map((g) => {
          const n = signals.filter((s) => g.kinds.includes(s.kind) && s.severity !== 'info').length;
          if (n === 0) return null;
          return (
            <ChipButton key={g.key} selected={group === g.key} onClick={() => setGroup(g.key)}>
              {g.title} · {n}
            </ChipButton>
          );
        })}
      </div>

      {visible.length === 0 ? (
        <Card className="mx-4 mt-4">
          <EmptyState icon={<RiskIcon size={34} />} title={t.risks.title} body={t.risks.clear} />
        </Card>
      ) : null}

      {visible.map((g) => (
        <div key={g.key} className="mx-4 mt-4">
          <SectionLabel>
            {g.title} · {g.items.length}
          </SectionLabel>
          <Card className="overflow-hidden">
            {g.items.map((signal, index) => {
              const href = hrefFor(signal);
              const context = contextFor(signal);
              const record = recordFor(signal);
              const board = record?.sourceId
                ? sources.find((source) => source.id === record.sourceId)?.title
                : undefined;
              const notion = notionUrl(record?.notionPageId);
              const body = (
                <>
                  <span
                    className="mt-[7px] h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{
                      background:
                        signal.severity === 'critical'
                          ? 'var(--red)'
                          : signal.severity === 'warning'
                            ? 'var(--amber)'
                            : 'var(--compass-ring)',
                    }}
                    aria-hidden
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-[15px] leading-snug text-[var(--ink)]">
                      {signal.summary[locale]}
                    </div>
                    {context || board ? (
                      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-[var(--ter)]">
                        {context ? <span className="min-w-0">{context}</span> : null}
                        {board ? <SourceBadge source="notion" title={board} /> : null}
                      </div>
                    ) : null}
                  </div>
                </>
              );
              return (
                <div
                  key={signal.id}
                  className={`flex items-start gap-2 px-4 py-3 ${
                    index === g.items.length - 1 ? '' : 'tn-hairline'
                  }`}
                >
                  {href ? (
                    <Link href={href} className="tn-press flex min-w-0 flex-1 items-start gap-3">
                      {body}
                    </Link>
                  ) : (
                    <div className="flex min-w-0 flex-1 items-start gap-3">{body}</div>
                  )}

                  {/* Outside the row's link on purpose: a link inside a link is
                      invalid, and these two go to different places — the app's
                      screen for the record, and the record in Notion. */}
                  {notion ? (
                    <a
                      href={notion}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={t.task.openInNotion}
                      title={t.task.openInNotion}
                      className="tn-press -my-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-[var(--sec)]"
                    >
                      <NotionMark size={18} />
                    </a>
                  ) : null}

                  {href ? (
                    <span className="mt-1 shrink-0 text-[var(--ter)]">
                      <Chevron />
                    </span>
                  ) : null}
                </div>
              );
            })}
          </Card>
        </div>
      ))}

      {minor > 0 ? (
        <div className="mx-4 mt-3">
          <TextButton onClick={() => setShowMinor((was) => !was)}>
            {showMinor ? t.risks.hideMinor : t.risks.showMinor(minor)}
          </TextButton>
        </div>
      ) : null}

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
                <span
                  className="mt-[7px] h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{
                    background:
                      risk.severity === 'high'
                        ? 'var(--red)'
                        : risk.severity === 'medium'
                          ? 'var(--amber)'
                          : 'var(--compass-ring)',
                  }}
                  aria-hidden
                />
                <div className="min-w-0 flex-1">
                  <div className="text-[15px] leading-snug text-[var(--ink)]">
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
