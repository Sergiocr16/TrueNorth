import { TIME_ZONE, TIME_ZONE_OFFSET, shiftIso, todayIso } from './dates';
import type { LeadMinutes, Reminder } from './types';

/**
 * Personal reminders: a title, a day and a time in Costa Rica, and a push a
 * few minutes before. Everything about *when* is decided here, with the
 * clock injected, so the route on the Pi and the screen on the phone agree
 * and the tests can freeze time.
 *
 * A reminder that is late by more than a few minutes is never sent: a late
 * reminder is noise, not help.
 */

export const DEFAULT_LEAD_MINUTES: LeadMinutes = 10;
/** How late a reminder may still go out. */
export const DEFAULT_GRACE_MINUTES = 5;

const MINUTE = 60_000;

/** The instant a reminder is for, in the product's zone whatever the machine's is. */
export function reminderAt(reminder: Pick<Reminder, 'date' | 'time'>): Date {
  return new Date(`${reminder.date}T${reminder.time}:00${TIME_ZONE_OFFSET}`);
}

/** Minutes from now to the reminder; negative once it has passed. */
export function minutesUntil(reminder: Pick<Reminder, 'date' | 'time'>, now: Date): number {
  return Math.round((reminderAt(reminder).getTime() - now.getTime()) / MINUTE);
}

/** Day, then time, then id: the same order in every list. */
export function sortReminders(list: Reminder[]): Reminder[] {
  return [...list].sort(
    (a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time) || a.id.localeCompare(b.id),
  );
}

/**
 * The reminders to push now: not done, not yet notified, and inside the
 * window from `lead` minutes before to `grace` minutes after their time.
 */
export function dueReminders(list: Reminder[], now: Date, graceMinutes = DEFAULT_GRACE_MINUTES): Reminder[] {
  const at = now.getTime();
  return sortReminders(list).filter((r) => {
    if (r.doneAt || r.notifiedAt) return false;
    const due = reminderAt(r).getTime();
    return at >= due - r.leadMinutes * MINUTE && at <= due + graceMinutes * MINUTE;
  });
}

/** Every reminder of a day, done or not. */
export function remindersOn(list: Reminder[], iso: string): Reminder[] {
  return sortReminders(list).filter((r) => r.date === iso);
}

/** Still ahead and not done, soonest first. */
export function upcomingReminders(list: Reminder[], now: Date): Reminder[] {
  return sortReminders(list).filter((r) => !r.doneAt && reminderAt(r).getTime() >= now.getTime());
}

/** Done, or already behind, most recent first. */
export function pastReminders(list: Reminder[], now: Date): Reminder[] {
  return sortReminders(list)
    .filter((r) => Boolean(r.doneAt) || reminderAt(r).getTime() < now.getTime())
    .reverse();
}

/** The next round hour in Costa Rica, as a day and a time — where a new reminder starts. */
export function nextRoundHour(now: Date = new Date()): { date: string; time: string } {
  const date = todayIso(now);
  const hour = Number(
    new Intl.DateTimeFormat('en-US', { hour: 'numeric', hourCycle: 'h23', timeZone: TIME_ZONE }).format(now),
  );
  const next = hour + 1;
  if (next >= 24) return { date: shiftIso(date, 1), time: '00:00' };
  return { date, time: `${String(next).padStart(2, '0')}:00` };
}
