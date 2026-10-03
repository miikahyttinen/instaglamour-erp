/**
 * Date helpers. Business dates ("today", the current year) are evaluated in the
 * business time zone so that e.g. "played" flips at local midnight, not UTC midnight.
 */
export const BUSINESS_TIME_ZONE = 'Europe/Helsinki';

/** Today's date as `YYYY-MM-DD` in the business time zone. */
export function todayIso(now: Date = new Date()): string {
  // en-CA formats as YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: BUSINESS_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

export function currentYear(now: Date = new Date()): number {
  return Number(todayIso(now).slice(0, 4));
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** True for a real calendar date in `YYYY-MM-DD` form. */
export function isIsoDate(value: string): boolean {
  const m = ISO_DATE.exec(value);
  if (!m) return false;
  const d = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

/** `YYYY-MM-DD` → Date at UTC midnight (how Prisma represents `@db.Date`). */
export function dateFromIso(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

/** Date from a `@db.Date` column → `YYYY-MM-DD`. */
export function isoFromDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}
