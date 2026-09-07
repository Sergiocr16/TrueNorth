'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import type { Indicator, Objective } from '@truenorth/core';
import {
  expectedObjectivePath,
  expectedObjectivePct,
  indicatorProgressPct,
  indicatorTargetDate,
  isOverdue,
  objectiveGap,
} from '@truenorth/core';
import { LineChart, WorkloadBars, type Series } from '../../components/charts';
import { LargeTitle, ROUTES, Screen } from '../../components/shell';
import { Card, ChipButton, EmptyState, SectionLabel } from '../../components/ui';
import { Chevron, ReportIcon } from '../../components/icons';
import { formatShortDate } from '../../lib/i18n/dictionary';
import { usePreferences } from '../../lib/preferences';
import { useRiskCount, useStore } from '../../lib/store';

const DAY = 86_400_000;
const toTime = (iso: string) => new Date(`${iso}T00:00:00`).getTime();

/**
 * Reports: the trends behind the numbers the rest of the app shows as a single
 * value. Three questions, three charts, in the order they matter:
 *
 *   1. Is this objective on the line it needs to be on?
 *   2. Is each of its indicators actually moving towards its target?
 *   3. Who is carrying the work, and how much of it is late?
 */
export default function ReportsPage() {
  const { t, locale } = usePreferences();
  const store = useStore();
  const riskCount = useRiskCount();

  const { activeObjectives: objectives, tasks, users, today } = store;
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Default to the objective furthest behind: the one worth looking at.
  const objective: Objective | undefined = useMemo(() => {
    if (objectives.length === 0) return undefined;
    const chosen = objectives.find((o) => o.id === selectedId);
    if (chosen) return chosen;
    return [...objectives].sort((a, b) => objectiveGap(b, today) - objectiveGap(a, today))[0];
  }, [objectives, selectedId, today]);

  const workload = useMemo(() => {
    const rows = users.map((user) => {
      const own = tasks.filter((task) => task.assigneeUserIds.includes(user.id) && task.status !== 'done');
      return {
        name: user.displayName.split(' ')[0] ?? user.displayName,
        open: own.length,
        overdue: own.filter((task) => isOverdue(task, today)).length,
      };
    });
    return rows.filter((row) => row.open > 0).sort((a, b) => b.open - a.open);
  }, [users, tasks, today]);

  const scale = Math.max(4, ...workload.map((row) => row.open));

  return (
    <Screen riskCount={riskCount} wide>
      <LargeTitle
        title={t.nav.reports}
        subtitle={
          locale === 'es'
            ? 'Tendencias hacia la meta'
            : 'Trends towards the goal'
        }
      />

      {objectives.length === 0 ? (
        <Card className="mx-4 mt-4">
          <EmptyState
            icon={<ReportIcon size={34} />}
            title={t.nav.reports}
            body={
              locale === 'es'
                ? 'Creá un objetivo con indicadores y acá vas a ver cómo avanza contra lo esperado.'
                : 'Create an objective with indicators and this will show how it moves against plan.'
            }
          />
        </Card>
      ) : (
        <div className="mx-4 mt-3 lg:grid lg:grid-cols-2 lg:gap-4">
          {objectives.length > 1 ? (
            // Chips that wrap, before the chart: six objectives with long
            // names do not fit a segmented control on a phone.
            <div className="mb-3 flex flex-wrap gap-2 lg:col-span-2 lg:mb-0">
              {objectives.map((o) => (
                <ChipButton key={o.id} selected={o.id === objective?.id} onClick={() => setSelectedId(o.id)}>
                  {o.title}
                </ChipButton>
              ))}
            </div>
          ) : null}
          {objective ? <GapCard objective={objective} /> : null}

          {objective && objective.indicators.length === 0 ? (
            <Card className="mt-3 p-4 text-[15px] leading-snug text-[var(--sec)] lg:mt-0">
              {t.reports.noIndicators}
            </Card>
          ) : null}
          {objective?.indicators.map((indicator) => (
            <div key={indicator.id} className="mt-3 lg:mt-0">
              <IndicatorCard indicator={indicator} objective={objective} />
            </div>
          ))}

          <div className="mt-3 lg:col-span-2">
            <SectionLabel>{t.reports.workload}</SectionLabel>
            <Card className="p-4">
              {workload.length === 0 ? (
                <p className="text-[15px] text-[var(--ter)]">{t.risks.none}</p>
              ) : (
                <>
                  <WorkloadBars
                    rows={workload}
                    scale={scale}
                    overdueLabel={locale === 'es' ? 'venc.' : 'late'}
                  />
                  <p className="mt-2.5 text-[12px] text-[var(--faint)]">
                    {t.reports.workloadCaption(scale)}
                  </p>
                </>
              )}
            </Card>
          </div>

          <div className="mt-3 lg:col-span-2">
            <Link href={`${ROUTES.reports}/weekly`}>
              <Card className="tn-press flex items-center gap-3 p-4">
                <span className="min-w-0 flex-1">
                  <span className="block text-[17px] font-semibold text-[var(--ink)]">
                    {t.reports.weekly}
                  </span>
                  <span className="block text-[15px] text-[var(--sec)]">
                    {t.reports.weeklyHint}
                  </span>
                </span>
                <span className="text-[var(--ter)]">
                  <Chevron />
                </span>
              </Card>
            </Link>
          </div>
        </div>
      )}
    </Screen>
  );
}

/** Actual progress against the line the objective needs to be on. */
function GapCard({ objective }: { objective: Objective }) {
  const { t, locale } = usePreferences();
  const { today } = useStore();

  const start = toTime(objective.startDate);
  const end = toTime(objective.targetDate);
  const now = today.getTime();

  const history = objective.history ?? [];
  const actual: Series = {
    label: t.objectives.actual,
    color: 'var(--amber)',
    endpoint: true,
    points:
      history.length > 0
        ? [...history]
            .sort((a, b) => toTime(a.date) - toTime(b.date))
            .map((r) => ({ x: toTime(r.date), y: r.value }))
        : // With no history yet there is one honest point: today.
          [{ x: now, y: objective.progressPct }],
  };

  // The expected line is computed, not recorded: linear from the start date,
  // with a bend wherever an indicator comes due.
  const path = expectedObjectivePath(objective).map((p) => ({ x: toTime(p.date), y: p.pct }));
  const expected: Series = {
    label: t.objectives.expected,
    color: 'var(--slate)',
    dashed: true,
    points: path,
  };
  const last = Math.max(end, path[path.length - 1]?.x ?? end);

  const expectedNow = expectedObjectivePct(objective, today);
  const gap = objectiveGap(objective, today);

  return (
    <Card className="p-4">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[12px] font-bold uppercase tracking-[0.8px] text-[var(--ter)]">
          {t.reports.gapByObjective}
        </span>
        <span className="min-w-0 truncate text-[13px] font-semibold text-[var(--accent)]">
          {objective.title}
        </span>
      </div>

      <div className="mt-2">
        <LineChart
          title={`${t.reports.gapByObjective} · ${objective.title}`}
          series={[expected, actual]}
          xDomain={[start, Math.max(last, now)]}
          yDomain={[0, 100]}
          xTicks={monthTicks(start, Math.max(last, now), locale)}
          gapAt={
            gap > 0
              ? {
                  x: now,
                  from: expectedNow,
                  to: objective.progressPct,
                  label: t.objectives.gap(gap),
                  color: 'var(--red)',
                }
              : undefined
          }
          caption={
            <span className="tn-tabular">
              {t.objectives.actual} {objective.progressPct} % ·{' '}
              {t.objectives.expected} {expectedNow} %
            </span>
          }
        />
      </div>

      {history.length === 0 ? (
        <p className="mt-1 text-[12px] leading-snug text-[var(--faint)]">
          {t.reports.noHistory}
        </p>
      ) : null}
    </Card>
  );
}

/** One indicator moving towards its target, by its own date. */
function IndicatorCard({ indicator, objective }: { indicator: Indicator; objective: Objective }) {
  const { t, locale } = usePreferences();
  const { today } = useStore();
  const due = indicatorTargetDate(indicator, objective);

  const history = indicator.history ?? [];
  const points =
    history.length > 1
      ? [...history]
          .sort((a, b) => toTime(a.date) - toTime(b.date))
          .map((r) => ({ x: toTime(r.date), y: r.value }))
      : // Without readings, baseline and current are still two honest points.
        [
          { x: today.getTime() - 30 * DAY, y: indicator.baseline },
          { x: today.getTime(), y: indicator.current },
        ];

  const values = [...points.map((p) => p.y), indicator.target, indicator.baseline];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const padding = Math.max(1, (max - min) * 0.15);

  return (
    <Card className="p-4">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[12px] font-bold uppercase tracking-[0.8px] text-[var(--ter)]">
          {t.reports.indicatorVsTarget}
        </span>
        <span className="min-w-0 truncate text-[13px] font-semibold text-[var(--accent)]">
          {indicator.name}
        </span>
      </div>

      <div className="mt-2">
        <LineChart
          title={`${indicator.name} · ${t.objectives.target} ${indicator.target}`}
          height={112}
          series={[
            {
              label: indicator.name,
              color: 'var(--accent)',
              endpoint: true,
              endpointLabel: `${indicator.current}`,
              points,
            },
          ]}
          xDomain={[points[0]!.x, points[points.length - 1]!.x]}
          yDomain={[min - padding, max + padding]}
          reference={{
            at: indicator.target,
            label: `${t.objectives.target} ${indicator.target} ${indicator.unit} · ${formatShortDate(due, locale)}`,
            color: 'var(--green)',
          }}
          caption={
            <span className="tn-tabular">
              {t.objectives.baseline} {indicator.baseline} · {t.objectives.current}{' '}
              {indicator.current} {indicator.unit} · {indicatorProgressPct(indicator)} %
            </span>
          }
        />
      </div>

      {history.length < 2 ? (
        <p className="mt-1 text-[12px] leading-snug text-[var(--faint)]">
          {t.reports.noHistory}
        </p>
      ) : null}
    </Card>
  );
}

/** Month boundaries inside the domain, so ticks name real dates. */
function monthTicks(from: number, to: number, locale: 'es' | 'en') {
  const ticks: { at: number; label: string }[] = [];
  const cursor = new Date(from);
  cursor.setDate(1);
  const format = new Intl.DateTimeFormat(locale === 'es' ? 'es-CR' : 'en-US', { month: 'short' });

  while (cursor.getTime() <= to) {
    if (cursor.getTime() >= from) {
      ticks.push({ at: cursor.getTime(), label: format.format(cursor).replace('.', '') });
    }
    cursor.setMonth(cursor.getMonth() + 1);
  }
  // Four labels is the most that fits without collisions at this width.
  if (ticks.length > 4) {
    const step = Math.ceil(ticks.length / 4);
    return ticks.filter((_, index) => index % step === 0);
  }
  return ticks;
}
