'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import type { PlanItem, PlanItemVerdict, Task } from '@truenorth/core';
import { notionUrl, progressGap } from '@truenorth/core';
import { CompanySwitcher, LargeTitle, ROUTES, Screen } from '../../components/shell';
import {
  Banner,
  Card,
  ChipButton,
  EmptyState,
  PrimaryButton,
  SectionLabel,
  Sheet,
  Skeleton,
  StatusPill,
  TextButton,
} from '../../components/ui';
import { AskIcon, CalendarIcon, CheckIcon, Chevron, ClockIcon, OfflineIcon, SettingsIcon, WarningTriangle } from '../../components/icons';
import { PlanCalendar } from '../../components/plan-calendar';
import { DayCompass } from '../../components/day-compass';
import { formatShortDate } from '../../lib/i18n/dictionary';
import { usePreferences } from '../../lib/preferences';
import { useRiskCount, useStore } from '../../lib/store';

export default function TodayPage() {
  const { t, locale } = usePreferences();
  const store = useStore();
  const riskCount = useRiskCount();
  const [recalculating, setRecalculating] = useState(false);
  const [recalculateError, setRecalculateError] = useState<string | null>(null);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [whyOpen, setWhyOpen] = useState(false);
  const [offline, setOffline] = useState(false);

  const { plan, objectives, tasks, currentMembership, company, today } = store;

  // Only the messages still waiting on a decision; the ones already sent or
  // waved off should not keep asking for attention.
  const pendingFollowUps = (store.followUp?.messages ?? []).filter(
    (message) => !store.followUp?.outcome?.[message.id],
  ).length;

  useEffect(() => {
    const sync = () => setOffline(!navigator.onLine);
    sync();
    window.addEventListener('online', sync);
    window.addEventListener('offline', sync);
    return () => {
      window.removeEventListener('online', sync);
      window.removeEventListener('offline', sync);
    };
  }, []);

  const headlineObjective = useMemo(
    () => objectives.find((o) => o.id === plan.items[0]?.objectiveId),
    [objectives, plan.items],
  );

  const gap = headlineObjective ? progressGap(headlineObjective, today) : 0;

  /**
   * A real round trip: this same server runs Claude Code and writes the new
   * plan, and the live listener on the plan document repaints the screen when
   * it lands. Nothing is queued; the request simply waits.
   */
  const recalculate = () => {
    setRecalculating(true);
    setRecalculateError(null);
    store
      .replan()
      .then(() => store.markPlanStale(false))
      .catch((cause: unknown) =>
        setRecalculateError(cause instanceof Error ? cause.message : String(cause)),
      )
      .finally(() => setRecalculating(false));
  };

  const hasPlan = plan.items.length > 0;
  const doneCount = Object.values(plan.feedback ?? {}).filter((v) => v === 'done').length;

  return (
    <Screen riskCount={riskCount}>
      <LargeTitle
        title={t.nav.today}
        subtitle={`${formatShortDate(plan.date, locale)} · ${currentMembership.roleTitle} · ${company.name}`}
        trailing={
          <div className="flex items-center gap-2">
            {/* Settings live here now, not in the tab capsule: the capsule is
                for places you go every day. */}
            <Link
              href={ROUTES.settings}
              aria-label={t.nav.settings}
              title={t.nav.settings}
              className="tn-press flex h-11 w-11 items-center justify-center rounded-full border border-[var(--hair)] bg-[var(--surface)] text-[var(--sec)]"
            >
              <SettingsIcon size={20} />
            </Link>
            {/* The record of past days opens from here, next to the date it
                belongs to, rather than from the briefing. */}
            <button
              type="button"
              onClick={() => setCalendarOpen(true)}
              aria-label={t.today.calendar}
              title={t.today.calendar}
              className="tn-press flex h-11 w-11 items-center justify-center rounded-full border border-[var(--hair)] bg-[var(--surface)] text-[var(--accent)]"
            >
              <CalendarIcon />
            </button>
            <CompanySwitcher />
          </div>
        }
      />

      <Sheet open={calendarOpen} onClose={() => setCalendarOpen(false)} labelledBy="today-calendar">
        <h2 id="today-calendar" className="mt-3 self-start text-[22px] font-bold text-[var(--ink)]">
          {t.today.calendar}
        </h2>
        <div className="mt-3 w-full">
          <PlanCalendar onPick={() => setCalendarOpen(false)} />
        </div>
        <Link
          href={`${ROUTES.briefing}/history`}
          onClick={() => setCalendarOpen(false)}
          className="mt-4 self-start text-[15px] font-semibold text-[var(--accent)]"
        >
          {t.briefing.recentDays} →
        </Link>
      </Sheet>

      {offline ? (
        <div className="mt-3 px-4">
          <Banner tone="info" icon={<OfflineIcon />}>
            {t.today.offline}
          </Banner>
        </div>
      ) : null}

      {recalculateError ? (
        <div className="mt-3 px-4">
          <Banner tone="warning" icon={<WarningTriangle />}>
            <strong className="font-semibold">{t.today.recalculateFailed}</strong> {recalculateError}
          </Banner>
        </div>
      ) : null}

      {!hasPlan ? (
        <Card className="mx-4 mt-4">
          <EmptyState
            title={t.today.emptyTitle}
            body={t.today.emptyBody}
            action={
              <Link href={ROUTES.company}>
                <PrimaryButton>{t.today.emptyAction}</PrimaryButton>
              </Link>
            }
          />
        </Card>
      ) : recalculating ? (
        <RecalculatingState />
      ) : (
        <>
          {/* The day at a glance: the compass swings north as items get done,
              the headline says what today is about. The reasoning is one tap
              away instead of on the face of the card. */}
          <Card className="mx-4 mt-3 p-4">
            <div className="flex items-center gap-4">
              <DayCompass done={doneCount} total={plan.items.length} size={112} />
              <div className="min-w-0 flex-1">
                <div className="text-[12px] font-bold uppercase tracking-[0.8px] text-[var(--accent)]">
                  {doneCount >= plan.items.length ? t.today.allDone : t.today.priority}
                </div>
                {/* Body size, not display size: it shares the row with the
                    compass, and a headline is two lines of a sentence, not a
                    title. */}
                <h2 className="mt-1 text-[17px] font-semibold leading-snug tracking-[-0.1px] text-[var(--ink)] text-pretty">
                  {plan.headline}
                </h2>
                {headlineObjective ? (
                  // `flex` with `max-w-full`, not `inline-flex`: an inline box
                  // grows to its content, and a title longer than the card
                  // pushed the whole page sideways.
                  <Link
                    href={`${ROUTES.objectives}/${headlineObjective.id}`}
                    className="mt-2 flex max-w-full items-center gap-2 text-[13px] font-semibold text-[var(--sec)]"
                  >
                    <span className="shrink-0">
                      <StatusPill status={headlineObjective.status} size="sm" />
                    </span>
                    <span className="min-w-0 truncate">{headlineObjective.title}</span>
                  </Link>
                ) : null}
              </div>
            </div>

            <button
              type="button"
              onClick={() => setWhyOpen((open) => !open)}
              aria-expanded={whyOpen}
              className="tn-press mt-3 text-[15px] font-semibold text-[var(--accent)]"
            >
              {whyOpen ? t.today.hideWhy : t.today.showWhy}
            </button>
            {whyOpen ? (
              <div className="mt-2 flex flex-col gap-2 text-[15px] leading-snug text-[var(--sec)]">
                <p>{plan.why}</p>
                {headlineObjective && gap > 0 ? (
                  <p className="tn-tabular text-[13px] text-[var(--ter)]">
                    {headlineObjective.title}: {headlineObjective.progressPct}% · {gap} pts
                  </p>
                ) : null}
                <p>
                  <strong className="font-semibold text-[var(--warn)]">{t.today.ifNotToday}</strong>{' '}
                  {plan.consequenceIfNotDone}.
                </p>
              </div>
            ) : null}
          </Card>

          <div className="mx-4 mt-3">
            <SectionLabel
              action={<TextButton onClick={recalculate}>{t.today.recalculate}</TextButton>}
            >
              {t.today.planCount(plan.items.length)}
            </SectionLabel>

            <Card className="overflow-hidden">
              {plan.items.map((item, index) => (
                <PlanItemRow
                  key={`${item.title}-${index}`}
                  item={item}
                  index={index}
                  isLast={index === plan.items.length - 1}
                  verdict={plan.feedback[index]}
                  task={tasks.find((candidate) => candidate.id === item.taskId)}
                  onVerdict={(verdict) =>
                    store.setPlanFeedback(index, plan.feedback[index] === verdict ? null : verdict)
                  }
                />
              ))}
            </Card>
          </div>

          {/* The assistant is a destination, so it gets a row like any other
              card, not a call to action shouting over the plan. */}
          <div className="mx-4 mt-3">
            <Link href={ROUTES.ask}>
              <Card className="tn-press flex items-center gap-3.5 p-4">
                <span
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
                  style={{ background: 'var(--accent-bg)', color: 'var(--accent)' }}
                >
                  <AskIcon size={24} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[17px] font-semibold text-[var(--ink)]">{t.ask.cta}</span>
                  <span className="block text-[13px] leading-snug text-[var(--sec)]">{t.ask.ctaHint}</span>
                </span>
                <span className="text-[var(--ter)]">
                  <Chevron />
                </span>
              </Card>
            </Link>
          </div>

          {/* Today is this person's own plan. The team's follow-up lives on the
              team screen; all that belongs here is the count. */}
          {pendingFollowUps > 0 ? (
            <div className="mx-4 mt-3">
              <Link
                href={ROUTES.followUps}
                className="tn-press flex items-center justify-between rounded-2xl px-4 py-3 text-[15px] font-semibold"
                style={{ background: 'var(--accent-bg)', color: 'var(--accent)' }}
              >
                {t.team.followUpPending(pendingFollowUps)}
                <span aria-hidden>→</span>
              </Link>
            </div>
          ) : null}
        </>
      )}

    </Screen>
  );
}

function PlanItemRow({
  item,
  index,
  isLast,
  verdict,
  task,
  onVerdict,
}: {
  item: PlanItem;
  index: number;
  isLast: boolean;
  verdict?: PlanItemVerdict;
  task?: Task;
  onVerdict: (verdict: PlanItemVerdict) => void;
}) {
  const { t, locale } = usePreferences();
  const { signals } = useStore();
  const [open, setOpen] = useState(false);

  // Every item cites at least one signal. It is still shown — that is what
  // makes the recommendation checkable — but on request, so the list itself
  // is a list of things to do and not a wall of reasons.
  const signal = signals.find((s) => item.signalIds.includes(s.id));
  const done = verdict === 'done';

  return (
    <div className={`px-4 pb-2.5 pt-3 ${isLast ? '' : 'tn-hairline'}`}>
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={() => onVerdict('done')}
          aria-pressed={done}
          aria-label={t.today.done}
          className="tn-press mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2"
          style={{
            borderColor: done ? 'var(--green)' : 'var(--compass-ring)',
            background: done ? 'var(--green)' : 'transparent',
            color: 'var(--on-accent)',
          }}
        >
          {done ? <CheckIcon size={13} /> : null}
        </button>

        <button
          type="button"
          onClick={() => setOpen((was) => !was)}
          aria-expanded={open}
          className="min-w-0 flex-1 text-left"
        >
          <div
            className="text-[17px] font-semibold leading-tight text-[var(--ink)]"
            style={done ? { textDecoration: 'line-through', opacity: 0.55 } : undefined}
          >
            {item.title}
          </div>
          <div className="tn-tabular mt-0.5 flex flex-wrap items-center gap-x-2 text-[13px] text-[var(--faint)]">
            <span className="inline-flex items-center gap-1">
              <ClockIcon /> {item.estimatedMinutes} {t.today.minutes}
            </span>
            {item.deadlineTime ? <span>· {item.deadlineTime}</span> : null}
            {task?.code ? <span>· {task.code}</span> : null}
            {verdict && verdict !== 'done' ? <span>· {t.today[verdict]}</span> : null}
          </div>
        </button>
      </div>

      {open ? (
        <div className="ml-10 mt-2 flex flex-col gap-2">
          {item.why ? (
            <p className="text-[15px] leading-snug text-[var(--sec)]">{item.why}</p>
          ) : null}
          {signal ? (
            <p className="text-[13px] leading-snug text-[var(--faint)]">
              {t.today.signal}: {signal.summary[locale]}
            </p>
          ) : null}
          {task ? (
            notionUrl(task.notionPageId) ? (
              <a
                href={notionUrl(task.notionPageId)!}
                target="_blank"
                rel="noreferrer"
                className="text-[15px] font-semibold text-[var(--accent)]"
                title={t.task.openInNotion}
              >
                {task.code ? `${task.code} · ` : ''}
                {task.title} ↗
              </a>
            ) : (
              <Link
                href={`${ROUTES.projects}/${task.projectId}`}
                className="text-[15px] font-semibold text-[var(--accent)]"
              >
                {task.code ? `${task.code} · ` : ''}
                {task.title}
              </Link>
            )
          ) : null}
          <div className="flex flex-wrap gap-2">
            <ChipButton selected={verdict === 'skipped'} onClick={() => onVerdict('skipped')}>
              {t.today.skipped}
            </ChipButton>
            <ChipButton selected={verdict === 'irrelevant'} onClick={() => onVerdict('irrelevant')}>
              {t.today.irrelevant}
            </ChipButton>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function RecalculatingState() {
  const { t } = usePreferences();
  return (
    <div className="mx-4 mt-3" aria-busy="true" aria-live="polite">
      <Card className="p-4">
        <div className="text-[12px] font-bold uppercase tracking-[0.8px] text-[var(--accent)]">
          {t.today.recalculating}
        </div>
        <p className="mt-2 text-[15px] leading-snug text-[var(--sec)]">
          {t.today.recalculatingHint}
        </p>
        <div className="mt-4 flex flex-col gap-2.5">
          <Skeleton height={22} width="88%" />
          <Skeleton height={16} width="64%" />
        </div>
      </Card>
      <Card className="mt-3 overflow-hidden">
        {[0, 1, 2].map((row) => (
          <div key={row} className={`px-4 py-3.5 ${row === 2 ? '' : 'tn-hairline'}`}>
            <Skeleton height={18} width={row === 1 ? '70%' : '82%'} />
            <div className="mt-2">
              <Skeleton height={13} width="46%" />
            </div>
          </div>
        ))}
      </Card>
    </div>
  );
}
