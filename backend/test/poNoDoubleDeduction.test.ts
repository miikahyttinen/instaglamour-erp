/**
 * Freelancer PO: sound check already set on the gig (api-contract 2026-11-04) — no double deduction.
 * - FreelancerLine shows the cost line's joinsLoadIn + loadInDeductionAppliedCents;
 * - a line already at joinsLoadIn = false is never deducted again (public and partner path):
 *   stored soundcheck false, base = budgeted + applied, deduction = applied, VAT on the budgeted fee;
 * - a line at joinsLoadIn = true with soundcheck false is deducted once (as before).
 * Synthetic data only; the deduction comes from test settings.
 */
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SETTING_KEYS } from '../src/domain/enums.js';
import { poCostLineAmount } from '../src/purchaseOrders/amounts.js';
import { closeTestDb, resetDb } from './helpers.js';
import { call, createEvent, FEES, setSetting, startSession, type Json, type Session } from './eventFixtures.js';

describe('poCostLineAmount', () => {
  const settings = { soundcheckDeductionCents: 10000 };

  it('line already off: ignores the request, shows the applied deduction once, VAT on budgeted', () => {
    const line = { budgetedCents: 20000, joinsLoadIn: false, loadInDeductionAppliedCents: 10000 };
    for (const soundcheck of [true, false]) {
      expect(poCostLineAmount(line, { soundcheck, vatRateBp: 1350 }, settings)).toEqual({
        soundcheck: false,
        baseCents: 30000,
        deductionCents: 10000,
        vatCents: 2700,
        amountCents: 22700,
      });
    }
  });

  it('line already off without a remembered amount: no deduction at all', () => {
    const line = { budgetedCents: 20000, joinsLoadIn: false, loadInDeductionAppliedCents: null };
    expect(poCostLineAmount(line, { soundcheck: false, vatRateBp: 0 }, settings)).toEqual({
      soundcheck: false,
      baseCents: 20000,
      deductionCents: 0,
      vatCents: 0,
      amountCents: 20000,
    });
  });

  it('line on (or not a musician line): the requested sound check as before', () => {
    expect(poCostLineAmount({ budgetedCents: 30000, joinsLoadIn: true, loadInDeductionAppliedCents: null }, { soundcheck: false, vatRateBp: 0 }, settings))
      .toEqual({ soundcheck: false, baseCents: 30000, deductionCents: 10000, vatCents: 0, amountCents: 20000 });
    expect(poCostLineAmount({ budgetedCents: 30000, joinsLoadIn: null, loadInDeductionAppliedCents: null }, { soundcheck: true, vatRateBp: 0 }, settings))
      .toEqual({ soundcheck: true, baseCents: 30000, deductionCents: 0, vatCents: 0, amountCents: 30000 });
  });
});

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
const D = FEES.loadInDeduction;

const anon = (method: 'GET' | 'POST', url: string, payload?: unknown) =>
  s.app.inject({ method, url, remoteAddress: '10.0.0.5', ...(payload !== undefined && { payload: payload as object }) });

async function tokenOf(personId: string): Promise<string> {
  const res = await call(s, 'GET', `/api/people/${personId}/freelancer-link`);
  return res.json<{ sharePath: string }>().sharePath.slice(3);
}

const lineOf = (event: Json, type: string): Json => event.costLines.find((l: Json) => l.type === type);

/** A played event (Template A: VOC 30000, BASS 20000), Person 1 on both; VOC set to "no sound check" on the gig. */
async function eventWithVocOff(startDate = PAST): Promise<{ voc: Json; bass: Json }> {
  const event = await createEvent(s, { startDate });
  await call(s, 'PATCH', `/api/cost-lines/${lineOf(event, 'BASS').id}`, { personId: s.world.p1.id });
  const res = await call(s, 'PATCH', `/api/cost-lines/${lineOf(event, 'VOC').id}`, { personId: s.world.p1.id, joinsLoadIn: false });
  const updated = res.json().event;
  return { voc: lineOf(updated, 'VOC'), bass: lineOf(updated, 'BASS') };
}

const createPo = (token: string, body: unknown) => anon('POST', `/api/public/freelancers/${token}/purchase-orders`, body);

describe('FreelancerLine.joinsLoadIn / loadInDeductionAppliedCents', () => {
  it('shows the gig-level load-in setting of each line', async () => {
    const { voc, bass } = await eventWithVocOff();
    expect(voc).toMatchObject({ joinsLoadIn: false, loadInDeductionAppliedCents: D, budgetedCents: 30000 - D });
    const token = await tokenOf(s.world.p1.id);
    const v = (await anon('GET', `/api/public/freelancers/${token}`)).json();
    expect(v.lines.find((l: Json) => l.costLineId === voc.id)).toMatchObject({
      joinsLoadIn: false,
      loadInDeductionAppliedCents: D,
      amountCents: 30000 - D,
      state: 'SELECTABLE',
    });
    expect(v.lines.find((l: Json) => l.costLineId === bass.id)).toMatchObject({
      joinsLoadIn: true,
      loadInDeductionAppliedCents: null,
      amountCents: 20000,
    });
  });
});

describe('public PO creation never deducts twice', () => {
  for (const soundcheck of [false, true]) {
    it(`line already off, request soundcheck ${soundcheck} → deduction shown once, VAT on top`, async () => {
      const { voc } = await eventWithVocOff();
      const token = await tokenOf(s.world.p1.id);
      const res = await createPo(token, { vatRateBp: 1350, lines: [{ costLineId: voc.id, soundcheck }] });
      expect(res.statusCode).toBe(201);
      const net = 30000 - D;
      const vat = Math.round((net * 1350) / 10000);
      expect(res.json().lines[0]).toMatchObject({
        baseCents: 30000,
        soundcheck: false,
        deductionCents: D,
        vatCents: vat,
        amountCents: net + vat,
      });
      expect(res.json().totalCents).toBe(net + vat);
    });
  }

  it('the remembered amount wins even if the setting changed since', async () => {
    const { voc } = await eventWithVocOff();
    await setSetting(SETTING_KEYS.loadInDeduction, 25000);
    const token = await tokenOf(s.world.p1.id);
    const res = await createPo(token, { vatRateBp: 0, lines: [{ costLineId: voc.id, soundcheck: false }] });
    expect(res.json().lines[0]).toMatchObject({ baseCents: 30000, soundcheck: false, deductionCents: D, amountCents: 30000 - D });
  });

  it('line on + request soundcheck false → one deduction (unchanged behaviour), mixed with an off line', async () => {
    const { voc, bass } = await eventWithVocOff();
    const token = await tokenOf(s.world.p1.id);
    const res = await createPo(token, {
      vatRateBp: 0,
      lines: [
        { costLineId: voc.id, soundcheck: true },
        { costLineId: bass.id, soundcheck: false },
      ],
    });
    expect(res.statusCode).toBe(201);
    expect((res.json().lines as Json[]).map((l): unknown[] => [l.type, l.baseCents, l.soundcheck, l.deductionCents, l.amountCents])).toEqual([
      ['VOC', 30000, false, D, 30000 - D],
      ['BASS', 20000, false, D, 20000 - D],
    ]);
    expect(res.json().totalCents).toBe(30000 - D + 20000 - D);
    // The cost lines themselves are unchanged
    const event = (await call(s, 'GET', `/api/events/${voc.eventId}`)).json();
    expect(lineOf(event, 'VOC')).toMatchObject({ budgetedCents: 30000 - D, joinsLoadIn: false });
    expect(lineOf(event, 'BASS')).toMatchObject({ budgetedCents: 20000, joinsLoadIn: true });
  });
});

describe('partner PO creation applies the same rule', () => {
  it('line already off → soundcheck false, deduction shown once; other lines unchanged', async () => {
    const { voc, bass } = await eventWithVocOff();
    const res = await call(s, 'POST', '/api/purchase-orders', { personId: s.world.p1.id, costLineIds: [voc.id, bass.id] });
    expect(res.statusCode).toBe(201);
    expect((res.json().lines as Json[]).map((l): unknown[] => [l.type, l.baseCents, l.soundcheck, l.deductionCents, l.vatCents, l.amountCents])).toEqual([
      ['VOC', 30000, false, D, 0, 30000 - D],
      ['BASS', 20000, true, 0, 0, 20000],
    ]);
    expect(res.json().totalCents).toBe(30000 - D + 20000);
  });
});
