/**
 * Offer statistics for the Tarjoukset KPI cards (docs/api-contract.md "Offer statistics", BR-122).
 *
 * Input: every non-deleted offer of all years, reduced to the few columns the figures need; one
 * pass over the rows (fine for thousands of offers). Pure and clock-free: the caller passes `now`.
 */
import { BUSINESS_TIME_ZONE, isoFromDate, todayIso } from '../domain/dates.js';
import { EVENT_TYPES } from '../domain/enums.js';
import type { EventType, OfferDisposition } from '../generated/prisma/client.js';

export interface OfferStatsRow {
  disposition: OfferDisposition;
  eventDate: Date;
  priceCents: number | null;
  eventType: EventType | null;
  createdAt: Date;
}

export interface OfferStats {
  createdByMonth: { month: string; count: number; valueCents: number }[];
  averageByCreatedYear: { year: number; averageCents: number | null; count: number }[];
  byEventYear: { year: number; count: number; valueCents: number }[];
  openValueByEventYear: { year: number; valueCents: number; count: number }[];
  openByEventType: { eventType: EventType | null; count: number; valueCents: number }[];
  winRate: {
    pct: number | null;
    won: number;
    decided: number;
    byEventType: { eventType: EventType; pct: number | null; won: number; decided: number }[];
  };
}

const helsinkiMonth = new Intl.DateTimeFormat('en-CA', { timeZone: BUSINESS_TIME_ZONE, year: 'numeric', month: '2-digit' });

/** `YYYY-MM` of an instant in Europe/Helsinki. */
export function helsinkiYearMonth(at: Date): string {
  const parts = helsinkiMonth.formatToParts(at);
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${get('year')}-${get('month')}`;
}

/** The `count` completed months before the month of `today` (YYYY-MM-DD), oldest first. */
export function completedMonths(today: string, count: number): string[] {
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7)); // 1…12
  const months: string[] = [];
  for (let back = count; back >= 1; back--) {
    const index = year * 12 + (month - 1) - back;
    months.push(`${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`);
  }
  return months;
}

/** Same rounding as the BR-106 summary: percent with one decimal; null when nothing decided. */
function pct(won: number, decided: number): number | null {
  return decided === 0 ? null : Math.round((won / decided) * 1000) / 10;
}

function range(from: number, to: number): number[] {
  return Array.from({ length: to - from + 1 }, (_, i) => from + i);
}

const isDecided = (d: OfferDisposition) => d !== 'PENDING' && d !== 'CANCELLED';

export function computeOfferStats(rows: readonly OfferStatsRow[], year: number, now: Date = new Date()): OfferStats {
  const today = todayIso(now);

  const months = completedMonths(today, 6);
  const byMonth = new Map(months.map((month) => [month, { month, count: 0, valueCents: 0 }]));

  const avgYears = new Map(range(year - 5, year).map((y) => [y, { year: y, sum: 0, count: 0 }]));
  const eventYears = new Map(range(year - 3, year + 2).map((y) => [y, { year: y, count: 0, valueCents: 0 }]));
  const openYears = new Map(range(year, year + 3).map((y) => [y, { year: y, valueCents: 0, count: 0 }]));
  const openTypes = new Map<EventType | null, { eventType: EventType | null; count: number; valueCents: number }>();
  const winByType = new Map(EVENT_TYPES.map((t) => [t, { eventType: t, won: 0, decided: 0 }]));
  let won = 0;
  let decided = 0;

  for (const o of rows) {
    const value = o.priceCents ?? 0;

    const createdMonth = helsinkiYearMonth(o.createdAt);
    const month = byMonth.get(createdMonth);
    if (month) {
      month.count++;
      month.valueCents += value;
    }
    if (o.priceCents !== null) {
      const avg = avgYears.get(Number(createdMonth.slice(0, 4)));
      if (avg) {
        avg.sum += o.priceCents;
        avg.count++;
      }
    }

    const eventIso = isoFromDate(o.eventDate);
    const eventYear = Number(eventIso.slice(0, 4));
    const ey = eventYears.get(eventYear);
    if (ey) {
      ey.count++;
      ey.valueCents += value;
    }

    // Open = PENDING and not expired (event date today or later, Helsinki) — BR-102.
    if (o.disposition === 'PENDING' && eventIso >= today) {
      const oy = openYears.get(eventYear);
      if (oy) {
        oy.valueCents += value;
        oy.count++;
      }
      let group = openTypes.get(o.eventType);
      if (!group) {
        group = { eventType: o.eventType, count: 0, valueCents: 0 };
        openTypes.set(o.eventType, group);
      }
      group.count++;
      group.valueCents += value;
    }

    if (isDecided(o.disposition)) {
      const isWon = o.disposition === 'WON';
      decided++;
      if (isWon) won++;
      const t = o.eventType ? winByType.get(o.eventType) : undefined;
      if (t) {
        t.decided++;
        if (isWon) t.won++;
      }
    }
  }

  // Ties: more offers first, then EVENT_TYPES order, "no type" last — so the order is stable.
  const typeRank = (t: EventType | null) => (t === null ? EVENT_TYPES.length : EVENT_TYPES.indexOf(t));
  const openByEventType = [...openTypes.values()].sort(
    (a, b) => b.valueCents - a.valueCents || b.count - a.count || typeRank(a.eventType) - typeRank(b.eventType),
  );

  return {
    createdByMonth: [...byMonth.values()],
    averageByCreatedYear: [...avgYears.values()].map((a) => ({
      year: a.year,
      averageCents: a.count === 0 ? null : Math.round(a.sum / a.count),
      count: a.count,
    })),
    byEventYear: [...eventYears.values()],
    openValueByEventYear: [...openYears.values()],
    openByEventType,
    winRate: {
      pct: pct(won, decided),
      won,
      decided,
      byEventType: [...winByType.values()].map((t) => ({ eventType: t.eventType, pct: pct(t.won, t.decided), won: t.won, decided: t.decided })),
    },
  };
}
