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

export interface MonthGroup {
  /** 1…12 */
  month: number;
  total: number;
  entries: HourEntry[];
}

/** Groups entries by month of `date`, newest month first; keeps the entry order within a month. */
export function groupByMonth(entries: HourEntry[]): MonthGroup[] {
  const map = new Map<number, MonthGroup>();
  for (const entry of entries) {
    const month = Number(entry.date.slice(5, 7));
    let group = map.get(month);
    if (!group) {
      group = { month, total: 0, entries: [] };
      map.set(month, group);
    }
    group.entries.push(entry);
    group.total += entry.hours;
  }
  return [...map.values()].sort((a, b) => b.month - a.month);
}

export function sumHours(entries: HourEntry[]): number {
  return entries.reduce((sum, e) => sum + e.hours, 0);
}

/** Hours per month (index 0 = January) of the given entries, for the month bar chart. */
export function monthTotals(entries: HourEntry[]): number[] {
  const totals = Array.from({ length: 12 }, () => 0);
  for (const entry of entries) {
    const month = Number(entry.date.slice(5, 7));
    if (month >= 1 && month <= 12) totals[month - 1] = (totals[month - 1] ?? 0) + entry.hours;
  }
  return totals;
}
