'use client';

import { useState } from 'react';
import type { Situation, Standing } from '@truenorth/core';
import { todayIso } from '@truenorth/core';
import { LargeTitle, Screen } from '../../components/shell';
import { Avatar, Card, EmptyState, GlanceTile, PrimaryButton, SectionLabel, TextButton } from '../../components/ui';
import {
  DateField,
  DestructiveRow,
  EditSheet,
  FieldGroup,
  SelectField,
  TextAreaField,
  ToggleField,
  useConfirm,
} from '../../components/form';
import { FollowUpMessage } from '../../components/follow-up';
import { SendIcon } from '../../components/icons';
import { HealthCompass } from '../../components/day-compass';
import { formatShortDate } from '../../lib/i18n/dictionary';
import { usePreferences } from '../../lib/preferences';
import { makeSituation, useRiskCount, useStore } from '../../lib/store';

/**
 * Today's messages, and nothing else.
 *
 * The Team screen says how everybody is doing; this one is the outbox: what to
 * send today, greeting included, ready to copy. Each message is decided on its
 * own — sent, or not today — and the ones already decided fold away so what
 * remains is only what is left to do.
 */
export default function FollowUpsPage() {
  const { t } = usePreferences();
  const store = useStore();
  const riskCount = useRiskCount();
  const [showDecided, setShowDecided] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);

  const { followUp, users, activeRole } = store;

  const generate = () => {
    if (!activeRole) return;
    setGenerating(true);
    setGenerateError(null);
    store
      .generateFollowUp(activeRole.id)
      .catch((cause: unknown) =>
        setGenerateError(cause instanceof Error ? cause.message : String(cause)),
      )
      .finally(() => setGenerating(false));
  };
  const isManager = store.currentMembership.access !== 'member';
  const messages = followUp?.messages ?? [];
  const pending = messages.filter((m) => !followUp?.outcome?.[m.id]);
  const decided = messages.filter((m) => followUp?.outcome?.[m.id]);
  const sent = decided.filter((m) => followUp?.outcome?.[m.id] === 'sent').length;

  const nameOf = (id: string) => users.find((u) => u.id === id);

  return (
    <Screen riskCount={riskCount}>
      <LargeTitle
        title={t.followUps.title}
        subtitle={store.company.name}
        trailing={
          <HealthCompass
            ratio={messages.length === 0 ? 1 : decided.length / messages.length}
            label={t.followUps.progress}
          />
        }
      />

      {!isManager ? (
        <Card className="mx-4 mt-4">
          <EmptyState icon={<SendIcon size={34} />} title={t.followUps.title} body={t.followUps.notManager} />
        </Card>
      ) : !followUp && activeRole ? (
        <Card className="mx-4 mt-4">
          <EmptyState
            icon={<SendIcon size={34} />}
            title={t.roles.noFollowUp(activeRole.name)}
            body={generateError ? `${t.roles.generateFailed} ${generateError}` : t.roles.noFollowUpBody}
            action={
              <PrimaryButton onClick={generating ? undefined : generate}>
                {generating ? t.roles.generating : t.roles.generate}
              </PrimaryButton>
            }
          />
        </Card>
      ) : !followUp ? (
        <Card className="mx-4 mt-4">
          <EmptyState icon={<SendIcon size={34} />} title={t.followUps.title} body={t.team.followUpNotYet} />
        </Card>
      ) : followUp.readings.length === 0 && followUp.messages.length === 0 ? (
        <Card className="mx-4 mt-4">
          <EmptyState icon={<SendIcon size={34} />} title={t.followUps.title} body={t.roles.nobodyInView} />
        </Card>
      ) : (
        <>
          <div className="mx-4 mt-3 grid grid-cols-3 gap-2.5">
            <GlanceTile value={pending.length} label={t.followUps.glancePending} tone={pending.length > 0 ? 'accent' : 'green'} />
            <GlanceTile value={sent} label={t.followUps.glanceSent} tone="green" />
            <GlanceTile value={decided.length - sent} label={t.followUps.glanceSkipped} tone="neutral" />
          </div>

          <TeamReadings />

          <div className="mx-4 mt-4">
            <SectionLabel>{t.followUps.toSend}</SectionLabel>
          </div>

          {pending.length === 0 ? (
            <Card className="mx-4">
              <EmptyState icon={<SendIcon size={34} />} title={t.followUps.allDone} body={t.followUps.allDoneBody} />
            </Card>
          ) : (
            <div className="mx-4 flex flex-col gap-2.5">
              {pending.map((message) => {
                const person = nameOf(message.userId);
                return (
                  <Card key={message.id} className="p-4">
                    <div className="flex items-center gap-3">
                      <Avatar initials={person?.initials ?? '—'} size={36} />
                      <div className="min-w-0 flex-1 text-[17px] font-semibold text-[var(--ink)]">
                        {person?.displayName ?? message.userId}
                      </div>
                    </div>
                    <FollowUpMessage message={message} />
                  </Card>
                );
              })}
            </div>
          )}

          {decided.length > 0 ? (
            <div className="mx-4 mt-4">
              <SectionLabel
                action={
                  <TextButton onClick={() => setShowDecided((was) => !was)}>
                    {showDecided ? t.followUps.hideDecided : t.followUps.showDecided(decided.length)}
                  </TextButton>
                }
              >
                {t.followUps.decided}
              </SectionLabel>
              {showDecided ? (
                <div className="flex flex-col gap-2.5">
                  {decided.map((message) => {
                    const person = nameOf(message.userId);
                    return (
                      <Card key={message.id} className="p-4 opacity-80">
                        <div className="flex items-center gap-3">
                          <Avatar initials={person?.initials ?? '—'} size={36} />
                          <div className="min-w-0 flex-1 text-[17px] font-semibold text-[var(--ink)]">
                            {person?.displayName ?? message.userId}
                          </div>
                        </div>
                        <FollowUpMessage message={message} />
                      </Card>
                    );
                  })}
                </div>
              ) : null}
            </div>
          ) : null}
        </>
      )}
    </Screen>
  );
}

/* ------------------------------------------------------------------ */
/* How everybody is doing                                              */
/* ------------------------------------------------------------------ */

/**
 * One row per person, folded: the standing and the recommendation are what
 * you scan; the full reading and the situation are a tap away. Situations are
 * edited from here rather than from Team because they exist for the follow-up.
 */
function TeamReadings() {
  const { t, locale } = usePreferences();
  const store = useStore();
  const [openId, setOpenId] = useState<string | null>(null);
  const [editingSituation, setEditingSituation] = useState<Situation | null>(null);

  const readings = store.followUp?.readings ?? [];
  if (readings.length === 0) return null;
  const today0 = todayIso();

  return (
    <div className="mx-4 mt-4">
      <SectionLabel>{t.team.reading}</SectionLabel>
      <Card className="overflow-hidden">
        {readings.map((reading, index) => {
          const user = store.users.find((u) => u.id === reading.userId);
          const style = STANDING_STYLE[reading.standing];
          const open = openId === reading.userId;
          const situation =
            store.situations.find(
              (sit) => sit.userId === reading.userId && (!sit.endsAt || sit.endsAt >= today0),
            ) ?? null;
          return (
            <div key={reading.userId} className={index === readings.length - 1 ? '' : 'tn-hairline'}>
              <button
                type="button"
                onClick={() => setOpenId(open ? null : reading.userId)}
                aria-expanded={open}
                className="tn-press flex w-full items-start gap-3 px-4 py-3 text-left"
              >
                <Avatar initials={user?.initials ?? '—'} size={32} />
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
                    {situation ? (
                      <span
                        className="rounded-full px-2 py-0.5 text-[12px] font-semibold"
                        style={{ background: 'var(--amber-bg)', color: 'var(--amber)' }}
                      >
                        {t.team.situationActive}
                      </span>
                    ) : null}
                  </div>
                  <p className={`mt-0.5 text-[13px] leading-snug text-[var(--sec)] ${open ? '' : 'line-clamp-2'}`}>
                    {reading.recommendation}
                  </p>
                </div>
              </button>

              {open ? (
                <div className="px-4 pb-3 pl-[60px]">
                  <p className="text-[15px] leading-snug text-[var(--ink)]">{reading.reading}</p>
                  {reading.signals.length > 0 ? (
                    <ul className="mt-2 flex flex-col gap-1">
                      {reading.signals.map((signal) => (
                        <li key={signal.id} className="text-[13px] leading-snug text-[var(--faint)]">
                          · {signal.summary[locale]}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  <div className="mt-2">
                    <TextButton
                      onClick={() =>
                        setEditingSituation(
                          situation ??
                            makeSituation(store.company.id, reading.userId, store.currentUser.id),
                        )
                      }
                    >
                      {situation
                        ? `${t.team.editSituation}${situation.endsAt ? ` · ${formatShortDate(situation.endsAt, locale)}` : ''}`
                        : t.team.addSituation}
                    </TextButton>
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
      </Card>

      {editingSituation ? (
        <SituationEditor
          situation={editingSituation}
          onCancel={() => setEditingSituation(null)}
          onSave={(situation) => {
            store.upsertSituation(situation);
            setEditingSituation(null);
          }}
          onDelete={() => {
            store.deleteSituation(editingSituation.id);
            setEditingSituation(null);
          }}
        />
      ) : null}
    </div>
  );
}

const STANDING_STYLE: Record<Standing, { bg: string; fg: string }> = {
  adelantado: { bg: 'var(--green-bg)', fg: 'var(--green)' },
  en_curso: { bg: 'var(--chip-bg)', fg: 'var(--sec)' },
  atrasado: { bg: 'var(--amber-bg)', fg: 'var(--amber)' },
  trabado: { bg: 'var(--red-bg)', fg: 'var(--red)' },
};

function SituationEditor({
  situation,
  onCancel,
  onSave,
  onDelete,
}: {
  situation: Situation;
  onCancel: () => void;
  onSave: (situation: Situation) => void;
  onDelete: () => void;
}) {
  const { t, locale } = usePreferences();
  const [draft, setDraft] = useState(situation);
  const [armed, arm, disarm] = useConfirm();
  const es = locale === 'es';

  const kinds: { value: Situation['kind']; label: string }[] = [
    { value: 'personal', label: t.team.kind.personal },
    { value: 'carga', label: t.team.kind.carga },
    { value: 'desempeno', label: t.team.kind.desempeno },
    { value: 'salud', label: t.team.kind.salud },
    { value: 'motivacion', label: t.team.kind.motivacion },
    { value: 'otro', label: t.team.kind.otro },
  ];

  return (
    <EditSheet
      open
      title={t.team.editSituation}
      onCancel={onCancel}
      onSave={() => onSave(draft)}
      canSave={draft.note.trim().length > 0}
    >
      <FieldGroup footer={t.team.situationPrivate}>
        <TextAreaField
          label={t.team.situationNote}
          value={draft.note}
          onChange={(note) => setDraft({ ...draft, note })}
          rows={4}
          placeholder={
            es
              ? 'Anda con un tema familiar esta semana; bajarle la carga.'
              : 'Family matter this week; ease their load.'
          }
        />
        <SelectField
          label={t.team.situationKind}
          value={draft.kind}
          options={kinds}
          onChange={(kind) => setDraft({ ...draft, kind })}
        />
        <DateField
          label={t.team.situationUntil}
          value={draft.endsAt}
          onChange={(endsAt) => setDraft({ ...draft, endsAt })}
          isLast
        />
      </FieldGroup>

      <FieldGroup footer={t.team.situationDiscreetHint}>
        <ToggleField
          label={t.team.situationDiscreet}
          value={draft.discreet}
          onChange={(discreet) => setDraft({ ...draft, discreet })}
          isLast
        />
      </FieldGroup>

      <div className="mt-6">
        <div className="tn-card mx-4 overflow-hidden">
          <DestructiveRow
            label={
              armed
                ? es
                  ? 'Tocá otra vez para eliminar'
                  : 'Tap again to delete'
                : es
                  ? 'Eliminar situación'
                  : 'Delete situation'
            }
            onClick={() => {
              if (armed) {
                disarm();
                onDelete();
              } else {
                arm();
              }
            }}
          />
        </div>
      </div>
    </EditSheet>
  );
}
