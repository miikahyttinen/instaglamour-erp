/** Gig endpoints (UC-002…UC-004, UC-007, UC-009, UC-010, UC-012, UC-013, UC-025). Synthetic data only. */
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SETTING_KEYS } from '../src/domain/enums.js';
import { closeTestDb, login, resetDb, testDb } from './helpers.js';
import {
  call,
  createGig,
  FEES,
  gigBody,
  history,
  setSetting,
  startSession,
  UNKNOWN_ID,
  type Session,
} from './gigFixtures.js';

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

const lineTypes = (gig: { costLines: { type: string }[] }) => gig.costLines.map((l) => l.type);

describe('POST /api/gigs', () => {
  it('creates a SOLD gig with template lines and internal lines (BR-020, BR-021)', async () => {
    const { world } = s;
    const res = await call(s, 'POST', '/api/gigs', gigBody(world, { additionalSalesCents: 20000, additionalSalesDescription: 'Extra set' }));
    expect(res.statusCode).toBe(201);
    const gig = res.json();
    expect(gig).toMatchObject({
      id: expect.any(String),
      startDate: '2026-05-01',
      endDate: null,
      year: 2026,
      status: 'SOLD',
      lineupTemplateId: world.templateA.id,
      lineupName: 'Template A',
      venue: 'Venue X',
      technicalSetup: ['HOUSE_TECH'],
      sellerId: world.a.id,
      producerId: world.b.id,
      priceCents: 100000,
      additionalSalesCents: 20000,
      additionalSalesDescription: 'Extra set',
      notes: null,
      totalPriceCents: 120000,
      budgetedCostsCents: 30000 + 20000 + FEES.office + FEES.sales + FEES.production,
      actualCostsCents: 0,
      marginBudgetCents: 120000 - 80000,
      marginActualCents: 120000,
      marginBudgetPct: 33.3,
      marginActualPct: 100,
      notFullyStaffed: true,
      deletedAt: null,
      attachments: [],
    });
    expect(lineTypes(gig)).toEqual(['VOC', 'BASS', 'OFFICE', 'SALES', 'PRODUCTION']);
    const [voc, bass, office, sales, production] = gig.costLines;
    expect(voc).toEqual({
      id: expect.any(String),
      gigId: gig.id,
      type: 'VOC',
      personId: null,
      description: null,
      budgetedCents: 30000,
      joinsLoadIn: true,
      loadInDeductionAppliedCents: null,
      actualCents: null,
      paidAt: null,
      paidBy: null,
    });
    expect(bass).toMatchObject({ budgetedCents: 20000, joinsLoadIn: true, personId: null });
    expect(office).toMatchObject({ budgetedCents: FEES.office, personId: null, joinsLoadIn: null });
    expect(sales).toMatchObject({ budgetedCents: FEES.sales, personId: world.a.personId, joinsLoadIn: null });
    expect(production).toMatchObject({ budgetedCents: FEES.production, personId: world.b.personId, joinsLoadIn: null });

    expect(await history(s, gig.id)).toEqual([
      expect.objectContaining({ type: 'CREATED', partnerId: world.a.id, reason: null, details: {} }),
    ]);
  });

  it('keeps line order stable on reload (creation order)', async () => {
    const gig = await createGig(s);
    const again = (await call(s, 'GET', `/api/gigs/${gig.id}`)).json();
    expect(again.costLines.map((l: { id: string }) => l.id)).toEqual(gig.costLines.map((l: { id: string }) => l.id));
  });

  it('uses current settings for the internal lines', async () => {
    await setSetting(SETTING_KEYS.officeDefault, 20000);
    const gig = await createGig(s);
    expect(gig.costLines.find((l: { type: string }) => l.type === 'OFFICE').budgetedCents).toBe(20000);
  });

  it('custom lineup gets only Office, Sales and Production (UC-002 A1)', async () => {
    const gig = await createGig(s, { lineupTemplateId: null, lineupName: 'Custom Band' });
    expect(gig.lineupTemplateId).toBeNull();
    expect(gig.lineupName).toBe('Custom Band');
    expect(lineTypes(gig)).toEqual(['OFFICE', 'SALES', 'PRODUCTION']);
    expect(gig.notFullyStaffed).toBe(false);
  });

  it('keeps an explicit lineup name with a template', async () => {
    const gig = await createGig(s, { lineupName: 'Template A Plus' });
    expect(gig.lineupName).toBe('Template A Plus');
    expect(lineTypes(gig)).toHaveLength(5);
  });

  it('accepts a multi-day gig and minimal input', async () => {
    const res = await call(s, 'POST', '/api/gigs', {
      startDate: '2026-07-01',
      endDate: '2026-07-02',
      lineupName: 'Custom',
      venue: 'Venue Y',
      sellerId: s.world.a.id,
      producerId: s.world.a.id,
      priceCents: 0,
    });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({
      endDate: '2026-07-02',
      technicalSetup: [],
      additionalSalesCents: 0,
      marginBudgetPct: null,
      marginActualPct: null,
    });
  });

  it.each([
    [{ startDate: undefined }, { startDate: 'REQUIRED' }],
    [{ startDate: '2026-02-30' }, { startDate: 'INVALID_DATE' }],
    [{ startDate: '1.5.2026' }, { startDate: 'INVALID_DATE' }],
    [{ endDate: '2026-04-30' }, { endDate: 'END_BEFORE_START' }],
    [{ venue: '' }, { venue: 'REQUIRED' }],
    [{ venue: '   ' }, { venue: 'REQUIRED' }],
    [{ venue: 'x'.repeat(501) }, { venue: 'TOO_LONG' }],
    [{ notes: 'x'.repeat(5001) }, { notes: 'TOO_LONG' }],
    [{ priceCents: -10000 }, { priceCents: 'NEGATIVE_AMOUNT' }],
    [{ priceCents: undefined }, { priceCents: 'REQUIRED' }],
    [{ priceCents: 1000.5 }, { priceCents: 'INVALID_VALUE' }],
    [{ priceCents: '1000' }, { priceCents: 'INVALID_VALUE' }],
    [{ additionalSalesCents: -1000 }, { additionalSalesCents: 'NEGATIVE_AMOUNT' }],
    [{ technicalSetup: ['NOPE'] }, { technicalSetup: 'INVALID_VALUE' }],
    [{ sellerId: undefined }, { sellerId: 'REQUIRED' }],
    [{ sellerId: UNKNOWN_ID }, { sellerId: 'UNKNOWN_REFERENCE' }],
    [{ producerId: 'not-a-uuid' }, { producerId: 'UNKNOWN_REFERENCE' }],
    [{ lineupTemplateId: UNKNOWN_ID }, { lineupTemplateId: 'UNKNOWN_REFERENCE' }],
    [{ lineupTemplateId: null, lineupName: null }, { lineupName: 'REQUIRED' }],
  ])('rejects %j', async (overrides, fields) => {
    const res = await call(s, 'POST', '/api/gigs', gigBody(s.world, overrides));
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: { code: 'VALIDATION_ERROR', message: expect.any(String), fields } });
    expect(await testDb().gig.count()).toBe(0);
  });

  it('returns 401 without a session', async () => {
    const res = await s.app.inject({ method: 'POST', url: '/api/gigs', payload: gigBody(s.world) });
    expect(res.statusCode).toBe(401);
  });
});

describe('GET /api/gigs/{id}', () => {
  it('returns the gig detail', async () => {
    const gig = await createGig(s);
    const res = await call(s, 'GET', `/api/gigs/${gig.id}`);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual(gig);
  });

  it('returns deleted gigs (read-only) with deletedAt', async () => {
    const gig = await createGig(s);
    await call(s, 'POST', `/api/gigs/${gig.id}/delete`, { reason: 'Duplicate' });
    const res = await call(s, 'GET', `/api/gigs/${gig.id}`);
    expect(res.statusCode).toBe(200);
    expect(res.json().deletedAt).toEqual(expect.any(String));
  });

  it.each([UNKNOWN_ID, 'nope'])('404 for unknown id %s', async (id) => {
    const res = await call(s, 'GET', `/api/gigs/${id}`);
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('NOT_FOUND');
  });
});

describe('played (BR-010)', () => {
  it('is true for a SOLD gig that started before today (Helsinki)', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-06-14T21:30:00.000Z')); // already 2026-06-15 in Helsinki
    const past = await createGig(s, { startDate: '2026-06-14' });
    const today = await createGig(s, { startDate: '2026-06-15' });
    expect(past.played).toBe(true);
    expect(today.played).toBe(false);
    await call(s, 'POST', `/api/gigs/${past.id}/cancel`, { reason: 'Client cancelled' });
    expect((await call(s, 'GET', `/api/gigs/${past.id}`)).json().played).toBe(false);
  });
});

describe('GET /api/gigs', () => {
  const list = (query: string) => call(s, 'GET', `/api/gigs?${query}`);
  const venues = (body: { gigs: { venue: string }[] }) => body.gigs.map((g) => g.venue);

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-06-15T09:00:00.000Z'));
  });

  async function seedYear() {
    const { world } = s;
    const g1 = await createGig(s, { startDate: '2026-03-01', venue: 'Venue A', priceCents: 100000 });
    const g2 = await createGig(s, { startDate: '2026-08-01', venue: 'Venue B', priceCents: 200000, sellerId: world.b.id, producerId: world.c.id, notes: 'Rooftop party' });
    const g3 = await createGig(s, { startDate: '2026-06-15', venue: 'Venue C', priceCents: 100000, lineupTemplateId: null, lineupName: 'Duo Night' });
    const cancelled = await createGig(s, { startDate: '2026-04-01', venue: 'Venue D', priceCents: 100000 });
    await call(s, 'POST', `/api/gigs/${cancelled.id}/cancel`, { reason: 'Client cancelled' });
    await call(s, 'PATCH', `/api/gigs/${cancelled.id}`, { priceCents: 20000, notes: 'Cancellation fee billed' });
    const deleted = await createGig(s, { startDate: '2026-05-01', venue: 'Venue E', priceCents: 900000 });
    await call(s, 'POST', `/api/gigs/${deleted.id}/delete`, { reason: 'Duplicate' });
    await createGig(s, { startDate: '2027-01-10', venue: 'Venue F' });
    return { g1, g2, g3, cancelled, deleted };
  }

  it('defaults to SOLD, non-deleted gigs of the year sorted by start date', async () => {
    await seedYear();
    const res = await list('year=2026');
    expect(res.statusCode).toBe(200);
    expect(venues(res.json())).toEqual(['Venue A', 'Venue C', 'Venue B']);
    const [a, c] = res.json().gigs;
    expect(a.played).toBe(true);
    expect(c.played).toBe(false); // starts today
    expect(a).not.toHaveProperty('costLines');
  });

  it('yearSummary ignores filters, includes cancelled gigs and excludes deleted ones (BR-082)', async () => {
    await seedYear();
    const expected = {
      gigCount: 3,
      cancelledCount: 1,
      soldGigsSumCents: 100000 + 200000 + 100000 + 20000,
      budgetedCostsCents: 3 * 80000 + 30000,
      actualCostsCents: 0,
      marginBudgetCents: 420000 - 270000,
      marginActualCents: 420000,
    };
    for (const q of ['year=2026', 'year=2026&status=CANCELLED', 'year=2026&q=nothing', 'year=2026&deleted=true&status=ALL']) {
      expect((await list(q)).json().yearSummary).toEqual(expected);
    }
    expect((await list('year=2027')).json().yearSummary).toMatchObject({ gigCount: 1, cancelledCount: 0, soldGigsSumCents: 100000 });
    expect((await list('year=2025')).json()).toEqual({
      gigs: [],
      yearSummary: {
        gigCount: 0,
        cancelledCount: 0,
        soldGigsSumCents: 0,
        budgetedCostsCents: 0,
        actualCostsCents: 0,
        marginBudgetCents: 0,
        marginActualCents: 0,
      },
    });
  });

  it('filters by status, when, seller, producer, staffing, search and deleted', async () => {
    const { world } = s;
    await seedYear();
    expect(venues((await list('year=2026&status=CANCELLED')).json())).toEqual(['Venue D']);
    expect(venues((await list('year=2026&status=ALL')).json())).toEqual(['Venue A', 'Venue D', 'Venue C', 'Venue B']);
    expect(venues((await list('year=2026&when=upcoming')).json())).toEqual(['Venue C', 'Venue B']);
    expect(venues((await list('year=2026&when=past')).json())).toEqual(['Venue A']);
    expect(venues((await list(`year=2026&sellerId=${world.b.id}`)).json())).toEqual(['Venue B']);
    expect(venues((await list(`year=2026&producerId=${world.c.id}`)).json())).toEqual(['Venue B']);
    expect(venues((await list('year=2026&notFullyStaffed=true')).json())).toEqual(['Venue A', 'Venue B']);
    expect(venues((await list('year=2026&q=ROOFTOP')).json())).toEqual(['Venue B']); // notes
    expect(venues((await list('year=2026&q=duo')).json())).toEqual(['Venue C']); // lineup name
    expect(venues((await list('year=2026&q=venue%20a')).json())).toEqual(['Venue A']); // venue
    expect(venues((await list('year=2026&deleted=true')).json())).toEqual(['Venue E']);
    expect((await list('year=2026&deleted=true')).json().gigs[0].deletedAt).toEqual(expect.any(String));
  });

  it('uses the start date year (BR-080)', async () => {
    await createGig(s, { startDate: '2026-12-31', endDate: '2027-01-01', venue: 'Venue NYE' });
    expect(venues((await list('year=2026')).json())).toEqual(['Venue NYE']);
    expect(venues((await list('year=2027')).json())).toEqual([]);
  });

  it.each([
    ['', { year: 'REQUIRED' }],
    ['year=20x6', { year: 'INVALID_VALUE' }],
    ['year=2026&status=PLAYED', { status: 'INVALID_VALUE' }],
    ['year=2026&when=soon', { when: 'INVALID_VALUE' }],
    ['year=2026&sellerId=abc', { sellerId: 'INVALID_VALUE' }],
  ])('rejects query %s', async (query, fields) => {
    const res = await list(query);
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toEqual({ code: 'VALIDATION_ERROR', message: expect.any(String), fields });
  });

  it('returns 401 without a session', async () => {
    expect((await s.app.inject({ method: 'GET', url: '/api/gigs?year=2026' })).statusCode).toBe(401);
  });
});

describe('PATCH /api/gigs/{id}', () => {
  it('updates fields and logs one UPDATED with every change (UC-004, UC-007)', async () => {
    const gig = await createGig(s);
    const res = await call(s, 'PATCH', `/api/gigs/${gig.id}`, {
      venue: 'Venue Y',
      lineupName: 'Template A Big',
      technicalSetup: ['SET_A', 'VAN'],
      priceCents: 200000,
      additionalSalesCents: 10000,
      additionalSalesDescription: 'Extra hour',
      notes: 'Note 1',
    });
    expect(res.statusCode).toBe(200);
    const { gig: updated, movedCostLineIds } = res.json();
    expect(movedCostLineIds).toEqual([]);
    expect(updated).toMatchObject({
      venue: 'Venue Y',
      lineupName: 'Template A Big',
      technicalSetup: ['SET_A', 'VAN'],
      priceCents: 200000,
      additionalSalesCents: 10000,
      totalPriceCents: 210000,
      marginBudgetCents: 130000,
      notes: 'Note 1',
    });
    const events = await history(s, gig.id);
    expect(events.map((e) => e.type)).toEqual(['UPDATED', 'CREATED']);
    expect(events[0]!.details).toEqual({
      changes: [
        { field: 'lineupName', from: 'Template A', to: 'Template A Big' },
        { field: 'venue', from: 'Venue X', to: 'Venue Y' },
        { field: 'technicalSetup', from: ['HOUSE_TECH'], to: ['SET_A', 'VAN'] },
        { field: 'priceCents', from: 100000, to: 200000 },
        { field: 'additionalSalesCents', from: 0, to: 10000 },
        { field: 'additionalSalesDescription', from: null, to: 'Extra hour' },
        { field: 'notes', from: null, to: 'Note 1' },
      ],
      movedCostLineIds: [],
    });
  });

  it('logs only changed fields and nothing when nothing changed', async () => {
    const gig = await createGig(s);
    await call(s, 'PATCH', `/api/gigs/${gig.id}`, { venue: 'Venue X', priceCents: 200000 });
    const res = await call(s, 'PATCH', `/api/gigs/${gig.id}`, { venue: 'Venue X' });
    expect(res.statusCode).toBe(200);
    const events = await history(s, gig.id);
    expect(events.map((e) => e.type)).toEqual(['UPDATED', 'CREATED']);
    expect(events[0]!.details.changes).toEqual([{ field: 'priceCents', from: 100000, to: 200000 }]);
  });

  it('clears optional text with null or blank', async () => {
    const gig = await createGig(s, { notes: 'Note 1' });
    const res = await call(s, 'PATCH', `/api/gigs/${gig.id}`, { notes: '  ' });
    expect(res.json().gig.notes).toBeNull();
  });

  it('is allowed on a cancelled gig (BR-013)', async () => {
    const gig = await createGig(s);
    await call(s, 'POST', `/api/gigs/${gig.id}/cancel`, { reason: 'Client cancelled' });
    const res = await call(s, 'PATCH', `/api/gigs/${gig.id}`, { priceCents: 0, additionalSalesCents: 0, notes: 'Nothing billed' });
    expect(res.statusCode).toBe(200);
    expect(res.json().gig).toMatchObject({ status: 'CANCELLED', totalPriceCents: 0 });
  });

  it.each([
    [{ startDate: '2026-06-01' }, { startDate: 'NOT_EDITABLE' }],
    [{ endDate: null }, { endDate: 'NOT_EDITABLE' }],
    [{ venue: '' }, { venue: 'REQUIRED' }],
    [{ lineupName: null }, { lineupName: 'REQUIRED' }],
    [{ priceCents: -10000 }, { priceCents: 'NEGATIVE_AMOUNT' }],
    [{ priceCents: null }, { priceCents: 'REQUIRED' }],
    [{ technicalSetup: 'SET_A' }, { technicalSetup: 'INVALID_VALUE' }],
    [{ sellerId: UNKNOWN_ID }, { sellerId: 'UNKNOWN_REFERENCE' }],
    [{ producerId: 'x' }, { producerId: 'UNKNOWN_REFERENCE' }],
    [{ additionalSalesDescription: 'x'.repeat(501) }, { additionalSalesDescription: 'TOO_LONG' }],
  ])('rejects %j', async (payload, fields) => {
    const gig = await createGig(s);
    const res = await call(s, 'PATCH', `/api/gigs/${gig.id}`, payload);
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toEqual({ code: 'VALIDATION_ERROR', message: expect.any(String), fields });
    expect((await history(s, gig.id)).map((e) => e.type)).toEqual(['CREATED']);
  });

  it('404 for an unknown gig, 409 GIG_DELETED for a deleted gig', async () => {
    expect((await call(s, 'PATCH', `/api/gigs/${UNKNOWN_ID}`, { venue: 'Venue Y' })).statusCode).toBe(404);
    const gig = await createGig(s);
    await call(s, 'POST', `/api/gigs/${gig.id}/delete`, { reason: 'Duplicate' });
    const res = await call(s, 'PATCH', `/api/gigs/${gig.id}`, { venue: 'Venue Y' });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('GIG_DELETED');
  });
});

describe('seller / producer change (BR-027)', () => {
  it('moves the old seller’s unpaid Sales lines only, incl. the split case', async () => {
    const { world } = s;
    const gig = await createGig(s); // seller A, producer B
    const salesA = gig.costLines.find((l: { type: string }) => l.type === 'SALES');
    // A second, paid Sales line of A, and a split Sales line of Person 1.
    const paidA = (await call(s, 'POST', `/api/gigs/${gig.id}/cost-lines`, { type: 'SALES', personId: world.a.personId, budgetedCents: 10000 })).json().gig.costLines.at(-1);
    await call(s, 'POST', `/api/cost-lines/${paidA.id}/pay`, {});
    const split = (await call(s, 'POST', `/api/gigs/${gig.id}/cost-lines`, { type: 'SALES', personId: world.p1.id, budgetedCents: 10000 })).json().gig.costLines.at(-1);
    const unpaidA2 = (await call(s, 'POST', `/api/gigs/${gig.id}/cost-lines`, { type: 'SALES', personId: world.a.personId, budgetedCents: 20000 })).json().gig.costLines.at(-1);

    const res = await call(s, 'PATCH', `/api/gigs/${gig.id}`, { sellerId: world.c.id });
    expect(res.statusCode).toBe(200);
    const { gig: updated, movedCostLineIds } = res.json();
    expect(movedCostLineIds).toEqual([salesA.id, unpaidA2.id]);
    const byId = new Map(updated.costLines.map((l: { id: string }) => [l.id, l]));
    expect(byId.get(salesA.id)).toMatchObject({ personId: world.c.personId, budgetedCents: FEES.sales });
    expect(byId.get(unpaidA2.id)).toMatchObject({ personId: world.c.personId, budgetedCents: 20000 });
    expect(byId.get(paidA.id)).toMatchObject({ personId: world.a.personId });
    expect(byId.get(split.id)).toMatchObject({ personId: world.p1.id });
    expect(updated.sellerId).toBe(world.c.id);

    const [event] = await history(s, gig.id);
    expect(event).toMatchObject({
      type: 'UPDATED',
      details: { changes: [{ field: 'sellerId', from: world.a.id, to: world.c.id }], movedCostLineIds: [salesA.id, unpaidA2.id] },
    });
  });

  it('moves Production lines on producer change and both on a combined change', async () => {
    const { world } = s;
    const gig = await createGig(s);
    const sales = gig.costLines.find((l: { type: string }) => l.type === 'SALES');
    const production = gig.costLines.find((l: { type: string }) => l.type === 'PRODUCTION');
    const res = await call(s, 'PATCH', `/api/gigs/${gig.id}`, { sellerId: world.b.id, producerId: world.c.id });
    expect(res.json().movedCostLineIds).toEqual([sales.id, production.id]);
    const lines = res.json().gig.costLines;
    expect(lines.find((l: { id: string }) => l.id === sales.id).personId).toBe(world.b.personId);
    expect(lines.find((l: { id: string }) => l.id === production.id).personId).toBe(world.c.personId);
  });

  it('moves nothing when the old seller has no unpaid Sales line', async () => {
    const { world } = s;
    const gig = await createGig(s);
    const sales = gig.costLines.find((l: { type: string }) => l.type === 'SALES');
    await call(s, 'PATCH', `/api/cost-lines/${sales.id}`, { personId: world.p2.id });
    const res = await call(s, 'PATCH', `/api/gigs/${gig.id}`, { sellerId: world.c.id });
    expect(res.json().movedCostLineIds).toEqual([]);
    expect(res.json().gig.costLines.find((l: { id: string }) => l.id === sales.id).personId).toBe(world.p2.id);
  });
});

describe('POST /api/gigs/{id}/move (UC-009)', () => {
  it('changes the dates, keeps status and staff, logs MOVED with old and new dates', async () => {
    const gig = await createGig(s, { startDate: '2026-05-01' });
    const res = await call(s, 'POST', `/api/gigs/${gig.id}/move`, { startDate: '2027-02-01', endDate: '2027-02-02', reason: 'Venue asked' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ gig: expect.objectContaining({ startDate: '2027-02-01', endDate: '2027-02-02', year: 2027, status: 'SOLD' }), warnings: [] });
    expect(res.json().gig.costLines).toEqual(gig.costLines);
    const [event] = await history(s, gig.id);
    expect(event).toMatchObject({
      type: 'MOVED',
      reason: 'Venue asked',
      details: { from: { startDate: '2026-05-01', endDate: null }, to: { startDate: '2027-02-01', endDate: '2027-02-02' } },
    });
  });

  it('reason is optional; same dates log nothing', async () => {
    const gig = await createGig(s);
    expect((await call(s, 'POST', `/api/gigs/${gig.id}/move`, { startDate: '2026-05-01' })).statusCode).toBe(200);
    expect((await history(s, gig.id)).map((e) => e.type)).toEqual(['CREATED']);
    await call(s, 'POST', `/api/gigs/${gig.id}/move`, { startDate: '2026-05-02', endDate: null });
    expect((await history(s, gig.id))[0]).toMatchObject({ type: 'MOVED', reason: null });
  });

  it.each([
    [{}, { startDate: 'REQUIRED' }],
    [{ startDate: '2026-13-01' }, { startDate: 'INVALID_DATE' }],
    [{ startDate: '2026-05-02', endDate: '2026-05-01' }, { endDate: 'END_BEFORE_START' }],
  ])('rejects %j', async (payload, fields) => {
    const gig = await createGig(s);
    const res = await call(s, 'POST', `/api/gigs/${gig.id}/move`, payload);
    expect(res.statusCode).toBe(400);
    expect(res.json().error.fields).toEqual(fields);
  });

  it('409 for a cancelled gig, 409 GIG_DELETED for a deleted gig, 404 for unknown', async () => {
    const gig = await createGig(s);
    await call(s, 'POST', `/api/gigs/${gig.id}/cancel`, { reason: 'Client cancelled' });
    const res = await call(s, 'POST', `/api/gigs/${gig.id}/move`, { startDate: '2026-06-01' });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('INVALID_STATUS_TRANSITION');

    const other = await createGig(s);
    await call(s, 'POST', `/api/gigs/${other.id}/delete`, { reason: 'Duplicate' });
    expect((await call(s, 'POST', `/api/gigs/${other.id}/move`, { startDate: '2026-06-01' })).json().error.code).toBe('GIG_DELETED');
    expect((await call(s, 'POST', `/api/gigs/${UNKNOWN_ID}/move`, { startDate: '2026-06-01' })).statusCode).toBe(404);
  });
});

describe('cancel / uncancel (UC-010, UC-012)', () => {
  it('cancel requires a reason, sets CANCELLED and logs it; uncancel reverts and keeps the history', async () => {
    const gig = await createGig(s);
    const noReason = await call(s, 'POST', `/api/gigs/${gig.id}/cancel`, { reason: ' ' });
    expect(noReason.statusCode).toBe(400);
    expect(noReason.json().error.fields).toEqual({ reason: 'REQUIRED' });
    expect((await call(s, 'POST', `/api/gigs/${gig.id}/cancel`)).json().error.fields).toEqual({ reason: 'REQUIRED' });

    const res = await call(s, 'POST', `/api/gigs/${gig.id}/cancel`, { reason: 'Client cancelled' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ id: gig.id, status: 'CANCELLED', costLines: expect.any(Array) });

    const again = await call(s, 'POST', `/api/gigs/${gig.id}/cancel`, { reason: 'Again' });
    expect(again.statusCode).toBe(409);
    expect(again.json().error.code).toBe('INVALID_STATUS_TRANSITION');

    expect((await call(s, 'POST', `/api/gigs/${gig.id}/uncancel`, {})).statusCode).toBe(400);
    const back = await call(s, 'POST', `/api/gigs/${gig.id}/uncancel`, { reason: 'Back on' });
    expect(back.statusCode).toBe(200);
    expect(back.json().status).toBe('SOLD');

    const events = await history(s, gig.id);
    expect(events.map((e) => [e.type, e.reason])).toEqual([
      ['UNCANCELLED', 'Back on'],
      ['CANCELLED', 'Client cancelled'],
      ['CREATED', null],
    ]);
    expect(events[0]!.details).toEqual({});
  });

  it('uncancel of a SOLD gig is 409; both are 409 GIG_DELETED on a deleted gig; 404 unknown', async () => {
    const gig = await createGig(s);
    expect((await call(s, 'POST', `/api/gigs/${gig.id}/uncancel`, { reason: 'x' })).json().error.code).toBe('INVALID_STATUS_TRANSITION');
    await call(s, 'POST', `/api/gigs/${gig.id}/delete`, { reason: 'Duplicate' });
    expect((await call(s, 'POST', `/api/gigs/${gig.id}/cancel`, { reason: 'x' })).json().error.code).toBe('GIG_DELETED');
    expect((await call(s, 'POST', `/api/gigs/${gig.id}/uncancel`, { reason: 'x' })).json().error.code).toBe('GIG_DELETED');
    expect((await call(s, 'POST', `/api/gigs/${UNKNOWN_ID}/cancel`, { reason: 'x' })).statusCode).toBe(404);
  });
});

describe('delete / restore (UC-025)', () => {
  it('soft-deletes with a reason, hides the gig and restores all data', async () => {
    const gig = await createGig(s);
    expect((await call(s, 'POST', `/api/gigs/${gig.id}/delete`, {})).json().error.fields).toEqual({ reason: 'REQUIRED' });

    const res = await call(s, 'POST', `/api/gigs/${gig.id}/delete`, { reason: 'Duplicate' });
    expect(res.statusCode).toBe(204);
    expect(res.body).toBe('');
    const row = await testDb().gig.findUniqueOrThrow({ where: { id: gig.id } });
    expect(row.deletedAt).not.toBeNull();
    expect(row.deletedById).toBe(s.world.a.id);
    expect((await call(s, 'GET', '/api/gigs?year=2026')).json().gigs).toEqual([]);

    const twice = await call(s, 'POST', `/api/gigs/${gig.id}/delete`, { reason: 'Again' });
    expect(twice.statusCode).toBe(409);
    expect(twice.json().error.code).toBe('GIG_DELETED');

    const restored = await call(s, 'POST', `/api/gigs/${gig.id}/restore`);
    expect(restored.statusCode).toBe(200);
    const { updatedAt: _u1, ...after } = restored.json();
    const { updatedAt: _u2, ...before } = gig;
    expect(after).toEqual(before);
    expect((await call(s, 'GET', '/api/gigs?year=2026')).json().gigs).toHaveLength(1);

    const events = await history(s, gig.id);
    expect(events.map((e) => [e.type, e.reason])).toEqual([
      ['RESTORED', null],
      ['DELETED', 'Duplicate'],
      ['CREATED', null],
    ]);
  });

  it('restore of a non-deleted gig is 409; unknown is 404', async () => {
    const gig = await createGig(s);
    const res = await call(s, 'POST', `/api/gigs/${gig.id}/restore`);
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('INVALID_STATUS_TRANSITION');
    expect((await call(s, 'POST', `/api/gigs/${UNKNOWN_ID}/restore`)).statusCode).toBe(404);
    expect((await call(s, 'POST', `/api/gigs/${UNKNOWN_ID}/delete`, { reason: 'x' })).statusCode).toBe(404);
  });

  it('no endpoint physically deletes a gig or edits history', async () => {
    const gig = await createGig(s);
    expect((await call(s, 'DELETE', `/api/gigs/${gig.id}`)).statusCode).toBe(404);
    expect((await call(s, 'DELETE', `/api/gigs/${gig.id}/history`)).statusCode).toBe(404);
    expect((await call(s, 'PATCH', `/api/gigs/${gig.id}/history`, {})).statusCode).toBe(404);
    expect(await testDb().gig.count()).toBe(1);
  });
});

describe('GET /api/gigs/{id}/history (UC-013)', () => {
  it('lists events newest first with partner and time, also for deleted gigs', async () => {
    const gig = await createGig(s);
    const cookieB = await login(s.app, 'partner.b@example.com');
    await s.app.inject({ method: 'PATCH', url: `/api/gigs/${gig.id}`, headers: { cookie: cookieB }, payload: { venue: 'Venue Y' } });
    await call(s, 'POST', `/api/gigs/${gig.id}/delete`, { reason: 'Duplicate' });

    const res = await call(s, 'GET', `/api/gigs/${gig.id}/history`);
    expect(res.statusCode).toBe(200);
    const events = res.json();
    expect(events.map((e: { type: string }) => e.type)).toEqual(['DELETED', 'UPDATED', 'CREATED']);
    expect(events[1]).toEqual({
      id: expect.any(String),
      gigId: gig.id,
      type: 'UPDATED',
      partnerId: s.world.b.id,
      at: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
      reason: null,
      details: { changes: [{ field: 'venue', from: 'Venue X', to: 'Venue Y' }], movedCostLineIds: [] },
    });
  });

  it('404 for an unknown gig; 401 without a session', async () => {
    expect((await call(s, 'GET', `/api/gigs/${UNKNOWN_ID}/history`)).statusCode).toBe(404);
    const gig = await createGig(s);
    expect((await s.app.inject({ method: 'GET', url: `/api/gigs/${gig.id}/history` })).statusCode).toBe(401);
  });
});
