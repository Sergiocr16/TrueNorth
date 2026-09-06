'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { Objective } from '@truenorth/core';
import { expectedObjectivePct, objectiveGap, shareHealthy } from '@truenorth/core';
import { LargeTitle, ROUTES, Screen } from '../../components/shell';
import { Card, EmptyState, ProgressBar, SectionLabel, StatusPill } from '../../components/ui';
import { AddRow } from '../../components/form';
import { ObjectiveIcon } from '../../components/icons';
import { HealthCompass } from '../../components/day-compass';
import { formatShortDate } from '../../lib/i18n/dictionary';
import { usePreferences } from '../../lib/preferences';
import { makeObjective, useRiskCount, useStore } from '../../lib/store';
import { ObjectiveEditor } from './editor';

export default function ObjectivesPage() {
  const { t, locale } = usePreferences();
  const store = useStore();
  const riskCount = useRiskCount();
  const [draft, setDraft] = useState<Objective | null>(null);

  const { objectives, users, today, company, currentUser } = store;

  return (
    <Screen riskCount={riskCount}>
      <LargeTitle
        title={t.objectives.title}
        trailing={<HealthCompass ratio={shareHealthy(objectives)} label={t.common.health} />}
      />

      <div className="mx-4 mt-3">
        {objectives.length === 0 ? (
          <Card>
            <EmptyState
              icon={<ObjectiveIcon size={34} />}
              title={t.objectives.title}
              body={t.today.emptyBody}
            />
          </Card>
        ) : (
          <SectionLabel>{t.company.overall}</SectionLabel>
        )}

        <div className="flex flex-col gap-2.5">
          {objectives.map((objective) => {
            const expected = expectedObjectivePct(objective, today);
            const gap = objectiveGap(objective, today);
            const owner = users.find((u) => u.id === objective.ownerUserId);
            return (
              <Link key={objective.id} href={`${ROUTES.objectives}/${objective.id}`}>
                <Card className="tn-press p-4">
                  <div className="flex items-start justify-between gap-3">
                    <h2 className="min-w-0 flex-1 text-[17px] font-semibold leading-snug text-[var(--ink)]">
                      {objective.title}
                    </h2>
                    <StatusPill status={objective.status} size="sm" />
                  </div>

                  <div className="mt-3">
                    <ProgressBar
                      value={objective.progressPct}
                      expected={expected}
                      status={objective.status}
                    />
                    <div className="mt-1.5 flex flex-wrap items-baseline gap-x-3 text-[13px] text-[var(--sec)]">
                      <span className="tn-tabular">
                        {t.objectives.actual} {objective.progressPct} %
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
                  </div>

                  <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-[var(--ter)]">
                    <span>
                      {t.objectives.owner}: {owner?.displayName ?? '—'}
                    </span>
                    <span className="tn-tabular">
                      {formatShortDate(objective.targetDate, locale)}
                    </span>
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>

        <Card className="mt-2.5 overflow-hidden">
          <AddRow
            label={locale === 'es' ? 'Agregar objetivo' : 'Add objective'}
            onClick={() => setDraft(makeObjective(company.id, currentUser.id))}
          />
        </Card>
      </div>

      {draft ? (
        <ObjectiveEditor
          objective={draft}
          isNew
          onCancel={() => setDraft(null)}
          onSave={(objective) => {
            store.upsertObjective(objective);
            setDraft(null);
          }}
        />
      ) : null}
    </Screen>
  );
}
