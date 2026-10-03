// In-memory mock of hour entries (UC-018, UC-019). Synthetic data only (BR-090).
// This file does not import mocks/data.ts (no import cycle): callers pass in the partners.
import type { HourEntry, HoursTotals, Partner } from '../api/types';

export interface HoursState {
  entries: HourEntry[];
  nextId: number;
}

export function hourEntryId(n: number): string {
  return `00000000-0000-4000-8000-${String(900000000000 + n)}`;
}

/** Hours state with the given entries (copied); the next id continues after them. */
export function hoursStateWith(entries: HourEntry[]): HoursState {
  return { entries: entries.map((e) => ({ ...e })), nextId: entries.length + 1 };
}

/** Seed: a few entries for the current year and one for the previous year. */
export function seedHours(partners: Partner[]): HoursState {
  const year = new Date().getFullYear();
  const [a, b, c] = partners;
  const rows: [string | undefined, string, string, number][] = [
    [a?.id, `${year}-01-08`, 'Planning', 2],
    [a?.id, `${year}-01-20`, 'Admin', 1.5],
    [a?.id, `${year}-02-03`, 'Rehearsal', 3],
    [a?.id, `${year}-03-12`, 'Client meeting', 0.75],
    [b?.id, `${year}-01-15`, 'Sound check', 4],
    [b?.id, `${year}-03-01`, 'Planning', 1.25],
    [c?.id, `${year}-02-10`, 'Admin', 2.5],
    [a?.id, `${year - 1}-11-05`, 'Planning', 1],
  ];
  const entries = rows
    .filter((row): row is [string, string, string, number] => Boolean(row[0]))
    .map(([partnerId, date, comment, hours], i) => ({ id: hourEntryId(i + 1), partnerId, date, comment, hours }));
  return hoursStateWith(entries);
}

/** Hours per partner per month for `year` (every partner, zeros when none). */
export function hoursTotals(state: HoursState, partners: Partner[], year: number): HoursTotals {
  const rows = partners.map((p) => {
    const months = Array.from({ length: 12 }, () => 0);
    for (const e of state.entries) {
      if (e.partnerId !== p.id || !e.date.startsWith(`${year}-`)) continue;
      const month = Number(e.date.slice(5, 7));
      months[month - 1] = (months[month - 1] ?? 0) + e.hours;
    }
    return { partnerId: p.id, months, total: months.reduce((s, h) => s + h, 0) };
  });
  return { year, partners: rows, grandTotal: rows.reduce((s, p) => s + p.total, 0) };
}
