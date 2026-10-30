// The event mocks follow the contract's rules, so the UI behaves like the real backend.
import { beforeEach, describe, expect, it } from 'vitest';
import { attachmentsApi, costLinesApi, eventsApi, invoiceRowsApi, peopleApi } from '../api/endpoints';
import type { ApiError } from '../api/client';
import type { EventCreate, EventDetail } from '../api/types';
import { testFile } from '../test/files';
import { signInMock } from '../test/renderApp';
import { db } from './data';

const YEAR = 2030;
const templateA = () => db.reference.lineupTemplates[0]!;
const partnerA = () => db.partners[0]!;
const partnerB = () => db.partners[1]!;

function eventInput(overrides: Partial<EventCreate> = {}): EventCreate {
  return {
    startDate: `${YEAR}-06-01`,
    lineupTemplateId: templateA().id,
    venue: 'Venue X',
    sellerId: partnerA().id,
    producerId: partnerA().id,
    priceCents: 100000,
    ...overrides,
  };
}

async function expectError(promise: Promise<unknown>): Promise<ApiError> {
  try {
    await promise;
  } catch (error) {
    return error as ApiError;
  }
  throw new Error('expected an error');
}

const line = (event: EventDetail, type: string) => event.costLines.find((l) => l.type === type)!;

describe('event mocks', () => {
  beforeEach(() => {
    signInMock();
  });

  it('creates template lines + Office/Sales/Production and computes economics', async () => {
    const event = await eventsApi.create(eventInput({ additionalSalesCents: 10000 }));
    expect(event.costLines.map((l) => l.type)).toEqual([
      'VOC', 'GUITAR', 'BASS', 'DRUMS', 'OFFICE', 'SALES', 'PRODUCTION',
    ]);
    expect(line(event, 'SALES').personId).toBe(partnerA().personId);
    expect(line(event, 'VOC')).toMatchObject({ personId: null, joinsLoadIn: true, budgetedCents: 10000 });
    expect(line(event, 'OFFICE').joinsLoadIn).toBeNull();
    expect(event.totalPriceCents).toBe(110000);
    expect(event.budgetedCostsCents).toBe(4 * 10000 + 3 * 1000);
    expect(event.marginBudgetCents).toBe(110000 - (4 * 10000 + 3 * 1000));
    expect(event.marginBudgetPct).toBe(60.9);
    expect(event.notFullyStaffed).toBe(true);
    const history = await eventsApi.history(event.id);
    expect(history.map((e) => e.type)).toEqual(['CREATED']);
  });

  it('technical setup and logistics are one code or null; house technician is a boolean', async () => {
    const event = await eventsApi.create(eventInput());
    expect(event).toMatchObject({ technicalSetup: null, logistics: null, houseTechnician: false });
    const { event: updated } = await eventsApi.update(event.id, {
      technicalSetup: 'SET_B',
      logistics: 'TAXI',
      houseTechnician: true,
    });
    expect(updated).toMatchObject({ technicalSetup: 'SET_B', logistics: 'TAXI', houseTechnician: true });
    const cleared = await eventsApi.update(event.id, { technicalSetup: null });
    expect(cleared.event.technicalSetup).toBeNull();
    const bad = await expectError(
      eventsApi.create(
        eventInput({
          technicalSetup: ['SET_A'] as never,
          logistics: 'VAN' as never,
          houseTechnician: 'yes' as never,
        }),
      ),
    );
    expect(bad.fields).toEqual({
      technicalSetup: 'INVALID_VALUE',
      logistics: 'INVALID_VALUE',
      houseTechnician: 'INVALID_VALUE',
    });
    // houseTechnician: null is invalid; send true/false or leave it out.
    const nullSwitch = await expectError(eventsApi.update(event.id, { houseTechnician: null as never }));
    expect(nullSwitch.fields).toEqual({ houseTechnician: 'INVALID_VALUE' });
    const ref = db.reference;
    expect(ref.technicalSetups).toEqual(['HOUSE_TECH', 'SET_A', 'SET_B', 'SET_C']);
    expect(ref.logistics).toEqual(['OWN_VAN', 'RENTAL_VAN', 'TAXI', 'OTHER']);
  });

  it('validates input with field codes', async () => {
    const error = await expectError(
      eventsApi.create(
        eventInput({ venue: '', priceCents: -1000, startDate: `${YEAR}-06-02`, endDate: `${YEAR}-06-01`, lineupTemplateId: null }),
      ),
    );
    expect(error.status).toBe(400);
    expect(error.fields).toEqual({
      venue: 'REQUIRED',
      priceCents: 'NEGATIVE_AMOUNT',
      endDate: 'END_BEFORE_START',
      lineupName: 'REQUIRED',
    });
  });

  it('load-in switch subtracts the deduction and restores it exactly (BR-026)', async () => {
    const event = await eventsApi.create(eventInput());
    const voc = line(event, 'VOC');
    let result = await costLinesApi.update(voc.id, { joinsLoadIn: false });
    expect(line(result.event, 'VOC')).toMatchObject({
      joinsLoadIn: false,
      budgetedCents: 10000 - 1000,
      loadInDeductionAppliedCents: 1000,
    });
    db.reference.settings.loadInDeductionCents = 10000; // setting changes in between
    result = await costLinesApi.update(voc.id, { joinsLoadIn: true });
    expect(line(result.event, 'VOC')).toMatchObject({
      joinsLoadIn: true,
      budgetedCents: 10000,
      loadInDeductionAppliedCents: null,
    });
    const office = line(event, 'OFFICE');
    const error = await expectError(costLinesApi.update(office.id, { joinsLoadIn: false }));
    expect(error.fields).toEqual({ joinsLoadIn: 'INVALID_VALUE' });
  });

  it('pays with the budget by default, refuses FUEL, and unpays', async () => {
    const event = await eventsApi.create(eventInput());
    let result = await costLinesApi.pay(line(event, 'OFFICE').id);
    expect(line(result.event, 'OFFICE')).toMatchObject({ actualCents: 1000, paidBy: partnerA().id });
    expect(result.event.actualCostsCents).toBe(1000);
    const firstPaid = line(result.event, 'OFFICE');
    signInMock('partner.b@example.com');
    result = await costLinesApi.pay(firstPaid.id, { actualCents: 10000 });
    expect(line(result.event, 'OFFICE')).toMatchObject({
      actualCents: 10000,
      paidAt: firstPaid.paidAt,
      paidBy: partnerA().id,
    });
    await costLinesApi.pay(firstPaid.id, { actualCents: 10000 }); // no change, no event
    const paidEvents = (await eventsApi.history(event.id)).filter((e) => e.type === 'COST_PAID');
    expect(paidEvents).toHaveLength(2);
    signInMock();
    result = await costLinesApi.unpay(line(event, 'OFFICE').id);
    expect(line(result.event, 'OFFICE')).toMatchObject({ actualCents: null, paidAt: null });

    result = await costLinesApi.create(event.id, { type: 'FUEL', budgetedCents: 10000 });
    const error = await expectError(costLinesApi.pay(line(result.event, 'FUEL').id));
    expect(error.code).toBe('COST_NOT_PAYABLE');
  });

  it('warns about double booking on overlapping, non-cancelled, non-deleted events (BR-022)', async () => {
    const person = db.events.people.find((p) => p.name === 'Person 1')!;
    const other = await eventsApi.create(eventInput({ startDate: `${YEAR}-06-01`, endDate: `${YEAR}-06-03` }));
    await costLinesApi.update(line(other, 'VOC').id, { personId: person.id });
    const event = await eventsApi.create(eventInput({ startDate: `${YEAR}-06-03` }));
    const result = await costLinesApi.update(line(event, 'BASS').id, { personId: person.id });
    expect(result.warnings).toEqual([
      {
        code: 'PERSON_DOUBLE_BOOKED',
        personId: person.id,
        otherEventId: other.id,
        otherEventStartDate: `${YEAR}-06-01`,
        otherEventLineupName: 'Template A',
      },
    ]);
    await eventsApi.cancel(other.id, { reason: 'Called off' });
    const moved = await eventsApi.move(event.id, { startDate: `${YEAR}-06-02` });
    expect(moved.warnings).toEqual([]);
  });

  it('double booking counts performers only: SALES on one event + VOC on another never warns (BR-022)', async () => {
    const person = db.events.people.find((p) => p.name === 'Person 1')!;
    const eventA = await eventsApi.create(eventInput({ startDate: `${YEAR}-08-01` }));
    const eventB = await eventsApi.create(eventInput({ startDate: `${YEAR}-08-01` }));

    const sales = await costLinesApi.create(eventA.id, { type: 'SALES', personId: person.id, budgetedCents: 1000 });
    expect(sales.warnings).toEqual([]);
    const voc = await costLinesApi.update(line(eventB, 'VOC').id, { personId: person.id });
    expect(voc.warnings).toEqual([]);
    // Internal line added while the person already performs elsewhere: no warning either.
    const production = await costLinesApi.create(eventA.id, {
      type: 'PRODUCTION',
      personId: person.id,
      budgetedCents: 1000,
    });
    expect(production.warnings).toEqual([]);
    // Seller and producer are the same partner on both events: moving never warns about them.
    expect((await eventsApi.move(eventA.id, { startDate: `${YEAR}-08-01` })).warnings).toEqual([]);
  });

  it('double booking warns when the person is VOC on both events (BR-022)', async () => {
    const person = db.events.people.find((p) => p.name === 'Person 1')!;
    const eventA = await eventsApi.create(eventInput({ startDate: `${YEAR}-08-01` }));
    const eventB = await eventsApi.create(eventInput({ startDate: `${YEAR}-08-01` }));
    await costLinesApi.update(line(eventA, 'VOC').id, { personId: person.id });
    const result = await costLinesApi.update(line(eventB, 'VOC').id, { personId: person.id });
    expect(result.warnings).toEqual([
      {
        code: 'PERSON_DOUBLE_BOOKED',
        personId: person.id,
        otherEventId: eventA.id,
        otherEventStartDate: `${YEAR}-08-01`,
        otherEventLineupName: 'Template A',
      },
    ]);
  });

  it('moves unpaid Sales/Production lines on seller/producer change (BR-027)', async () => {
    const event = await eventsApi.create(eventInput());
    // A paid sales line and a split production line of someone else stay.
    const split = await costLinesApi.create(event.id, {
      type: 'PRODUCTION',
      personId: partnerB().personId,
      budgetedCents: 1000,
    });
    const paidSales = await costLinesApi.create(event.id, {
      type: 'SALES',
      personId: partnerA().personId,
      budgetedCents: 1000,
    });
    const paidLine = paidSales.event.costLines.at(-1)!;
    await costLinesApi.pay(paidLine.id);

    const { event: updated, movedCostLineIds } = await eventsApi.update(event.id, {
      sellerId: partnerB().id,
      producerId: partnerB().id,
    });
    expect(movedCostLineIds).toEqual([line(event, 'SALES').id, line(event, 'PRODUCTION').id]);
    const byId = (id: string) => updated.costLines.find((l) => l.id === id)!;
    expect(byId(line(event, 'SALES').id).personId).toBe(partnerB().personId);
    expect(byId(paidLine.id).personId).toBe(partnerA().personId);
    expect(byId(split.event.costLines.at(-1)!.id).personId).toBe(partnerB().personId);

    const [updatedEvent] = await eventsApi.history(event.id);
    expect(updatedEvent).toMatchObject({
      type: 'UPDATED',
      details: {
        changes: [
          { field: 'sellerId', from: partnerA().id, to: partnerB().id },
          { field: 'producerId', from: partnerA().id, to: partnerB().id },
        ],
        movedCostLineIds,
      },
    });
  });

  it('invoice rows: add / patch / remove, derived figures and state, history, 409 when deleted (TASK-173)', async () => {
    const event = await eventsApi.create(eventInput());
    const total = event.totalPriceCents;
    expect(event).toMatchObject({
      invoiceRows: [],
      invoicedCents: 0,
      paidCents: 0,
      balanceCents: total,
      openCents: 0,
      invoiceCoverage: 'NEEDS_INVOICES',
      paymentState: 'NONE',
    });

    // Default status READY; who / when set; creation order kept.
    const first = await invoiceRowsApi.create(event.id, { description: ' Prepayment ', amountCents: 10000 });
    expect(first.invoiceRows).toHaveLength(1);
    expect(first.invoiceRows[0]).toMatchObject({
      description: 'Prepayment',
      amountCents: 10000,
      status: 'READY',
      statusBy: partnerA().id,
      createdBy: partnerA().id,
    });
    expect(first).toMatchObject({ invoiceCoverage: 'NEEDS_INVOICES', paymentState: 'NONE', openCents: 0 });
    const rowA = first.invoiceRows[0]!;
    const second = await invoiceRowsApi.create(event.id, { description: 'Invoice', amountCents: total - 10000, status: 'SENT' });
    expect(second.invoiceRows.map((r) => r.description)).toEqual(['Prepayment', 'Invoice']);
    expect(second).toMatchObject({
      invoicedCents: total - 10000,
      paidCents: 0,
      openCents: total - 10000,
      invoiceCoverage: 'NEEDS_INVOICES',
      paymentState: 'OPEN_INVOICES',
    });
    const rowB = second.invoiceRows[1]!;

    // Prepayment paid, invoice still sent → fully invoiced, open invoices; invoice paid → fully paid.
    const paidA = await invoiceRowsApi.update(rowA.id, { status: 'PAID' });
    expect(paidA).toMatchObject({
      paidCents: 10000,
      balanceCents: total - 10000,
      invoicedCents: total,
      openCents: total - 10000,
      invoiceCoverage: 'FULLY_INVOICED',
      paymentState: 'OPEN_INVOICES',
    });
    const paidAll = await invoiceRowsApi.update(rowB.id, { status: 'PAID' });
    expect(paidAll).toMatchObject({ paidCents: total, balanceCents: 0, openCents: 0, paymentState: 'FULLY_PAID' });
    // Only some paid, nothing open → needs invoices + partly paid; overpaid → negative balance, fully paid.
    const partly = await invoiceRowsApi.remove(rowB.id);
    expect(partly).toMatchObject({
      invoiceRows: [expect.objectContaining({ id: rowA.id })],
      invoiceCoverage: 'NEEDS_INVOICES',
      paymentState: 'PARTLY_PAID',
    });
    const over = await invoiceRowsApi.update(rowA.id, { amountCents: total + 500, description: 'All' });
    expect(over).toMatchObject({ balanceCents: -500, invoiceCoverage: 'FULLY_INVOICED', paymentState: 'FULLY_PAID' });

    const listed = (await eventsApi.list({ year: YEAR })).events.find((g) => g.id === event.id)!;
    expect(listed).toMatchObject({
      invoiceCoverage: 'FULLY_INVOICED',
      paymentState: 'FULLY_PAID',
      openCents: 0,
      balanceCents: -500,
      paidCents: total + 500,
    });
    const filtered = async (query: string) => {
      const res = await fetch(`/api/events?year=${YEAR}&${query}`);
      return { status: res.status, ids: res.ok ? ((await res.json()) as { events: { id: string }[] }).events.map((g) => g.id) : [] };
    };
    // OR within one filter, AND across the two; unknown value → 400.
    expect((await filtered('invoiceCoverage=FULLY_INVOICED')).ids).toContain(event.id);
    expect(
      (await filtered('invoiceCoverage=NONE&invoiceCoverage=FULLY_INVOICED&paymentState=FULLY_PAID')).ids,
    ).toContain(event.id);
    expect((await filtered('invoiceCoverage=FULLY_INVOICED&paymentState=OPEN_INVOICES')).ids).not.toContain(event.id);
    expect((await filtered('invoiceCoverage=NEEDS_INVOICES')).ids).not.toContain(event.id);
    expect((await filtered('invoiceCoverage=NOPE')).status).toBe(400);
    expect((await filtered('paymentState=PAID')).status).toBe(400);

    const history = (await eventsApi.history(event.id)).filter((h) => h.type.startsWith('INVOICE_ROW'));
    expect(history.map((h) => h.type)).toEqual([
      'INVOICE_ROW_UPDATED',
      'INVOICE_ROW_REMOVED',
      'INVOICE_ROW_UPDATED',
      'INVOICE_ROW_UPDATED',
      'INVOICE_ROW_ADDED',
      'INVOICE_ROW_ADDED',
    ]);
    expect(history[0]!.details).toMatchObject({
      invoiceRowId: rowA.id,
      description: 'All',
      changes: [
        { field: 'description', from: 'Prepayment', to: 'All' },
        { field: 'amountCents', from: 10000, to: total + 500 },
      ],
    });

    // Validation.
    expect((await expectError(invoiceRowsApi.create(event.id, { description: ' ', amountCents: 0 }))).fields).toEqual({
      description: 'REQUIRED',
      amountCents: 'INVALID_VALUE',
    });
    expect(
      (await expectError(invoiceRowsApi.create(event.id, { description: 'x'.repeat(501), amountCents: 1, status: 'NOPE' as never })))
        .fields,
    ).toEqual({ description: 'TOO_LONG', status: 'INVALID_VALUE' });
    expect((await expectError(invoiceRowsApi.update(rowA.id, { amountCents: -1 }))).fields).toEqual({
      amountCents: 'INVALID_VALUE',
    });

    // Allowed on cancelled gigs; deleted → 409.
    await eventsApi.cancel(event.id, { reason: 'Called off' });
    expect((await invoiceRowsApi.update(rowA.id, { status: 'SENT' })).paymentState).toBe('OPEN_INVOICES');
    await eventsApi.uncancel(event.id, { reason: 'Back on' });
    await eventsApi.delete(event.id, { reason: 'Duplicate' });
    expect((await expectError(invoiceRowsApi.update(rowA.id, { status: 'PAID' }))).code).toBe('EVENT_DELETED');
    expect((await expectError(invoiceRowsApi.remove(rowA.id))).code).toBe('EVENT_DELETED');
    expect((await expectError(invoiceRowsApi.create(event.id, { description: 'x', amountCents: 1 }))).code).toBe(
      'EVENT_DELETED',
    );
  });

  it('enforces status transitions, deletion and restore', async () => {
    const event = await eventsApi.create(eventInput());
    expect((await expectError(eventsApi.cancel(event.id, { reason: ' ' }))).fields).toEqual({ reason: 'REQUIRED' });
    expect((await expectError(eventsApi.uncancel(event.id, { reason: 'x' }))).code).toBe('INVALID_STATUS_TRANSITION');
    await eventsApi.cancel(event.id, { reason: 'Called off' });
    expect((await expectError(eventsApi.move(event.id, { startDate: `${YEAR}-07-01` }))).code).toBe(
      'INVALID_STATUS_TRANSITION',
    );
    await eventsApi.uncancel(event.id, { reason: 'Back on' });
    await eventsApi.delete(event.id, { reason: 'Duplicate' });
    expect((await expectError(eventsApi.update(event.id, { venue: 'Venue Y' }))).code).toBe('EVENT_DELETED');
    const list = await eventsApi.list({ year: YEAR });
    expect(list.events).toEqual([]);
    expect((await eventsApi.list({ year: YEAR, deleted: true, status: 'ALL' })).events).toHaveLength(1);
    await eventsApi.restore(event.id);
    const history = await eventsApi.history(event.id);
    expect(history.map((e) => e.type)).toEqual(['RESTORED', 'DELETED', 'UNCANCELLED', 'CANCELLED', 'CREATED']);
    expect(history[1]!.reason).toBe('Duplicate');
  });

  it('year summary includes cancelled events and ignores filters', async () => {
    await eventsApi.create(eventInput({ priceCents: 100000 }));
    const cancelled = await eventsApi.create(eventInput({ priceCents: 10000, venue: 'Venue Y' }));
    await eventsApi.cancel(cancelled.id, { reason: 'Called off' });
    const { events, yearSummary } = await eventsApi.list({ year: YEAR, q: 'venue x' });
    expect(events).toHaveLength(1);
    expect(yearSummary).toMatchObject({ eventCount: 1, cancelledCount: 1, soldEventsSumCents: 110000 });
  });

  it('accepts allowed attachments and rejects others', async () => {
    const event = await eventsApi.create(eventInput());
    const pdf = testFile('contract.pdf', 'application/pdf');
    const attachment = await attachmentsApi.upload(event.id, pdf);
    expect(attachment).toMatchObject({ filename: 'contract.pdf', uploadedBy: partnerA().id });
    const error = await expectError(
      attachmentsApi.upload(event.id, testFile('notes.txt', 'text/plain')),
    );
    expect(error.code).toBe('UNSUPPORTED_FILE_TYPE');
    await attachmentsApi.remove(attachment.id);
    expect((await eventsApi.get(event.id)).attachments).toEqual([]);
    const types = (await eventsApi.history(event.id)).map((e) => e.type);
    expect(types).toEqual(['ATTACHMENT_REMOVED', 'ATTACHMENT_ADDED', 'CREATED']);
  });

  it('no-op requests write no history; type is not editable; upload needs a file', async () => {
    const event = await eventsApi.create(eventInput());
    await eventsApi.update(event.id, { venue: 'Venue X' });
    await costLinesApi.update(line(event, 'VOC').id, { joinsLoadIn: true });
    await costLinesApi.unpay(line(event, 'VOC').id);
    expect((await eventsApi.history(event.id)).map((e) => e.type)).toEqual(['CREATED']);

    const typeError = await expectError(
      costLinesApi.update(line(event, 'VOC').id, { type: 'BASS' } as never),
    );
    expect(typeError.fields).toEqual({ type: 'NOT_EDITABLE' });

    const res = await fetch(`/api/events/${event.id}/attachments`, { method: 'POST', body: new FormData() });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: { fields: { file: 'REQUIRED' } } });
  });

  it('lists active people and creates people with a duplicate warning', async () => {
    const active = await peopleApi.list('true');
    expect(active.some((p) => p.name === 'Person 9')).toBe(false);
    const created = await peopleApi.create({ name: 'person 1' });
    expect(created.warnings).toEqual([{ code: 'DUPLICATE_NAME' }]);
  });
});
