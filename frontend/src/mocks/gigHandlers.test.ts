// The gig mocks follow the contract's rules, so the UI behaves like the real backend.
import { beforeEach, describe, expect, it } from 'vitest';
import { attachmentsApi, costLinesApi, gigsApi, peopleApi } from '../api/endpoints';
import type { ApiError } from '../api/client';
import type { GigCreate, GigDetail } from '../api/types';
import { testFile } from '../test/files';
import { signInMock } from '../test/renderApp';
import { db } from './data';

const YEAR = 2030;
const templateA = () => db.reference.lineupTemplates[0]!;
const partnerA = () => db.partners[0]!;
const partnerB = () => db.partners[1]!;

function gigInput(overrides: Partial<GigCreate> = {}): GigCreate {
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

const line = (gig: GigDetail, type: string) => gig.costLines.find((l) => l.type === type)!;

describe('gig mocks', () => {
  beforeEach(() => {
    signInMock();
  });

  it('creates template lines + Office/Sales/Production and computes economics', async () => {
    const gig = await gigsApi.create(gigInput({ additionalSalesCents: 10000 }));
    expect(gig.costLines.map((l) => l.type)).toEqual([
      'VOC', 'GUITAR', 'BASS', 'DRUMS', 'OFFICE', 'SALES', 'PRODUCTION',
    ]);
    expect(line(gig, 'SALES').personId).toBe(partnerA().personId);
    expect(line(gig, 'VOC')).toMatchObject({ personId: null, joinsLoadIn: true, budgetedCents: 10000 });
    expect(line(gig, 'OFFICE').joinsLoadIn).toBeNull();
    expect(gig.totalPriceCents).toBe(110000);
    expect(gig.budgetedCostsCents).toBe(4 * 10000 + 3 * 1000);
    expect(gig.marginBudgetCents).toBe(110000 - (4 * 10000 + 3 * 1000));
    expect(gig.marginBudgetPct).toBe(60.9);
    expect(gig.notFullyStaffed).toBe(true);
    const history = await gigsApi.history(gig.id);
    expect(history.map((e) => e.type)).toEqual(['CREATED']);
  });

  it('validates input with field codes', async () => {
    const error = await expectError(
      gigsApi.create(
        gigInput({ venue: '', priceCents: -1000, startDate: `${YEAR}-06-02`, endDate: `${YEAR}-06-01`, lineupTemplateId: null }),
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
    const gig = await gigsApi.create(gigInput());
    const voc = line(gig, 'VOC');
    let result = await costLinesApi.update(voc.id, { joinsLoadIn: false });
    expect(line(result.gig, 'VOC')).toMatchObject({
      joinsLoadIn: false,
      budgetedCents: 10000 - 1000,
      loadInDeductionAppliedCents: 1000,
    });
    db.reference.settings.loadInDeductionCents = 10000; // setting changes in between
    result = await costLinesApi.update(voc.id, { joinsLoadIn: true });
    expect(line(result.gig, 'VOC')).toMatchObject({
      joinsLoadIn: true,
      budgetedCents: 10000,
      loadInDeductionAppliedCents: null,
    });
    const office = line(gig, 'OFFICE');
    const error = await expectError(costLinesApi.update(office.id, { joinsLoadIn: false }));
    expect(error.fields).toEqual({ joinsLoadIn: 'INVALID_VALUE' });
  });

  it('pays with the budget by default, refuses FUEL, and unpays', async () => {
    const gig = await gigsApi.create(gigInput());
    let result = await costLinesApi.pay(line(gig, 'OFFICE').id);
    expect(line(result.gig, 'OFFICE')).toMatchObject({ actualCents: 1000, paidBy: partnerA().id });
    expect(result.gig.actualCostsCents).toBe(1000);
    const firstPaid = line(result.gig, 'OFFICE');
    signInMock('partner.b@example.com');
    result = await costLinesApi.pay(firstPaid.id, { actualCents: 10000 });
    expect(line(result.gig, 'OFFICE')).toMatchObject({
      actualCents: 10000,
      paidAt: firstPaid.paidAt,
      paidBy: partnerA().id,
    });
    await costLinesApi.pay(firstPaid.id, { actualCents: 10000 }); // no change, no event
    const paidEvents = (await gigsApi.history(gig.id)).filter((e) => e.type === 'COST_PAID');
    expect(paidEvents).toHaveLength(2);
    signInMock();
    result = await costLinesApi.unpay(line(gig, 'OFFICE').id);
    expect(line(result.gig, 'OFFICE')).toMatchObject({ actualCents: null, paidAt: null });

    result = await costLinesApi.create(gig.id, { type: 'FUEL', budgetedCents: 10000 });
    const error = await expectError(costLinesApi.pay(line(result.gig, 'FUEL').id));
    expect(error.code).toBe('COST_NOT_PAYABLE');
  });

  it('warns about double booking on overlapping, non-cancelled, non-deleted gigs (BR-022)', async () => {
    const person = db.gigs.people.find((p) => p.name === 'Person 1')!;
    const other = await gigsApi.create(gigInput({ startDate: `${YEAR}-06-01`, endDate: `${YEAR}-06-03` }));
    await costLinesApi.update(line(other, 'VOC').id, { personId: person.id });
    const gig = await gigsApi.create(gigInput({ startDate: `${YEAR}-06-03` }));
    const result = await costLinesApi.update(line(gig, 'BASS').id, { personId: person.id });
    expect(result.warnings).toEqual([
      {
        code: 'PERSON_DOUBLE_BOOKED',
        personId: person.id,
        otherGigId: other.id,
        otherGigStartDate: `${YEAR}-06-01`,
        otherGigLineupName: 'Template A',
      },
    ]);
    await gigsApi.cancel(other.id, { reason: 'Called off' });
    const moved = await gigsApi.move(gig.id, { startDate: `${YEAR}-06-02` });
    expect(moved.warnings).toEqual([]);
  });

  it('moves unpaid Sales/Production lines on seller/producer change (BR-027)', async () => {
    const gig = await gigsApi.create(gigInput());
    // A paid sales line and a split production line of someone else stay.
    const split = await costLinesApi.create(gig.id, {
      type: 'PRODUCTION',
      personId: partnerB().personId,
      budgetedCents: 1000,
    });
    const paidSales = await costLinesApi.create(gig.id, {
      type: 'SALES',
      personId: partnerA().personId,
      budgetedCents: 1000,
    });
    const paidLine = paidSales.gig.costLines.at(-1)!;
    await costLinesApi.pay(paidLine.id);

    const { gig: updated, movedCostLineIds } = await gigsApi.update(gig.id, {
      sellerId: partnerB().id,
      producerId: partnerB().id,
    });
    expect(movedCostLineIds).toEqual([line(gig, 'SALES').id, line(gig, 'PRODUCTION').id]);
    const byId = (id: string) => updated.costLines.find((l) => l.id === id)!;
    expect(byId(line(gig, 'SALES').id).personId).toBe(partnerB().personId);
    expect(byId(paidLine.id).personId).toBe(partnerA().personId);
    expect(byId(split.gig.costLines.at(-1)!.id).personId).toBe(partnerB().personId);

    const [updatedEvent] = await gigsApi.history(gig.id);
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

  it('enforces status transitions, deletion and restore', async () => {
    const gig = await gigsApi.create(gigInput());
    expect((await expectError(gigsApi.cancel(gig.id, { reason: ' ' }))).fields).toEqual({ reason: 'REQUIRED' });
    expect((await expectError(gigsApi.uncancel(gig.id, { reason: 'x' }))).code).toBe('INVALID_STATUS_TRANSITION');
    await gigsApi.cancel(gig.id, { reason: 'Called off' });
    expect((await expectError(gigsApi.move(gig.id, { startDate: `${YEAR}-07-01` }))).code).toBe(
      'INVALID_STATUS_TRANSITION',
    );
    await gigsApi.uncancel(gig.id, { reason: 'Back on' });
    await gigsApi.delete(gig.id, { reason: 'Duplicate' });
    expect((await expectError(gigsApi.update(gig.id, { venue: 'Venue Y' }))).code).toBe('GIG_DELETED');
    const list = await gigsApi.list({ year: YEAR });
    expect(list.gigs).toEqual([]);
    expect((await gigsApi.list({ year: YEAR, deleted: true, status: 'ALL' })).gigs).toHaveLength(1);
    await gigsApi.restore(gig.id);
    const history = await gigsApi.history(gig.id);
    expect(history.map((e) => e.type)).toEqual(['RESTORED', 'DELETED', 'UNCANCELLED', 'CANCELLED', 'CREATED']);
    expect(history[1]!.reason).toBe('Duplicate');
  });

  it('year summary includes cancelled gigs and ignores filters', async () => {
    await gigsApi.create(gigInput({ priceCents: 100000 }));
    const cancelled = await gigsApi.create(gigInput({ priceCents: 10000, venue: 'Venue Y' }));
    await gigsApi.cancel(cancelled.id, { reason: 'Called off' });
    const { gigs, yearSummary } = await gigsApi.list({ year: YEAR, q: 'venue x' });
    expect(gigs).toHaveLength(1);
    expect(yearSummary).toMatchObject({ gigCount: 1, cancelledCount: 1, soldGigsSumCents: 110000 });
  });

  it('accepts allowed attachments and rejects others', async () => {
    const gig = await gigsApi.create(gigInput());
    const pdf = testFile('contract.pdf', 'application/pdf');
    const attachment = await attachmentsApi.upload(gig.id, pdf);
    expect(attachment).toMatchObject({ filename: 'contract.pdf', uploadedBy: partnerA().id });
    const error = await expectError(
      attachmentsApi.upload(gig.id, testFile('notes.txt', 'text/plain')),
    );
    expect(error.code).toBe('UNSUPPORTED_FILE_TYPE');
    await attachmentsApi.remove(attachment.id);
    expect((await gigsApi.get(gig.id)).attachments).toEqual([]);
    const types = (await gigsApi.history(gig.id)).map((e) => e.type);
    expect(types).toEqual(['ATTACHMENT_REMOVED', 'ATTACHMENT_ADDED', 'CREATED']);
  });

  it('no-op requests write no history; type is not editable; upload needs a file', async () => {
    const gig = await gigsApi.create(gigInput());
    await gigsApi.update(gig.id, { venue: 'Venue X' });
    await costLinesApi.update(line(gig, 'VOC').id, { joinsLoadIn: true });
    await costLinesApi.unpay(line(gig, 'VOC').id);
    expect((await gigsApi.history(gig.id)).map((e) => e.type)).toEqual(['CREATED']);

    const typeError = await expectError(
      costLinesApi.update(line(gig, 'VOC').id, { type: 'BASS' } as never),
    );
    expect(typeError.fields).toEqual({ type: 'NOT_EDITABLE' });

    const res = await fetch(`/api/gigs/${gig.id}/attachments`, { method: 'POST', body: new FormData() });
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
