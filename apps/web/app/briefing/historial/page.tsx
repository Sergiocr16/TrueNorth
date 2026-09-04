'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import type { DailyPlan } from '@truenorth/core';
import { DetailHeader, ROUTES, Screen } from '../../../components/shell';
import { Card, EmptyState, SectionLabel } from '../../../components/ui';
import { BriefingIcon, Chevron, ChevronLeft } from '../../../components/icons';
import { formatShortDate } from '../../../lib/i18n/dictionary';
import { usePreferences } from '../../../lib/preferences';
import { useRiskCount, useStore } from '../../../lib/store';

const toDate = (iso: string) => new Date(`${iso}T00:00:00`);
const toIso = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}`;

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
  const { planHistory, analyses, today } = store;

  const [monthOffset, setMonthOffset] = useState(0);

  const cursor = useMemo(() => {
    const base = new Date(today);
    base.setDate(1);
    base.setMonth(base.getMonth() + monthOffset);
    return base;
  }, [today, monthOffset]);

  const byDate = useMemo(() => {
    const map = new Map<string, DailyPlan>();
    for (const plan of planHistory) map.set(plan.date, plan);
    return map;
  }, [planHistory]);

  const analysisDates = useMemo(
    () => new Set(analyses.map((a) => a.date)),
    [analyses],
  );

  const cells = useMemo(() => buildMonth(cursor), [cursor]);

  const es = locale === 'es';
  const monthLabel = new Intl.DateTimeFormat(es ? 'es-CR' : 'en-US', {
    month: 'long',
    year: 'numeric',
  }).format(cursor);

  // Weekday initials starting on Monday, which is how a work week reads.
  const weekdays = useMemo(() => {
    const format = new Intl.DateTimeFormat(es ? 'es-CR' : 'en-US', { weekday: 'narrow' });
    return Array.from({ length: 7 }, (_, index) => {
      const day = new Date(2026, 0, 5 + index); // 5 Jan 2026 is a Monday.
      return format.format(day);
    });
  }, [es]);

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
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => setMonthOffset((n) => n - 1)}
                aria-label={es ? 'Mes anterior' : 'Previous month'}
                className="tn-press flex h-9 w-9 items-center justify-center rounded-full text-[var(--sec)]"
              >
                <ChevronLeft size={14} />
              </button>
              <span className="text-[17px] font-semibold capitalize text-[var(--ink)]">
                {monthLabel}
              </span>
              <button
                type="button"
                onClick={() => setMonthOffset((n) => Math.min(0, n + 1))}
                disabled={monthOffset >= 0}
                aria-label={es ? 'Mes siguiente' : 'Next month'}
                className="tn-press flex h-9 w-9 items-center justify-center rounded-full text-[var(--sec)] disabled:opacity-30"
              >
                <span className="rotate-180">
                  <ChevronLeft size={14} />
                </span>
              </button>
            </div>

            <div className="mt-3 grid grid-cols-7 gap-1">
              {weekdays.map((label, index) => (
                <div
                  key={index}
                  className="pb-1 text-center text-[11px] font-semibold uppercase text-[var(--ter)]"
                >
                  {label}
                </div>
              ))}

              {cells.map((cell, index) => {
                if (!cell) return <div key={`blank-${index}`} />;
                const iso = toIso(cell);
                const plan = byDate.get(iso);
                const isToday = iso === toIso(today);
                const total = plan?.items.length ?? 0;
                const completed = plan ? done(plan) : 0;
                const ratio = total > 0 ? completed / total : 0;

                const body = (
                  <>
                    <span
                      className="tn-tabular text-[13px]"
                      style={{
                        fontWeight: isToday ? 700 : 500,
                        color: plan ? 'var(--ink)' : 'var(--ter)',
                      }}
                    >
                      {cell.getDate()}
                    </span>
                    {plan ? (
                      // A dot per item, filled for the ones marked done: the
                      // shape carries the information, not just a colour.
                      <span className="mt-1 flex gap-[3px]" aria-hidden>
                        {plan.items.map((_, itemIndex) => (
                          <span
                            key={itemIndex}
                            className="h-[5px] w-[5px] rounded-full"
                            style={{
                              background:
                                plan.feedback?.[itemIndex] === 'done'
                                  ? 'var(--green)'
                                  : 'var(--chip-bg)',
                              outline:
                                plan.feedback?.[itemIndex] === 'done'
                                  ? 'none'
                                  : '1px solid var(--hair)',
                            }}
                          />
                        ))}
                      </span>
                    ) : null}
                  </>
                );

                const className =
                  'flex aspect-square flex-col items-center justify-center rounded-xl';
                const style = {
                  background: plan
                    ? ratio === 1
                      ? 'var(--green-bg)'
                      : 'var(--surface)'
                    : 'transparent',
                  border: isToday ? '1.5px solid var(--accent)' : '1px solid var(--hair)',
                };

                return plan ? (
                  <Link
                    key={iso}
                    href={`${ROUTES.briefing}/${iso}`}
                    aria-label={`${formatShortDate(iso, locale)} · ${completed}/${total}`}
                    className={`${className} tn-press`}
                    style={style}
                  >
                    {body}
                  </Link>
                ) : (
                  <div key={iso} className={className} style={{ ...style, opacity: 0.5 }}>
                    {body}
                  </div>
                );
              })}
            </div>

            <p className="mt-3 text-[12px] leading-snug text-[var(--faint)]">
              {t.briefing.calendarLegend}
            </p>
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

/** Month grid padded so the first day lands on the right weekday, Monday-first. */
function buildMonth(cursor: Date): (Date | null)[] {
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const first = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  // getDay() is Sunday-first; shift so Monday is column zero.
  const lead = (first.getDay() + 6) % 7;

  const cells: (Date | null)[] = Array.from({ length: lead }, () => null);
  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push(new Date(year, month, day));
  }
  return cells;
}
