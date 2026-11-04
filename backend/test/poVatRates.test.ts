/**
 * Freelancer PO: VAT rate choice (api-contract 2026-11-04, "replaces the yes/no VAT question").
 * - rates from settings: `fees.performer_vat_rates_bp`, fallback to the old `fees.performer_vat_rate_bp`;
 * - public create with `{ vatRateBp, lines }` for each allowed rate, invalid rates, legacy bodies;
 * - responses carry `vatRateBp` and `vatLiable` (= vatRateBp > 0).
 * Synthetic data only; rates come from test settings.
 */
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { OPTIONAL_NUMBER_SETTING_KEYS, PERFORMER_VAT_RATES_SETTING_KEY, parsePerformerVatRates } from '../src/domain/enums.js';
import { resolveVatRates } from '../src/purchaseOrders/amounts.js';
import { closeTestDb, resetDb, testDb } from './helpers.js';
import { call, createEvent, FEES, setSetting, startSession, UNKNOWN_ID, type Json, type Session } from './eventFixtures.js';

// ======================================================================== pure
describe('parsePerformerVatRates / resolveVatRates', () => {
  const row = (key: string, valueCents: number | null, valueText: string | null = null) => ({ key, valueCents, valueText });
  const LIST = PERFORMER_VAT_RATES_SETTING_KEY;
  const OLD = OPTIONAL_NUMBER_SETTING_KEYS.performerVatRateBp;

  it('parses comma-separated basis points', () => {
    expect(parsePerformerVatRates('1350,2550')).toEqual([1350, 2550]);
    expect(parsePerformerVatRates(' 1000 , 2400 ,10000')).toEqual([1000, 2400, 10000]);
    for (const bad of ['', ' ', 'x', '1350,', '1350,1350', '0', '10001', '13.5', '-1', '1350;2550']) {
      expect(parsePerformerVatRates(bad), bad).toBeNull();
    }
  });

  it('no rows → default [1350, 2550]', () => {
    expect(resolveVatRates([])).toEqual([1350, 2550]);
  });

  it('only the old single rate → it is the first rate', () => {
    expect(resolveVatRates([row(OLD, 2400)])).toEqual([2400, 2550]);
    expect(resolveVatRates([row(OLD, 2550)])).toEqual([2550]); // no duplicates
    expect(resolveVatRates([row(OLD, 0)])).toEqual([2550]); // 0 is "no VAT", always allowed anyway
  });

  it('the new list wins over the old setting; an invalid list falls back', () => {
    expect(resolveVatRates([row(OLD, 2400), row(LIST, null, '1000,2000,3000')])).toEqual([1000, 2000, 3000]);
    expect(resolveVatRates([row(OLD, 2400), row(LIST, null, 'nonsense')])).toEqual([2400, 2550]);
    expect(resolveVatRates([row(LIST, null, null)])).toEqual([1350, 2550]);
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

const anon = (method: 'GET' | 'POST', url: string, payload?: unknown) =>
  s.app.inject({ method, url, remoteAddress: '10.0.0.5', ...(payload !== undefined && { payload: payload as object }) });

async function tokenOf(personId: string): Promise<string> {
  const res = await call(s, 'GET', `/api/people/${personId}/freelancer-link`);
  return res.json<{ sharePath: string }>().sharePath.slice(3);
}

const lineOf = (event: Json, type: string): Json => event.costLines.find((l: Json) => l.type === type);

/** A played event (Template A: VOC 30000, BASS 20000) with Person 1 on VOC and BASS. */
async function playedEvent(): Promise<Json> {
  const event = await createEvent(s, { startDate: PAST });
  await call(s, 'PATCH', `/api/cost-lines/${lineOf(event, 'VOC').id}`, { personId: s.world.p1.id });
  const res = await call(s, 'PATCH', `/api/cost-lines/${lineOf(event, 'BASS').id}`, { personId: s.world.p1.id });
  return res.json().event;
}

const createPo = (token: string, body: unknown) => anon('POST', `/api/public/freelancers/${token}/purchase-orders`, body);

async function poByNumber(number: string): Promise<Json> {
  const res = await call(s, 'GET', `/api/purchase-orders?q=${encodeURIComponent(number)}`);
  return res.json().purchaseOrders.find((p: Json) => p.number === number);
}

const setRatesText = (valueText: string) =>
  testDb().setting.upsert({
    where: { key: PERFORMER_VAT_RATES_SETTING_KEY },
    create: { key: PERFORMER_VAT_RATES_SETTING_KEY, valueText },
    update: { valueText, valueCents: null },
  });

describe('FreelancerView.settings.vatRatesBp', () => {
  it('default, old single-rate fallback, and the new list', async () => {
    const token = await tokenOf(s.world.p1.id);
    const settingsOf = async (): Promise<Json> => (await anon('GET', `/api/public/freelancers/${token}`)).json<Json>().settings;
    expect(await settingsOf()).toEqual({ soundcheckDeductionCents: FEES.loadInDeduction, vatRatesBp: [1350, 2550] });
    await setSetting(OPTIONAL_NUMBER_SETTING_KEYS.performerVatRateBp, 2400);
    expect((await settingsOf()).vatRatesBp).toEqual([2400, 2550]);
    await setRatesText('1000,2000');
    expect((await settingsOf()).vatRatesBp).toEqual([1000, 2000]);
  });
});

describe('POST /api/public/freelancers/{token}/purchase-orders with vatRateBp', () => {
  it.each([
    [0, 0],
    [1350, 4050],
    [2550, 7650],
  ])('vatRateBp %i: VAT on every line, stored and returned (public + partner)', async (rate, vocVat) => {
    const e = await playedEvent();
    const token = await tokenOf(s.world.p1.id);
    const res = await createPo(token, {
      vatRateBp: rate,
      lines: [
        { costLineId: lineOf(e, 'VOC').id, soundcheck: true },
        { costLineId: lineOf(e, 'BASS').id, soundcheck: false },
      ],
    });
    expect(res.statusCode).toBe(201);
    const created = res.json();
    const bassNet = 20000 - FEES.loadInDeduction;
    const bassVat = Math.floor((bassNet * rate + 5000) / 10000);
    expect(created).toMatchObject({
      vatRateBp: rate,
      vatLiable: rate > 0,
      totalCents: 30000 + vocVat + bassNet + bassVat,
      lines: [
        { type: 'VOC', baseCents: 30000, deductionCents: 0, vatCents: vocVat, amountCents: 30000 + vocVat },
        { type: 'BASS', baseCents: 20000, deductionCents: FEES.loadInDeduction, vatCents: bassVat, amountCents: bassNet + bassVat },
      ],
    });
    const po = await poByNumber(created.number);
    expect(po).toMatchObject({ vatRateBp: rate, vatLiable: rate > 0, totalCents: created.totalCents });
    const row = await testDb().purchaseOrder.findUniqueOrThrow({ where: { number: created.number } });
    expect(row).toMatchObject({ vatRateBp: rate, vatLiable: rate > 0 });
    const v = (await anon('GET', `/api/public/freelancers/${token}`)).json();
    expect(v.purchaseOrders).toEqual([created]);
  });

  it('allowed values follow the settings', async () => {
    await setRatesText('1000,2400');
    const e = await playedEvent();
    const token = await tokenOf(s.world.p1.id);
    const line = { costLineId: lineOf(e, 'BASS').id, soundcheck: true };
    expect((await createPo(token, { vatRateBp: 1350, lines: [line] })).json().error.fields).toEqual({ vatRateBp: 'INVALID_VALUE' });
    const res = await createPo(token, { vatRateBp: 2400, lines: [line] });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ vatRateBp: 2400, totalCents: 24800 });
  });

  it('400 vatRateBp: INVALID_VALUE / REQUIRED (checked before the token)', async () => {
    const token = await tokenOf(s.world.p1.id);
    const line = { costLineId: UNKNOWN_ID, soundcheck: true };
    const expectFields = async (payload: unknown, fields: Record<string, string>, t = token) => {
      const res = await createPo(t, payload);
      expect(res.statusCode).toBe(400);
      expect(res.json().error).toMatchObject({ code: 'VALIDATION_ERROR' });
      expect(res.json().error.fields).toEqual(fields);
    };
    for (const bad of [2400, 1349, -1350, 13.5, 1350.5, '1350', true, [1350], {}]) {
      await expectFields({ vatRateBp: bad, lines: [line] }, { vatRateBp: 'INVALID_VALUE' });
    }
    await expectFields({ vatRateBp: null, lines: [line] }, { vatRateBp: 'REQUIRED' });
    await expectFields({ lines: [line] }, { vatRateBp: 'REQUIRED' });
    await expectFields({ vatRateBp: 9999, lines: [] }, { vatRateBp: 'INVALID_VALUE', lines: 'INVALID_VALUE' });
    await expectFields({ vatRateBp: 9999, lines: [line] }, { vatRateBp: 'INVALID_VALUE' }, 'A'.repeat(43));
    expect(await testDb().purchaseOrder.count()).toBe(0);
  });

  it('vatRateBp wins over a legacy vatLiable in the same body', async () => {
    const e = await playedEvent();
    const token = await tokenOf(s.world.p1.id);
    const res = await createPo(token, { vatRateBp: 2550, vatLiable: false, lines: [{ costLineId: lineOf(e, 'BASS').id, soundcheck: true }] });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ vatRateBp: 2550, vatLiable: true, totalCents: 25100 });
  });
});

describe('legacy bodies', () => {
  it('vatLiable: true = the first rate (1350 by default)', async () => {
    const e = await playedEvent();
    const token = await tokenOf(s.world.p1.id);
    const res = await createPo(token, { vatLiable: true, lines: [{ costLineId: lineOf(e, 'BASS').id, soundcheck: true }] });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ vatRateBp: 1350, vatLiable: true, totalCents: 22700 });
  });

  it('vatLiable: false = 0', async () => {
    const e = await playedEvent();
    const token = await tokenOf(s.world.p1.id);
    const res = await createPo(token, { vatLiable: false, lines: [{ costLineId: lineOf(e, 'BASS').id, soundcheck: true }] });
    expect(res.json()).toMatchObject({ vatRateBp: 0, vatLiable: false, totalCents: 20000 });
  });

  it('{ costLineIds } = 0', async () => {
    const e = await playedEvent();
    const token = await tokenOf(s.world.p1.id);
    const res = await createPo(token, { costLineIds: [lineOf(e, 'BASS').id] });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ vatRateBp: 0, vatLiable: false, totalCents: 20000 });
  });

  it('invalid legacy vatLiable → 400 vatLiable: INVALID_VALUE', async () => {
    const token = await tokenOf(s.world.p1.id);
    const res = await createPo(token, { vatLiable: 'yes', lines: [{ costLineId: UNKNOWN_ID, soundcheck: true }] });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.fields).toEqual({ vatLiable: 'INVALID_VALUE' });
  });
});

describe('POST /api/purchase-orders (partner)', () => {
  it('always vatRateBp 0', async () => {
    const e = await playedEvent();
    const res = await call(s, 'POST', '/api/purchase-orders', { personId: s.world.p1.id, costLineIds: [lineOf(e, 'VOC').id] });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ vatRateBp: 0, vatLiable: false, totalCents: 30000 });
  });
});
