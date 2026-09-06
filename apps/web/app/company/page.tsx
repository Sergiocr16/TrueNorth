'use client';

import { useState } from 'react';
import type { CompanySchedule, Weekday } from '@truenorth/core';
import { daysUntil, formatShortDate, weekdayName } from '../../lib/i18n/dictionary';
import { CompanyLogoPicker } from '../../components/company-switcher';
import { HealthCompass } from '../../components/day-compass';
import { LargeTitle, Screen } from '../../components/shell';
import { Card, SectionLabel, StatusPill, TextButton } from '../../components/ui';
import { DateField, EditSheet, FieldGroup, TextAreaField, TextField, ToggleField } from '../../components/form';
import { usePreferences } from '../../lib/preferences';
import { useRiskCount, useStore } from '../../lib/store';
import { WEEKDAYS, companySchedule, shareHealthy, todayIso } from '@truenorth/core';

export default function CompanyPage() {
  const { t, locale } = usePreferences();
  const store = useStore();
  const riskCount = useRiskCount();
  const { company, objectives } = store;

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(company);
  const [editingSchedule, setEditingSchedule] = useState(false);
  const schedule = companySchedule(company);

  const open = () => {
    setDraft(company);
    setEditing(true);
  };

  const save = () => {
    store.updateCompany(draft);
    setEditing(false);
  };

  const counts = {
    on_track: objectives.filter((o) => o.status === 'on_track').length,
    at_risk: objectives.filter((o) => o.status === 'at_risk').length,
    late: objectives.filter((o) => o.status === 'late').length,
    done: objectives.filter((o) => o.status === 'done').length,
  } as const;

  return (
    <Screen riskCount={riskCount}>
      <LargeTitle
        title={t.nav.company}
        subtitle={company.name}
        trailing={<HealthCompass ratio={shareHealthy(objectives)} label={t.common.health} />}
      />

      <div className="mt-3">
        <CompanyLogoPicker />
      </div>

      <div className="mx-4 mt-4">
        <SectionLabel action={<TextButton onClick={open}>{t.team.editRole}</TextButton>}>
          {t.company.northStar}
        </SectionLabel>
        <Card className="p-4">
          <p className="text-[20px] font-semibold leading-snug tracking-[-0.2px] text-[var(--ink)] text-pretty">
            {company.northStar}
          </p>
          {/* A company starts empty: no deadline until somebody sets one. */}
          {company.northStarDeadline ? (
            <div className="mt-3 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[15px] text-[var(--sec)]">
              <span className="text-[13px] font-semibold uppercase tracking-[0.6px] text-[var(--ter)]">
                {t.company.deadline}
              </span>
              <span className="tn-tabular font-semibold text-[var(--ink)]">
                {formatShortDate(company.northStarDeadline, locale)}
              </span>
              <span className="tn-tabular">
                · {t.company.daysLeft(daysUntil(company.northStarDeadline, todayIso()))}
              </span>
            </div>
          ) : null}
        </Card>
      </div>

      <div className="mx-4 mt-4">
        <SectionLabel>{t.company.overall}</SectionLabel>
        <Card className="flex flex-wrap gap-2 p-4">
          {(['on_track', 'at_risk', 'late', 'done'] as const).map((status) =>
            counts[status] > 0 ? (
              <span key={status} className="inline-flex items-center gap-1.5">
                <StatusPill status={status} size="sm" />
                <span className="tn-tabular text-[15px] font-semibold text-[var(--ink)]">
                  {counts[status]}
                </span>
              </span>
            ) : null,
          )}
          {objectives.length === 0 ? (
            <span className="text-[15px] text-[var(--ter)]">{t.risks.none}</span>
          ) : null}
        </Card>
      </div>

      <div className="mx-4 mt-4">
        <SectionLabel>{t.company.plans}</SectionLabel>
        <Card className="overflow-hidden">
          {(
            [
              ['m3', t.company.plan3],
              ['m6', t.company.plan6],
              ['m12', t.company.plan12],
            ] as const
          ).map(([key, label], index) => (
            <div key={key} className={`px-4 py-3 ${index === 2 ? '' : 'tn-hairline'}`}>
              <div className="text-[13px] font-semibold uppercase tracking-[0.6px] text-[var(--ter)]">
                {label}
              </div>
              <p className="mt-1 text-[17px] leading-snug text-[var(--ink)]">
                {company.plans[key] || '—'}
              </p>
            </div>
          ))}
        </Card>
      </div>

      {/* The week (ADR-012): which days are working days, and the focus of
          any day that has one. The role never changes with the day. */}
      <div className="mx-4 mt-4">
        <SectionLabel
          action={<TextButton onClick={() => setEditingSchedule(true)}>{t.company.editSchedule}</TextButton>}
        >
          {t.company.schedule}
        </SectionLabel>
        <Card className="overflow-hidden">
          {WEEKDAYS.map((day, index) => {
            const working = schedule.workingDays.includes(day);
            const focus = schedule.focus[day];
            return (
              <div key={day} className={`flex items-baseline gap-3 px-4 py-3 ${index === 6 ? '' : 'tn-hairline'}`}>
                <span className="w-24 shrink-0 text-[17px] text-[var(--ink)]">{weekdayName(day, locale)}</span>
                <span
                  className={`min-w-0 flex-1 text-[15px] leading-snug ${working && focus ? 'text-[var(--ink)]' : 'text-[var(--ter)]'}`}
                >
                  {working ? (focus ?? t.company.normalDay) : t.company.restDayMode}
                </span>
              </div>
            );
          })}
        </Card>
        <p className="px-5 pt-2 text-[13px] leading-snug text-[var(--ter)]">{t.company.scheduleHint}</p>
      </div>

      {editingSchedule ? (
        <ScheduleSheet
          initial={schedule}
          onCancel={() => setEditingSchedule(false)}
          onSave={(next) => {
            store.updateCompany({ schedule: next });
            setEditingSchedule(false);
          }}
        />
      ) : null}

      <EditSheet
        open={editing}
        title={t.nav.company}
        onCancel={() => setEditing(false)}
        onSave={save}
        canSave={draft.northStar.trim().length > 0}
      >
        <FieldGroup header={t.company.northStar} footer={t.company.northStarHint}>
          <TextAreaField
            label={t.company.northStar}
            value={draft.northStar}
            onChange={(northStar) => setDraft({ ...draft, northStar })}
            rows={3}
          />
          <DateField
            label={t.company.deadline}
            value={draft.northStarDeadline}
            onChange={(value) => setDraft({ ...draft, northStarDeadline: value ?? '' })}
            isLast
          />
        </FieldGroup>

        <FieldGroup header={t.company.plans}>
          <TextAreaField
            label={t.company.plan3}
            value={draft.plans.m3}
            onChange={(m3) => setDraft({ ...draft, plans: { ...draft.plans, m3 } })}
            rows={2}
          />
          <TextAreaField
            label={t.company.plan6}
            value={draft.plans.m6}
            onChange={(m6) => setDraft({ ...draft, plans: { ...draft.plans, m6 } })}
            rows={2}
          />
          <TextAreaField
            label={t.company.plan12}
            value={draft.plans.m12}
            onChange={(m12) => setDraft({ ...draft, plans: { ...draft.plans, m12 } })}
            rows={2}
            isLast
          />
        </FieldGroup>
      </EditSheet>
    </Screen>
  );
}

/**
 * The week, one row per day: a switch for rest, and notes for the day if
 * anybody wants to add some. Notes are hidden behind "add" so a plain week
 * is seven switches, not fourteen fields.
 */
function ScheduleSheet({
  initial,
  onCancel,
  onSave,
}: {
  initial: CompanySchedule;
  onCancel: () => void;
  onSave: (schedule: CompanySchedule) => void;
}) {
  const { t, locale } = usePreferences();
  const [draft, setDraft] = useState<CompanySchedule>(initial);
  const [noting, setNoting] = useState<Weekday[]>(WEEKDAYS.filter((day) => Boolean(initial.focus[day])));

  return (
    <EditSheet
      open
      title={t.company.schedule}
      onCancel={onCancel}
      onSave={() => onSave(companySchedule({ schedule: draft }))}
      canSave={draft.workingDays.length > 0}
    >
      <FieldGroup
        header={t.company.restDays}
        footer={draft.workingDays.length === 0 ? t.company.atLeastOneDay : t.company.scheduleHint}
      >
        {WEEKDAYS.map((day, index) => {
          const rest = !draft.workingDays.includes(day);
          return (
            <div key={day} className={index === 6 ? '' : 'tn-hairline'}>
              <ToggleField
                label={weekdayName(day, locale)}
                description={rest ? t.company.restDayMode : t.company.normalDay}
                value={rest}
                onChange={(on) =>
                  setDraft({
                    ...draft,
                    workingDays: on ? draft.workingDays.filter((d) => d !== day) : [...draft.workingDays, day],
                  })
                }
                isLast
              />
              {noting.includes(day) ? (
                <TextField
                  label={t.company.notes}
                  value={draft.focus[day] ?? ''}
                  onChange={(text) => setDraft({ ...draft, focus: { ...draft.focus, [day]: text } })}
                  isLast
                />
              ) : (
                <div className="-mt-1 px-4 pb-1">
                  <TextButton onClick={() => setNoting([...noting, day])}>{t.company.addNotes}</TextButton>
                </div>
              )}
            </div>
          );
        })}
      </FieldGroup>
    </EditSheet>
  );
}
