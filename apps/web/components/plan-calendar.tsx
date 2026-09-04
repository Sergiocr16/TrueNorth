'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import type { DailyPlan } from '@truenorth/core';
import { ROUTES } from './shell';
import { ChevronLeft } from './icons';
import { CompassNeedle } from './day-compass';
import { formatShortDate } from '../lib/i18n/dictionary';
import { usePreferences } from '../lib/preferences';
import { useStore } from '../lib/store';

const toIso = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}`;

/**
 * A month of days, each carrying how much of that day's plan got done.
 *
 * Lives on its own so it can open from the Today header as a sheet and also
 * sit on the history page. Days with no plan are blank: the calendar never
 * invents a day that did not happen. Picking a day goes to that day's plan.
 */
export function PlanCalendar({ onPick }: { onPick?: () => void }) {
  const { t, locale } = usePreferences();
  const { planHistory, today } = useStore();
  const [monthOffset, setMonthOffset] = useState(0);
  const es = locale === 'es';

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

  const cells = useMemo(() => buildMonth(cursor), [cursor]);

  const monthLabel = new Intl.DateTimeFormat(es ? 'es-CR' : 'en-US', {
    month: 'long',
    year: 'numeric',
  }).format(cursor);

  // Weekday initials starting on Monday, which is how a work week reads.
  const weekdays = useMemo(() => {
    const format = new Intl.DateTimeFormat(es ? 'es-CR' : 'en-US', { weekday: 'narrow' });
    return Array.from({ length: 7 }, (_, index) => format.format(new Date(2026, 0, 5 + index)));
  }, [es]);

  const done = (plan: DailyPlan) =>
    Object.values(plan.feedback ?? {}).filter((verdict) => verdict === 'done').length;

  return (
    <div className="w-full">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setMonthOffset((n) => n - 1)}
          aria-label={es ? 'Mes anterior' : 'Previous month'}
          className="tn-press flex h-11 w-11 items-center justify-center rounded-full text-[var(--sec)]"
        >
          <ChevronLeft size={14} />
        </button>
        <span className="text-[17px] font-semibold capitalize text-[var(--ink)]">{monthLabel}</span>
        <button
          type="button"
          onClick={() => setMonthOffset((n) => Math.min(0, n + 1))}
          disabled={monthOffset >= 0}
          aria-label={es ? 'Mes siguiente' : 'Next month'}
          className="tn-press flex h-11 w-11 items-center justify-center rounded-full text-[var(--sec)] disabled:opacity-30"
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
                style={{ fontWeight: isToday ? 700 : 500, color: plan ? 'var(--ink)' : 'var(--ter)' }}
              >
                {cell.getDate()}
              </span>
              {plan ? (
                // The day's compass, as it was left: how far north the needle
                // got is how much of that day's plan got done.
                <span className="mt-0.5" aria-hidden>
                  <CompassNeedle done={completed} total={total} size={20} />
                </span>
              ) : null}
            </>
          );

          const className = 'flex aspect-square flex-col items-center justify-center rounded-xl';
          const style = {
            background: plan ? (ratio === 1 ? 'var(--green-bg)' : 'var(--surface)') : 'transparent',
            border: isToday ? '1.5px solid var(--accent)' : '1px solid var(--hair)',
          };

          return plan ? (
            <Link
              key={iso}
              href={`${ROUTES.briefing}/${iso}`}
              onClick={onPick}
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

      <p className="mt-3 text-[12px] leading-snug text-[var(--faint)]">{t.briefing.calendarLegend}</p>
    </div>
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
  for (let day = 1; day <= daysInMonth; day += 1) cells.push(new Date(year, month, day));
  return cells;
}
