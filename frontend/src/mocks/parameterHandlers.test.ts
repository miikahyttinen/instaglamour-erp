// Parameter mocks follow the contract ("Settings: Parameters tab"), so the UI behaves like the backend.
import { beforeEach, describe, expect, it } from 'vitest';
import type { ApiError } from '../api/client';
import { costLinesApi, eventsApi, parametersApi, referenceApi } from '../api/endpoints';
import type { EventDetail } from '../api/types';
import { signInMock } from '../test/renderApp';
import { db } from './data';

async function apiError(promise: Promise<unknown>): Promise<ApiError> {
  try {
    await promise;
  } catch (error) {
    return error as ApiError;
  }
  throw new Error('expected an error');
}

const KEY = 'fees.load_in_deduction';
const vocLine = (event: EventDetail) => event.costLines.find((l) => l.type === 'VOC')!;

describe('parameter mocks', () => {
  beforeEach(() => {
    signInMock();
  });

  it('lists the registry with the current value and no change info yet', async () => {
    expect(await parametersApi.list()).toEqual([
      { key: KEY, type: 'MONEY', value: db.reference.settings.loadInDeductionCents, updatedAt: null, updatedBy: null },
    ]);
  });

  it('PATCH stores the value, who and when; the reference reflects it', async () => {
    const me = signInMock('partner.b@example.com');
    const saved = await parametersApi.update(KEY, { value: 2500 });
    expect(saved).toMatchObject({ key: KEY, value: 2500, updatedBy: me.id, updatedAt: expect.any(String) });
    expect((await parametersApi.list())[0]).toEqual(saved);
    expect((await referenceApi.get()).settings.loadInDeductionCents).toBe(2500);
  });

  it('unknown key → 404; negative → NEGATIVE_AMOUNT; too large / not an integer → INVALID_VALUE', async () => {
    expect((await apiError(parametersApi.update('nope', { value: 1 }))).status).toBe(404);
    expect((await apiError(parametersApi.update(KEY, { value: -1 }))).fields).toEqual({ value: 'NEGATIVE_AMOUNT' });
    expect((await apiError(parametersApi.update(KEY, { value: 100_000_001 }))).fields).toEqual({
      value: 'INVALID_VALUE',
    });
    expect((await apiError(parametersApi.update(KEY, { value: 1.5 }))).fields).toEqual({ value: 'INVALID_VALUE' });
  });

  it('existing lines keep their deduction; a later load-in switch-off uses the new value', async () => {
    const template = db.reference.lineupTemplates[0]!;
    const partner = db.partners[0]!;
    const input = {
      startDate: '2030-06-01',
      lineupTemplateId: template.id,
      venue: 'Venue X',
      sellerId: partner.id,
      producerId: partner.id,
      priceCents: 100000,
    };
    await parametersApi.update(KEY, { value: 1000 });
    const first = await eventsApi.create(input);
    const before = await costLinesApi.update(vocLine(first).id, { joinsLoadIn: false });
    expect(vocLine(before.event).loadInDeductionAppliedCents).toBe(1000);

    await parametersApi.update(KEY, { value: 3000 });
    const second = await eventsApi.create({ ...input, startDate: '2030-06-02' });
    const after = await costLinesApi.update(vocLine(second).id, { joinsLoadIn: false });
    expect(vocLine(after.event).loadInDeductionAppliedCents).toBe(3000);
    const firstAgain = await eventsApi.get(first.id);
    expect(vocLine(firstAgain).loadInDeductionAppliedCents).toBe(1000);
  });
});
