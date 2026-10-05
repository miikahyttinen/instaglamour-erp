/** Year page (UC-022; BR-063, BR-080…BR-083). Synthetic data only; money is 1000 or multiples of 10000 cents. */
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { closeTestDb, resetDb } from './helpers.js';
import { call, createBudgetCategory, createGig, startSession, type Json, type Session } from './gigFixtures.js';

let s: Session;

beforeEach(async () => {
  await resetDb();
  s = await startSession();
});
afterEach(async () => {
  vi.useRealTimers();
  await s.app.close();
});
afterAll(closeTestDb);

async function get(url: string): Promise<Json> {
  const res = await call(s, 'GET', url);
  if (res.statusCode !== 200) throw new Error(`GET ${url} failed: ${res.statusCode} ${res.body}`);
  return res.json();
}

/** Freeze "today" (Helsinki). */
function setToday(isoInstant: string) {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(isoInstant));
}

describe('GET /api/years/{year}', () => {
  it('is all zeros for an empty year, with every partner listed', async () => {
    const body = await get('/api/years/2030');
    expect(body).toEqual({
      year: 2030,
      gigs: {
        gigCount: 0,
        cancelledCount: 0,
        soldGigsSumCents: 0,
        budgetedCostsCents: 0,
        actualCostsCents: 0,
        marginBudgetCents: 0,
        marginActualCents: 0,
      },
      hours: {
        partners: [s.world.a, s.world.b, s.world.c].map((p) => ({ partnerId: p.id, total: 0 })),
        grandTotal: 0,
      },
      budget: { budgetExpenseCents: 0, budgetIncomeCents: 0, actualExpenseCents: 0, actualIncomeCents: 0 },
      yearResultCents: 0,
      upcomingGigs: [],
    });
  });

  it('gig sums, hours and budget equal their own endpoints; year result per BR-063', async () => {
    // Gigs: one sold with a paid line, one cancelled with an adjusted price, one deleted, one in another year
    const sold = await createGig(s, { startDate: '2026-03-01', priceCents: 200000, additionalSalesCents: 10000 });
    const voc = sold.costLines.find((l: Json) => l.type === 'VOC');
    await call(s, 'POST', `/api/cost-lines/${voc.id}/pay`, { actualCents: 20000 });
    const cancelled = await createGig(s, { startDate: '2026-04-01' });
    await call(s, 'POST', `/api/gigs/${cancelled.id}/cancel`, { reason: 'Reason 1' });
    await call(s, 'PATCH', `/api/gigs/${cancelled.id}`, { priceCents: 10000 });
    const deleted = await createGig(s, { startDate: '2026-05-01' });
    await call(s, 'POST', `/api/gigs/${deleted.id}/delete`, { reason: 'Reason 1' });
    await createGig(s, { startDate: '2027-01-01' });

    // Hours
    await call(s, 'POST', '/api/hours', { date: '2026-02-01', comment: 'Work 1', hours: 2.5 });
    await call(s, 'POST', '/api/hours', { date: '2027-02-01', comment: 'Work 1', hours: 1 });

    // Budget
    const catA = await createBudgetCategory('Category A', { sortOrder: 1 });
    const catB = await createBudgetCategory('Category B', { sortOrder: 2 });
    const removed = await createBudgetCategory('Category C', { sortOrder: 3 });
    await call(s, 'PUT', `/api/budget/2026/${catA.id}`, {
      budgetExpenseCents: 100000,
      budgetIncomeCents: 20000,
      actualExpenseCents: 90000,
      actualIncomeCents: 30000,
    });
    await call(s, 'PUT', `/api/budget/2026/${catB.id}`, {
      budgetExpenseCents: 0,
      budgetIncomeCents: 0,
      actualExpenseCents: 10000,
      actualIncomeCents: 0,
    });
    // A removed row's values are kept but excluded from the year page
    await call(s, 'PUT', `/api/budget/2026/${removed.id}`, {
      budgetExpenseCents: 10000,
      budgetIncomeCents: 10000,
      actualExpenseCents: 10000,
      actualIncomeCents: 10000,
    });
    expect((await call(s, 'DELETE', `/api/budget-categories/${removed.id}`)).statusCode).toBe(204);

    const year = await get('/api/years/2026');
    const gigList = await get('/api/gigs?year=2026&status=CANCELLED&q=nothing-matches');
    const hours = await get('/api/hours/totals?year=2026');
    const budget = await get('/api/budget?year=2026');

    expect(year.gigs).toEqual(gigList.yearSummary);
    // Sold 210000 + cancelled 10000 (BR-082); costs from both non-deleted gigs
    expect(year.gigs).toMatchObject({ gigCount: 1, cancelledCount: 1, soldGigsSumCents: 220000, actualCostsCents: 20000 });

    expect(year.hours).toEqual({
      partners: hours.partners.map((p: Json) => ({ partnerId: p.partnerId, total: p.total })),
      grandTotal: hours.grandTotal,
    });
    expect(year.hours.grandTotal).toBe(2.5);

    const { varianceExpenseCents: _ve, varianceIncomeCents: _vi, ...budgetTotals } = budget.totals;
    expect(year.budget).toEqual(budgetTotals);
    expect(year.budget).toEqual({ budgetExpenseCents: 100000, budgetIncomeCents: 20000, actualExpenseCents: 100000, actualIncomeCents: 30000 });

    // BR-063: 220000 − 20000 + 30000 − 100000
    expect(year.yearResultCents).toBe(130000);
  });

  it('upcoming = next 5 non-deleted SOLD gigs from today (Helsinki), regardless of the year', async () => {
    setToday('2026-06-14T21:30:00.000Z'); // 2026-06-15 in Helsinki
    await createGig(s, { startDate: '2026-06-14' }); // yesterday: played
    const today = await createGig(s, { startDate: '2026-06-15' });
    const cancelled = await createGig(s, { startDate: '2026-06-16' });
    await call(s, 'POST', `/api/gigs/${cancelled.id}/cancel`, { reason: 'Reason 1' });
    const deleted = await createGig(s, { startDate: '2026-06-17' });
    await call(s, 'POST', `/api/gigs/${deleted.id}/delete`, { reason: 'Reason 1' });
    const g3 = await createGig(s, { startDate: '2026-12-31' });
    const g2 = await createGig(s, { startDate: '2026-07-01' });
    const g4 = await createGig(s, { startDate: '2027-01-02' });
    const g5 = await createGig(s, { startDate: '2027-02-01' });
    await createGig(s, { startDate: '2027-03-01' }); // sixth

    const expected = [today.id, g2.id, g3.id, g4.id, g5.id];
    for (const y of [2026, 2025, 2027]) {
      const body = await get(`/api/years/${y}`);
      expect(body.upcomingGigs.map((g: { id: string }) => g.id)).toEqual(expected);
    }
    const [first] = (await get('/api/years/2026')).upcomingGigs;
    const { costLines: _lines, attachments: _attachments, ...summary } = today;
    expect(first).toEqual(summary); // a GigSummary, incl. notFullyStaffed
    expect(first.notFullyStaffed).toBe(true);
    expect(first.played).toBe(false);
  });

  it('validates the year', async () => {
    for (const y of ['26', 'abcd', '20266']) {
      const res = await call(s, 'GET', `/api/years/${y}`);
      expect(res.statusCode).toBe(400);
      expect(res.json().error).toMatchObject({ code: 'VALIDATION_ERROR', fields: { year: 'INVALID_VALUE' } });
    }
  });

  it('requires a session', async () => {
    expect((await s.app.inject({ method: 'GET', url: '/api/years/2026' })).statusCode).toBe(401);
  });
});
