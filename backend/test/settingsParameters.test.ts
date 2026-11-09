/**
 * Settings → Parameters (TASK-057, api-contract "Settings: Parameters tab", 2026-11-09).
 * Synthetic data only; the deduction values are test values (BR-090).
 */
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SETTING_KEYS } from '../src/domain/enums.js';
import { PARAMETERS } from '../src/settings/parameters.js';
import { closeTestDb, login, resetDb, testDb } from './helpers.js';
import { call, createEvent, FEES, startSession, type Json, type Session } from './eventFixtures.js';

const KEY = SETTING_KEYS.loadInDeduction;
const URL = `/api/settings/parameters/${KEY}`;

let s: Session;

beforeEach(async () => {
  await resetDb();
  s = await startSession(); // sets fees.load_in_deduction = FEES.loadInDeduction (no updatedBy)
});
afterEach(async () => {
  await s.app.close();
});
afterAll(closeTestDb);

const lineOf = (event: Json, type: string): Json => event.costLines.find((l: Json) => l.type === type);

describe('registry', () => {
  it('contains fees.load_in_deduction as MONEY with the contract limits', () => {
    expect(PARAMETERS).toEqual([{ key: 'fees.load_in_deduction', type: 'MONEY', min: 0, max: 100_000_000 }]);
  });
});

describe('GET /api/settings/parameters', () => {
  it('lists the registry in order with the stored value', async () => {
    const res = await call(s, 'GET', '/api/settings/parameters');
    expect(res.statusCode).toBe(200);
    const row = await testDb().setting.findUniqueOrThrow({ where: { key: KEY } });
    expect(res.json()).toEqual([
      { key: KEY, type: 'MONEY', value: FEES.loadInDeduction, updatedAt: row.updatedAt.toISOString(), updatedBy: null },
    ]);
  });

  it('value, updatedAt and updatedBy are null when there is no row yet', async () => {
    await testDb().setting.delete({ where: { key: KEY } });
    const res = await call(s, 'GET', '/api/settings/parameters');
    expect(res.json()).toEqual([{ key: KEY, type: 'MONEY', value: null, updatedAt: null, updatedBy: null }]);
  });

  it('needs a session', async () => {
    const res = await s.app.inject({ method: 'GET', url: '/api/settings/parameters' });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('UNAUTHENTICATED');
  });
});

describe('PATCH /api/settings/parameters/{key}', () => {
  it('updates the value and records updatedBy = me and updatedAt', async () => {
    const before = Date.now();
    const res = await call(s, 'PATCH', URL, { value: 5000 });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toEqual({ key: KEY, type: 'MONEY', value: 5000, updatedAt: expect.any(String), updatedBy: s.world.a.id });
    expect(Date.parse(body.updatedAt)).toBeGreaterThanOrEqual(before - 1000);
    const row = await testDb().setting.findUniqueOrThrow({ where: { key: KEY } });
    expect(row).toMatchObject({ valueCents: 5000, updatedById: s.world.a.id });
    expect((await call(s, 'GET', '/api/settings/parameters')).json()).toEqual([body]);
  });

  it('creates the row when missing (upsert); 0 and the maximum are allowed', async () => {
    await testDb().setting.delete({ where: { key: KEY } });
    const res = await call(s, 'PATCH', URL, { value: 0 });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ value: 0, updatedBy: s.world.a.id });
    expect(await testDb().setting.count({ where: { key: KEY } })).toBe(1);
    expect((await call(s, 'PATCH', URL, { value: 100_000_000 })).json().value).toBe(100_000_000);
  });

  it('records the partner who saved last', async () => {
    await call(s, 'PATCH', URL, { value: 5000 });
    const cookieB = await login(s.app, 'partner.b@example.com');
    const res = await s.app.inject({ method: 'PATCH', url: URL, headers: { cookie: cookieB }, payload: { value: 6000 } });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ value: 6000, updatedBy: s.world.b.id });
  });

  it('unknown key → 404 NOT_FOUND', async () => {
    const res = await call(s, 'PATCH', '/api/settings/parameters/fees.unknown', { value: 1000 });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('NOT_FOUND');
    // A setting that exists but is not a parameter is not editable here either.
    const other = await call(s, 'PATCH', '/api/settings/parameters/offers.default_includes', { value: 1000 });
    expect(other.statusCode).toBe(404);
    expect(await testDb().setting.count({ where: { key: { in: ['fees.unknown', 'offers.default_includes'] } } })).toBe(0);
  });

  it.each([
    [{ value: -1 }, 'NEGATIVE_AMOUNT'],
    [{ value: 10.5 }, 'INVALID_VALUE'],
    [{ value: '1000' }, 'INVALID_VALUE'],
    [{ value: null }, 'INVALID_VALUE'],
    [{}, 'INVALID_VALUE'],
    [{ value: 100_000_001 }, 'INVALID_VALUE'],
  ])('invalid value %j → 400 VALIDATION_ERROR value: %s', async (payload, code) => {
    const res = await call(s, 'PATCH', URL, payload);
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatchObject({ code: 'VALIDATION_ERROR', fields: { value: code } });
    expect((await testDb().setting.findUniqueOrThrow({ where: { key: KEY } })).valueCents).toBe(FEES.loadInDeduction);
  });

  it('needs a session', async () => {
    const res = await s.app.inject({ method: 'PATCH', url: URL, payload: { value: 1000 } });
    expect(res.statusCode).toBe(401);
  });
});

describe('effect of a new value', () => {
  it('/api/reference shows it immediately', async () => {
    await call(s, 'PATCH', URL, { value: 7000 });
    const ref = (await call(s, 'GET', '/api/reference')).json();
    expect(ref.settings.loadInDeductionCents).toBe(7000);
  });

  it('existing switched-off lines keep their deducted amount; later switches use the new value', async () => {
    const event = await createEvent(s); // Template A: VOC 30000, BASS 20000
    const voc = lineOf(event, 'VOC');
    const bass = lineOf(event, 'BASS');
    const off = await call(s, 'PATCH', `/api/cost-lines/${voc.id}`, { joinsLoadIn: false });
    expect(lineOf(off.json().event, 'VOC')).toMatchObject({ budgetedCents: 30000 - FEES.loadInDeduction, loadInDeductionAppliedCents: FEES.loadInDeduction });

    expect((await call(s, 'PATCH', URL, { value: 5000 })).statusCode).toBe(200);

    // Existing line unchanged by the settings change.
    const after = (await call(s, 'GET', `/api/events/${event.id}`)).json();
    expect(lineOf(after, 'VOC')).toMatchObject({ budgetedCents: 30000 - FEES.loadInDeduction, loadInDeductionAppliedCents: FEES.loadInDeduction });

    // Switching back on restores the stored deducted amount (not the new value).
    const on = await call(s, 'PATCH', `/api/cost-lines/${voc.id}`, { joinsLoadIn: true });
    expect(lineOf(on.json().event, 'VOC')).toMatchObject({ budgetedCents: 30000, loadInDeductionAppliedCents: null });

    // A later switch-off uses the new value.
    const bassOff = await call(s, 'PATCH', `/api/cost-lines/${bass.id}`, { joinsLoadIn: false });
    expect(lineOf(bassOff.json().event, 'BASS')).toMatchObject({ budgetedCents: 15000, loadInDeductionAppliedCents: 5000 });
  });

  it('the freelancer PO sound-check deduction uses the new value', async () => {
    const event = await createEvent(s, { startDate: '2026-01-10' });
    const voc = lineOf(event, 'VOC');
    await call(s, 'PATCH', `/api/cost-lines/${voc.id}`, { personId: s.world.p1.id });
    await call(s, 'PATCH', URL, { value: 4000 });

    const link = (await call(s, 'GET', `/api/people/${s.world.p1.id}/freelancer-link`)).json<{ sharePath: string }>();
    const token = link.sharePath.slice(3);
    const anon = (method: 'GET' | 'POST', url: string, payload?: object) =>
      s.app.inject({ method, url, remoteAddress: '10.0.0.7', ...(payload && { payload }) });

    const view = (await anon('GET', `/api/public/freelancers/${token}`)).json();
    expect(view.settings.soundcheckDeductionCents).toBe(4000);

    const res = await anon('POST', `/api/public/freelancers/${token}/purchase-orders`, {
      vatRateBp: 0,
      lines: [{ costLineId: voc.id, soundcheck: false }],
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().lines[0]).toMatchObject({ baseCents: 30000, deductionCents: 4000, amountCents: 26000 });
  });
});
