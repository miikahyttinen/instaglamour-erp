// The purchase order mocks follow the contract (UC-034, BR-116…BR-119), so the UI behaves like
// the real backend.
import { beforeEach, describe, expect, it } from 'vitest';
import type { ApiError } from '../api/client';
import { costLinesApi, gigsApi, purchaseOrdersApi } from '../api/endpoints';
import { partnerA, TEST_YEAR } from '../test/gigFixtures';
import { addMockPurchaseOrder, clearPurchaseOrders, localTs } from '../test/purchaseOrderFixtures';
import { signInMock } from '../test/renderApp';
import { db, resetMockDb } from './data';
import { purchaseOrderNumber, purchaseOrderSlug } from './purchaseOrderStore';

async function expectError(promise: Promise<unknown>): Promise<ApiError> {
  try {
    await promise;
  } catch (error) {
    return error as ApiError;
  }
  throw new Error('expected an error');
}

const costLine = (id: string) => db.gigs.costLines.find((l) => l.id === id)!;

describe('purchase order number (BR-116)', () => {
  it('slugs the name: accents removed, upper case, other characters → dashes', () => {
    expect(purchaseOrderSlug('Person 1')).toBe('PERSON-1');
    expect(purchaseOrderSlug('  Äö-å Ñame!! ')).toBe('AO-A-NAME');
    expect(purchaseOrderSlug('***')).toBe('PERSON');
    expect(purchaseOrderNumber('Person 1', 42)).toBe('PERSON-1-0042');
    expect(purchaseOrderNumber('Person 1', 12345)).toBe('PERSON-1-12345');
  });
});

describe('purchase order mocks', () => {
  beforeEach(() => {
    signInMock();
    clearPurchaseOrders();
  });

  it('seeds synthetic POs in every status, lines on them carry purchaseOrder', () => {
    resetMockDb();
    const statuses = new Set(db.purchaseOrders.orders.map((po) => po.status));
    expect(statuses).toEqual(new Set(['OPEN', 'PAID', 'CANCELLED']));
    for (const po of db.purchaseOrders.orders) {
      expect(po.personName).toMatch(/^Person \d$/);
      for (const line of po.lines) {
        const onPo = costLine(line.costLineId).purchaseOrder;
        if (po.status === 'CANCELLED') continue;
        expect(onPo).toEqual({ id: po.id, number: po.number, status: po.status });
      }
    }
  });

  it('lists the year by creation date, newest first; q searches every year and ignores year', async () => {
    const older = addMockPurchaseOrder({ personName: 'Person 2', createdAt: localTs(TEST_YEAR, 3, 1) }).po;
    const newer = addMockPurchaseOrder({ personName: 'Person 3', createdAt: localTs(TEST_YEAR, 7, 1) }).po;
    const nextYear = addMockPurchaseOrder({ personName: 'Person 2', createdAt: localTs(TEST_YEAR + 1, 1, 10) }).po;

    const list = await purchaseOrdersApi.list({ year: TEST_YEAR });
    expect(list.purchaseOrders.map((p) => p.id)).toEqual([newer.id, older.id]);

    const byName = await purchaseOrdersApi.list({ year: TEST_YEAR, q: 'person 2' });
    expect(byName.purchaseOrders.map((p) => p.id)).toEqual([nextYear.id, older.id]);

    const byNumber = await purchaseOrdersApi.list({ q: newer.number.slice(-4) });
    expect(byNumber.purchaseOrders.map((p) => p.id)).toEqual([newer.id]);

    expect((await purchaseOrdersApi.list({ year: TEST_YEAR, status: 'PAID' })).purchaseOrders).toEqual([]);
  });

  it('pay marks every line paid with the PO amount, logs COST_PAID with the number; unpay reverts', async () => {
    const { po, gig } = addMockPurchaseOrder();
    const lineId = po.lines[0]!.costLineId;
    costLine(lineId).budgetedCents = 99999; // the snapshot is what gets paid

    const paid = await purchaseOrdersApi.pay(po.id);
    expect(paid.status).toBe('PAID');
    expect(paid.paidBy).toBe(partnerA().id);
    expect(costLine(lineId)).toMatchObject({
      actualCents: po.lines[0]!.amountCents,
      paidBy: partnerA().id,
      purchaseOrder: { id: po.id, number: po.number, status: 'PAID' },
    });
    const history = await gigsApi.history(gig.id);
    expect(history[0]).toMatchObject({ type: 'COST_PAID', details: { purchaseOrderNumber: po.number } });
    expect((await expectError(purchaseOrdersApi.pay(po.id))).code).toBe('INVALID_STATUS_TRANSITION');

    const reopened = await purchaseOrdersApi.unpay(po.id);
    expect(reopened.status).toBe('OPEN');
    expect(costLine(lineId)).toMatchObject({ actualCents: null, paidAt: null, purchaseOrder: { status: 'OPEN' } });
    expect((await gigsApi.history(gig.id))[0]).toMatchObject({ type: 'COST_UNPAID' });
    expect((await expectError(purchaseOrdersApi.unpay(po.id))).code).toBe('INVALID_STATUS_TRANSITION');
  });

  it('cancel needs a reason, frees the lines and is final', async () => {
    const { po } = addMockPurchaseOrder();
    const error = await expectError(purchaseOrdersApi.cancel(po.id, { reason: ' ' }));
    expect(error.fields).toEqual({ reason: 'REQUIRED' });
    const cancelled = await purchaseOrdersApi.cancel(po.id, { reason: 'Wrong fee.' });
    expect(cancelled).toMatchObject({ status: 'CANCELLED', cancelReason: 'Wrong fee.', cancelledBy: partnerA().id });
    expect(costLine(po.lines[0]!.costLineId).purchaseOrder).toBeNull();
    expect((await expectError(purchaseOrdersApi.pay(po.id))).code).toBe('INVALID_STATUS_TRANSITION');
    expect((await expectError(purchaseOrdersApi.cancel(po.id, { reason: 'x' }))).code).toBe(
      'INVALID_STATUS_TRANSITION',
    );
  });

  it('logs every event with its actor (null = freelancer), newest first', async () => {
    // Created in the past, so the events made now are newer.
    const { po } = addMockPurchaseOrder({ createdAt: localTs(2020, 1, 1) });
    await purchaseOrdersApi.pay(po.id);
    await purchaseOrdersApi.unpay(po.id);
    await purchaseOrdersApi.cancel(po.id, { reason: 'Wrong fee.' });
    const history = await purchaseOrdersApi.history(po.id);
    expect(history.map((e) => [e.type, e.partnerId])).toEqual([
      ['CANCELLED', partnerA().id],
      ['UNPAID', partnerA().id],
      ['PAID', partnerA().id],
      ['CREATED', null],
    ]);
    expect(history[0]!.details).toEqual({ reason: 'Wrong fee.' });
    const events = await purchaseOrdersApi.events(2);
    expect(events.map((e) => e.type)).toEqual(['CANCELLED', 'UNPAID']);
  });

  it('locks person, amount, load-in, paid state and delete of a line on a PO (BR-118)', async () => {
    const { po, gig } = addMockPurchaseOrder();
    const lineId = po.lines[0]!.costLineId;
    for (const call of [
      () => costLinesApi.update(lineId, { personId: null }),
      () => costLinesApi.update(lineId, { budgetedCents: 1 }),
      () => costLinesApi.update(lineId, { joinsLoadIn: false }),
      () => costLinesApi.pay(lineId),
      () => costLinesApi.unpay(lineId),
      () => costLinesApi.remove(lineId),
      () => gigsApi.cancel(gig.id, { reason: 'x' }),
      () => gigsApi.delete(gig.id, { reason: 'x' }),
    ]) {
      const error = await expectError(call());
      expect(error.code).toBe('COST_LINE_ON_PURCHASE_ORDER');
      expect(error.details).toEqual({ purchaseOrderNumber: po.number });
    }
    // The description stays editable.
    const result = await costLinesApi.update(lineId, { description: 'Extra set' });
    expect(result.gig.costLines.find((l) => l.id === lineId)?.description).toBe('Extra set');
  });

  it('a paid PO no longer blocks cancelling the gig (only open POs do)', async () => {
    const { gig } = addMockPurchaseOrder({ status: 'PAID' });
    const cancelled = await gigsApi.cancel(gig.id, { reason: 'Called off.' });
    expect(cancelled.status).toBe('CANCELLED');
  });
});
