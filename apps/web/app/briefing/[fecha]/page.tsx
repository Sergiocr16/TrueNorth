'use client';

import { useParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import type { PerspectiveKey } from '@truenorth/core';
import { DetailHeader, ROUTES, Screen } from '../../../components/shell';
import { Card, SectionLabel, Segmented } from '../../../components/ui';
import { CheckIcon, CloseIcon, WarningTriangle } from '../../../components/icons';
import { formatShortDate } from '../../../lib/i18n/dictionary';
import { usePreferences } from '../../../lib/preferences';
import { useRiskCount, useStore } from '../../../lib/store';

/**
 * One day from the record: the plan that was given that morning, what was
 * actually marked done, and the company analysis if the engine produced one.
 */
export default function BriefingDayPage() {
  const params = useParams<{ fecha: string }>();
  const { t, locale } = usePreferences();
  const store = useStore();
  const riskCount = useRiskCount();
  const [lens, setLens] = useState<PerspectiveKey>('cto');

  const date = params.fecha;
  const plan = useMemo(
    () => store.planHistory.find((p) => p.date === date),
    [store.planHistory, date],
  );
  const analysis = useMemo(
    () => store.analyses.find((a) => a.date === date),
    [store.analyses, date],
  );

  const es = locale === 'es';

  if (!plan && !analysis) {
    return (
      <Screen riskCount={riskCount}>
        <DetailHeader title={t.briefing.history} backHref={`${ROUTES.briefing}/historial`} />
        <Card className="mx-4 mt-4 p-4 text-[15px] leading-snug text-[var(--sec)]">
          {es
            ? 'No hay nada registrado ese día.'
            : 'Nothing was recorded on that day.'}
        </Card>
      </Screen>
    );
  }

  const total = plan?.items.length ?? 0;
  const completed = plan
    ? Object.values(plan.feedback ?? {}).filter((v) => v === 'done').length
    : 0;

  const options = (['ceo', 'coo', 'cto', 'cfo', 'pm'] as const).map((key) => ({
    value: key,
    label: t.perspectives[key],
  }));
  const selected = analysis?.perspectives.find((p) => p.key === lens);

  return (
    <Screen riskCount={riskCount}>
      <DetailHeader title={t.briefing.history} backHref={`${ROUTES.briefing}/historial`} />

      <div className="mx-4 mt-2">
        <h1 className="text-[28px] font-bold capitalize leading-tight tracking-[-0.2px] text-[var(--ink)]">
          {formatShortDate(date, locale)}
        </h1>
        {plan ? (
          <p className="tn-tabular mt-0.5 text-[15px] text-[var(--sec)]">
            {t.briefing.completedOf(completed, total)}
          </p>
        ) : null}
      </div>

      {plan ? (
        <>
          <Card className="mx-4 mt-3.5 p-4">
            <div className="text-[12px] font-bold uppercase tracking-[0.8px] text-[var(--accent)]">
              {t.today.priority}
            </div>
            <h2 className="mt-1.5 text-[20px] font-semibold leading-tight tracking-[-0.2px] text-[var(--ink)] text-pretty">
              {plan.headline}
            </h2>
            {plan.why ? (
              <p className="mt-2 text-[15px] leading-snug text-[var(--sec)]">
                <strong className="font-semibold text-[var(--ink)]">{t.today.why}:</strong>{' '}
                {plan.why}
              </p>
            ) : null}
          </Card>

          <div className="mx-4 mt-4">
            <SectionLabel>{t.today.planCount(total)}</SectionLabel>
            <Card className="overflow-hidden">
              {plan.items.map((item, index) => {
                const verdict = plan.feedback?.[index];
                return (
                  <div
                    key={index}
                    className={`flex items-start gap-3 px-4 py-3 ${
                      index === plan.items.length - 1 ? '' : 'tn-hairline'
                    }`}
                  >
                    <span
                      className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full"
                      style={{
                        background:
                          verdict === 'done' ? 'var(--green-bg)' : 'var(--chip-bg)',
                        color: verdict === 'done' ? 'var(--green)' : 'var(--ter)',
                      }}
                      aria-hidden
                    >
                      {verdict === 'done' ? <CheckIcon size={11} /> : <CloseIcon size={9} />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div
                        className="text-[17px] font-semibold leading-tight text-[var(--ink)]"
                        style={
                          verdict === 'done'
                            ? { textDecoration: 'line-through', opacity: 0.6 }
                            : undefined
                        }
                      >
                        {item.title}
                      </div>
                      {item.why ? (
                        <div className="mt-0.5 text-[15px] leading-snug text-[var(--sec)]">
                          {item.why}
                        </div>
                      ) : null}
                      <div className="tn-tabular mt-1 text-[13px] text-[var(--ter)]">
                        {item.estimatedMinutes} {t.today.minutes}
                        {verdict && verdict !== 'done'
                          ? ` · ${verdict === 'skipped' ? t.today.skipped : t.today.irrelevant}`
                          : ''}
                        {!verdict ? ` · ${t.briefing.noVerdict}` : ''}
                      </div>
                    </div>
                  </div>
                );
              })}
            </Card>
          </div>

          {plan.consequenceIfNotDone ? (
            <div className="mx-4 mt-3">
              <div
                className="flex items-start gap-2.5 rounded-2xl px-3.5 py-2.5"
                style={{
                  background: 'var(--amber-bg)',
                  border: '0.5px solid var(--amber-line)',
                }}
              >
                <span className="mt-0.5 shrink-0 text-[var(--amber)]">
                  <WarningTriangle />
                </span>
                <div className="text-[14px] leading-snug text-[var(--warn)]">
                  <strong className="font-semibold">{t.today.ifNotToday}</strong>{' '}
                  {plan.consequenceIfNotDone}.
                </div>
              </div>
            </div>
          ) : null}
        </>
      ) : null}

      {analysis ? (
        <>
          <Card className="mx-4 mt-4 p-4">
            <div className="text-[12px] font-bold uppercase tracking-[0.8px] text-[var(--ter)]">
              {t.briefing.title}
            </div>
            <p className="mt-1.5 text-[17px] leading-relaxed text-[var(--ink)] text-pretty">
              {analysis.briefing}
            </p>
          </Card>

          <div className="mx-4 mt-4">
            <SectionLabel>{t.briefing.perspectives}</SectionLabel>
            <Segmented options={options} value={lens} onChange={setLens} />
            <Card className="mt-2.5 p-4">
              <p className="text-[17px] leading-relaxed text-[var(--ink)]">
                {selected?.reading}
              </p>
            </Card>
          </div>
        </>
      ) : (
        <div className="mx-4 mt-4">
          <Card className="p-4 text-[15px] leading-snug text-[var(--sec)]">
            {t.briefing.noAnalysis}
          </Card>
        </div>
      )}
    </Screen>
  );
}
