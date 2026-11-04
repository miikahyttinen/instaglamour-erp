/** Cost line endpoints (UC-005; BR-008, BR-022…BR-026). Synthetic data only. */
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SETTING_KEYS } from '../src/domain/enums.js';
import { closeTestDb, login, resetDb, testDb } from './helpers.js';
import { call, createEvent, history, type Json, setSetting, startSession, UNKNOWN_ID, type Session } from './eventFixtures.js';

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
const lineOf = (event: { costLines: Line[] }, type: string) => event.costLines.find((l) => l.type === type)!;

async function addLine(eventId: string, payload: Record<string, unknown>): Promise<Json> {
  const res = await call(s, 'POST', `/api/events/${eventId}/cost-lines`, payload);
  if (res.statusCode !== 200) throw new Error(`add line failed: ${res.statusCode} ${res.body}`);
  return res.json();
}

describe('POST /api/events/{id}/cost-lines', () => {
  it('adds a line at the end, updates totals and logs COST_ADDED', async () => {
    const event = await createEvent(s);
    const res = await call(s, 'POST', `/api/events/${event.id}/cost-lines`, { type: 'GUITAR', personId: s.world.p1.id, budgetedCents: 20000 });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.warnings).toEqual([]);
    const line = body.event.costLines.at(-1);
    expect(line).toEqual({
      id: expect.any(String),
      eventId: event.id,
      type: 'GUITAR',
      personId: s.world.p1.id,
      description: null,
      budgetedCents: 20000,
      joinsLoadIn: true,
      loadInDeductionAppliedCents: null,
      actualCents: null,
      paidAt: null,
      paidBy: null,
      purchaseOrder: null,
    });
    expect(body.event.budgetedCostsCents).toBe(event.budgetedCostsCents + 20000);
    expect(body.event.costLines.slice(0, -1)).toEqual(event.costLines);

    const [entry] = await history(s, event.id);
    expect(entry).toMatchObject({
      type: 'COST_ADDED',
      details: { costLineId: line.id, type: 'GUITAR', personId: s.world.p1.id, budgetedCents: 20000 },
    });
  });

  it('expense and internal lines have joinsLoadIn null; OTHER needs a description', async () => {
    const event = await createEvent(s);
    const fuel = (await addLine(event.id, { type: 'FUEL', budgetedCents: 10000 })).event.costLines.at(-1);
    expect(fuel).toMatchObject({ type: 'FUEL', joinsLoadIn: null, personId: null });
    const other = (await addLine(event.id, { type: 'OTHER', description: 'Flowers', budgetedCents: 10000 })).event.costLines.at(-1);
    expect(other).toMatchObject({ type: 'OTHER', description: 'Flowers' });
    const office = (await addLine(event.id, { type: 'OFFICE', budgetedCents: 0 })).event.costLines.at(-1);
    expect(office).toMatchObject({ joinsLoadIn: null, budgetedCents: 0 });
  });

  it('allows the same person on several lines and several people in one role (BR-024)', async () => {
    const event = await createEvent(s);
    await addLine(event.id, { type: 'GUITAR', personId: s.world.p1.id, budgetedCents: 10000 });
    const body = await addLine(event.id, { type: 'MIX', personId: s.world.p1.id, budgetedCents: 10000 });
    await addLine(event.id, { type: 'PRODUCTION', personId: s.world.b.personId, budgetedCents: 10000 });
    expect(body.warnings).toEqual([]); // same event is not a double booking
  });

  it.each([
    [{ budgetedCents: 10000 }, { type: 'REQUIRED' }],
    [{ type: 'CATERING', budgetedCents: 10000 }, { type: 'INVALID_VALUE' }],
    // Removed roles (TASK-041)
    [{ type: 'HORN_1', budgetedCents: 10000 }, { type: 'INVALID_VALUE' }],
    [{ type: 'HORN_2', budgetedCents: 10000 }, { type: 'INVALID_VALUE' }],
    [{ type: 'TECHNICIAN', budgetedCents: 10000 }, { type: 'INVALID_VALUE' }],
    [{ type: 'VOC' }, { budgetedCents: 'REQUIRED' }],
    [{ type: 'VOC', budgetedCents: -10000 }, { budgetedCents: 'NEGATIVE_AMOUNT' }],
    [{ type: 'OTHER', budgetedCents: 10000 }, { description: 'DESCRIPTION_REQUIRED' }],
    [{ type: 'OTHER_ROLE', description: '  ', budgetedCents: 10000 }, { description: 'DESCRIPTION_REQUIRED' }],
    [{ type: 'VOC', personId: UNKNOWN_ID, budgetedCents: 10000 }, { personId: 'UNKNOWN_REFERENCE' }],
    [{ type: 'VOC', description: 'x'.repeat(501), budgetedCents: 10000 }, { description: 'TOO_LONG' }],
  ])('rejects %j', async (payload, fields) => {
    const event = await createEvent(s);
    const res = await call(s, 'POST', `/api/events/${event.id}/cost-lines`, payload);
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toEqual({ code: 'VALIDATION_ERROR', message: expect.any(String), fields });
  });

  it('404 unknown event, 409 deleted event, allowed on a cancelled event', async () => {
    expect((await call(s, 'POST', `/api/events/${UNKNOWN_ID}/cost-lines`, { type: 'VOC', budgetedCents: 0 })).statusCode).toBe(404);
    const event = await createEvent(s);
    await call(s, 'POST', `/api/events/${event.id}/cancel`, { reason: 'Client cancelled' });
    expect((await call(s, 'POST', `/api/events/${event.id}/cost-lines`, { type: 'VOC', budgetedCents: 0 })).statusCode).toBe(200);
    await call(s, 'POST', `/api/events/${event.id}/delete`, { reason: 'Duplicate' });
    const res = await call(s, 'POST', `/api/events/${event.id}/cost-lines`, { type: 'VOC', budgetedCents: 0 });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('EVENT_DELETED');
  });
});

describe('double booking (BR-022)', () => {
  it('warns on add, assign and move; ignores cancelled and deleted events; never blocks', async () => {
    const { p1, c } = s.world;
    // Seller/producer C, so only Person 1 is on both events.
    const other = await createEvent(s, { startDate: '2026-05-01', endDate: '2026-05-03', lineupTemplateId: null, lineupName: 'Lineup Other', sellerId: c.id, producerId: c.id });
    await addLine(other.id, { type: 'VOC', personId: p1.id, budgetedCents: 10000 });

    // Overlapping one-day event inside the other's range.
    const event = await createEvent(s, { startDate: '2026-05-02' });
    const add = await addLine(event.id, { type: 'GUITAR', personId: p1.id, budgetedCents: 10000 });
    const warning = { code: 'PERSON_DOUBLE_BOOKED', personId: p1.id, otherEventId: other.id, otherEventStartDate: '2026-05-01', otherEventLineupName: 'Lineup Other' };
    expect(add.warnings).toEqual([warning]);
    expect(add.event.costLines.at(-1).personId).toBe(p1.id); // saved anyway

    // Assign on an existing line.
    const voc = lineOf(event, 'VOC');
    const assign = (await call(s, 'PATCH', `/api/cost-lines/${voc.id}`, { personId: p1.id })).json();
    expect(assign.warnings).toEqual([warning]);
    // No warning when the person does not change, or is cleared.
    expect((await call(s, 'PATCH', `/api/cost-lines/${voc.id}`, { budgetedCents: 20000 })).json().warnings).toEqual([]);
    expect((await call(s, 'PATCH', `/api/cost-lines/${voc.id}`, { personId: null })).json().warnings).toEqual([]);

    // Move away: no overlap; move back: warning.
    expect((await call(s, 'POST', `/api/events/${event.id}/move`, { startDate: '2026-05-04' })).json().warnings).toEqual([]);
    expect((await call(s, 'POST', `/api/events/${event.id}/move`, { startDate: '2026-04-30', endDate: '2026-05-01' })).json().warnings).toEqual([warning]);

    // Cancelled other event → no warning.
    await call(s, 'POST', `/api/events/${other.id}/cancel`, { reason: 'Client cancelled' });
    expect((await addLine(event.id, { type: 'KEYS', personId: p1.id, budgetedCents: 10000 })).warnings).toEqual([]);
    await call(s, 'POST', `/api/events/${other.id}/uncancel`, { reason: 'Back on' });
    expect((await addLine(event.id, { type: 'KEYS', personId: p1.id, budgetedCents: 10000 })).warnings).toEqual([warning]);

    // Deleted other event → no warning.
    await call(s, 'POST', `/api/events/${other.id}/delete`, { reason: 'Duplicate' });
    expect((await addLine(event.id, { type: 'KEYS', personId: p1.id, budgetedCents: 10000 })).warnings).toEqual([]);
  });

  it('a one-day event overlaps only the same day', async () => {
    const { p2 } = s.world;
    const other = await createEvent(s, { startDate: '2026-05-01' });
    await addLine(other.id, { type: 'VOC', personId: p2.id, budgetedCents: 10000 });
    const next = await createEvent(s, { startDate: '2026-05-02' });
    expect((await addLine(next.id, { type: 'VOC', personId: p2.id, budgetedCents: 10000 })).warnings).toEqual([]);
    const same = await createEvent(s, { startDate: '2026-05-01' });
    expect((await addLine(same.id, { type: 'VOC', personId: p2.id, budgetedCents: 10000 })).warnings).toHaveLength(1);
  });

  it('move warns for each assigned person', async () => {
    const { p1, p2 } = s.world;
    const other = await createEvent(s, { startDate: '2026-06-01' });
    await addLine(other.id, { type: 'VOC', personId: p1.id, budgetedCents: 10000 });
    await addLine(other.id, { type: 'BASS', personId: p2.id, budgetedCents: 10000 });
    const event = await createEvent(s, { startDate: '2026-07-01' });
    await addLine(event.id, { type: 'VOC', personId: p1.id, budgetedCents: 10000 });
    await addLine(event.id, { type: 'BASS', personId: p2.id, budgetedCents: 10000 });
    const res = (await call(s, 'POST', `/api/events/${event.id}/move`, { startDate: '2026-06-01' })).json();
    // Sellers/producers (Partner A/B) are also on both events via Sales/Production lines, but
    // internal lines never count: only the performers are warned about.
    expect(res.warnings.map((w: { personId: string }) => w.personId).sort()).toEqual([p1.id, p2.id].sort());
  });

  it('internal roles and expenses never trigger a warning (add and assign)', async () => {
    // Partner C: Sales/Production lines take only active partners.
    const p1 = { id: s.world.c.personId };
    const other = await createEvent(s, { startDate: '2026-08-01' });
    await addLine(other.id, { type: 'VOC', personId: p1.id, budgetedCents: 10000 });
    const event = await createEvent(s, { startDate: '2026-08-01' });
    for (const type of ['OFFICE', 'SALES', 'PRODUCTION', 'FUEL', 'ACCOMMODATION']) {
      const add = await addLine(event.id, { type, personId: p1.id, budgetedCents: 10000 });
      expect(add.warnings, type).toEqual([]);
    }
    // Assigning the person on an existing internal line (default SALES line) also stays silent.
    const sales = lineOf(event, 'SALES');
    expect((await call(s, 'PATCH', `/api/cost-lines/${sales.id}`, { personId: p1.id })).json().warnings).toEqual([]);
  });

  it('SALES on one event and VOC on another the same day is fine; VOC on both warns', async () => {
    const p1 = { id: s.world.c.personId }; // a partner: Sales lines take only active partners
    const salesEvent = await createEvent(s, { startDate: '2026-09-01', lineupTemplateId: null, lineupName: 'Lineup Sales' });
    await addLine(salesEvent.id, { type: 'SALES', personId: p1.id, budgetedCents: 10000 });
    const event = await createEvent(s, { startDate: '2026-09-01' });
    expect((await addLine(event.id, { type: 'VOC', personId: p1.id, budgetedCents: 10000 })).warnings).toEqual([]);

    const vocEvent = await createEvent(s, { startDate: '2026-09-01', lineupTemplateId: null, lineupName: 'Lineup Voc' });
    await addLine(vocEvent.id, { type: 'VOC', personId: p1.id, budgetedCents: 10000 });
    const add = await addLine(event.id, { type: 'BACKING_VOC', personId: p1.id, budgetedCents: 10000 });
    expect(add.warnings).toEqual([
      { code: 'PERSON_DOUBLE_BOOKED', personId: p1.id, otherEventId: vocEvent.id, otherEventStartDate: '2026-09-01', otherEventLineupName: 'Lineup Voc' },
    ]);
  });

  it('move warns only for musician-role people on the moved event', async () => {
    const { p1, p2 } = s.world;
    const other = await createEvent(s, { startDate: '2026-10-01' });
    await addLine(other.id, { type: 'VOC', personId: p1.id, budgetedCents: 10000 });
    await addLine(other.id, { type: 'MIX', personId: p2.id, budgetedCents: 10000 });
    const event = await createEvent(s, { startDate: '2026-11-01' });
    await addLine(other.id, { type: 'GUITAR', personId: s.world.c.personId, budgetedCents: 10000 });
    await addLine(event.id, { type: 'PRODUCTION', personId: s.world.c.personId, budgetedCents: 10000 }); // internal: ignored
    await addLine(event.id, { type: 'DJ', personId: p2.id, budgetedCents: 10000 });
    const res = (await call(s, 'POST', `/api/events/${event.id}/move`, { startDate: '2026-10-01' })).json();
    expect(res.warnings.map((w: { personId: string }) => w.personId)).toEqual([p2.id]);
  });
});

describe('PATCH /api/cost-lines/{id}', () => {
  it('edits person, description and amount; logs COST_UPDATED with the changes', async () => {
    const event = await createEvent(s);
    const voc = lineOf(event, 'VOC');
    const res = await call(s, 'PATCH', `/api/cost-lines/${voc.id}`, { personId: s.world.p1.id, description: 'Lead', budgetedCents: 20000 });
    expect(res.statusCode).toBe(200);
    const updated = lineOf(res.json().event, 'VOC');
    expect(updated).toMatchObject({ personId: s.world.p1.id, description: 'Lead', budgetedCents: 20000 });
    expect(res.json().event.budgetedCostsCents).toBe(event.budgetedCostsCents - 10000);
    const [entry] = await history(s, event.id);
    expect(entry).toMatchObject({
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
    const event = await createEvent(s);
    expect(event.notFullyStaffed).toBe(true);
    await call(s, 'PATCH', `/api/cost-lines/${lineOf(event, 'VOC').id}`, { personId: s.world.p1.id });
    const res = await call(s, 'PATCH', `/api/cost-lines/${lineOf(event, 'BASS').id}`, { personId: s.world.p2.id });
    expect(res.json().event.notFullyStaffed).toBe(false);
  });

  it('no change logs nothing', async () => {
    const event = await createEvent(s);
    const res = await call(s, 'PATCH', `/api/cost-lines/${lineOf(event, 'VOC').id}`, { budgetedCents: 30000, joinsLoadIn: true });
    expect(res.statusCode).toBe(200);
    expect((await history(s, event.id)).map((e) => e.type)).toEqual(['CREATED']);
  });

  it.each([
    [{ type: 'BASS' }, { type: 'NOT_EDITABLE' }],
    [{ budgetedCents: -10000 }, { budgetedCents: 'NEGATIVE_AMOUNT' }],
    [{ budgetedCents: null }, { budgetedCents: 'REQUIRED' }],
    [{ joinsLoadIn: 'no' }, { joinsLoadIn: 'INVALID_VALUE' }],
    [{ personId: UNKNOWN_ID }, { personId: 'UNKNOWN_REFERENCE' }],
  ])('rejects %j', async (payload, fields) => {
    const event = await createEvent(s);
    const res = await call(s, 'PATCH', `/api/cost-lines/${lineOf(event, 'VOC').id}`, payload);
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toEqual({ code: 'VALIDATION_ERROR', message: expect.any(String), fields });
  });

  it('joinsLoadIn on a non-musician line is INVALID_VALUE; clearing OTHER description is DESCRIPTION_REQUIRED', async () => {
    const event = await createEvent(s);
    const office = await call(s, 'PATCH', `/api/cost-lines/${lineOf(event, 'OFFICE').id}`, { joinsLoadIn: false });
    expect(office.statusCode).toBe(400);
    expect(office.json().error.fields).toEqual({ joinsLoadIn: 'INVALID_VALUE' });

    const other = (await addLine(event.id, { type: 'OTHER', description: 'Flowers', budgetedCents: 10000 })).event.costLines.at(-1);
    const res = await call(s, 'PATCH', `/api/cost-lines/${other.id}`, { description: null });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.fields).toEqual({ description: 'DESCRIPTION_REQUIRED' });
  });

  it('404 unknown line, 409 on a deleted event', async () => {
    expect((await call(s, 'PATCH', `/api/cost-lines/${UNKNOWN_ID}`, { budgetedCents: 0 })).statusCode).toBe(404);
    expect((await call(s, 'PATCH', '/api/cost-lines/nope', { budgetedCents: 0 })).statusCode).toBe(404);
    const event = await createEvent(s);
    await call(s, 'POST', `/api/events/${event.id}/delete`, { reason: 'Duplicate' });
    const res = await call(s, 'PATCH', `/api/cost-lines/${lineOf(event, 'VOC').id}`, { budgetedCents: 0 });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('EVENT_DELETED');
  });
});

describe('load-in switch (BR-026)', () => {
  const patch = (id: string, payload: unknown) => call(s, 'PATCH', `/api/cost-lines/${id}`, payload);

  it('off deducts the setting, on restores exactly even after the setting changed', async () => {
    const event = await createEvent(s);
    const voc = lineOf(event, 'VOC'); // 30000, deduction 10000

    const off = lineOf((await patch(voc.id, { joinsLoadIn: false })).json().event, 'VOC');
    expect(off).toMatchObject({ joinsLoadIn: false, budgetedCents: 20000, loadInDeductionAppliedCents: 10000 });
    const [offEvent] = await history(s, event.id);
    expect(offEvent!.details.changes).toEqual([
      { field: 'budgetedCents', from: 30000, to: 20000 },
      { field: 'joinsLoadIn', from: true, to: false },
    ]);

    // Same value again: no-op.
    const again = lineOf((await patch(voc.id, { joinsLoadIn: false })).json().event, 'VOC');
    expect(again).toMatchObject({ budgetedCents: 20000, loadInDeductionAppliedCents: 10000 });
    expect((await history(s, event.id)).filter((e) => e.type === 'COST_UPDATED')).toHaveLength(1);

    await setSetting(SETTING_KEYS.loadInDeduction, 20000);
    const on = lineOf((await patch(voc.id, { joinsLoadIn: true })).json().event, 'VOC');
    expect(on).toMatchObject({ joinsLoadIn: true, budgetedCents: 30000, loadInDeductionAppliedCents: null });
  });

  it('never goes below 0 and restores only what was deducted', async () => {
    await setSetting(SETTING_KEYS.loadInDeduction, 20000);
    const event = await createEvent(s);
    const line = (await addLine(event.id, { type: 'DJ', budgetedCents: 10000 })).event.costLines.at(-1);
    const off = (await patch(line.id, { joinsLoadIn: false })).json().event.costLines.at(-1);
    expect(off).toMatchObject({ budgetedCents: 0, loadInDeductionAppliedCents: 10000 });
    const on = (await patch(line.id, { joinsLoadIn: true })).json().event.costLines.at(-1);
    expect(on).toMatchObject({ budgetedCents: 10000, loadInDeductionAppliedCents: null });
  });

  it('with budgetedCents and joinsLoadIn together, the budget is applied first', async () => {
    const event = await createEvent(s);
    const voc = lineOf(event, 'VOC');
    const off = lineOf((await patch(voc.id, { budgetedCents: 60000, joinsLoadIn: false })).json().event, 'VOC');
    expect(off).toMatchObject({ budgetedCents: 50000, loadInDeductionAppliedCents: 10000 });
    const [entry] = await history(s, event.id);
    expect(entry!.details.changes).toEqual([
      { field: 'budgetedCents', from: 30000, to: 50000 },
      { field: 'joinsLoadIn', from: true, to: false },
    ]);
    const on = lineOf((await patch(voc.id, { budgetedCents: 20000, joinsLoadIn: true })).json().event, 'VOC');
    expect(on).toMatchObject({ budgetedCents: 30000, loadInDeductionAppliedCents: null });
  });
});

describe('DELETE /api/cost-lines/{id}', () => {
  it('removes the line, returns the event and logs COST_REMOVED', async () => {
    const event = await createEvent(s);
    const sales = lineOf(event, 'SALES');
    const res = await call(s, 'DELETE', `/api/cost-lines/${sales.id}`);
    expect(res.statusCode).toBe(200);
    expect(res.json().warnings).toEqual([]);
    expect(res.json().event.costLines.map((l: Line) => l.type)).toEqual(['VOC', 'BASS', 'OFFICE', 'PRODUCTION']);
    const [entry] = await history(s, event.id);
    expect(entry).toMatchObject({
      type: 'COST_REMOVED',
      details: { costLineId: sales.id, type: 'SALES', personId: s.world.a.personId, budgetedCents: sales.budgetedCents },
    });
    expect((await call(s, 'DELETE', `/api/cost-lines/${sales.id}`)).statusCode).toBe(404);
  });

  it('409 on a deleted event', async () => {
    const event = await createEvent(s);
    await call(s, 'POST', `/api/events/${event.id}/delete`, { reason: 'Duplicate' });
    expect((await call(s, 'DELETE', `/api/cost-lines/${lineOf(event, 'VOC').id}`)).json().error.code).toBe('EVENT_DELETED');
  });
});

describe('pay / unpay (BR-025, BR-008)', () => {
  it('pay defaults to the budgeted amount, records time and partner, logs COST_PAID', async () => {
    const event = await createEvent(s);
    const voc = lineOf(event, 'VOC');
    const before = Date.now();
    const res = await call(s, 'POST', `/api/cost-lines/${voc.id}/pay`);
    expect(res.statusCode).toBe(200);
    const paid = lineOf(res.json().event, 'VOC') as Line & { actualCents: number; paidAt: string; paidBy: string };
    expect(paid).toMatchObject({ actualCents: 30000, paidBy: s.world.a.id });
    expect(new Date(paid.paidAt).getTime()).toBeGreaterThanOrEqual(before - 1000);
    expect(res.json().event.actualCostsCents).toBe(30000);
    const [entry] = await history(s, event.id);
    expect(entry).toMatchObject({ type: 'COST_PAID', details: { costLineId: voc.id, type: 'VOC', actualCents: 30000 } });
  });

  it('pay with an amount; paying again updates the amount and keeps the original payment', async () => {
    const event = await createEvent(s);
    const voc = lineOf(event, 'VOC');
    const first = lineOf((await call(s, 'POST', `/api/cost-lines/${voc.id}/pay`, { actualCents: 20000 })).json().event, 'VOC') as Line & { paidAt: string };
    expect(first).toMatchObject({ actualCents: 20000 });
    const cookieB = await login(s.app, 'partner.b@example.com');
    const res = await s.app.inject({ method: 'POST', url: `/api/cost-lines/${voc.id}/pay`, headers: { cookie: cookieB }, payload: { actualCents: 10000 } });
    const second = lineOf(res.json().event, 'VOC');
    expect(second).toMatchObject({ actualCents: 10000, paidAt: first.paidAt, paidBy: s.world.a.id });
    const events = await history(s, event.id);
    expect(events[0]).toMatchObject({ type: 'COST_PAID', partnerId: s.world.b.id, details: { actualCents: 10000 } });
  });

  it('unpay clears amount, time and partner and logs COST_UNPAID; unpay of an unpaid line is a no-op', async () => {
    const event = await createEvent(s);
    const voc = lineOf(event, 'VOC');
    await call(s, 'POST', `/api/cost-lines/${voc.id}/pay`, { actualCents: 20000 });
    const res = await call(s, 'POST', `/api/cost-lines/${voc.id}/unpay`);
    expect(res.statusCode).toBe(200);
    expect(lineOf(res.json().event, 'VOC')).toMatchObject({ actualCents: null, paidAt: null, paidBy: null });
    expect(res.json().event.actualCostsCents).toBe(0);
    const [entry] = await history(s, event.id);
    expect(entry).toMatchObject({ type: 'COST_UNPAID', details: { costLineId: voc.id, type: 'VOC', previousActualCents: 20000 } });

    expect((await call(s, 'POST', `/api/cost-lines/${voc.id}/unpay`)).statusCode).toBe(200);
    expect((await history(s, event.id)).filter((e) => e.type === 'COST_UNPAID')).toHaveLength(1);
  });

  it('FUEL cannot be paid (409 COST_NOT_PAYABLE)', async () => {
    const event = await createEvent(s);
    const fuel = (await addLine(event.id, { type: 'FUEL', budgetedCents: 10000 })).event.costLines.at(-1);
    const res = await call(s, 'POST', `/api/cost-lines/${fuel.id}/pay`, {});
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('COST_NOT_PAYABLE');
  });

  it('validates the amount; 404 unknown; 409 deleted event', async () => {
    const event = await createEvent(s);
    const voc = lineOf(event, 'VOC');
    const neg = await call(s, 'POST', `/api/cost-lines/${voc.id}/pay`, { actualCents: -10000 });
    expect(neg.statusCode).toBe(400);
    expect(neg.json().error.fields).toEqual({ actualCents: 'NEGATIVE_AMOUNT' });
    expect((await call(s, 'POST', `/api/cost-lines/${UNKNOWN_ID}/pay`)).statusCode).toBe(404);
    expect((await call(s, 'POST', `/api/cost-lines/${UNKNOWN_ID}/unpay`)).statusCode).toBe(404);
    await call(s, 'POST', `/api/events/${event.id}/delete`, { reason: 'Duplicate' });
    expect((await call(s, 'POST', `/api/cost-lines/${voc.id}/pay`)).json().error.code).toBe('EVENT_DELETED');
    expect((await call(s, 'POST', `/api/cost-lines/${voc.id}/unpay`)).json().error.code).toBe('EVENT_DELETED');
  });

  it('cost line endpoints need a session', async () => {
    const event = await createEvent(s);
    const voc = lineOf(event, 'VOC');
    for (const [method, url] of [
      ['POST', `/api/events/${event.id}/cost-lines`],
      ['PATCH', `/api/cost-lines/${voc.id}`],
      ['DELETE', `/api/cost-lines/${voc.id}`],
      ['POST', `/api/cost-lines/${voc.id}/pay`],
      ['POST', `/api/cost-lines/${voc.id}/unpay`],
    ] as const) {
      expect((await s.app.inject({ method, url })).statusCode).toBe(401);
    }
  });
});

describe('Sales and production lines: partners only (contract 2026-11-04)', () => {
  const add = (eventId: string, payload: Record<string, unknown>) => call(s, 'POST', `/api/events/${eventId}/cost-lines`, payload);
  const patch = (id: string, payload: Record<string, unknown>) => call(s, 'PATCH', `/api/cost-lines/${id}`, payload);
  const notPartner = { error: expect.objectContaining({ code: 'VALIDATION_ERROR', fields: { personId: 'NOT_PARTNER' } }) };

  it.each(['SALES', 'PRODUCTION'])('%s: an active partner is accepted on create and on person change', async (type) => {
    const event = await createEvent(s);
    const res = await add(event.id, { type, personId: s.world.c.personId, budgetedCents: 10000 });
    expect(res.statusCode).toBe(200);
    const line = res.json().event.costLines.at(-1);
    expect(line).toMatchObject({ type, personId: s.world.c.personId });
    const changed = await patch(line.id, { personId: s.world.b.personId });
    expect(changed.statusCode).toBe(200);
    expect(changed.json().event.costLines.find((l: Line) => l.id === line.id).personId).toBe(s.world.b.personId);
  });

  it.each(['SALES', 'PRODUCTION'])('%s: a person who is not a partner → 400 personId: NOT_PARTNER; nothing written', async (type) => {
    const event = await createEvent(s);
    const historyBefore = (await history(s, event.id)).length;
    const res = await add(event.id, { type, personId: s.world.p1.id, budgetedCents: 10000 });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual(notPartner);

    const line = lineOf(event, type);
    const changed = await patch(line.id, { personId: s.world.p1.id });
    expect(changed.statusCode).toBe(400);
    expect(changed.json()).toEqual(notPartner);

    const db = testDb();
    expect(await db.costLine.count({ where: { eventId: event.id } })).toBe(event.costLines.length);
    expect((await db.costLine.findUniqueOrThrow({ where: { id: line.id } })).personId).toBe(line.personId);
    expect(await history(s, event.id)).toHaveLength(historyBefore);
  });

  it('a removed (inactive) partner → 400 NOT_PARTNER on create and PATCH', async () => {
    const event = await createEvent(s);
    await testDb().partner.update({ where: { id: s.world.c.id }, data: { active: false, revokedAt: new Date() } });
    const res = await add(event.id, { type: 'SALES', personId: s.world.c.personId, budgetedCents: 10000 });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual(notPartner);
    const changed = await patch(lineOf(event, 'PRODUCTION').id, { personId: s.world.c.personId });
    expect(changed.statusCode).toBe(400);
    expect(changed.json()).toEqual(notPartner);
  });

  it('no person is fine on create and PATCH', async () => {
    const event = await createEvent(s);
    expect((await add(event.id, { type: 'PRODUCTION', personId: null, budgetedCents: 10000 })).statusCode).toBe(200);
    expect((await add(event.id, { type: 'SALES', budgetedCents: 10000 })).statusCode).toBe(200);
    const sales = lineOf(event, 'SALES');
    const cleared = await patch(sales.id, { personId: null });
    expect(cleared.statusCode).toBe(200);
    expect(cleared.json().event.costLines.find((l: Line) => l.id === sales.id).personId).toBeNull();
  });

  it('other types are unaffected: non-partners stay allowed', async () => {
    const event = await createEvent(s);
    for (const type of ['OFFICE', 'VOC', 'MIX', 'FUEL', 'ACCOMMODATION']) {
      expect((await add(event.id, { type, personId: s.world.p1.id, budgetedCents: 10000 })).statusCode, type).toBe(200);
    }
    expect((await patch(lineOf(event, 'VOC').id, { personId: s.world.p2.id })).statusCode).toBe(200);
  });

  it('an unknown person stays UNKNOWN_REFERENCE (not NOT_PARTNER)', async () => {
    const event = await createEvent(s);
    const res = await add(event.id, { type: 'SALES', personId: UNKNOWN_ID, budgetedCents: 10000 });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.fields).toEqual({ personId: 'UNKNOWN_REFERENCE' });
  });

  it('existing lines that break the rule stay editable while the person is unchanged; BR-027 still works', async () => {
    const event = await createEvent(s);
    const legacy = await testDb().costLine.create({
      data: { eventId: event.id, type: 'SALES', personId: s.world.p1.id, budgetedCents: 10000 },
    });
    expect((await patch(legacy.id, { budgetedCents: 20000, description: 'Old split' })).statusCode).toBe(200);
    expect((await patch(legacy.id, { personId: s.world.p1.id })).statusCode).toBe(200); // same person: no change
    expect((await patch(legacy.id, { personId: s.world.p2.id })).json()).toEqual(notPartner);

    // BR-027: changing the seller moves the old seller's lines and leaves the legacy line alone.
    const res = await call(s, 'PATCH', `/api/events/${event.id}`, { sellerId: s.world.c.id });
    expect(res.statusCode).toBe(200);
    const sales = lineOf(event, 'SALES');
    expect(res.json().movedCostLineIds).toEqual([sales.id]);
    const lines = res.json().event.costLines as Line[];
    expect(lines.find((l) => l.id === sales.id)!.personId).toBe(s.world.c.personId);
    expect(lines.find((l) => l.id === legacy.id)).toMatchObject({ personId: s.world.p1.id, budgetedCents: 20000 });
  });
});
