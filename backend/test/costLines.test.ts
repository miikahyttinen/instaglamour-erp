/** Cost line endpoints (UC-005; BR-008, BR-022…BR-026). Synthetic data only. */
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SETTING_KEYS } from '../src/domain/enums.js';
import { closeTestDb, login, resetDb } from './helpers.js';
import { call, createGig, history, type Json, setSetting, startSession, UNKNOWN_ID, type Session } from './gigFixtures.js';

let s: Session;

beforeEach(async () => {
  await resetDb();
  s = await startSession();
});
afterEach(async () => {
  await s.app.close();
});
afterAll(closeTestDb);

type Line = { id: string; type: string; personId: string | null; budgetedCents: number };
const lineOf = (gig: { costLines: Line[] }, type: string) => gig.costLines.find((l) => l.type === type)!;

async function addLine(gigId: string, payload: Record<string, unknown>): Promise<Json> {
  const res = await call(s, 'POST', `/api/gigs/${gigId}/cost-lines`, payload);
  if (res.statusCode !== 200) throw new Error(`add line failed: ${res.statusCode} ${res.body}`);
  return res.json();
}

describe('POST /api/gigs/{id}/cost-lines', () => {
  it('adds a line at the end, updates totals and logs COST_ADDED', async () => {
    const gig = await createGig(s);
    const res = await call(s, 'POST', `/api/gigs/${gig.id}/cost-lines`, { type: 'GUITAR', personId: s.world.p1.id, budgetedCents: 20000 });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.warnings).toEqual([]);
    const line = body.gig.costLines.at(-1);
    expect(line).toEqual({
      id: expect.any(String),
      gigId: gig.id,
      type: 'GUITAR',
      personId: s.world.p1.id,
      description: null,
      budgetedCents: 20000,
      joinsLoadIn: true,
      loadInDeductionAppliedCents: null,
      actualCents: null,
      paidAt: null,
      paidBy: null,
    });
    expect(body.gig.budgetedCostsCents).toBe(gig.budgetedCostsCents + 20000);
    expect(body.gig.costLines.slice(0, -1)).toEqual(gig.costLines);

    const [event] = await history(s, gig.id);
    expect(event).toMatchObject({
      type: 'COST_ADDED',
      details: { costLineId: line.id, type: 'GUITAR', personId: s.world.p1.id, budgetedCents: 20000 },
    });
  });

  it('expense and internal lines have joinsLoadIn null; OTHER needs a description', async () => {
    const gig = await createGig(s);
    const fuel = (await addLine(gig.id, { type: 'FUEL', budgetedCents: 10000 })).gig.costLines.at(-1);
    expect(fuel).toMatchObject({ type: 'FUEL', joinsLoadIn: null, personId: null });
    const other = (await addLine(gig.id, { type: 'OTHER', description: 'Flowers', budgetedCents: 10000 })).gig.costLines.at(-1);
    expect(other).toMatchObject({ type: 'OTHER', description: 'Flowers' });
    const office = (await addLine(gig.id, { type: 'OFFICE', budgetedCents: 0 })).gig.costLines.at(-1);
    expect(office).toMatchObject({ joinsLoadIn: null, budgetedCents: 0 });
  });

  it('allows the same person on several lines and several people in one role (BR-024)', async () => {
    const gig = await createGig(s);
    await addLine(gig.id, { type: 'GUITAR', personId: s.world.p1.id, budgetedCents: 10000 });
    const body = await addLine(gig.id, { type: 'MIX', personId: s.world.p1.id, budgetedCents: 10000 });
    await addLine(gig.id, { type: 'PRODUCTION', personId: s.world.p2.id, budgetedCents: 10000 });
    expect(body.warnings).toEqual([]); // same gig is not a double booking
  });

  it.each([
    [{ budgetedCents: 10000 }, { type: 'REQUIRED' }],
    [{ type: 'CATERING', budgetedCents: 10000 }, { type: 'INVALID_VALUE' }],
    [{ type: 'VOC' }, { budgetedCents: 'REQUIRED' }],
    [{ type: 'VOC', budgetedCents: -10000 }, { budgetedCents: 'NEGATIVE_AMOUNT' }],
    [{ type: 'OTHER', budgetedCents: 10000 }, { description: 'DESCRIPTION_REQUIRED' }],
    [{ type: 'OTHER_ROLE', description: '  ', budgetedCents: 10000 }, { description: 'DESCRIPTION_REQUIRED' }],
    [{ type: 'VOC', personId: UNKNOWN_ID, budgetedCents: 10000 }, { personId: 'UNKNOWN_REFERENCE' }],
    [{ type: 'VOC', description: 'x'.repeat(501), budgetedCents: 10000 }, { description: 'TOO_LONG' }],
  ])('rejects %j', async (payload, fields) => {
    const gig = await createGig(s);
    const res = await call(s, 'POST', `/api/gigs/${gig.id}/cost-lines`, payload);
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toEqual({ code: 'VALIDATION_ERROR', message: expect.any(String), fields });
  });

  it('404 unknown gig, 409 deleted gig, allowed on a cancelled gig', async () => {
    expect((await call(s, 'POST', `/api/gigs/${UNKNOWN_ID}/cost-lines`, { type: 'VOC', budgetedCents: 0 })).statusCode).toBe(404);
    const gig = await createGig(s);
    await call(s, 'POST', `/api/gigs/${gig.id}/cancel`, { reason: 'Client cancelled' });
    expect((await call(s, 'POST', `/api/gigs/${gig.id}/cost-lines`, { type: 'VOC', budgetedCents: 0 })).statusCode).toBe(200);
    await call(s, 'POST', `/api/gigs/${gig.id}/delete`, { reason: 'Duplicate' });
    const res = await call(s, 'POST', `/api/gigs/${gig.id}/cost-lines`, { type: 'VOC', budgetedCents: 0 });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('GIG_DELETED');
  });
});

describe('double booking (BR-022)', () => {
  it('warns on add, assign and move; ignores cancelled and deleted gigs; never blocks', async () => {
    const { p1, c } = s.world;
    // Seller/producer C, so only Person 1 is on both gigs.
    const other = await createGig(s, { startDate: '2026-05-01', endDate: '2026-05-03', lineupTemplateId: null, lineupName: 'Lineup Other', sellerId: c.id, producerId: c.id });
    await addLine(other.id, { type: 'VOC', personId: p1.id, budgetedCents: 10000 });

    // Overlapping one-day gig inside the other's range.
    const gig = await createGig(s, { startDate: '2026-05-02' });
    const add = await addLine(gig.id, { type: 'GUITAR', personId: p1.id, budgetedCents: 10000 });
    const warning = { code: 'PERSON_DOUBLE_BOOKED', personId: p1.id, otherGigId: other.id, otherGigStartDate: '2026-05-01', otherGigLineupName: 'Lineup Other' };
    expect(add.warnings).toEqual([warning]);
    expect(add.gig.costLines.at(-1).personId).toBe(p1.id); // saved anyway

    // Assign on an existing line.
    const voc = lineOf(gig, 'VOC');
    const assign = (await call(s, 'PATCH', `/api/cost-lines/${voc.id}`, { personId: p1.id })).json();
    expect(assign.warnings).toEqual([warning]);
    // No warning when the person does not change, or is cleared.
    expect((await call(s, 'PATCH', `/api/cost-lines/${voc.id}`, { budgetedCents: 20000 })).json().warnings).toEqual([]);
    expect((await call(s, 'PATCH', `/api/cost-lines/${voc.id}`, { personId: null })).json().warnings).toEqual([]);

    // Move away: no overlap; move back: warning.
    expect((await call(s, 'POST', `/api/gigs/${gig.id}/move`, { startDate: '2026-05-04' })).json().warnings).toEqual([]);
    expect((await call(s, 'POST', `/api/gigs/${gig.id}/move`, { startDate: '2026-04-30', endDate: '2026-05-01' })).json().warnings).toEqual([warning]);

    // Cancelled other gig → no warning.
    await call(s, 'POST', `/api/gigs/${other.id}/cancel`, { reason: 'Client cancelled' });
    expect((await addLine(gig.id, { type: 'KEYS', personId: p1.id, budgetedCents: 10000 })).warnings).toEqual([]);
    await call(s, 'POST', `/api/gigs/${other.id}/uncancel`, { reason: 'Back on' });
    expect((await addLine(gig.id, { type: 'KEYS', personId: p1.id, budgetedCents: 10000 })).warnings).toEqual([warning]);

    // Deleted other gig → no warning.
    await call(s, 'POST', `/api/gigs/${other.id}/delete`, { reason: 'Duplicate' });
    expect((await addLine(gig.id, { type: 'KEYS', personId: p1.id, budgetedCents: 10000 })).warnings).toEqual([]);
  });

  it('a one-day gig overlaps only the same day', async () => {
    const { p2 } = s.world;
    const other = await createGig(s, { startDate: '2026-05-01' });
    await addLine(other.id, { type: 'VOC', personId: p2.id, budgetedCents: 10000 });
    const next = await createGig(s, { startDate: '2026-05-02' });
    expect((await addLine(next.id, { type: 'VOC', personId: p2.id, budgetedCents: 10000 })).warnings).toEqual([]);
    const same = await createGig(s, { startDate: '2026-05-01' });
    expect((await addLine(same.id, { type: 'VOC', personId: p2.id, budgetedCents: 10000 })).warnings).toHaveLength(1);
  });

  it('move warns for each assigned person', async () => {
    const { p1, p2 } = s.world;
    const other = await createGig(s, { startDate: '2026-06-01' });
    await addLine(other.id, { type: 'VOC', personId: p1.id, budgetedCents: 10000 });
    await addLine(other.id, { type: 'BASS', personId: p2.id, budgetedCents: 10000 });
    const gig = await createGig(s, { startDate: '2026-07-01' });
    await addLine(gig.id, { type: 'VOC', personId: p1.id, budgetedCents: 10000 });
    await addLine(gig.id, { type: 'BASS', personId: p2.id, budgetedCents: 10000 });
    const res = (await call(s, 'POST', `/api/gigs/${gig.id}/move`, { startDate: '2026-06-01' })).json();
    // Sellers/producers (Partner A/B) are also on both gigs via Sales/Production lines.
    expect(res.warnings.map((w: { personId: string }) => w.personId).sort()).toEqual(
      [s.world.a.personId, s.world.b.personId, p1.id, p2.id].sort(),
    );
  });
});

describe('PATCH /api/cost-lines/{id}', () => {
  it('edits person, description and amount; logs COST_UPDATED with the changes', async () => {
    const gig = await createGig(s);
    const voc = lineOf(gig, 'VOC');
    const res = await call(s, 'PATCH', `/api/cost-lines/${voc.id}`, { personId: s.world.p1.id, description: 'Lead', budgetedCents: 20000 });
    expect(res.statusCode).toBe(200);
    const updated = lineOf(res.json().gig, 'VOC');
    expect(updated).toMatchObject({ personId: s.world.p1.id, description: 'Lead', budgetedCents: 20000 });
    expect(res.json().gig.budgetedCostsCents).toBe(gig.budgetedCostsCents - 10000);
    const [event] = await history(s, gig.id);
    expect(event).toMatchObject({
      type: 'COST_UPDATED',
      details: {
        costLineId: voc.id,
        type: 'VOC',
        changes: [
          { field: 'personId', from: null, to: s.world.p1.id },
          { field: 'description', from: null, to: 'Lead' },
          { field: 'budgetedCents', from: 30000, to: 20000 },
        ],
      },
    });
  });

  it('"not fully staffed" disappears when every musician line has a person (BR-023)', async () => {
    const gig = await createGig(s);
    expect(gig.notFullyStaffed).toBe(true);
    await call(s, 'PATCH', `/api/cost-lines/${lineOf(gig, 'VOC').id}`, { personId: s.world.p1.id });
    const res = await call(s, 'PATCH', `/api/cost-lines/${lineOf(gig, 'BASS').id}`, { personId: s.world.p2.id });
    expect(res.json().gig.notFullyStaffed).toBe(false);
  });

  it('no change logs nothing', async () => {
    const gig = await createGig(s);
    const res = await call(s, 'PATCH', `/api/cost-lines/${lineOf(gig, 'VOC').id}`, { budgetedCents: 30000, joinsLoadIn: true });
    expect(res.statusCode).toBe(200);
    expect((await history(s, gig.id)).map((e) => e.type)).toEqual(['CREATED']);
  });

  it.each([
    [{ type: 'BASS' }, { type: 'NOT_EDITABLE' }],
    [{ budgetedCents: -10000 }, { budgetedCents: 'NEGATIVE_AMOUNT' }],
    [{ budgetedCents: null }, { budgetedCents: 'REQUIRED' }],
    [{ joinsLoadIn: 'no' }, { joinsLoadIn: 'INVALID_VALUE' }],
    [{ personId: UNKNOWN_ID }, { personId: 'UNKNOWN_REFERENCE' }],
  ])('rejects %j', async (payload, fields) => {
    const gig = await createGig(s);
    const res = await call(s, 'PATCH', `/api/cost-lines/${lineOf(gig, 'VOC').id}`, payload);
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toEqual({ code: 'VALIDATION_ERROR', message: expect.any(String), fields });
  });

  it('joinsLoadIn on a non-musician line is INVALID_VALUE; clearing OTHER description is DESCRIPTION_REQUIRED', async () => {
    const gig = await createGig(s);
    const office = await call(s, 'PATCH', `/api/cost-lines/${lineOf(gig, 'OFFICE').id}`, { joinsLoadIn: false });
    expect(office.statusCode).toBe(400);
    expect(office.json().error.fields).toEqual({ joinsLoadIn: 'INVALID_VALUE' });

    const other = (await addLine(gig.id, { type: 'OTHER', description: 'Flowers', budgetedCents: 10000 })).gig.costLines.at(-1);
    const res = await call(s, 'PATCH', `/api/cost-lines/${other.id}`, { description: null });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.fields).toEqual({ description: 'DESCRIPTION_REQUIRED' });
  });

  it('404 unknown line, 409 on a deleted gig', async () => {
    expect((await call(s, 'PATCH', `/api/cost-lines/${UNKNOWN_ID}`, { budgetedCents: 0 })).statusCode).toBe(404);
    expect((await call(s, 'PATCH', '/api/cost-lines/nope', { budgetedCents: 0 })).statusCode).toBe(404);
    const gig = await createGig(s);
    await call(s, 'POST', `/api/gigs/${gig.id}/delete`, { reason: 'Duplicate' });
    const res = await call(s, 'PATCH', `/api/cost-lines/${lineOf(gig, 'VOC').id}`, { budgetedCents: 0 });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('GIG_DELETED');
  });
});

describe('load-in switch (BR-026)', () => {
  const patch = (id: string, payload: unknown) => call(s, 'PATCH', `/api/cost-lines/${id}`, payload);

  it('off deducts the setting, on restores exactly even after the setting changed', async () => {
    const gig = await createGig(s);
    const voc = lineOf(gig, 'VOC'); // 30000, deduction 10000

    const off = lineOf((await patch(voc.id, { joinsLoadIn: false })).json().gig, 'VOC');
    expect(off).toMatchObject({ joinsLoadIn: false, budgetedCents: 20000, loadInDeductionAppliedCents: 10000 });
    const [offEvent] = await history(s, gig.id);
    expect(offEvent!.details.changes).toEqual([
      { field: 'budgetedCents', from: 30000, to: 20000 },
      { field: 'joinsLoadIn', from: true, to: false },
    ]);

    // Same value again: no-op.
    const again = lineOf((await patch(voc.id, { joinsLoadIn: false })).json().gig, 'VOC');
    expect(again).toMatchObject({ budgetedCents: 20000, loadInDeductionAppliedCents: 10000 });
    expect((await history(s, gig.id)).filter((e) => e.type === 'COST_UPDATED')).toHaveLength(1);

    await setSetting(SETTING_KEYS.loadInDeduction, 20000);
    const on = lineOf((await patch(voc.id, { joinsLoadIn: true })).json().gig, 'VOC');
    expect(on).toMatchObject({ joinsLoadIn: true, budgetedCents: 30000, loadInDeductionAppliedCents: null });
  });

  it('never goes below 0 and restores only what was deducted', async () => {
    await setSetting(SETTING_KEYS.loadInDeduction, 20000);
    const gig = await createGig(s);
    const line = (await addLine(gig.id, { type: 'DJ', budgetedCents: 10000 })).gig.costLines.at(-1);
    const off = (await patch(line.id, { joinsLoadIn: false })).json().gig.costLines.at(-1);
    expect(off).toMatchObject({ budgetedCents: 0, loadInDeductionAppliedCents: 10000 });
    const on = (await patch(line.id, { joinsLoadIn: true })).json().gig.costLines.at(-1);
    expect(on).toMatchObject({ budgetedCents: 10000, loadInDeductionAppliedCents: null });
  });

  it('with budgetedCents and joinsLoadIn together, the budget is applied first', async () => {
    const gig = await createGig(s);
    const voc = lineOf(gig, 'VOC');
    const off = lineOf((await patch(voc.id, { budgetedCents: 60000, joinsLoadIn: false })).json().gig, 'VOC');
    expect(off).toMatchObject({ budgetedCents: 50000, loadInDeductionAppliedCents: 10000 });
    const [event] = await history(s, gig.id);
    expect(event!.details.changes).toEqual([
      { field: 'budgetedCents', from: 30000, to: 50000 },
      { field: 'joinsLoadIn', from: true, to: false },
    ]);
    const on = lineOf((await patch(voc.id, { budgetedCents: 20000, joinsLoadIn: true })).json().gig, 'VOC');
    expect(on).toMatchObject({ budgetedCents: 30000, loadInDeductionAppliedCents: null });
  });
});

describe('DELETE /api/cost-lines/{id}', () => {
  it('removes the line, returns the gig and logs COST_REMOVED', async () => {
    const gig = await createGig(s);
    const sales = lineOf(gig, 'SALES');
    const res = await call(s, 'DELETE', `/api/cost-lines/${sales.id}`);
    expect(res.statusCode).toBe(200);
    expect(res.json().warnings).toEqual([]);
    expect(res.json().gig.costLines.map((l: Line) => l.type)).toEqual(['VOC', 'BASS', 'OFFICE', 'PRODUCTION']);
    const [event] = await history(s, gig.id);
    expect(event).toMatchObject({
      type: 'COST_REMOVED',
      details: { costLineId: sales.id, type: 'SALES', personId: s.world.a.personId, budgetedCents: sales.budgetedCents },
    });
    expect((await call(s, 'DELETE', `/api/cost-lines/${sales.id}`)).statusCode).toBe(404);
  });

  it('409 on a deleted gig', async () => {
    const gig = await createGig(s);
    await call(s, 'POST', `/api/gigs/${gig.id}/delete`, { reason: 'Duplicate' });
    expect((await call(s, 'DELETE', `/api/cost-lines/${lineOf(gig, 'VOC').id}`)).json().error.code).toBe('GIG_DELETED');
  });
});

describe('pay / unpay (BR-025, BR-008)', () => {
  it('pay defaults to the budgeted amount, records time and partner, logs COST_PAID', async () => {
    const gig = await createGig(s);
    const voc = lineOf(gig, 'VOC');
    const before = Date.now();
    const res = await call(s, 'POST', `/api/cost-lines/${voc.id}/pay`);
    expect(res.statusCode).toBe(200);
    const paid = lineOf(res.json().gig, 'VOC') as Line & { actualCents: number; paidAt: string; paidBy: string };
    expect(paid).toMatchObject({ actualCents: 30000, paidBy: s.world.a.id });
    expect(new Date(paid.paidAt).getTime()).toBeGreaterThanOrEqual(before - 1000);
    expect(res.json().gig.actualCostsCents).toBe(30000);
    const [event] = await history(s, gig.id);
    expect(event).toMatchObject({ type: 'COST_PAID', details: { costLineId: voc.id, type: 'VOC', actualCents: 30000 } });
  });

  it('pay with an amount; paying again updates the amount and keeps the original payment', async () => {
    const gig = await createGig(s);
    const voc = lineOf(gig, 'VOC');
    const first = lineOf((await call(s, 'POST', `/api/cost-lines/${voc.id}/pay`, { actualCents: 20000 })).json().gig, 'VOC') as Line & { paidAt: string };
    expect(first).toMatchObject({ actualCents: 20000 });
    const cookieB = await login(s.app, 'partner.b@example.com');
    const res = await s.app.inject({ method: 'POST', url: `/api/cost-lines/${voc.id}/pay`, headers: { cookie: cookieB }, payload: { actualCents: 10000 } });
    const second = lineOf(res.json().gig, 'VOC');
    expect(second).toMatchObject({ actualCents: 10000, paidAt: first.paidAt, paidBy: s.world.a.id });
    const events = await history(s, gig.id);
    expect(events[0]).toMatchObject({ type: 'COST_PAID', partnerId: s.world.b.id, details: { actualCents: 10000 } });
  });

  it('unpay clears amount, time and partner and logs COST_UNPAID; unpay of an unpaid line is a no-op', async () => {
    const gig = await createGig(s);
    const voc = lineOf(gig, 'VOC');
    await call(s, 'POST', `/api/cost-lines/${voc.id}/pay`, { actualCents: 20000 });
    const res = await call(s, 'POST', `/api/cost-lines/${voc.id}/unpay`);
    expect(res.statusCode).toBe(200);
    expect(lineOf(res.json().gig, 'VOC')).toMatchObject({ actualCents: null, paidAt: null, paidBy: null });
    expect(res.json().gig.actualCostsCents).toBe(0);
    const [event] = await history(s, gig.id);
    expect(event).toMatchObject({ type: 'COST_UNPAID', details: { costLineId: voc.id, type: 'VOC', previousActualCents: 20000 } });

    expect((await call(s, 'POST', `/api/cost-lines/${voc.id}/unpay`)).statusCode).toBe(200);
    expect((await history(s, gig.id)).filter((e) => e.type === 'COST_UNPAID')).toHaveLength(1);
  });

  it('FUEL cannot be paid (409 COST_NOT_PAYABLE)', async () => {
    const gig = await createGig(s);
    const fuel = (await addLine(gig.id, { type: 'FUEL', budgetedCents: 10000 })).gig.costLines.at(-1);
    const res = await call(s, 'POST', `/api/cost-lines/${fuel.id}/pay`, {});
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('COST_NOT_PAYABLE');
  });

  it('validates the amount; 404 unknown; 409 deleted gig', async () => {
    const gig = await createGig(s);
    const voc = lineOf(gig, 'VOC');
    const neg = await call(s, 'POST', `/api/cost-lines/${voc.id}/pay`, { actualCents: -10000 });
    expect(neg.statusCode).toBe(400);
    expect(neg.json().error.fields).toEqual({ actualCents: 'NEGATIVE_AMOUNT' });
    expect((await call(s, 'POST', `/api/cost-lines/${UNKNOWN_ID}/pay`)).statusCode).toBe(404);
    expect((await call(s, 'POST', `/api/cost-lines/${UNKNOWN_ID}/unpay`)).statusCode).toBe(404);
    await call(s, 'POST', `/api/gigs/${gig.id}/delete`, { reason: 'Duplicate' });
    expect((await call(s, 'POST', `/api/cost-lines/${voc.id}/pay`)).json().error.code).toBe('GIG_DELETED');
    expect((await call(s, 'POST', `/api/cost-lines/${voc.id}/unpay`)).json().error.code).toBe('GIG_DELETED');
  });

  it('cost line endpoints need a session', async () => {
    const gig = await createGig(s);
    const voc = lineOf(gig, 'VOC');
    for (const [method, url] of [
      ['POST', `/api/gigs/${gig.id}/cost-lines`],
      ['PATCH', `/api/cost-lines/${voc.id}`],
      ['DELETE', `/api/cost-lines/${voc.id}`],
      ['POST', `/api/cost-lines/${voc.id}/pay`],
      ['POST', `/api/cost-lines/${voc.id}/unpay`],
    ] as const) {
      expect((await s.app.inject({ method, url })).statusCode).toBe(401);
    }
  });
});
