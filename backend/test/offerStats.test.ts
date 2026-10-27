/**
 * Offer statistics (api-contract "Offer statistics", BR-122; TASK-029).
 * Synthetic data only; money is multiples of 10000 cents.
 */
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { todayIso } from '../src/domain/dates.js';
import { newShareToken } from '../src/offers/shareToken.js';
import { completedMonths, computeOfferStats, helsinkiYearMonth, type OfferStatsRow } from '../src/offers/stats.js';
import { closeTestDb, resetDb, testApp, testDb } from './helpers.js';
import { call, startSession, type Json, type Session } from './eventFixtures.js';

// "Now" for the pure tests: 2026-10-20 13:00 in Helsinki.
const NOW = new Date('2026-10-20T10:00:00.000Z');

function row(overrides: Partial<Omit<OfferStatsRow, 'eventDate'>> & { eventDate?: Date | string } = {}): OfferStatsRow {
  const { eventDate, ...rest } = overrides;
  return {
    disposition: 'PENDING',
    priceCents: 100000,
    eventType: 'CORPORATE',
    createdAt: new Date('2026-05-15T09:00:00.000Z'),
    ...rest,
    eventDate: eventDate instanceof Date ? eventDate : new Date(`${eventDate ?? '2026-12-01'}T00:00:00.000Z`),
  };
}

describe('helpers', () => {
  it('completedMonths: the months before the current one, oldest first, across a year change', () => {
    expect(completedMonths('2026-10-20', 6)).toEqual(['2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09']);
    expect(completedMonths('2026-02-01', 6)).toEqual(['2025-08', '2025-09', '2025-10', '2025-11', '2025-12', '2026-01']);
    expect(completedMonths('2026-01-31', 2)).toEqual(['2025-11', '2025-12']);
  });

  it('helsinkiYearMonth uses Europe/Helsinki', () => {
    expect(helsinkiYearMonth(new Date('2026-09-30T21:30:00.000Z'))).toBe('2026-10'); // 00:30 EEST
    expect(helsinkiYearMonth(new Date('2026-09-30T20:30:00.000Z'))).toBe('2026-09');
    expect(helsinkiYearMonth(new Date('2025-12-31T22:30:00.000Z'))).toBe('2026-01'); // 00:30 EET
  });
});

describe('computeOfferStats', () => {
  it('empty: full series of zeros / nulls', () => {
    expect(computeOfferStats([], 2026, NOW)).toEqual({
      createdByMonth: ['2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09'].map((month) => ({
        month,
        count: 0,
        valueCents: 0,
      })),
      averageByCreatedYear: [2021, 2022, 2023, 2024, 2025, 2026].map((year) => ({ year, averageCents: null, count: 0 })),
      byEventYear: [2023, 2024, 2025, 2026, 2027, 2028].map((year) => ({ year, count: 0, valueCents: 0 })),
      openValueByEventYear: [2026, 2027, 2028, 2029].map((year) => ({ year, valueCents: 0, count: 0 })),
      openByEventType: [],
      winRate: {
        pct: null,
        won: 0,
        decided: 0,
        byEventType: [
          { eventType: 'PRIVATE', pct: null, won: 0, decided: 0 },
          { eventType: 'WEDDING', pct: null, won: 0, decided: 0 },
          { eventType: 'CORPORATE', pct: null, won: 0, decided: 0 },
        ],
      },
    });
  });

  it('createdByMonth: Helsinki month of createdAt; current month and older months left out; no price adds 0', () => {
    const stats = computeOfferStats(
      [
        row({ createdAt: new Date('2026-03-31T21:30:00.000Z'), priceCents: 10000 }), // 2026-04-01 Helsinki
        row({ createdAt: new Date('2026-03-31T20:30:00.000Z'), priceCents: 20000 }), // 2026-03 → outside
        row({ createdAt: new Date('2026-09-30T20:59:59.000Z'), priceCents: 30000 }), // 2026-09-30 23:59 → Sep
        row({ createdAt: new Date('2026-09-30T21:00:00.000Z'), priceCents: 40000 }), // 2026-10 → current month
        row({ createdAt: new Date('2026-09-10T10:00:00.000Z'), priceCents: null }),
      ],
      2026,
      NOW,
    );
    expect(stats.createdByMonth).toEqual([
      { month: '2026-04', count: 1, valueCents: 10000 },
      { month: '2026-05', count: 0, valueCents: 0 },
      { month: '2026-06', count: 0, valueCents: 0 },
      { month: '2026-07', count: 0, valueCents: 0 },
      { month: '2026-08', count: 0, valueCents: 0 },
      { month: '2026-09', count: 2, valueCents: 30000 },
    ]);
  });

  it('createdByMonth does not depend on the selected year', () => {
    const rows = [row({ createdAt: new Date('2026-06-10T10:00:00.000Z') })];
    expect(computeOfferStats(rows, 2020, NOW).createdByMonth).toEqual(computeOfferStats(rows, 2026, NOW).createdByMonth);
  });

  it('averageByCreatedYear: year-5…year by Helsinki creation year, priced offers only, rounded', () => {
    const stats = computeOfferStats(
      [
        row({ createdAt: new Date('2025-12-31T22:30:00.000Z'), priceCents: 10000 }), // 2026 in Helsinki
        row({ createdAt: new Date('2026-02-01T10:00:00.000Z'), priceCents: 20001 }),
        row({ createdAt: new Date('2026-02-01T10:00:00.000Z'), priceCents: null }), // ignored in average
        row({ createdAt: new Date('2021-01-01T10:00:00.000Z'), priceCents: 50000 }),
        row({ createdAt: new Date('2020-12-31T10:00:00.000Z'), priceCents: 90000 }), // year-6 → outside
        row({ createdAt: new Date('2024-05-01T10:00:00.000Z'), priceCents: null }),
      ],
      2026,
      NOW,
    );
    expect(stats.averageByCreatedYear).toEqual([
      { year: 2021, averageCents: 50000, count: 1 },
      { year: 2022, averageCents: null, count: 0 },
      { year: 2023, averageCents: null, count: 0 },
      { year: 2024, averageCents: null, count: 0 },
      { year: 2025, averageCents: null, count: 0 },
      { year: 2026, averageCents: 15001, count: 2 }, // (10000 + 20001) / 2 = 15000.5 → 15001
    ]);
  });

  it('byEventYear: year-3…year+2 by event date, all statuses', () => {
    const stats = computeOfferStats(
      [
        row({ eventDate: '2022-12-31', priceCents: 10000 }), // year-4 → outside
        row({ eventDate: '2023-01-01', priceCents: 10000, disposition: 'WON' }),
        row({ eventDate: '2026-03-01', priceCents: 20000, disposition: 'LOST_PRICE' }),
        row({ eventDate: '2026-12-31', priceCents: null, disposition: 'CANCELLED' }),
        row({ eventDate: '2028-12-31', priceCents: 30000 }),
        row({ eventDate: '2029-01-01', priceCents: 30000 }), // year+3 → outside
      ],
      2026,
      NOW,
    );
    expect(stats.byEventYear).toEqual([
      { year: 2023, count: 1, valueCents: 10000 },
      { year: 2024, count: 0, valueCents: 0 },
      { year: 2025, count: 0, valueCents: 0 },
      { year: 2026, count: 2, valueCents: 20000 },
      { year: 2027, count: 0, valueCents: 0 },
      { year: 2028, count: 1, valueCents: 30000 },
    ]);
  });

  it('open offers: PENDING and event today or later (Helsinki); expired and decided are not open', () => {
    const rows = [
      row({ eventDate: '2026-10-19', priceCents: 10000 }), // expired
      row({ eventDate: '2026-10-20', priceCents: 20000 }), // today → open
      row({ eventDate: '2026-12-01', priceCents: 30000, disposition: 'WON' }),
      row({ eventDate: '2027-06-01', priceCents: null, eventType: null }),
      row({ eventDate: '2029-12-31', priceCents: 40000, eventType: 'WEDDING' }),
      row({ eventDate: '2030-01-01', priceCents: 50000, eventType: 'WEDDING' }), // year+4: not in series, still open
    ];
    const stats = computeOfferStats(rows, 2026, NOW);
    expect(stats.openValueByEventYear).toEqual([
      { year: 2026, valueCents: 20000, count: 1 },
      { year: 2027, valueCents: 0, count: 1 },
      { year: 2028, valueCents: 0, count: 0 },
      { year: 2029, valueCents: 40000, count: 1 },
    ]);
    expect(stats.openByEventType).toEqual([
      { eventType: 'WEDDING', count: 2, valueCents: 90000 },
      { eventType: 'CORPORATE', count: 1, valueCents: 20000 },
      { eventType: null, count: 1, valueCents: 0 },
    ]);

    // Today is evaluated in Helsinki: at 2026-10-19 22:30 UTC it is already the 20th there.
    const late = computeOfferStats([row({ eventDate: '2026-10-19' })], 2026, new Date('2026-10-19T22:30:00.000Z'));
    expect(late.openByEventType).toEqual([]);
  });

  it('openValueByEventYear starts at the selected year', () => {
    const stats = computeOfferStats([row({ eventDate: '2027-01-05', priceCents: 10000 })], 2027, NOW);
    expect(stats.openValueByEventYear.map((y) => y.year)).toEqual([2027, 2028, 2029, 2030]);
    expect(stats.openValueByEventYear[0]).toEqual({ year: 2027, valueCents: 10000, count: 1 });
  });

  it('openByEventType ties: more offers first, then EVENT_TYPES order, no type last', () => {
    const stats = computeOfferStats(
      [
        row({ eventType: null, priceCents: 10000 }),
        row({ eventType: 'CORPORATE', priceCents: 10000 }),
        row({ eventType: 'PRIVATE', priceCents: 10000 }),
        row({ eventType: 'WEDDING', priceCents: 5000 }),
        row({ eventType: 'WEDDING', priceCents: 5000 }),
      ],
      2026,
      NOW,
    );
    expect(stats.openByEventType.map((g) => g.eventType)).toEqual(['WEDDING', 'PRIVATE', 'CORPORATE', null]);
  });

  it('winRate: all years; decided = not PENDING and not CANCELLED; per event type in EVENT_TYPES order', () => {
    const stats = computeOfferStats(
      [
        row({ disposition: 'WON', eventType: 'CORPORATE', eventDate: '2015-01-01' }),
        row({ disposition: 'WON', eventType: 'CORPORATE' }),
        row({ disposition: 'LOST_PRICE', eventType: 'CORPORATE' }),
        row({ disposition: 'NO_RESPONSE', eventType: 'PRIVATE' }),
        row({ disposition: 'WON', eventType: null }),
        row({ disposition: 'CANCELLED', eventType: 'PRIVATE' }),
        row({ disposition: 'PENDING', eventType: 'WEDDING' }),
      ],
      2026,
      NOW,
    );
    expect(stats.winRate).toEqual({
      pct: 60, // 3 / 5
      won: 3,
      decided: 5,
      byEventType: [
        { eventType: 'PRIVATE', pct: 0, won: 0, decided: 1 },
        { eventType: 'WEDDING', pct: null, won: 0, decided: 0 },
        { eventType: 'CORPORATE', pct: 66.7, won: 2, decided: 3 },
      ],
    });
  });
});

describe('GET /api/offers/stats', () => {
  let s: Session;
  let clientId: string;
  let sellerId: string;
  let n = 0;

  beforeEach(async () => {
    await resetDb();
    s = await startSession();
    clientId = (await testDb().client.create({ data: { name: 'Client A Oy' } })).id;
    sellerId = s.world.a.id;
  });
  afterEach(async () => {
    await s.app.close();
  });
  afterAll(closeTestDb);

  async function insert(data: {
    eventDate: string;
    priceCents?: number | null;
    disposition?: OfferStatsRow['disposition'];
    eventType?: OfferStatsRow['eventType'];
    createdAt?: Date;
    deletedAt?: Date | null;
  }) {
    n++;
    const token = newShareToken();
    return testDb().offer.create({
      data: {
        clientId,
        sellerId,
        eventName: `Event ${n}`,
        venue: 'Venue X',
        eventDate: new Date(`${data.eventDate}T00:00:00.000Z`),
        priceCents: data.priceCents === undefined ? 100000 : data.priceCents,
        disposition: data.disposition ?? 'PENDING',
        eventType: data.eventType === undefined ? 'CORPORATE' : data.eventType,
        createdAt: data.createdAt ?? new Date(),
        deletedAt: data.deletedAt ?? null,
        shareToken: token.token,
        shareTokenHash: token.hash,
      },
    });
  }

  const stats = (query: string) => call(s, 'GET', `/api/offers/stats${query}`);

  it('needs a session (401)', async () => {
    const app = await testApp();
    try {
      const res = await app.inject({ method: 'GET', url: '/api/offers/stats?year=2026' });
      expect(res.statusCode).toBe(401);
      expect(res.json().error.code).toBe('UNAUTHENTICATED');
    } finally {
      await app.close();
    }
  });

  it('missing or invalid year → 400 INVALID_VALUE', async () => {
    for (const query of ['', '?year=', '?year=26', '?year=abcd', '?year=20266', '?year=2026&year=2027']) {
      const res = await stats(query);
      expect(res.statusCode, query).toBe(400);
      expect(res.json()).toEqual({
        error: { code: 'VALIDATION_ERROR', message: expect.any(String), fields: { year: 'INVALID_VALUE' } },
      });
    }
  });

  it('aggregates all years of non-deleted offers per contract', async () => {
    const today = todayIso();
    const year = Number(today.slice(0, 4));
    // Mid-month of the previous completed month, so the row lands in createdByMonth[5].
    const lastMonth = completedMonths(today, 1)[0]!;
    const createdLastMonth = new Date(`${lastMonth}-15T10:00:00.000Z`);

    await insert({ eventDate: `${year + 1}-06-01`, priceCents: 200000, createdAt: createdLastMonth });
    await insert({ eventDate: `${year + 1}-07-01`, priceCents: null, eventType: null, createdAt: createdLastMonth });
    await insert({ eventDate: `${year - 2}-05-01`, priceCents: 100000, disposition: 'WON', eventType: 'WEDDING' });
    await insert({ eventDate: `${year - 2}-06-01`, priceCents: 100000, disposition: 'LOST_PRICE', eventType: 'WEDDING' });
    await insert({ eventDate: `${year - 10}-06-01`, priceCents: 100000, disposition: 'WON', eventType: 'PRIVATE' });
    // Expired: open in name only.
    await insert({ eventDate: `${year - 1}-01-01`, priceCents: 70000 });
    // Deleted offers count nowhere.
    await insert({
      eventDate: `${year + 1}-06-01`,
      priceCents: 990000,
      disposition: 'WON',
      createdAt: createdLastMonth,
      deletedAt: new Date(),
    });

    const res = await stats(`?year=${year}`);
    expect(res.statusCode).toBe(200);
    const body: Json = res.json();

    expect(body.createdByMonth).toHaveLength(6);
    expect(body.createdByMonth[5]).toEqual({ month: lastMonth, count: 2, valueCents: 200000 });

    expect(body.byEventYear.map((y: { year: number }) => y.year)).toEqual([year - 3, year - 2, year - 1, year, year + 1, year + 2]);
    expect(body.byEventYear[1]).toEqual({ year: year - 2, count: 2, valueCents: 200000 });
    expect(body.byEventYear[2]).toEqual({ year: year - 1, count: 1, valueCents: 70000 });
    expect(body.byEventYear[4]).toEqual({ year: year + 1, count: 2, valueCents: 200000 });

    expect(body.averageByCreatedYear).toHaveLength(6);
    expect(body.averageByCreatedYear[0].year).toBe(year - 5);

    expect(body.openValueByEventYear).toEqual([
      { year, valueCents: 0, count: 0 },
      { year: year + 1, valueCents: 200000, count: 2 },
      { year: year + 2, valueCents: 0, count: 0 },
      { year: year + 3, valueCents: 0, count: 0 },
    ]);
    expect(body.openByEventType).toEqual([
      { eventType: 'CORPORATE', count: 1, valueCents: 200000 },
      { eventType: null, count: 1, valueCents: 0 },
    ]);
    expect(body.winRate).toEqual({
      pct: 66.7,
      won: 2,
      decided: 3,
      byEventType: [
        { eventType: 'PRIVATE', pct: 100, won: 1, decided: 1 },
        { eventType: 'WEDDING', pct: 50, won: 1, decided: 2 },
        { eventType: 'CORPORATE', pct: null, won: 0, decided: 0 },
      ],
    });
  });
});
