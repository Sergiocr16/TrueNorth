'use client';

import { useState } from 'react';
import type { LeadMinutes, Reminder } from '@truenorth/core';
import { LEAD_OPTIONS, remindersOn, todayIso } from '@truenorth/core';
import { Card, SectionLabel, TextButton } from './ui';
import {
  DateField,
  DestructiveRow,
  EditSheet,
  FieldGroup,
  SelectField,
  TextAreaField,
  TextField,
  TimeField,
  useConfirm,
} from './form';
import { CheckIcon, Chevron, ClockIcon } from './icons';
import { formatShortDate } from '../lib/i18n/dictionary';
import { usePreferences } from '../lib/preferences';
import { makeReminder, useStore } from '../lib/store';

/**
 * Personal reminders on screen: a row, the editor, and the strip Today shows
 * when the day has any. The Reminders screen composes the same pieces.
 */

/** One reminder: a done circle, the title, when, and the note. */
export function ReminderRow({
  reminder,
  isLast = false,
  onOpen,
}: {
  reminder: Reminder;
  isLast?: boolean;
  onOpen: () => void;
}) {
  const { t, locale } = usePreferences();
  const store = useStore();
  const done = Boolean(reminder.doneAt);
  return (
    <div className={`flex items-start gap-3 px-4 py-3 ${isLast ? '' : 'tn-hairline'}`}>
      <button
        type="button"
        onClick={() => store.setReminderDone(reminder.id, !done)}
        aria-pressed={done}
        aria-label={t.reminders.done}
        className="tn-press mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2"
        style={{
          borderColor: done ? 'var(--green)' : 'var(--compass-ring)',
          background: done ? 'var(--green)' : 'transparent',
          color: 'var(--on-accent)',
        }}
      >
        {done ? <CheckIcon size={13} /> : null}
      </button>
      <button type="button" onClick={onOpen} className="tn-press flex min-w-0 flex-1 items-start gap-3 text-left">
        <span className="min-w-0 flex-1">
          <span
            className="block text-[17px] font-semibold leading-tight text-[var(--ink)]"
            style={done ? { textDecoration: 'line-through', opacity: 0.55 } : undefined}
          >
            {reminder.title}
          </span>
          <span className="tn-tabular mt-0.5 flex flex-wrap items-center gap-x-2 text-[13px] text-[var(--faint)]">
            <span className="inline-flex items-center gap-1">
              <ClockIcon /> {reminder.time}
            </span>
            <span>· {formatShortDate(reminder.date, locale)}</span>
            {reminder.note ? <span className="min-w-0 truncate">· {reminder.note}</span> : null}
          </span>
        </span>
        <span className="mt-1 shrink-0 text-[var(--ter)]">
          <Chevron />
        </span>
      </button>
    </div>
  );
}

/** Create or edit a reminder: what, when, and how early to be told. */
export function ReminderEditor({
  reminder,
  isNew = false,
  onCancel,
  onSave,
  onDelete,
}: {
  reminder: Reminder;
  isNew?: boolean;
  onCancel: () => void;
  onSave: (reminder: Reminder) => void;
  onDelete?: () => void;
}) {
  const { t } = usePreferences();
  const [draft, setDraft] = useState<Reminder>(reminder);
  const [confirming, arm, disarm] = useConfirm();

  return (
    <EditSheet
      open
      title={isNew ? t.reminders.new : t.reminders.edit}
      onCancel={onCancel}
      onSave={() => onSave({ ...draft, title: draft.title.trim(), note: draft.note.trim() })}
      canSave={draft.title.trim().length > 0 && draft.date.length > 0 && draft.time.length > 0}
    >
      <FieldGroup>
        <TextField
          label={t.reminders.titleField}
          value={draft.title}
          onChange={(title) => setDraft({ ...draft, title })}
        />
        <TextAreaField
          label={t.reminders.noteField}
          value={draft.note}
          onChange={(note) => setDraft({ ...draft, note })}
          rows={2}
          isLast
        />
      </FieldGroup>

      <FieldGroup>
        <DateField
          label={t.reminders.dateField}
          value={draft.date}
          onChange={(date) => setDraft({ ...draft, date: date ?? draft.date })}
        />
        <TimeField
          label={t.reminders.timeField}
          value={draft.time}
          onChange={(time) => setDraft({ ...draft, time: time ?? draft.time })}
        />
        <SelectField
          label={t.reminders.leadField}
          value={String(draft.leadMinutes)}
          options={LEAD_OPTIONS.map((n) => ({ value: String(n), label: t.reminders.leadOption(n) }))}
          onChange={(value) => setDraft({ ...draft, leadMinutes: Number(value) as LeadMinutes })}
          isLast
        />
      </FieldGroup>

      {onDelete ? (
        <div className="mt-6">
          <div className="tn-card mx-4 overflow-hidden">
            <DestructiveRow
              label={confirming ? t.reminders.deleteConfirm : t.reminders.delete}
              onClick={() => {
                if (confirming) {
                  disarm();
                  onDelete();
                } else {
                  arm();
                }
              }}
            />
          </div>
        </div>
      ) : null}
    </EditSheet>
  );
}

/** Today's reminders, on the Today screen, only when the day has any. */
export function TodayReminders() {
  const { t } = usePreferences();
  const store = useStore();
  const [editing, setEditing] = useState<{ reminder: Reminder; isNew: boolean } | null>(null);
  const today = remindersOn(store.reminders, todayIso());
  if (today.length === 0 && !editing) return null;

  return (
    <div className="mx-4 mt-3">
      {today.length > 0 ? (
        <>
          <SectionLabel
            action={
              <TextButton onClick={() => setEditing({ reminder: makeReminder(), isNew: true })}>
                {t.reminders.add}
              </TextButton>
            }
          >
            {t.reminders.todayStrip}
          </SectionLabel>
          <Card className="overflow-hidden">
            {today.map((reminder, index) => (
              <ReminderRow
                key={reminder.id}
                reminder={reminder}
                isLast={index === today.length - 1}
                onOpen={() => setEditing({ reminder, isNew: false })}
              />
            ))}
          </Card>
        </>
      ) : null}
      {editing ? (
        <ReminderEditor
          reminder={editing.reminder}
          isNew={editing.isNew}
          onCancel={() => setEditing(null)}
          onSave={(next) => {
            store.upsertReminder(next);
            setEditing(null);
          }}
          onDelete={
            editing.isNew
              ? undefined
              : () => {
                  store.deleteReminder(editing.reminder.id);
                  setEditing(null);
                }
          }
        />
      ) : null}
    </div>
  );
}
