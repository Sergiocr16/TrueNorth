import { describe, expect, it } from 'vitest';
import {
  dueReminders,
  minutesUntil,
  nextRoundHour,
  pastReminders,
  reminderAt,
  remindersOn,
  sortReminders,
  upcomingReminders,
} from './reminders';
import type { Reminder } from './types';

// 09:04 in Costa Rica.
const NOW = new Date('2026-09-07T15:04:00Z');

const reminder = (overrides: Partial<Reminder> = {}): Reminder => ({
  id: 'rm_1',
  title: 'Llamar al banco',
  note: '',
  date: '2026-09-07',
  time: '09:15',
  leadMinutes: 10,
  doneAt: null,
  notifiedAt: null,
  createdAt: '2026-09-06T12:00:00Z',
  ...overrides,
});

describe('reminders', () => {
  it('reads the time in Costa Rica whatever the machine clock is', () => {
    expect(reminderAt({ date: '2026-09-07', time: '09:15' }).toISOString()).toBe('2026-09-07T15:15:00.000Z');
    expect(minutesUntil({ date: '2026-09-07', time: '09:15' }, NOW)).toBe(11);
  });

  it('is due from the lead until a few minutes after, and never later', () => {
    expect(dueReminders([reminder({ time: '09:05', leadMinutes: 10 })], NOW).length).toBe(1);
    expect(dueReminders([reminder({ time: '09:14', leadMinutes: 10 })], NOW).length).toBe(1);
    // Five minutes' lead on a 09:15 reminder starts at 09:10: not yet.
    expect(dueReminders([reminder({ time: '09:15', leadMinutes: 5 })], NOW)).toEqual([]);
    // 08:50 was more than the grace ago: stale, never sent.
    expect(dueReminders([reminder({ time: '08:50', leadMinutes: 5 })], NOW)).toEqual([]);
    // The grace boundary is inclusive.
    expect(dueReminders([reminder({ time: '08:59', leadMinutes: 5 })], NOW).length).toBe(1);
  });

  it('leaves alone what is done or already notified', () => {
    expect(dueReminders([reminder({ time: '09:05', doneAt: '2026-09-07T14:00:00Z' })], NOW)).toEqual([]);
    expect(dueReminders([reminder({ time: '09:05', notifiedAt: '2026-09-07T14:55:00Z' })], NOW)).toEqual([]);
  });

  it('splits a list into today, upcoming and past without overlap', () => {
    const list = [
      reminder({ id: 'a', date: '2026-09-07', time: '08:00' }),
      reminder({ id: 'b', date: '2026-09-07', time: '11:00' }),
      reminder({ id: 'c', date: '2026-09-08', time: '09:00' }),
      reminder({ id: 'd', date: '2026-09-06', time: '09:00', doneAt: '2026-09-06T15:30:00Z' }),
      reminder({ id: 'e', date: '2026-09-07', time: '17:00', doneAt: '2026-09-07T14:00:00Z' }),
    ];
    expect(remindersOn(list, '2026-09-07').map((r) => r.id)).toEqual(['a', 'b', 'e']);
    expect(upcomingReminders(list, NOW).map((r) => r.id)).toEqual(['b', 'c']);
    expect(pastReminders(list, NOW).map((r) => r.id)).toEqual(['e', 'a', 'd']);
  });

  it('sorts by day, then time', () => {
    const list = [
      reminder({ id: 'late', date: '2026-09-08', time: '08:00' }),
      reminder({ id: 'evening', date: '2026-09-07', time: '18:00' }),
      reminder({ id: 'morning', date: '2026-09-07', time: '07:30' }),
    ];
    expect(sortReminders(list).map((r) => r.id)).toEqual(['morning', 'evening', 'late']);
  });

  it('starts a new reminder at the next round hour, rolling over midnight', () => {
    expect(nextRoundHour(NOW)).toEqual({ date: '2026-09-07', time: '10:00' });
    // 23:30 in Costa Rica is 05:30 UTC the next day.
    expect(nextRoundHour(new Date('2026-09-08T05:30:00Z'))).toEqual({ date: '2026-09-08', time: '00:00' });
  });
});
