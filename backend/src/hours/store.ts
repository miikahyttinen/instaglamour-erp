/**
 * Hour entries (UC-018, UC-019; BR-050, BR-051, BR-083). `loadHoursTotals` is the single source of
 * the year's hour sums: `GET /api/hours/totals` and the year page both use it.
 */
import { isoFromDate } from '../domain/dates.js';
import type { HourEntry } from '../generated/prisma/client.js';
import { yearDateRange, type Tx } from '../events/store.js';

/** BR-050: 0.25…24 in 0.25 steps. */
export function isValidHours(value: number): boolean {
  return Number.isFinite(value) && value >= 0.25 && value <= 24 && Number.isInteger(value * 4);
}

/** Hours are stored as a decimal of quarter hours; counting quarters keeps sums exact. */
function quarters(entry: { hours: HourEntry['hours'] }): number {
  return Math.round(Number(entry.hours) * 4);
}

export interface HourEntryDto {
  id: string;
  partnerId: string;
  date: string;
  comment: string;
  hours: number;
}

export function toHourEntryDto(entry: HourEntry): HourEntryDto {
  return {
    id: entry.id,
    partnerId: entry.partnerId,
    date: isoFromDate(entry.date),
    comment: entry.comment,
    hours: quarters(entry) / 4,
  };
}

export interface HoursTotals {
  year: number;
  partners: { partnerId: string; months: number[]; total: number }[];
  grandTotal: number;
}

/** Every partner (sorted by name, zeros included) with 12 monthly totals, the year total and the grand total. */
export async function loadHoursTotals(db: Tx, year: number): Promise<HoursTotals> {
  const [partners, entries] = await Promise.all([
    db.partner.findMany({ select: { id: true }, orderBy: [{ person: { name: 'asc' } }, { id: 'asc' }] }),
    db.hourEntry.findMany({ where: { date: yearDateRange(year) }, select: { partnerId: true, date: true, hours: true } }),
  ]);
  const byPartner = new Map(partners.map((p) => [p.id, new Array<number>(12).fill(0)]));
  for (const entry of entries) {
    const months = byPartner.get(entry.partnerId);
    if (months) months[entry.date.getUTCMonth()]! += quarters(entry);
  }
  let grandQuarters = 0;
  const rows = partners.map((p) => {
    const months = byPartner.get(p.id)!;
    const totalQuarters = months.reduce((sum, q) => sum + q, 0);
    grandQuarters += totalQuarters;
    return { partnerId: p.id, months: months.map((q) => q / 4), total: totalQuarters / 4 };
  });
  return { year, partners: rows, grandTotal: grandQuarters / 4 };
}
