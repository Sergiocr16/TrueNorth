'use client';

import Link from 'next/link';
import type { DailyPlan } from '@truenorth/core';
import { DetailHeader, ROUTES, Screen } from '../../../components/shell';
import { Card, EmptyState, SectionLabel } from '../../../components/ui';
import { BriefingIcon, Chevron } from '../../../components/icons';
import { PlanCalendar } from '../../../components/plan-calendar';
import { formatShortDate } from '../../../lib/i18n/dictionary';
import { usePreferences } from '../../../lib/preferences';
import { useRiskCount, useStore } from '../../../lib/store';

/**
 * The record of past days.
 *
 * A month grid where each day carries how much of that day's plan actually got
 * done, so the question "how have the last few weeks gone" has an answer you
 * can see rather than remember. Days with no plan are simply blank: the
 * calendar never invents a day that did not happen.
 */
export default function BriefingHistoryPage() {
  const { t, locale } = usePreferences();
  const store = useStore();
  const riskCount = useRiskCount();
  const { planHistory, analyses } = store;
  const analysisDates = new Set(analyses.map((a) => a.date));

  const done = (plan: DailyPlan) =>
    Object.values(plan.feedback ?? {}).filter((verdict) => verdict === 'done').length;

  return (
    <Screen riskCount={riskCount}>
      <DetailHeader title={t.briefing.title} backHref={ROUTES.briefing} />

      <div className="mx-4 mt-2">
        <h1 className="text-[28px] font-bold leading-tight tracking-[-0.2px] text-[var(--ink)]">
          {t.briefing.history}
        </h1>
        <p className="mt-0.5 text-[15px] text-[var(--sec)]">{t.briefing.historyHint}</p>
      </div>

      {planHistory.length === 0 ? (
        <Card className="mx-4 mt-4">
          <EmptyState
            icon={<BriefingIcon size={34} />}
            title={t.briefing.history}
            body={t.briefing.historyEmpty}
          />
        </Card>
      ) : (
        <>
          <Card className="mx-4 mt-4 p-4">
            <PlanCalendar />
          </Card>

          <div className="mx-4 mt-4">
            <SectionLabel>{t.briefing.recentDays}</SectionLabel>
            <Card className="overflow-hidden">
              {planHistory.slice(0, 14).map((plan, index) => {
                const total = plan.items.length;
                const completed = done(plan);
                return (
                  <Link
                    key={plan.date}
                    href={`${ROUTES.briefing}/${plan.date}`}
                    className={`tn-press flex items-start gap-3 px-4 py-3 ${
                      index === Math.min(planHistory.length, 14) - 1 ? '' : 'tn-hairline'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="tn-tabular text-[13px] font-semibold uppercase tracking-[0.4px] text-[var(--ter)]">
                        {formatShortDate(plan.date, locale)}
                        {analysisDates.has(plan.date) ? ` · ${t.briefing.hasBriefing}` : ''}
                      </div>
                      <div className="mt-0.5 text-[15px] leading-snug text-[var(--ink)]">
                        {plan.headline}
                      </div>
                    </div>
                    <span
                      className="tn-tabular mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[12px] font-semibold"
                      style={{
                        background: completed === total ? 'var(--green-bg)' : 'var(--chip-bg)',
                        color: completed === total ? 'var(--green)' : 'var(--sec)',
                      }}
                    >
                      {completed}/{total}
                    </span>
                    <span className="mt-1 text-[var(--ter)]">
                      <Chevron />
                    </span>
                  </Link>
                );
              })}
            </Card>
          </div>
        </>
      )}
    </Screen>
  );
}
