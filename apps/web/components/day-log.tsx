'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { TIME_ZONE } from '@truenorth/core';
import { Card, ChipButton, PrimaryButton, SectionLabel, TextButton } from './ui';
import { FieldGroup, TextAreaField } from './form';
import { usePreferences } from '../lib/preferences';
import { useStore } from '../lib/store';

/**
 * The day in the person's own words (ADR-014), at the bottom of Today.
 *
 * The three verdicts on a plan item only ever describe what the engine
 * proposed. This is the other half: what actually happened, including the work
 * no plan asked for — which is the only way a blind spot in the signals ever
 * becomes visible. The engine reads yesterday's into tomorrow's prompt.
 *
 * It also shows the rule the engine offers once it has read a day, because the
 * confirmation belongs next to the evidence for it.
 */

/** HH:mm in Costa Rica, whatever the device clock says. */
function wallClock(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale === 'es' ? 'es-CR' : 'en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone: TIME_ZONE,
  }).format(new Date(iso));
}

export function DayLog() {
  const { t, locale } = usePreferences();
  const store = useStore();
  const saved = store.dayLog;
  const [draft, setDraft] = useState(saved?.text ?? '');
  const [editing, setEditing] = useState(false);

  // A log written on another device arrives through the listener; adopt it
  // unless the person is in the middle of writing.
  useEffect(() => {
    if (!editing) setDraft(saved?.text ?? '');
  }, [saved?.text, editing]);

  const open = editing || !saved;

  return (
    <div className="mx-4 mt-3">
      <ProposedRuleCard />

      <SectionLabel
        action={
          store.planRules.length > 0 ? (
            <Link href="/plan-rules" className="text-[15px] text-[var(--accent)]">
              {t.dayLog.rulesLink}
            </Link>
          ) : null
        }
      >
        {t.dayLog.title}
      </SectionLabel>

      {open ? (
        <>
          <p className="mb-2 px-1 text-[13px] leading-snug text-[var(--ter)]">{t.dayLog.hint}</p>
          <FieldGroup>
            <TextAreaField
              label={t.dayLog.title}
              value={draft}
              onChange={setDraft}
              placeholder={t.dayLog.placeholder}
              rows={4}
              isLast
            />
          </FieldGroup>
          <div className="mt-3 flex items-center gap-3">
            <PrimaryButton
              onClick={() => {
                store.saveDayLog(draft);
                setEditing(false);
              }}
            >
              {t.dayLog.save}
            </PrimaryButton>
            {saved ? <TextButton onClick={() => setEditing(false)}>{t.dayLog.saved}</TextButton> : null}
          </div>
        </>
      ) : (
        <Card className="overflow-hidden">
          <div className="px-4 py-3">
            <p className="whitespace-pre-wrap text-[17px] leading-snug text-[var(--ink)]">{saved.text}</p>
            <div className="mt-2 flex items-center justify-between">
              <span className="text-[13px] text-[var(--faint)]">
                {t.dayLog.savedAt(wallClock(saved.updatedAt, locale))}
              </span>
              <TextButton onClick={() => setEditing(true)}>{t.dayLog.edit}</TextButton>
            </div>
          </div>
        </Card>
      )}

    </div>
  );
}

/**
 * The rule the engine offers, with the evidence behind it. Confirming writes
 * it to the person's own member document; nothing is ever written back to the
 * plan, which only the engine may write.
 */
function ProposedRuleCard() {
  const { t } = usePreferences();
  const store = useStore();
  const proposal = store.proposedRule;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  useEffect(() => {
    setDraft(proposal?.text ?? '');
    setEditing(false);
  }, [proposal?.text]);

  if (!proposal) return null;

  const scope =
    proposal.scope === 'role'
      ? t.dayLog.proposalScopeRole(store.activeRole?.name ?? '')
      : t.dayLog.proposalScopeGeneral;

  return (
    <div className="mb-4">
      <SectionLabel>{t.dayLog.proposalTitle}</SectionLabel>
      <Card className="overflow-hidden">
        <div className="px-4 py-3">
          {editing ? (
            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              rows={3}
              className="w-full rounded-xl border border-[var(--hair)] bg-[var(--chip-bg)] p-3 text-[15px] leading-snug text-[var(--ink)] outline-none"
            />
          ) : (
            <p className="whitespace-pre-wrap rounded-xl bg-[var(--chip-bg)] p-3 text-[17px] leading-snug text-[var(--ink)]">
              {proposal.text}
            </p>
          )}

          <p className="mt-2 text-[13px] text-[var(--faint)]">{scope}</p>
          <p className="mt-1.5 text-[13px] leading-snug text-[var(--ter)]">
            <span className="text-[var(--faint)]">{t.dayLog.proposalWhy}: </span>
            {proposal.why}
          </p>

          <div className="mt-2.5 flex flex-wrap gap-2">
            <ChipButton tone="positive" onClick={() => store.answerProposedRule('confirm', draft)}>
              {t.dayLog.confirm}
            </ChipButton>
            <ChipButton selected={editing} onClick={() => setEditing((was) => !was)}>
              {t.dayLog.editRule}
            </ChipButton>
            <ChipButton onClick={() => store.answerProposedRule('reject')}>
              {t.dayLog.reject}
            </ChipButton>
          </div>
        </div>
      </Card>
    </div>
  );
}
