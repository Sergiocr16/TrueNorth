/**
 * Dates, in the one time zone the product lives in.
 *
 * Everything user-facing is a calendar day in Costa Rica: the plan is "today's"
 * plan, the timer fires at 02:00 local, and a task is overdue relative to the
 * local date. The server and the browser must agree on what "today" is, so
 * both go through here rather than through `new Date()` directly.
 */

export const TIME_ZONE = 'America/Costa_Rica';

/** ISO date (YYYY-MM-DD) for "now" in the product's time zone. */
export function todayIso(now: Date = new Date(), timeZone: string = TIME_ZONE): string {
  // en-CA formats as YYYY-MM-DD, which is exactly the ISO date we want.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/** Midnight local of an ISO date, as a Date usable for arithmetic. */
export function atMidnight(iso: string): Date {
  return new Date(`${iso}T00:00:00`);
}

/** ISO date shifted by a number of days. */
export function shiftIso(iso: string, days: number): string {
  const date = atMidnight(iso);
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}`;
}
