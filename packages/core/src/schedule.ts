import { WEEKDAYS, weekdayOf } from './dates';
import type { Company, CompanySchedule, Role, Weekday } from './types';

/**
 * The week (ADR-012). A company says which days are working days and may
 * give any day a focus; a role may give a day a focus of its own. The role
 * never changes by day — only the character of the day does: on a working
 * day the person gets their plan, ordered by the focus when there is one;
 * on a rest day they get a few optional suggestions instead.
 */

export const DEFAULT_WORKING_DAYS: readonly Weekday[] = ['mon', 'tue', 'wed', 'thu', 'fri'];

export const WEEKDAY_NAMES: Record<Weekday, { es: string; en: string }> = {
  mon: { es: 'lunes', en: 'Monday' },
  tue: { es: 'martes', en: 'Tuesday' },
  wed: { es: 'miércoles', en: 'Wednesday' },
  thu: { es: 'jueves', en: 'Thursday' },
  fri: { es: 'viernes', en: 'Friday' },
  sat: { es: 'sábado', en: 'Saturday' },
  sun: { es: 'domingo', en: 'Sunday' },
};

/** What one date is for one role: working or not, and the focus that applies, if any. */
export interface DayResolution {
  iso: string;
  weekday: Weekday;
  working: boolean;
  focus: string | null;
  /** Whose focus won. */
  focusSource: 'role' | 'company' | null;
}

function cleanFocus(focus: Partial<Record<Weekday, string>> | undefined): Partial<Record<Weekday, string>> {
  const out: Partial<Record<Weekday, string>> = {};
  for (const day of WEEKDAYS) {
    const text = focus?.[day]?.trim();
    if (text) out[day] = text;
  }
  return out;
}

/**
 * The company's schedule as the app reads it: absent or empty working days
 * mean Monday to Friday; days in week order without repeats; blank focus
 * lines dropped.
 */
export function companySchedule(company: Pick<Company, 'schedule'>): CompanySchedule {
  const wanted = new Set(company.schedule?.workingDays ?? []);
  const workingDays = WEEKDAYS.filter((day) => wanted.has(day));
  return {
    workingDays: workingDays.length > 0 ? workingDays : [...DEFAULT_WORKING_DAYS],
    focus: cleanFocus(company.schedule?.focus),
  };
}

/** A role's focus lines, blank ones dropped. */
export function roleFocus(role: Pick<Role, 'schedule'> | null | undefined): Partial<Record<Weekday, string>> {
  return cleanFocus(role?.schedule?.focus);
}

/** The day for a role: the role's focus wins, then the company's; a focus is returned on a rest day too, as its theme. */
export function resolveDay(
  company: Pick<Company, 'schedule'>,
  role: Pick<Role, 'schedule'> | null | undefined,
  iso: string,
): DayResolution {
  const weekday = weekdayOf(iso);
  const schedule = companySchedule(company);
  const own = roleFocus(role)[weekday];
  const shared = schedule.focus[weekday];
  const focus = own ?? shared ?? null;
  return {
    iso,
    weekday,
    working: schedule.workingDays.includes(weekday),
    focus,
    focusSource: own ? 'role' : shared ? 'company' : null,
  };
}
