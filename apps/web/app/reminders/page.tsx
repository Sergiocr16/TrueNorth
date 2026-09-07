'use client';

import { useState } from 'react';
import type { Reminder } from '@truenorth/core';
import { pastReminders, remindersOn, todayIso, upcomingReminders } from '@truenorth/core';
import { LargeTitle, Screen } from '../../components/shell';
import { Card, EmptyState, SectionLabel, TextButton } from '../../components/ui';
import { AddRow } from '../../components/form';
import { ReminderIcon } from '../../components/icons';
import { ReminderEditor, ReminderRow } from '../../components/reminders';
import { usePreferences } from '../../lib/preferences';
import { makeReminder, useRiskCount, useStore } from '../../lib/store';

/**
 * Reminders: today's, the ones ahead, and the ones behind on request. The
 * day is read when the screen renders, so a phone left open past midnight
 * still shows the right day.
 */
export default function RemindersPage() {
  const { t } = usePreferences();
  const store = useStore();
  const riskCount = useRiskCount();
  const [editing, setEditing] = useState<{ reminder: Reminder; isNew: boolean } | null>(null);
  const [showPast, setShowPast] = useState(false);

  const today = todayIso();
  const now = new Date();
  const ofToday = remindersOn(store.reminders, today);
  const upcoming = upcomingReminders(store.reminders, now).filter((r) => r.date !== today);
  const past = pastReminders(store.reminders, now).filter((r) => r.date !== today);

  const open = (reminder: Reminder) => setEditing({ reminder, isNew: false });
  const add = () => setEditing({ reminder: makeReminder(), isNew: true });

  const section = (title: string, list: Reminder[]) =>
    list.length > 0 ? (
      <div className="mx-4 mt-4">
        <SectionLabel>{title}</SectionLabel>
        <Card className="overflow-hidden">
          {list.map((reminder, index) => (
            <ReminderRow
              key={reminder.id}
              reminder={reminder}
              isLast={index === list.length - 1}
              onOpen={() => open(reminder)}
            />
          ))}
        </Card>
      </div>
    ) : null;

  return (
    <Screen riskCount={riskCount}>
      <LargeTitle title={t.reminders.title} subtitle={store.company.name} />

      {store.reminders.length === 0 ? (
        <Card className="mx-4 mt-4">
          <EmptyState icon={<ReminderIcon size={34} />} title={t.reminders.empty} body={t.reminders.emptyBody} />
        </Card>
      ) : null}

      {section(t.reminders.today, ofToday)}
      {section(t.reminders.upcoming, upcoming)}

      <div className="mx-4 mt-3">
        <Card className="overflow-hidden">
          <AddRow label={t.reminders.add} onClick={add} />
        </Card>
      </div>

      {past.length > 0 ? (
        <div className="mx-4 mt-3">
          <TextButton onClick={() => setShowPast((was) => !was)}>
            {showPast ? t.reminders.hidePast : t.reminders.showPast(past.length)}
          </TextButton>
        </div>
      ) : null}
      {showPast ? section(t.reminders.past, past) : null}

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
    </Screen>
  );
}
