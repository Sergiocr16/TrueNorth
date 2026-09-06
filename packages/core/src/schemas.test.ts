import { describe, expect, it } from 'vitest';
import { dailyPlanSchema, restDayPlanSchema } from './schemas';

const item = (extra: Record<string, unknown> = {}) => ({
  title: 'Leer sobre observabilidad',
  why: 'El objetivo 2 arranca sin líneas base',
  estimatedMinutes: 45,
  signalIds: ['rest_day:2026-09-05'],
  ...extra,
});

describe('plan contracts (ADR-012)', () => {
  it('keeps the working-day plan at three to five actions', () => {
    expect(dailyPlanSchema.safeParse({ headline: 'Hoy', why: 'Porque', items: [item(), item()], consequenceIfNotDone: 'Se atrasa' }).success).toBe(false);
    expect(dailyPlanSchema.safeParse({ headline: 'Hoy', why: 'Porque', items: [item(), item(), item()], consequenceIfNotDone: 'Se atrasa' }).success).toBe(true);
  });

  it('lets a rest day be one to three light suggestions, with no deadline and nothing owed', () => {
    expect(restDayPlanSchema.safeParse({ headline: 'Sábado', why: 'Nada urge', items: [item()] }).success).toBe(true);
    expect(restDayPlanSchema.safeParse({ headline: 'Sábado', why: 'Nada urge', items: [item(), item(), item(), item()] }).success).toBe(false);
    expect(restDayPlanSchema.safeParse({ headline: 'Sábado', why: 'Nada urge', items: [item({ deadlineTime: '14:00' })] }).success).toBe(false);
    expect(restDayPlanSchema.safeParse({ headline: 'Sábado', why: 'Nada urge', items: [item({ estimatedMinutes: 180 })] }).success).toBe(false);
  });
});
