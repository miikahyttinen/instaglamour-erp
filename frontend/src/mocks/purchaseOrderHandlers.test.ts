// The purchase order mocks follow the contract (UC-034, BR-116…BR-119), so the UI behaves like
// the real backend.
import { beforeEach, describe, expect, it } from 'vitest';
import type { ApiError } from '../api/client';
import { costLinesApi, eventsApi, peopleApi, purchaseOrdersApi } from '../api/endpoints';
import { addMockEvent, partnerA, person, staffMockEvent, TEST_YEAR } from '../test/eventFixtures';
import { addMockPurchaseOrder, clearPurchaseOrders, localTs } from '../test/purchaseOrderFixtures';
import { signInMock } from '../test/renderApp';
import { db, resetMockDb } from './data';
import { createPurchaseOrder, purchaseOrderNumber, purchaseOrderSlug } from './freelancerStore';

async function expectError(promise: Promise<unknown>): Promise<ApiError> {
  try {
    await promise;
  } catch (error) {
    return error as ApiError;
  }
  throw new Error('expected an error');
}

const costLine = (id: string) => db.events.costLines.find((l) => l.id === id)!;

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
    const statuses = new Set(db.freelancer.purchaseOrders.map((po) => po.status));
    expect(statuses).toEqual(new Set(['OPEN', 'PAID', 'CANCELLED']));
    for (const po of db.freelancer.purchaseOrders) {
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
    const { po, event } = addMockPurchaseOrder();
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
    const history = await eventsApi.history(event.id);
    expect(history[0]).toMatchObject({ type: 'COST_PAID', details: { purchaseOrderNumber: po.number } });
    expect((await expectError(purchaseOrdersApi.pay(po.id))).code).toBe('INVALID_STATUS_TRANSITION');

    const reopened = await purchaseOrdersApi.unpay(po.id);
    expect(reopened.status).toBe('OPEN');
    expect(costLine(lineId)).toMatchObject({ actualCents: null, paidAt: null, purchaseOrder: { status: 'OPEN' } });
    expect((await eventsApi.history(event.id))[0]).toMatchObject({ type: 'COST_UNPAID' });
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
    const { po, event } = addMockPurchaseOrder();
    const lineId = po.lines[0]!.costLineId;
    for (const call of [
      () => costLinesApi.update(lineId, { personId: null }),
      () => costLinesApi.update(lineId, { budgetedCents: 1 }),
      () => costLinesApi.update(lineId, { joinsLoadIn: false }),
      () => costLinesApi.pay(lineId),
      () => costLinesApi.unpay(lineId),
      () => costLinesApi.remove(lineId),
      () => eventsApi.cancel(event.id, { reason: 'x' }),
      () => eventsApi.delete(event.id, { reason: 'x' }),
    ]) {
      const error = await expectError(call());
      expect(error.code).toBe('COST_LINE_ON_PURCHASE_ORDER');
      expect(error.details).toEqual({ purchaseOrderNumber: po.number });
    }
    // The description stays editable.
    const result = await costLinesApi.update(lineId, { description: 'Extra set' });
    expect(result.event.costLines.find((l) => l.id === lineId)?.description).toBe('Extra set');
  });

  it('a paid PO no longer blocks cancelling the event (only open POs do)', async () => {
    const { event } = addMockPurchaseOrder({ status: 'PAID' });
    const cancelled = await eventsApi.cancel(event.id, { reason: 'Called off.' });
    expect(cancelled.status).toBe('CANCELLED');
  });

  it('a PO made by the freelancer puts the line on it; cancelling frees it (one PO store)', async () => {
    const event = addMockEvent({ startDate: '2020-05-01' }); // played
    staffMockEvent(event, ['Person 1']);
    const lineId = db.events.costLines.find((l) => l.eventId === event.id && l.type === 'VOC')!.id;
    const person1 = db.events.people.find((p) => p.id === person('Person 1').id)!;
    const result = createPurchaseOrder(db.freelancer, db.events, person1, [lineId]);
    if (!result.ok) throw new Error('not created');
    const po = result.purchaseOrder;
    expect(costLine(lineId).purchaseOrder).toEqual({ id: po.id, number: po.number, status: 'OPEN' });
    expect((await purchaseOrdersApi.list({ q: po.number })).purchaseOrders.map((p) => p.id)).toEqual([po.id]);
    await purchaseOrdersApi.cancel(po.id, { reason: 'Wrong fee.' });
    expect(costLine(lineId).purchaseOrder).toBeNull();
  });
});

describe('purchase orders created by partners (mocks)', () => {
  beforeEach(() => {
    signInMock();
    clearPurchaseOrders();
  });

  it('eligible lines: unpaid, not on a PO, amount > 0, SOLD (upcoming too), no FUEL; eventId limits', async () => {
    const event = addMockEvent({ venue: 'Venue Q', startDate: `${TEST_YEAR}-06-01` });
    const other = addMockEvent({ venue: 'Venue R', startDate: `${TEST_YEAR}-07-01` });
    staffMockEvent(event, ['Person 5']);
    staffMockEvent(other, ['Person 5']);
    const id = person('Person 5').id;
    const all = await peopleApi.poEligibleLines(id);
    const ours = all.filter((l) => l.eventId === event.id || l.eventId === other.id);
    expect(ours.map((l) => l.eventVenue)).toEqual(['Venue R', 'Venue Q']);
    expect(all.some((l) => l.type === 'FUEL')).toBe(false);
    const one = await peopleApi.poEligibleLines(id, event.id);
    expect(one.map((l) => l.eventId)).toEqual([event.id]);

    const po = await purchaseOrdersApi.create({ personId: id, costLineIds: [one[0]!.costLineId] });
    expect(po.status).toBe('OPEN');
    expect(costLine(one[0]!.costLineId).purchaseOrder).toEqual({ id: po.id, number: po.number, status: 'OPEN' });
    expect(db.freelancer.events.at(-1)).toMatchObject({ type: 'CREATED', partnerId: partnerA().id });
    expect(await peopleApi.poEligibleLines(id, event.id)).toEqual([]);

    // Already on a PO → 409 with the ids; unknown person → 400.
    const conflict = await expectError(purchaseOrdersApi.create({ personId: id, costLineIds: [one[0]!.costLineId] }));
    expect(conflict.code).toBe('COST_LINE_NOT_ELIGIBLE');
    expect(conflict.details.costLineIds).toEqual([one[0]!.costLineId]);
    const unknown = await expectError(purchaseOrdersApi.create({ personId: 'nope', costLineIds: ['x'] }));
    expect(unknown.fields.personId).toBe('UNKNOWN_REFERENCE');
  });
});
