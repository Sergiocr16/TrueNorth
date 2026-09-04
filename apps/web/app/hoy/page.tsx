'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import type { PlanItem, PlanItemVerdict } from '@truenorth/core';
import { progressGap } from '@truenorth/core';
import { CompanySwitcher, LargeTitle, ROUTES, Screen } from '../../components/shell';
import {
  Banner,
  Card,
  ChipButton,
  EmptyState,
  PrimaryButton,
  SectionLabel,
  Skeleton,
  StatusPill,
  TextButton,
} from '../../components/ui';
import { ClockIcon, MicIcon, OfflineIcon, WarningTriangle } from '../../components/icons';
import { formatShortDate } from '../../lib/i18n/dictionary';
import { usePreferences } from '../../lib/preferences';
import { useRiskCount, useStore } from '../../lib/store';
import { VoiceFlow } from './voice-flow';

export default function TodayPage() {
  const { t, locale } = usePreferences();
  const store = useStore();
  const riskCount = useRiskCount();
  const [recalculating, setRecalculating] = useState(false);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [offline, setOffline] = useState(false);

  const { plan, objectives, tasks, currentMembership, company, today } = store;

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
   * Recalculating is a real round trip in production: the change lands in the
   * jobs queue and the Raspberry Pi worker answers. Here it resolves locally so
   * the state is reachable and reviewable.
   */
  const recalculate = () => {
    setRecalculating(true);
    window.setTimeout(() => {
      setRecalculating(false);
      store.markPlanStale(false);
    }, 1600);
  };

  const hasPlan = plan.items.length > 0;

  return (
    <Screen riskCount={riskCount}>
      <LargeTitle
        title={t.nav.today}
        subtitle={`${formatShortDate(plan.date, locale)} · ${currentMembership.roleTitle} · ${company.name}`}
        trailing={<CompanySwitcher />}
      />

      {offline ? (
        <div className="mt-3 px-4">
          <Banner tone="info" icon={<OfflineIcon />}>
            {t.today.offline}
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
          {/* The headline: one sentence, and the objective it unblocks. */}
          <Card className="mx-4 mt-3 p-4">
            <div className="text-[12px] font-bold uppercase tracking-[0.8px] text-[var(--accent)]">
              {t.today.priority}
            </div>
            <h2 className="mt-1.5 text-[20px] font-semibold leading-tight tracking-[-0.2px] text-[var(--ink)] text-pretty">
              {plan.headline}
            </h2>
            <p className="mt-2 text-[15px] leading-snug text-[var(--ink)] opacity-80">
              <strong className="font-semibold">{t.today.why}:</strong>{' '}
              {headlineObjective ? (
                <Link
                  href={`${ROUTES.objectives}/${headlineObjective.id}`}
                  className="font-semibold"
                >
                  {headlineObjective.title}
                </Link>
              ) : null}{' '}
              {plan.why}
            </p>
            {headlineObjective ? (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <StatusPill status={headlineObjective.status} />
                {gap > 0 ? (
                  <span className="tn-tabular text-[13px] text-[var(--sec)]">
                    {t.objectives.gap(gap)}
                  </span>
                ) : null}
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
                  taskCode={tasks.find((task) => task.id === item.taskId)?.code}
                  onVerdict={(verdict) =>
                    store.setPlanFeedback(index, plan.feedback[index] === verdict ? null : verdict)
                  }
                />
              ))}
            </Card>
          </div>

          <div className="mx-4 mt-2.5 flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <Banner tone="warning">
                <strong className="font-semibold">{t.today.ifNotToday}</strong>{' '}
                {plan.consequenceIfNotDone}.
              </Banner>
            </div>
            <button
              type="button"
              onClick={() => setVoiceOpen(true)}
              aria-label={t.today.dictate}
              className="tn-press relative h-[58px] w-[58px] shrink-0 overflow-hidden rounded-full"
              style={{ boxShadow: '0 4px 14px rgba(23,29,46,.18)' }}
            >
              <span
                className="absolute inset-0"
                style={{
                  background: 'var(--fab-glass)',
                  backdropFilter: 'blur(28px) saturate(200%)',
                  WebkitBackdropFilter: 'blur(28px) saturate(200%)',
                }}
              />
              <span
                className="absolute inset-0 rounded-full"
                style={{
                  border: '0.5px solid var(--fab-border)',
                  boxShadow: 'var(--shine)',
                }}
              />
              <span className="relative flex h-full items-center justify-center text-[var(--accent)]">
                <MicIcon size={22} />
              </span>
            </button>
          </div>
        </>
      )}

      <VoiceFlow open={voiceOpen} onClose={() => setVoiceOpen(false)} />
    </Screen>
  );
}

function PlanItemRow({
  item,
  index,
  isLast,
  verdict,
  taskCode,
  onVerdict,
}: {
  item: PlanItem;
  index: number;
  isLast: boolean;
  verdict?: PlanItemVerdict;
  taskCode?: string;
  onVerdict: (verdict: PlanItemVerdict) => void;
}) {
  const { t } = usePreferences();
  const { signals } = useStore();
  const { locale } = usePreferences();

  // Every item cites at least one signal. Showing it is what makes the
  // recommendation checkable instead of something to take on faith.
  const signal = signals.find((s) => item.signalIds.includes(s.id));

  return (
    <div className={`px-4 pb-2.5 pt-3 ${isLast ? '' : 'tn-hairline'}`}>
      <div className="text-[17px] font-semibold leading-tight text-[var(--ink)]">{item.title}</div>
      {item.why ? (
        <div className="mt-0.5 text-[15px] leading-snug text-[var(--sec)]">{item.why}</div>
      ) : null}

      <div className="mt-1 flex items-start gap-1.5 text-[13px] leading-tight text-[var(--faint)]">
        <span className="mt-[3px] shrink-0">
          <ClockIcon />
        </span>
        <span className="min-w-0 flex-1">
          {signal ? `${t.today.signal}: ${signal.summary[locale]} · ` : ''}
          <span className="tn-tabular">
            {item.estimatedMinutes} {t.today.minutes}
          </span>
          {item.deadlineTime ? <span className="tn-tabular"> · {item.deadlineTime}</span> : null}
          {taskCode && item.taskId ? (
            <>
              {' · '}
              <Link href={`${ROUTES.projects}/${item.projectId}`} className="font-semibold">
                {taskCode}
              </Link>
            </>
          ) : null}
        </span>
      </div>

      <div className="mt-2 flex flex-wrap gap-2">
        <ChipButton
          selected={verdict === 'done'}
          tone="positive"
          onClick={() => onVerdict('done')}
        >
          {t.today.done}
        </ChipButton>
        <ChipButton selected={verdict === 'skipped'} onClick={() => onVerdict('skipped')}>
          {t.today.skipped}
        </ChipButton>
        <ChipButton selected={verdict === 'irrelevant'} onClick={() => onVerdict('irrelevant')}>
          {t.today.irrelevant}
        </ChipButton>
      </div>
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
