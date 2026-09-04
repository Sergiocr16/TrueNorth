import { describe, expect, it } from 'vitest';
import { atMidnight, shiftIso, todayIso } from './dates';

describe('dates', () => {
  it('names the day in Costa Rica, not in UTC', () => {
    // 03:30 UTC is still the evening of the day before at UTC-6.
    expect(todayIso(new Date('2026-09-04T03:30:00Z'))).toBe('2026-09-03');
    expect(todayIso(new Date('2026-09-04T06:30:00Z'))).toBe('2026-09-04');
  });

  it('shifts across month and year ends', () => {
    expect(shiftIso('2026-03-01', -1)).toBe('2026-02-28');
    expect(shiftIso('2026-12-31', 1)).toBe('2027-01-01');
    expect(shiftIso('2026-09-04', -7)).toBe('2026-08-28');
  });

  it('parses an ISO day at local midnight', () => {
    const day = atMidnight('2026-09-03');
    expect(day.getHours()).toBe(0);
    expect(day.getDate()).toBe(3);
    expect(day.getMonth()).toBe(8);
  });
});
