'use client';

import { useState } from 'react';
import type { PerspectiveKey } from '@truenorth/core';
import { shareHealthy, todayIso } from '@truenorth/core';
import Link from 'next/link';
import { LargeTitle, ROUTES, Screen } from '../../components/shell';
import { Card, EmptyState, GlanceTile, SectionLabel, Segmented, TextButton } from '../../components/ui';
import { BriefingIcon } from '../../components/icons';
import { HealthCompass } from '../../components/day-compass';
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
  const [briefingOpen, setBriefingOpen] = useState(false);

  // The engine writes companies/{cid}/analyses/{date}. Nothing stands in for
  // it: a briefing that was never generated is an empty screen that says so.
  const analysis =
    store.analyses.find((candidate) => candidate.date === todayIso()) ?? store.analyses[0] ?? null;
  const generatedTime = analysis
    ? new Date(analysis.generatedAt).toLocaleTimeString(locale === 'es' ? 'es-CR' : 'en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      })
    : null;

  const options = (['ceo', 'coo', 'cto', 'cfo', 'pm'] as const).map((key) => ({
    value: key,
    label: t.perspectives[key],
  }));

  const selected = analysis?.perspectives.find((p) => p.key === lens);

  // The first sentence is the headline; the rest is there, folded.
  const [lead, rest] = splitLead(analysis?.briefing ?? '');
  const stuck = (store.followUp?.readings ?? []).filter(
    (r) => r.standing === 'trabado' || r.standing === 'atrasado',
  ).length;

  return (
    <Screen riskCount={riskCount} wide>
      <LargeTitle
        title={t.briefing.title}
        subtitle={
          generatedTime
            ? `${store.company.name} · ${t.briefing.generatedAt(generatedTime)}`
            : store.company.name
        }
        trailing={<HealthCompass ratio={shareHealthy(store.objectives)} label={t.common.health} />}
      />

      {!analysis ? (
        <Card className="mx-4 mt-4">
          <EmptyState icon={<BriefingIcon size={34} />} title={t.briefing.title} body={t.briefing.notYet} />
        </Card>
      ) : (
        <>
      {/* Three numbers before any sentence: what needs a look, what needs a
          call, who is stuck. The prose comes after, and folded. */}
      <div className="mx-4 mt-3 grid grid-cols-3 gap-2.5">
        <GlanceTile value={analysis.topRisks.length} label={t.briefing.glanceRisks} tone="amber" />
        <GlanceTile
          value={analysis.pendingDecisions.length}
          label={t.briefing.glanceDecisions}
          tone="accent"
        />
        {/* People are read on the follow-up screen; the briefing only counts
            them, and the count is the door. */}
        <Link href={ROUTES.followUps} className="tn-press block">
          <GlanceTile value={stuck} label={t.briefing.glanceStuck} tone={stuck > 0 ? 'red' : 'green'} />
        </Link>
      </div>

      <div className="mx-4 mt-4 lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-5">
        <div>
          <Card className="p-4">
            <p className="text-[17px] font-semibold leading-snug text-[var(--ink)] text-pretty">
              {lead}
            </p>
            {rest ? (
              <>
                <p
                  className={`mt-2 text-[15px] leading-relaxed text-[var(--sec)] ${
                    briefingOpen ? '' : 'line-clamp-3'
                  }`}
                >
                  {rest}
                </p>
                <button
                  type="button"
                  onClick={() => setBriefingOpen((open) => !open)}
                  aria-expanded={briefingOpen}
                  className="tn-press mt-2 text-[15px] font-semibold text-[var(--accent)]"
                >
                  {briefingOpen ? t.briefing.readLess : t.briefing.readMore}
                </button>
              </>
            ) : null}
          </Card>

          <div className="mt-4">
            <SectionLabel>{t.briefing.perspectives}</SectionLabel>

            {/* Phone: one lens at a time, a few lines at a time. */}
            <div className="lg:hidden">
              <Segmented options={options} value={lens} onChange={setLens} />
              <Card className="mt-2.5 p-4">
                <Reading text={selected?.reading ?? ''} />
              </Card>
            </div>

            {/* Desktop: all five, comparable at a glance. */}
            <div className="hidden gap-2.5 lg:grid lg:grid-cols-2">
              {analysis.perspectives.map((perspective) => (
                <Card key={perspective.key} className="p-4">
                  <div className="text-[12px] font-bold uppercase tracking-[0.8px] text-[var(--accent)]">
                    {t.perspectives[perspective.key]}
                  </div>
                  <div className="mt-1.5">
                    <Reading text={perspective.reading} />
                  </div>
                </Card>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-4 lg:mt-0">
          <SectionLabel>{t.briefing.topRisks}</SectionLabel>
          <Card className="overflow-hidden">
            {/* Ranked, so the number carries information. */}
            {analysis.topRisks.map((risk, index) => (
              <div
                key={risk}
                className={`flex items-start gap-3 px-4 py-3 ${
                  index === analysis.topRisks.length - 1 ? '' : 'tn-hairline'
                }`}
              >
                <span
                  className="tn-tabular mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[12px] font-bold"
                  style={{ background: 'var(--amber-bg)', color: 'var(--amber)' }}
                >
                  {index + 1}
                </span>
                <span className="text-[15px] leading-snug text-[var(--ink)]">{risk}</span>
              </div>
            ))}
          </Card>

          <div className="mt-4">
            <SectionLabel>{t.briefing.decisions}</SectionLabel>
            <Card className="overflow-hidden">
              {analysis.pendingDecisions.length === 0 ? (
                <p className="px-4 py-3.5 text-[15px] text-[var(--ter)]">{t.risks.none}</p>
              ) : (
                analysis.pendingDecisions.map((decision, index) => (
                  <div
                    key={decision}
                    className={`flex items-start gap-3 px-4 py-3 ${
                      index === analysis.pendingDecisions.length - 1 ? '' : 'tn-hairline'
                    }`}
                  >
                    <span
                      className="mt-[7px] h-2 w-2 shrink-0 rounded-full"
                      style={{ background: 'var(--accent)' }}
                      aria-hidden
                    />
                    <span className="text-[15px] leading-snug text-[var(--ink)]">{decision}</span>
                  </div>
                ))
              )}
            </Card>
          </div>
        </div>
      </div>
        </>
      )}
    </Screen>
  );
}

/** First sentence out, the rest kept; a briefing with one sentence has no rest. */
function splitLead(text: string): [string, string] {
  const match = text.match(/^(.+?[.!?])(\s+[\s\S]*)?$/);
  if (!match) return [text, ''];
  return [match[1]!.trim(), (match[2] ?? '').trim()];
}

/** A perspective, four lines at a time. */
function Reading({ text }: { text: string }) {
  const { t } = usePreferences();
  const [open, setOpen] = useState(false);
  const long = text.length > 220;
  return (
    <>
      <p className={`text-[15px] leading-relaxed text-[var(--ink)] ${open || !long ? '' : 'line-clamp-4'}`}>
        {text}
      </p>
      {long ? (
        <button
          type="button"
          onClick={() => setOpen((was) => !was)}
          aria-expanded={open}
          className="tn-press mt-1.5 text-[15px] font-semibold text-[var(--accent)]"
        >
          {open ? t.briefing.readLess : t.briefing.readMore}
        </button>
      ) : null}
    </>
  );
}
