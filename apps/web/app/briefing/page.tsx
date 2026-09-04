'use client';

import { useState } from 'react';
import type { PerspectiveKey, Standing } from '@truenorth/core';
import { fixtures, todayIso } from '@truenorth/core';
import Link from 'next/link';
import { LargeTitle, ROUTES, Screen } from '../../components/shell';
import { Avatar, Card, SectionLabel, Segmented, TextButton } from '../../components/ui';
import { WarningTriangle } from '../../components/icons';
import { usePreferences } from '../../lib/preferences';
import { useRiskCount, useStore } from '../../lib/store';

/**
 * The executive briefing: one analysis with five lenses, not five agents. On a
 * phone the perspectives are a segmented control; on desktop they sit side by
 * side so the reader can compare them.
 */
export default function BriefingPage() {
  const { t, locale } = usePreferences();
  const riskCount = useRiskCount();
  const store = useStore();
  const [lens, setLens] = useState<PerspectiveKey>('cto');

  // The engine writes companies/{cid}/analyses/{date}. Until it has run for the
  // first time in this company there is nothing to read, and the worked example
  // stands in so the screen still shows what a briefing looks like.
  const analysis =
    store.analyses.find((candidate) => candidate.date === todayIso()) ??
    store.analyses[0] ??
    fixtures.todaysAnalysis;
  const generatedTime = new Date(analysis.generatedAt).toLocaleTimeString(
    locale === 'es' ? 'es-CR' : 'en-US',
    { hour: '2-digit', minute: '2-digit', hour12: false },
  );

  const options = (['ceo', 'coo', 'cto', 'cfo', 'pm'] as const).map((key) => ({
    value: key,
    label: t.perspectives[key],
  }));

  const selected = analysis.perspectives.find((p) => p.key === lens);

  return (
    <Screen riskCount={riskCount} wide>
      <LargeTitle
        title={t.briefing.title}
        subtitle={`${store.company.name} · ${t.briefing.generatedAt(generatedTime)}`}
      />

      <div className="mx-4 mt-4 lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-5">
        <div>
          <Card className="p-4">
            <p className="text-[17px] leading-relaxed text-[var(--ink)] text-pretty">
              {analysis.briefing}
            </p>
          </Card>

          <div className="mt-4">
            <SectionLabel>{t.briefing.perspectives}</SectionLabel>

            {/* Phone: one lens at a time. */}
            <div className="lg:hidden">
              <Segmented options={options} value={lens} onChange={setLens} />
              <Card className="mt-2.5 p-4">
                <div className="text-[12px] font-bold uppercase tracking-[0.8px] text-[var(--accent)]">
                  {t.perspectives[lens]}
                </div>
                <p className="mt-1.5 text-[17px] leading-relaxed text-[var(--ink)]">
                  {selected?.reading}
                </p>
              </Card>
            </div>

            {/* Desktop: all five, comparable at a glance. */}
            <div className="hidden gap-2.5 lg:grid lg:grid-cols-2">
              {analysis.perspectives.map((perspective) => (
                <Card key={perspective.key} className="p-4">
                  <div className="text-[12px] font-bold uppercase tracking-[0.8px] text-[var(--accent)]">
                    {t.perspectives[perspective.key]}
                  </div>
                  <p className="mt-1.5 text-[15px] leading-relaxed text-[var(--ink)]">
                    {perspective.reading}
                  </p>
                </Card>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-4 lg:mt-0">
          <SectionLabel>{t.briefing.topRisks}</SectionLabel>
          <Card className="overflow-hidden">
            {analysis.topRisks.map((risk, index) => (
              <div
                key={risk}
                className={`flex items-start gap-2.5 px-4 py-3 ${
                  index === analysis.topRisks.length - 1 ? '' : 'tn-hairline'
                }`}
              >
                <span className="mt-1 shrink-0 text-[var(--amber)]">
                  <WarningTriangle size={14} />
                </span>
                <span className="text-[15px] leading-snug text-[var(--ink)]">{risk}</span>
              </div>
            ))}
          </Card>

          <TeamReadings />

          <div className="mt-4">
            <SectionLabel>{t.briefing.decisions}</SectionLabel>
            <Card className="overflow-hidden">
              {analysis.pendingDecisions.length === 0 ? (
                <p className="px-4 py-3.5 text-[15px] text-[var(--ter)]">{t.risks.none}</p>
              ) : (
                analysis.pendingDecisions.map((decision, index) => (
                  <div
                    key={decision}
                    className={`px-4 py-3 text-[15px] leading-snug text-[var(--ink)] ${
                      index === analysis.pendingDecisions.length - 1 ? '' : 'tn-hairline'
                    }`}
                  >
                    {decision}
                  </div>
                ))
              )}
            </Card>
          </div>
        </div>
      </div>
    </Screen>
  );
}

const STANDING_STYLE: Record<Standing, { bg: string; fg: string }> = {
  adelantado: { bg: 'var(--green-bg)', fg: 'var(--green)' },
  en_curso: { bg: 'var(--chip-bg)', fg: 'var(--sec)' },
  atrasado: { bg: 'var(--amber-bg)', fg: 'var(--amber)' },
  trabado: { bg: 'var(--red-bg)', fg: 'var(--red)' },
};

/**
 * How the team is doing, one line each.
 *
 * The same readings the Team screen shows in full, compressed to a glance and
 * placed next to the risks — because "who is stuck" is a reading of the company,
 * not a separate report. Only managers have a follow-up document to read, so for
 * everybody else this section is simply not there.
 */
function TeamReadings() {
  const { t } = usePreferences();
  const store = useStore();
  const readings = store.followUp?.readings ?? [];
  if (readings.length === 0) return null;

  return (
    <div className="mt-4">
      <SectionLabel
        action={
          <Link href={ROUTES.team} className="text-[15px] font-semibold text-[var(--accent)]">
            {t.team.title}
          </Link>
        }
      >
        {t.team.reading}
      </SectionLabel>
      <Card className="overflow-hidden">
        {readings.map((reading, index) => {
          const user = store.users.find((candidate) => candidate.id === reading.userId);
          const style = STANDING_STYLE[reading.standing];
          return (
            <div
              key={reading.userId}
              className={`flex items-start gap-3 px-4 py-3 ${
                index === readings.length - 1 ? '' : 'tn-hairline'
              }`}
            >
              <Avatar initials={user?.initials ?? '—'} size={28} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[15px] font-semibold text-[var(--ink)]">
                    {user?.displayName ?? reading.userId}
                  </span>
                  <span
                    className="rounded-full px-2 py-0.5 text-[12px] font-semibold"
                    style={{ background: style.bg, color: style.fg }}
                  >
                    {t.team.standing[reading.standing]}
                  </span>
                </div>
                <p className="mt-0.5 text-[13px] leading-snug text-[var(--sec)]">
                  {reading.recommendation}
                </p>
              </div>
            </div>
          );
        })}
      </Card>
    </div>
  );
}
