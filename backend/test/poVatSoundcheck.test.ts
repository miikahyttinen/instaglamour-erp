/**
 * Freelancer PO: VAT and sound check (TASK-050, api-contract 2026-11-04).
 * - amount math (pure): deduction from settings, not below 0, VAT in basis points with rounding;
 * - public create with `{ vatLiable, lines }`, validation, all-or-nothing, totals, FreelancerView settings;
 * - paying sets each cost line's actual to the line amount (incl. VAT).
 * Synthetic data only; the deduction and VAT rate come from test settings.
 */
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { OPTIONAL_NUMBER_SETTING_KEYS, SETTING_KEYS } from '../src/domain/enums.js';
import { poLineAmount } from '../src/purchaseOrders/amounts.js';
import { closeTestDb, resetDb, testDb } from './helpers.js';
import { call, createEvent, FEES, setSetting, startSession, UNKNOWN_ID, type Json, type Session } from './eventFixtures.js';

// ======================================================================== pure amount math
describe('poLineAmount', () => {
  const settings = { soundcheckDeductionCents: 10000, vatRateBp: 1350 };

  it('sound check on, no VAT → the budgeted fee', () => {
    expect(poLineAmount(30000, { soundcheck: true, vatLiable: false }, settings)).toEqual({
      baseCents: 30000,
      deductionCents: 0,
      vatCents: 0,
      amountCents: 30000,
    });
  });

  it('sound check off deducts the setting value, never below 0', () => {
    expect(poLineAmount(30000, { soundcheck: false, vatLiable: false }, settings)).toEqual({
      baseCents: 30000,
      deductionCents: 10000,
      vatCents: 0,
      amountCents: 20000,
    });
    expect(poLineAmount(4000, { soundcheck: false, vatLiable: true }, settings)).toEqual({
      baseCents: 4000,
      deductionCents: 4000,
      vatCents: 0,
      amountCents: 0,
    });
    expect(poLineAmount(30000, { soundcheck: false, vatLiable: false }, { ...settings, soundcheckDeductionCents: 7000 }))
      .toMatchObject({ deductionCents: 7000, amountCents: 23000 });
  });

  it('VAT: round(net × rate) on the net after the deduction', () => {
    expect(poLineAmount(30000, { soundcheck: true, vatLiable: true }, settings)).toMatchObject({ vatCents: 4050, amountCents: 34050 });
    expect(poLineAmount(30000, { soundcheck: false, vatLiable: true }, settings)).toMatchObject({
      deductionCents: 10000,
      vatCents: 2700,
      amountCents: 22700,
    });
    // 10001 × 13.5 % = 1350.135 → 1350; 10004 → 1350.54 → 1351; 100 → 13.5 → 14 (half up)
    expect(poLineAmount(10001, { soundcheck: true, vatLiable: true }, settings).vatCents).toBe(1350);
    expect(poLineAmount(10004, { soundcheck: true, vatLiable: true }, settings).vatCents).toBe(1351);
    expect(poLineAmount(100, { soundcheck: true, vatLiable: true }, settings).vatCents).toBe(14);
    expect(poLineAmount(10000, { soundcheck: true, vatLiable: true }, { ...settings, vatRateBp: 2400 }).vatCents).toBe(2400);
  });
});

// ======================================================================== endpoints
let s: Session;

beforeEach(async () => {
  await resetDb();
  s = await startSession();
});
afterEach(async () => {
  await s.app.close();
});
afterAll(closeTestDb);

const PAST = '2026-01-10';
const PAST_2 = '2026-02-20';

const anon = (method: 'GET' | 'POST', url: string, payload?: unknown) =>
  s.app.inject({ method, url, remoteAddress: '10.0.0.5', ...(payload !== undefined && { payload: payload as object }) });

async function tokenOf(personId: string): Promise<string> {
  const res = await call(s, 'GET', `/api/people/${personId}/freelancer-link`);
  return res.json<{ sharePath: string }>().sharePath.slice(3);
}

const lineOf = (event: Json, type: string): Json => event.costLines.find((l: Json) => l.type === type);

/** A played event (Template A: VOC 30000, BASS 20000) with Person 1 on both VOC and BASS. */
async function playedEvent(startDate: string): Promise<Json> {
  const event = await createEvent(s, { startDate });
  await call(s, 'PATCH', `/api/cost-lines/${lineOf(event, 'VOC').id}`, { personId: s.world.p1.id });
  const res = await call(s, 'PATCH', `/api/cost-lines/${lineOf(event, 'BASS').id}`, { personId: s.world.p1.id });
  return res.json().event;
}

const createPo = (token: string, body: unknown) => anon('POST', `/api/public/freelancers/${token}/purchase-orders`, body);

async function poByNumber(number: string): Promise<Json> {
  const res = await call(s, 'GET', `/api/purchase-orders?q=${encodeURIComponent(number)}`);
  return res.json().purchaseOrders.find((p: Json) => p.number === number);
}

describe('POST /api/public/freelancers/{token}/purchase-orders with VAT and sound check', () => {
  it('VAT-liable, one gig without sound check: line breakdowns, total, partner + public shapes', async () => {
    const e1 = await playedEvent(PAST);
    const e2 = await playedEvent(PAST_2);
    const token = await tokenOf(s.world.p1.id);
    const res = await createPo(token, {
      vatLiable: true,
      lines: [
        { costLineId: lineOf(e2, 'VOC').id, soundcheck: false },
        { costLineId: lineOf(e1, 'VOC').id, soundcheck: true },
      ],
    });
    expect(res.statusCode).toBe(201);
    const created = res.json();
    const deduction = FEES.loadInDeduction;
    const vat1 = Math.round((30000 * 1350) / 10000);
    const vat2 = Math.round(((30000 - deduction) * 1350) / 10000);
    expect(created).toMatchObject({
      vatLiable: true,
      totalCents: 30000 + vat1 + (30000 - deduction + vat2),
      lines: [
        { eventStartDate: PAST, baseCents: 30000, soundcheck: true, deductionCents: 0, vatCents: vat1, amountCents: 30000 + vat1 },
        {
          eventStartDate: PAST_2,
          baseCents: 30000,
          soundcheck: false,
          deductionCents: deduction,
          vatCents: vat2,
          amountCents: 30000 - deduction + vat2,
        },
      ],
    });

    const po = await poByNumber(created.number);
    expect(po.vatLiable).toBe(true);
    expect(po.totalCents).toBe(created.totalCents);
    expect((po.lines as Record<string, unknown>[]).map((l) => [l.costLineId, l.baseCents, l.soundcheck, l.deductionCents, l.vatCents, l.amountCents])).toEqual([
      [lineOf(e1, 'VOC').id, 30000, true, 0, vat1, 30000 + vat1],
      [lineOf(e2, 'VOC').id, 30000, false, deduction, vat2, 30000 - deduction + vat2],
    ]);

    // The cost lines' budgeted fee is unchanged; the freelancer view shows the PO amount while ON_PO
    const event = (await call(s, 'GET', `/api/events/${e2.id}`)).json();
    expect(lineOf(event, 'VOC').budgetedCents).toBe(30000);
    const v = (await anon('GET', `/api/public/freelancers/${token}`)).json();
    const onPo = v.lines.find((l: Json) => l.costLineId === lineOf(e2, 'VOC').id);
    expect(onPo).toMatchObject({ state: 'ON_PO', amountCents: 30000 - deduction + vat2 });
    const selectable = v.lines.find((l: Json) => l.costLineId === lineOf(e2, 'BASS').id);
    expect(selectable).toMatchObject({ state: 'SELECTABLE', amountCents: 20000 }); // budgeted, alv 0 %
    expect(v.purchaseOrders).toEqual([created]);
  });

  it('not VAT-liable: no VAT; sound check off deducts the current setting value, not below 0', async () => {
    await setSetting(SETTING_KEYS.loadInDeduction, 25000);
    const e = await playedEvent(PAST);
    const token = await tokenOf(s.world.p1.id);
    const res = await createPo(token, {
      vatLiable: false,
      lines: [
        { costLineId: lineOf(e, 'VOC').id, soundcheck: false },
        { costLineId: lineOf(e, 'BASS').id, soundcheck: false },
      ],
    });
    expect(res.statusCode).toBe(201);
    const created = res.json();
    expect(created.vatLiable).toBe(false);
    expect((created.lines as Record<string, unknown>[]).map((l) => [l.type, l.deductionCents, l.vatCents, l.amountCents])).toEqual([
      ['VOC', 25000, 0, 5000],
      ['BASS', 20000, 0, 0],
    ]);
    expect(created.totalCents).toBe(5000);
  });

  it('uses the seeded VAT rate setting; FreelancerView.settings shows the values', async () => {
    await setSetting(OPTIONAL_NUMBER_SETTING_KEYS.performerVatRateBp, 2400);
    await setSetting(SETTING_KEYS.loadInDeduction, 5000);
    const e = await playedEvent(PAST);
    const token = await tokenOf(s.world.p1.id);
    const v = (await anon('GET', `/api/public/freelancers/${token}`)).json();
    expect(v.settings).toEqual({ soundcheckDeductionCents: 5000, vatRateBp: 2400 });

    const res = await createPo(token, { vatLiable: true, lines: [{ costLineId: lineOf(e, 'BASS').id, soundcheck: true }] });
    expect(res.json().lines[0]).toMatchObject({ baseCents: 20000, vatCents: 4800, amountCents: 24800 });
    expect(res.json().totalCents).toBe(24800);
  });

  it('paying sets each cost line actual = line amount incl. VAT; unpay clears it', async () => {
    const e = await playedEvent(PAST);
    const token = await tokenOf(s.world.p1.id);
    const created = (
      await createPo(token, { vatLiable: true, lines: [{ costLineId: lineOf(e, 'VOC').id, soundcheck: false }] })
    ).json();
    const expected = created.lines[0].amountCents;
    const po = await poByNumber(created.number);

    const paid = await call(s, 'POST', `/api/purchase-orders/${po.id}/pay`);
    expect(paid.statusCode).toBe(200);
    const event = (await call(s, 'GET', `/api/events/${e.id}`)).json();
    expect(lineOf(event, 'VOC')).toMatchObject({ actualCents: expected, budgetedCents: 30000 });
    const v = (await anon('GET', `/api/public/freelancers/${token}`)).json();
    expect(v.lines.find((l: Json) => l.costLineId === lineOf(e, 'VOC').id)).toMatchObject({ state: 'PAID', amountCents: expected });

    await call(s, 'POST', `/api/purchase-orders/${po.id}/unpay`);
    const after = (await call(s, 'GET', `/api/events/${e.id}`)).json();
    expect(lineOf(after, 'VOC').actualCents).toBeNull();
  });

  it('409 COST_LINE_NOT_ELIGIBLE with the new body: nothing created', async () => {
    const e = await playedEvent(PAST);
    const token = await tokenOf(s.world.p1.id);
    const res = await createPo(token, {
      vatLiable: true,
      lines: [
        { costLineId: lineOf(e, 'VOC').id, soundcheck: true },
        { costLineId: UNKNOWN_ID, soundcheck: false },
      ],
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toMatchObject({ code: 'COST_LINE_NOT_ELIGIBLE', details: { costLineIds: [UNKNOWN_ID] } });
    expect(await testDb().purchaseOrder.count()).toBe(0);
  });

  it('legacy { costLineIds } = not VAT-liable, sound check on every line', async () => {
    const e = await playedEvent(PAST);
    const token = await tokenOf(s.world.p1.id);
    const res = await createPo(token, { costLineIds: [lineOf(e, 'VOC').id] });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({
      vatLiable: false,
      totalCents: 30000,
      lines: [{ baseCents: 30000, soundcheck: true, deductionCents: 0, vatCents: 0, amountCents: 30000 }],
    });
  });

  it('400 validation (checked before the token)', async () => {
    const token = await tokenOf(s.world.p1.id);
    const line = { costLineId: UNKNOWN_ID, soundcheck: true };
    const expectFields = async (payload: unknown, fields: Record<string, string>, t = token) => {
      const res = await createPo(t, payload);
      expect(res.statusCode).toBe(400);
      expect(res.json().error).toMatchObject({ code: 'VALIDATION_ERROR' });
      expect(res.json().error.fields).toEqual(fields);
    };
    await expectFields({}, { vatLiable: 'REQUIRED', lines: 'REQUIRED' });
    await expectFields({ lines: [line] }, { vatLiable: 'REQUIRED' });
    await expectFields({ vatLiable: 'yes', lines: [line] }, { vatLiable: 'INVALID_VALUE' });
    await expectFields({ vatLiable: true }, { lines: 'REQUIRED' });
    await expectFields({ vatLiable: true, lines: [] }, { lines: 'INVALID_VALUE' });
    await expectFields({ vatLiable: true, lines: 'x' }, { lines: 'INVALID_VALUE' });
    await expectFields({ vatLiable: true, lines: [{ costLineId: UNKNOWN_ID }] }, { lines: 'INVALID_VALUE' });
    await expectFields({ vatLiable: true, lines: [{ costLineId: UNKNOWN_ID, soundcheck: 'no' }] }, { lines: 'INVALID_VALUE' });
    await expectFields({ vatLiable: true, lines: [{ costLineId: 'nope', soundcheck: true }] }, { lines: 'INVALID_VALUE' });
    await expectFields(
      { vatLiable: true, lines: [line, { costLineId: UNKNOWN_ID.toUpperCase(), soundcheck: false }] },
      { lines: 'INVALID_VALUE' },
    );
    const many = Array.from({ length: 201 }, (_, i) => ({
      costLineId: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
      soundcheck: true,
    }));
    await expectFields({ vatLiable: true, lines: many }, { lines: 'INVALID_VALUE' });
    await expectFields({}, { vatLiable: 'REQUIRED', lines: 'REQUIRED' }, 'A'.repeat(43));
  });
});

describe('POST /api/purchase-orders (partner) stays without VAT / sound check', () => {
  it('lines soundcheck true, no VAT, total = budgeted', async () => {
    await setSetting(OPTIONAL_NUMBER_SETTING_KEYS.performerVatRateBp, 2400);
    const e = await playedEvent(PAST);
    const res = await call(s, 'POST', '/api/purchase-orders', {
      personId: s.world.p1.id,
      costLineIds: [lineOf(e, 'VOC').id, lineOf(e, 'BASS').id],
    });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({
      vatLiable: false,
      totalCents: 50000,
      lines: [
        { amountCents: 30000, baseCents: 30000, soundcheck: true, deductionCents: 0, vatCents: 0 },
        { amountCents: 20000, baseCents: 20000, soundcheck: true, deductionCents: 0, vatCents: 0 },
      ],
    });
  });
});
