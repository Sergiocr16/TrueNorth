import { describe, expect, it } from 'vitest';
import { companySchedule, resolveDay } from './schedule';

const SAT = '2026-09-05';
const SUN = '2026-09-06';
const MON = '2026-09-07';
const TUE = '2026-09-08';

describe('the week (ADR-012)', () => {
  it('works Monday to Friday when nobody said otherwise', () => {
    expect(resolveDay({}, null, MON)).toEqual({
      iso: MON,
      weekday: 'mon',
      working: true,
      focus: null,
      focusSource: null,
    });
    expect(resolveDay({}, null, SAT).working).toBe(false);
    expect(resolveDay({}, null, SUN).working).toBe(false);
  });

  it('lets the company choose its working days', () => {
    const company = { schedule: { workingDays: ['mon' as const, 'sat' as const], focus: {} } };
    expect(resolveDay(company, null, SAT).working).toBe(true);
    expect(resolveDay(company, null, TUE).working).toBe(false);
  });

  it("prefers the role's focus, then the company's, and says whose it was", () => {
    const company = { schedule: { workingDays: [], focus: { mon: 'Planificar la semana' } } };
    const role = { schedule: { focus: { mon: 'Revisar los PRs pendientes' } } };
    expect(resolveDay(company, role, MON)).toMatchObject({ focus: 'Revisar los PRs pendientes', focusSource: 'role' });
    expect(resolveDay(company, null, MON)).toMatchObject({ focus: 'Planificar la semana', focusSource: 'company' });
    expect(resolveDay(company, { schedule: { focus: { mon: '   ' } } }, MON)).toMatchObject({
      focus: 'Planificar la semana',
      focusSource: 'company',
    });
    expect(resolveDay(company, role, TUE)).toMatchObject({ focus: null, focusSource: null });
  });

  it('returns a focus on a rest day too, as its theme', () => {
    const company = { schedule: { workingDays: [], focus: { sun: 'Leer sobre observabilidad' } } };
    expect(resolveDay(company, null, SUN)).toMatchObject({ working: false, focus: 'Leer sobre observabilidad' });
  });

  it('normalises what was written: week order, no repeats, no blank focus', () => {
    expect(
      companySchedule({
        schedule: { workingDays: ['fri', 'mon', 'mon'], focus: { tue: '  ', wed: ' Deuda técnica ' } },
      }),
    ).toEqual({ workingDays: ['mon', 'fri'], focus: { wed: 'Deuda técnica' } });
    expect(companySchedule({ schedule: { workingDays: [], focus: {} } }).workingDays).toEqual([
      'mon',
      'tue',
      'wed',
      'thu',
      'fri',
    ]);
  });
});
