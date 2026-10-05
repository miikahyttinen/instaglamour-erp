import type { FieldCode } from '../../api/enums';
import type { HourEntry, HourEntryCreate, HoursTotals, Id, Partner } from '../../api/types';
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

export interface PartnerHoursRow {
  partnerId: Id;
  name: string;
  total: number;
}

/**
 * Rows of the hours summary (UC-019): every partner of the totals response plus any reference
 * partner it lacks (0 h), sorted by year hours (most first), then by name.
 */
export function partnerHourRows(
  totals: HoursTotals,
  partners: readonly Pick<Partner, 'id' | 'name'>[],
  unknownName: string,
  locale?: string,
): PartnerHoursRow[] {
  const nameOf = new Map(partners.map((p) => [p.id, p.name]));
  const rows = totals.partners.map((row) => ({
    partnerId: row.partnerId,
    name: nameOf.get(row.partnerId) ?? unknownName,
    total: row.total,
  }));
  for (const p of partners) {
    if (!rows.some((r) => r.partnerId === p.id)) {
      rows.push({ partnerId: p.id, name: p.name, total: 0 });
    }
  }
  return rows.sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, locale));
}
