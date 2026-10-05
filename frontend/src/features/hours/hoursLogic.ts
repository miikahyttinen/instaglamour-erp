import type { FieldCode } from '../../api/enums';
import type { HourEntry, HourEntryCreate } from '../../api/types';
import { isValidHours, parseHours } from '../../lib/hours';

// The input helpers moved to lib/hours.ts (shared with InlineHours); re-exported here.
export { hoursToInput, isValidHours, parseHours } from '../../lib/hours';

export interface HourFormValues {
  date: string;
  comment: string;
  hours: string;
}

/** Client-side check with the same field codes as the API. */
export function validateHourForm(values: HourFormValues): {
  fields: Partial<Record<keyof HourEntryCreate, FieldCode>>;
  body: HourEntryCreate | null;
} {
  const fields: Partial<Record<keyof HourEntryCreate, FieldCode>> = {};
  if (!values.date) fields.date = 'REQUIRED';
  else if (!/^\d{4}-\d{2}-\d{2}$/.test(values.date)) fields.date = 'INVALID_DATE';
  const comment = values.comment.trim();
  if (!comment) fields.comment = 'REQUIRED';
  else if (comment.length > 500) fields.comment = 'TOO_LONG';
  let hours: number | null = null;
  if (!values.hours.trim()) fields.hours = 'REQUIRED';
  else {
    hours = parseHours(values.hours);
    if (hours === null || !isValidHours(hours)) fields.hours = 'INVALID_HOURS';
  }
  if (Object.keys(fields).length > 0 || hours === null) return { fields, body: null };
  return { fields, body: { date: values.date, comment, hours } };
}

export function sumHours(entries: readonly HourEntry[]): number {
  return entries.reduce((sum, e) => sum + e.hours, 0);
}

export type HourSortKey = 'date' | 'partner' | 'comment' | 'hours';
export type HourSortDirection = 'asc' | 'desc';
export interface HourSort {
  key: HourSortKey;
  dir: HourSortDirection;
}

/** Default order of the hours tables: oldest first (UC-018, UC-019). */
export const DEFAULT_HOUR_SORT: HourSort = { key: 'date', dir: 'asc' };

/** One row of an hours table: the entry, its partner's name and its creation rank. */
export interface HourRow {
  entry: HourEntry;
  partnerName: string;
  /** Creation order within the partner's list (higher = created later). */
  created: number;
}

/**
 * Table rows from one partner's `GET /api/hours` list. The API returns newest first (date, then
 * creation), so the creation rank is the reversed list position.
 */
export function toHourRows(entries: readonly HourEntry[], partnerName: string): HourRow[] {
  return entries.map((entry, i) => ({ entry, partnerName, created: entries.length - i }));
}

/**
 * Sorted copy: the chosen column in the chosen direction; ties always by date (oldest first),
 * then partner name, then creation order.
 */
export function sortHourRows(rows: readonly HourRow[], sort: HourSort, locale?: string): HourRow[] {
  const text = (a: string, b: string) => a.localeCompare(b, locale, { sensitivity: 'base' });
  const byDate = (a: HourRow, b: HourRow) =>
    a.entry.date < b.entry.date ? -1 : a.entry.date > b.entry.date ? 1 : 0;
  const primary = (a: HourRow, b: HourRow): number => {
    switch (sort.key) {
      case 'date':
        return byDate(a, b);
      case 'partner':
        return text(a.partnerName, b.partnerName);
      case 'comment':
        return text(a.entry.comment, b.entry.comment);
      case 'hours':
        return a.entry.hours - b.entry.hours;
    }
  };
  const dir = sort.dir === 'asc' ? 1 : -1;
  return [...rows].sort(
    (a, b) =>
      dir * primary(a, b) || byDate(a, b) || text(a.partnerName, b.partnerName) || a.created - b.created,
  );
}

/** Next sort after clicking a column header: same column flips, another column starts ascending. */
export function nextHourSort(current: HourSort, key: HourSortKey): HourSort {
  if (current.key === key) return { key, dir: current.dir === 'asc' ? 'desc' : 'asc' };
  return { key, dir: 'asc' };
}
