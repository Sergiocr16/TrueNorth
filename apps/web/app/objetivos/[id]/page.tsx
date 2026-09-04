'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { expectedProgressPct, progressGap } from '@truenorth/core';
import { DetailHeader, ROUTES, Screen } from '../../../components/shell';
import {
  Card,
  ProgressBar,
  SectionLabel,
  StatusPill,
  TextButton,
} from '../../../components/ui';
import { Chevron } from '../../../components/icons';
import { formatShortDate } from '../../../lib/i18n/dictionary';
import { usePreferences } from '../../../lib/preferences';
import { useRiskCount, useStore } from '../../../lib/store';
import { ObjectiveEditor } from '../editor';

export default function ObjectiveDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { t, locale } = usePreferences();
  const store = useStore();
  const riskCount = useRiskCount();
  const [editing, setEditing] = useState(false);

  const objective = store.objectives.find((o) => o.id === params.id);

  if (!objective) {
    return (
      <Screen riskCount={riskCount}>
        <DetailHeader title={t.objectives.title} backHref={ROUTES.objectives} />
        <Card className="mx-4 mt-4 p-4 text-[15px] text-[var(--sec)]">
          {locale === 'es' ? 'Este objetivo ya no existe.' : 'This objective no longer exists.'}
        </Card>
      </Screen>
    );
  }

  const expected = expectedProgressPct(objective.startDate, objective.targetDate, store.today);
  const gap = progressGap(objective, store.today);
  const owner = store.users.find((u) => u.id === objective.ownerUserId);
  const linked = store.projects.filter((p) => p.objectiveIds.includes(objective.id));

  return (
    <Screen riskCount={riskCount}>
      <DetailHeader title={t.objectives.title} backHref={ROUTES.objectives} />

      <div className="mx-4 mt-2">
        <div className="flex items-start justify-between gap-3">
          <h1 className="min-w-0 flex-1 text-[28px] font-bold leading-tight tracking-[-0.2px] text-[var(--ink)] text-pretty">
            {objective.title}
          </h1>
          <div className="mt-1 shrink-0">
            <TextButton onClick={() => setEditing(true)}>{t.team.editRole}</TextButton>
          </div>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <StatusPill status={objective.status} />
          <span className="tn-tabular text-[13px] text-[var(--sec)]">
            {formatShortDate(objective.targetDate, locale)}
          </span>
          {owner ? (
            <span className="text-[13px] text-[var(--ter)]">
              {t.objectives.owner}: {owner.displayName}
            </span>
          ) : null}
        </div>
      </div>

      <Card className="mx-4 mt-3 p-4">
        <ProgressBar
          value={objective.progressPct}
          expected={expected}
          status={objective.status}
          height={10}
        />
        <div className="mt-2 flex flex-wrap items-baseline gap-x-4 text-[13px]">
          <span className="tn-tabular text-[var(--sec)]">
            {t.objectives.actual}{' '}
            <span className="font-semibold text-[var(--ink)]">{objective.progressPct} %</span>
          </span>
          <span className="tn-tabular text-[var(--ter)]">
            {t.objectives.expected} {expected} %
          </span>
          {gap > 0 ? (
            <span className="tn-tabular font-semibold text-[var(--amber)]">
              {t.objectives.gap(gap)}
            </span>
          ) : null}
        </div>
        {objective.expectedResult ? (
          <p className="mt-3 border-t border-[var(--hair)] pt-3 text-[15px] leading-snug text-[var(--sec)]">
            <span className="font-semibold text-[var(--ink)]">
              {t.objectives.expectedResult}:{' '}
            </span>
            {objective.expectedResult}
          </p>
        ) : null}
      </Card>

      {objective.indicators.length > 0 ? (
        <div className="mx-4 mt-4">
          <SectionLabel>{t.objectives.indicators}</SectionLabel>
          <Card className="overflow-hidden">
            {objective.indicators.map((indicator, index) => {
              const span = indicator.target - indicator.baseline;
              const moved = indicator.current - indicator.baseline;
              const pct = span === 0 ? 100 : Math.round((moved / span) * 100);
              return (
                <div
                  key={indicator.id}
                  className={`px-4 py-3 ${
                    index === objective.indicators.length - 1 ? '' : 'tn-hairline'
                  }`}
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-[17px] font-semibold text-[var(--ink)]">
                      {indicator.name}
                    </span>
                    <span className="tn-tabular text-[15px] text-[var(--sec)]">
                      {indicator.current} {indicator.unit}
                    </span>
                  </div>
                  <div className="mt-2">
                    <ProgressBar
                      value={Math.max(0, Math.min(100, pct))}
                      status={objective.status}
                      height={6}
                    />
                  </div>
                  <div className="tn-tabular mt-1.5 flex justify-between text-[12px] text-[var(--ter)]">
                    <span>
                      {t.objectives.baseline} {indicator.baseline}
                    </span>
                    <span>
                      {t.objectives.target} {indicator.target}
                    </span>
                  </div>
                </div>
              );
            })}
          </Card>
        </div>
      ) : null}

      <div className="mx-4 mt-4">
        <SectionLabel>{t.objectives.linkedProjects}</SectionLabel>
        <Card className="overflow-hidden">
          {linked.length === 0 ? (
            <p className="px-4 py-3.5 text-[15px] text-[var(--ter)]">
              {locale === 'es'
                ? 'Ningún proyecto sirve a este objetivo todavía.'
                : 'No project serves this objective yet.'}
            </p>
          ) : (
            linked.map((project, index) => (
              <Link
                key={project.id}
                href={`${ROUTES.projects}/${project.id}`}
                className="tn-press flex min-h-[52px] items-center gap-3 px-4 py-3"
                style={
                  index === linked.length - 1
                    ? undefined
                    : { borderBottom: '0.5px solid var(--hair)' }
                }
              >
                <div className="min-w-0 flex-1">
                  <div className="text-[17px] font-semibold text-[var(--ink)]">{project.name}</div>
                  <div className="tn-tabular mt-0.5 text-[13px] text-[var(--ter)]">
                    {project.progressPct} % · {formatShortDate(project.targetDate, locale)}
                  </div>
                </div>
                <StatusPill status={project.status} size="sm" />
                <span className="text-[var(--ter)]">
                  <Chevron />
                </span>
              </Link>
            ))
          )}
        </Card>
      </div>

      {editing ? (
        <ObjectiveEditor
          objective={objective}
          onCancel={() => setEditing(false)}
          onSave={(next) => {
            store.upsertObjective(next);
            setEditing(false);
          }}
          onDelete={() => {
            store.deleteObjective(objective.id);
            setEditing(false);
            router.push(ROUTES.objectives);
          }}
        />
      ) : null}
    </Screen>
  );
}
