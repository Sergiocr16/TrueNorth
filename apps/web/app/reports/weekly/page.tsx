'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import type { Objective, Reading } from '@truenorth/core';
import { isOverdue, progressGap } from '@truenorth/core';
import { DeltaRow, LineChart } from '../../../components/charts';
import { DetailHeader, ROUTES, Screen } from '../../../components/shell';
import { Card, SectionLabel } from '../../../components/ui';
import { formatShortDate } from '../../../lib/i18n/dictionary';
import { usePreferences } from '../../../lib/preferences';
import { useRiskCount, useStore } from '../../../lib/store';

const DAY = 86_400_000;
const toTime = (iso: string) => new Date(`${iso}T00:00:00`).getTime();
const toIso = (time: number) => new Date(time).toISOString().slice(0, 10);

/**
 * The weekly report: what moved since last week, and whether it moved the way
 * it needed to. Every row is a real before-and-after, so a week with no
 * recorded readings says so instead of inventing a delta.
 */
export default function WeeklyReportPage() {
  const { t, locale } = usePreferences();
  const store = useStore();
  const riskCount = useRiskCount();
  const { objectives, tasks, today } = store;

  const weekAgo = today.getTime() - 7 * DAY;

  /** The last reading at or before a moment, so deltas compare like with like. */
  const readingAt = (history: Reading[] | undefined, at: number): number | null => {
    if (!history || history.length === 0) return null;
    const sorted = [...history].sort((a, b) => toTime(a.date) - toTime(b.date));
    let found: number | null = null;
    for (const entry of sorted) {
      if (toTime(entry.date) <= at) found = entry.value;
    }
    return found;
  };

  const changes = useMemo(() => {
    const rows: {
      label: string;
      from: string;
      to: string;
      delta: string;
      better: boolean;
    }[] = [];

    for (const objective of objectives) {
      const before = readingAt(objective.history, weekAgo);
      if (before === null || before === objective.progressPct) continue;
      const diff = objective.progressPct - before;
      rows.push({
        label: `${t.objectives.actual} · ${objective.title}`,
        from: `${before} %`,
        to: `${objective.progressPct} %`,
        delta: `${diff > 0 ? '▲ +' : '▼ '}${diff}`,
        // More progress is always the direction you wanted.
        better: diff > 0,
      });

      for (const indicator of objective.indicators) {
        const previous = readingAt(indicator.history, weekAgo);
        if (previous === null || previous === indicator.current) continue;
        const diff2 = indicator.current - previous;
        rows.push({
          label: indicator.name,
          from: `${previous}`,
          to: `${indicator.current}`,
          delta: `${diff2 > 0 ? '▲ +' : '▼ '}${diff2}`,
          // Whether down is good depends on the indicator, not on the sign.
          better: indicator.direction === 'down' ? diff2 < 0 : diff2 > 0,
        });
      }
    }
    return rows;
  }, [objectives, weekAgo, t]);

  const overdueNow = tasks.filter((task) => isOverdue(task, today)).length;

  // The objective furthest behind is the one the summary is about.
  const worst: Objective | undefined = useMemo(
    () => [...objectives].sort((a, b) => progressGap(b, today) - progressGap(a, today))[0],
    [objectives, today],
  );

  const trend = useMemo(() => {
    if (!worst?.history || worst.history.length < 2) return null;
    const from = today.getTime() - 42 * DAY;
    const points = [...worst.history]
      .sort((a, b) => toTime(a.date) - toTime(b.date))
      .filter((entry) => toTime(entry.date) >= from)
      .map((entry) => ({
        x: toTime(entry.date),
        // The gap is what this chart is about, not raw progress.
        y: Math.max(
          0,
          progressGap({ ...worst, progressPct: entry.value }, new Date(toTime(entry.date))),
        ),
      }));
    return points.length >= 2 ? points : null;
  }, [worst, today]);

  const es = locale === 'es';

  return (
    <Screen riskCount={riskCount}>
      <DetailHeader title={t.nav.reports} backHref={ROUTES.reports} />

      <div className="mx-4 mt-2">
        <h1 className="text-[28px] font-bold leading-tight tracking-[-0.2px] text-[var(--ink)]">
          {t.reports.weekly}
        </h1>
        <p className="tn-tabular mt-0.5 text-[13px] text-[var(--ter)]">
          {es ? 'semana del ' : 'week of '}
          {formatShortDate(toIso(weekAgo), locale)} {es ? 'al ' : 'to '}
          {formatShortDate(toIso(today.getTime()), locale)}
        </p>
      </div>

      <Card className="mx-4 mt-3.5 p-4">
        <div className="text-[12px] font-bold uppercase tracking-[0.8px] text-[var(--ter)]">
          {t.reports.summary}
        </div>
        <p className="mt-1.5 text-[17px] leading-snug text-[var(--ink)] text-pretty">
          {worst
            ? es
              ? `${worst.title} va ${progressGap(worst, today)} pts por detrás y es lo que más pesa esta semana. Hay ${overdueNow} ${overdueNow === 1 ? 'tarea vencida' : 'tareas vencidas'} en la empresa.`
              : `${worst.title} is ${progressGap(worst, today)} pts behind and carries the most weight this week. There ${overdueNow === 1 ? 'is' : 'are'} ${overdueNow} overdue ${overdueNow === 1 ? 'task' : 'tasks'} across the company.`
            : es
              ? 'Todavía no hay objetivos que resumir.'
              : 'No objectives to summarise yet.'}
        </p>
      </Card>

      <div className="mx-4 mt-4">
        <SectionLabel>{t.reports.changes}</SectionLabel>
        <Card className="overflow-hidden">
          {changes.length === 0 ? (
            <p className="px-4 py-3.5 text-[15px] leading-snug text-[var(--ter)]">
              {t.reports.noChanges}
            </p>
          ) : (
            changes.map((row, index) => (
              <DeltaRow
                key={`${row.label}-${index}`}
                label={row.label}
                from={row.from}
                to={row.to}
                delta={row.delta}
                better={row.better}
                isLast={index === changes.length - 1}
              />
            ))
          )}
        </Card>
      </div>

      {trend && worst ? (
        <Card className="mx-4 mt-4 p-4">
          <div className="text-[12px] font-bold uppercase tracking-[0.8px] text-[var(--ter)]">
            {t.reports.gapTrend}
          </div>
          <div className="mt-2">
            <LineChart
              title={`${t.reports.gapTrend} · ${worst.title}`}
              height={104}
              series={[
                {
                  label: t.reports.gapTrend,
                  color: 'var(--red)',
                  endpoint: true,
                  endpointLabel: `${progressGap(worst, today)} pts`,
                  points: trend,
                },
              ]}
              xDomain={[trend[0]!.x, trend[trend.length - 1]!.x]}
              yDomain={[0, Math.max(10, ...trend.map((p) => p.y)) * 1.25]}
              xTicks={[
                { at: trend[0]!.x, label: formatShortDate(toIso(trend[0]!.x), locale) },
                {
                  at: trend[trend.length - 1]!.x,
                  label: formatShortDate(toIso(trend[trend.length - 1]!.x), locale),
                },
              ]}
            />
          </div>
          <p className="mt-1 text-[12px] leading-snug text-[var(--faint)]">
            {es
              ? `Si la tendencia sigue, la fecha del ${formatShortDate(worst.targetDate, locale)} no se cumple.`
              : `If the trend holds, the ${formatShortDate(worst.targetDate, locale)} date is missed.`}
          </p>
        </Card>
      ) : null}

      <div className="mx-4 mt-4 mb-2">
        <Link
          href={ROUTES.briefing}
          className="tn-press flex min-h-11 items-center justify-center text-[15px] font-semibold text-[var(--accent)]"
        >
          {t.reports.seeBriefing}
        </Link>
      </div>
    </Screen>
  );
}
