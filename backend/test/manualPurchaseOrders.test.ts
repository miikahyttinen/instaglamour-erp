/**
 * Purchase orders created by partners (api-contract "Purchase orders created by partners",
 * 2026-10-31; TASK-043): GET /api/people/{id}/po-eligible-lines and POST /api/purchase-orders.
 * Synthetic data only; money is multiples of 10000 cents.
 */
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeTestDb, login, resetDb, testDb } from './helpers.js';
import { call, createEvent, startSession, UNKNOWN_ID, type Json, type Session } from './eventFixtures.js';

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
const FUTURE = '2099-05-01';
const FUTURE_2 = '2099-06-01';

const lineOf = (event: Json, type: string): Json => event.costLines.find((l: Json) => l.type === type);

/** An event (Template A: VOC 30000, BASS 20000 + internal lines) with Person 1 on VOC, Person 2 on BASS. */
async function eventWithPeople(startDate: string, overrides: Record<string, unknown> = {}): Promise<Json> {
  const event = await createEvent(s, { startDate, ...overrides });
  await call(s, 'PATCH', `/api/cost-lines/${lineOf(event, 'VOC').id}`, { personId: s.world.p1.id });
  const res = await call(s, 'PATCH', `/api/cost-lines/${lineOf(event, 'BASS').id}`, { personId: s.world.p2.id });
  return res.json().event;
}

const eligible = async (personId: string, query = ''): Promise<Json[]> => {
  const res = await call(s, 'GET', `/api/people/${personId}/po-eligible-lines${query}`);
  expect(res.statusCode).toBe(200);
  return res.json();
};

const create = (personId: unknown, costLineIds: unknown) =>
  call(s, 'POST', '/api/purchase-orders', { personId, costLineIds });

async function freelancerToken(personId: string): Promise<string> {
  const res = await call(s, 'GET', `/api/people/${personId}/freelancer-link`);
  return res.json<{ sharePath: string }>().sharePath.slice(3);
}

// ======================================================================== eligible lines
describe('GET /api/people/{id}/po-eligible-lines', () => {
  it('own unpaid lines > 0 on non-deleted SOLD events (played or upcoming), newest event first', async () => {
    const played = await eventWithPeople(PAST);
    const upcoming = await eventWithPeople(FUTURE, { lineupName: 'Lineup 1', venue: 'Venue Y' });
    const extra = (
      await call(s, 'POST', `/api/events/${upcoming.id}/cost-lines`, {
        type: 'OTHER_ROLE',
        personId: s.world.p1.id,
        description: 'Role 1',
        budgetedCents: 10000,
      })
    ).json().event.costLines.at(-1);
    // Excluded: paid, cancelled, deleted, zero, FUEL, on an OPEN PO, someone else's
    const paid = await eventWithPeople(PAST_2);
    await call(s, 'POST', `/api/cost-lines/${lineOf(paid, 'VOC').id}/pay`, {});
    const cancelled = await eventWithPeople(FUTURE_2);
    await call(s, 'POST', `/api/events/${cancelled.id}/cancel`, { reason: 'Reason 1' });
    const deleted = await eventWithPeople(PAST);
    await call(s, 'POST', `/api/events/${deleted.id}/delete`, { reason: 'Reason 1' });
    const zero = await eventWithPeople(PAST);
    await call(s, 'PATCH', `/api/cost-lines/${lineOf(zero, 'VOC').id}`, { budgetedCents: 0 });
    await call(s, 'POST', `/api/events/${played.id}/cost-lines`, { type: 'FUEL', personId: s.world.p1.id, budgetedCents: 10000 });
    const onPo = await eventWithPeople(PAST_2);
    expect((await create(s.world.p1.id, [lineOf(onPo, 'VOC').id])).statusCode).toBe(201);

    const rows = await eligible(s.world.p1.id);
    expect(rows).toEqual([
      {
        costLineId: lineOf(upcoming, 'VOC').id,
        eventId: upcoming.id,
        eventStartDate: FUTURE,
        eventVenue: 'Venue Y',
        eventLineupName: 'Lineup 1',
        type: 'VOC',
        description: null,
        amountCents: 30000,
      },
      expect.objectContaining({ costLineId: extra.id, type: 'OTHER_ROLE', description: 'Role 1', amountCents: 10000 }),
      expect.objectContaining({ costLineId: lineOf(played, 'VOC').id, eventId: played.id, eventStartDate: PAST }),
    ]);

    // Cancelling the PO frees the line again
    const po = (await call(s, 'GET', '/api/purchase-orders')).json().purchaseOrders[0];
    await call(s, 'POST', `/api/purchase-orders/${po.id}/cancel`, { reason: 'Reason 2' });
    expect((await eligible(s.world.p1.id)).map((r: { costLineId: string }) => r.costLineId)).toContain(lineOf(onPo, 'VOC').id);
  });

  it('?eventId limits to one event; unknown or malformed eventId → empty list', async () => {
    const a = await eventWithPeople(PAST);
    const b = await eventWithPeople(FUTURE);
    expect((await eligible(s.world.p1.id, `?eventId=${b.id}`)).map((r: { costLineId: string }) => r.costLineId)).toEqual([lineOf(b, 'VOC').id]);
    expect((await eligible(s.world.p1.id, `?eventId=${a.id}`)).map((r: { costLineId: string }) => r.costLineId)).toEqual([lineOf(a, 'VOC').id]);
    expect(await eligible(s.world.p1.id, `?eventId=${UNKNOWN_ID}`)).toEqual([]);
    expect(await eligible(s.world.p1.id, '?eventId=nope')).toEqual([]);
  });

  it('404 for unknown / malformed person; 401 without a session', async () => {
    for (const id of [UNKNOWN_ID, 'nope']) {
      expect((await call(s, 'GET', `/api/people/${id}/po-eligible-lines`)).statusCode).toBe(404);
    }
    const res = await s.app.inject({ method: 'GET', url: `/api/people/${s.world.p1.id}/po-eligible-lines` });
    expect(res.statusCode).toBe(401);
  });
});

// ======================================================================== create
describe('POST /api/purchase-orders', () => {
  it('creates a PO (upcoming events allowed), numbered and snapshotted like the freelancer path; logs the partner', async () => {
    const upcoming = await eventWithPeople(FUTURE);
    const played = await eventWithPeople(PAST);
    const ids = [lineOf(upcoming, 'VOC').id, lineOf(played, 'VOC').id];

    const res = await create(s.world.p1.id, ids);
    expect(res.statusCode).toBe(201);
    const po = res.json();
    expect(po).toEqual({
      id: expect.any(String),
      number: expect.stringMatching(/^PERSON-1-\d{4,}$/),
      personId: s.world.p1.id,
      personName: 'Person 1',
      status: 'OPEN',
      totalCents: 60000,
      createdAt: expect.any(String),
      paidAt: null,
      paidBy: null,
      cancelledAt: null,
      cancelledBy: null,
      cancelReason: null,
      lines: [
        // Oldest event first on the PO
        expect.objectContaining({ costLineId: lineOf(played, 'VOC').id, eventId: played.id, amountCents: 30000 }),
        expect.objectContaining({ costLineId: lineOf(upcoming, 'VOC').id, eventId: upcoming.id, eventStartDate: FUTURE }),
      ],
    });

    // CostLine.purchaseOrder is set and the BR-118 lock applies
    const event = (await call(s, 'GET', `/api/events/${upcoming.id}`)).json();
    expect(lineOf(event, 'VOC').purchaseOrder).toEqual({ id: po.id, number: po.number, status: 'OPEN' });
    const patch = await call(s, 'PATCH', `/api/cost-lines/${lineOf(upcoming, 'VOC').id}`, { budgetedCents: 10000 });
    expect(patch.statusCode).toBe(409);
    expect(patch.json().error).toMatchObject({ code: 'COST_LINE_ON_PURCHASE_ORDER', details: { purchaseOrderNumber: po.number } });
    expect((await call(s, 'POST', `/api/events/${upcoming.id}/cancel`, { reason: 'Reason 1' })).statusCode).toBe(409);

    // Log: CREATED by this partner
    const history = (await call(s, 'GET', `/api/purchase-orders/${po.id}/history`)).json();
    expect(history).toEqual([
      { id: expect.any(String), purchaseOrderId: po.id, number: po.number, type: 'CREATED', partnerId: s.world.a.id, at: expect.any(String), details: {} },
    ]);

    // The freelancer sees the line as ON_PO and the PO in their list
    const view = (await s.app.inject({ method: 'GET', url: `/api/public/freelancers/${await freelancerToken(s.world.p1.id)}` })).json();
    expect(view.lines.find((l: Json) => l.costLineId === lineOf(upcoming, 'VOC').id)).toMatchObject({
      state: 'ON_PO',
      purchaseOrderNumber: po.number,
    });
    expect(view.purchaseOrders.map((p: { number: string }) => p.number)).toEqual([po.number]);

    // Pay works as for any PO
    expect((await call(s, 'POST', `/api/purchase-orders/${po.id}/pay`)).json().status).toBe('PAID');
  });

  it('the log actor is the partner who created it; the freelancer path stays null and played-only', async () => {
    const g = await eventWithPeople(PAST);
    const upcoming = await eventWithPeople(FUTURE);
    const cookieB = await login(s.app, 'partner.b@example.com');
    const byB = await s.app.inject({
      method: 'POST',
      url: '/api/purchase-orders',
      headers: { cookie: cookieB },
      payload: { personId: s.world.p2.id, costLineIds: [lineOf(g, 'BASS').id] },
    });
    expect(byB.statusCode).toBe(201);

    const token = await freelancerToken(s.world.p1.id);
    const url = `/api/public/freelancers/${token}/purchase-orders`;
    const notPlayed = await s.app.inject({ method: 'POST', url, payload: { costLineIds: [lineOf(upcoming, 'VOC').id] } });
    expect(notPlayed.statusCode).toBe(409);
    expect(notPlayed.json().error.details).toEqual({ costLineIds: [lineOf(upcoming, 'VOC').id] });
    expect((await s.app.inject({ method: 'POST', url, payload: { costLineIds: [lineOf(g, 'VOC').id] } })).statusCode).toBe(201);

    const events = (await call(s, 'GET', '/api/purchase-orders/events')).json();
    expect(events.map((e: { type: string; partnerId: string | null }) => [e.type, e.partnerId])).toEqual([
      ['CREATED', null],
      ['CREATED', s.world.b.id],
    ]);
  });

  it('409 COST_LINE_NOT_ELIGIBLE lists exactly the offending ids; nothing is created', async () => {
    const upcoming = await eventWithPeople(FUTURE);
    const played = await eventWithPeople(PAST);
    const paid = await eventWithPeople(PAST_2);
    await call(s, 'POST', `/api/cost-lines/${lineOf(paid, 'VOC').id}/pay`, {});
    const zero = await eventWithPeople(PAST);
    await call(s, 'PATCH', `/api/cost-lines/${lineOf(zero, 'VOC').id}`, { budgetedCents: 0 });
    const cancelled = await eventWithPeople(FUTURE_2);
    await call(s, 'POST', `/api/events/${cancelled.id}/cancel`, { reason: 'Reason 1' });
    const deleted = await eventWithPeople(PAST);
    await call(s, 'POST', `/api/events/${deleted.id}/delete`, { reason: 'Reason 1' });
    const fuel = (
      await call(s, 'POST', `/api/events/${played.id}/cost-lines`, { type: 'FUEL', personId: s.world.p1.id, budgetedCents: 10000 })
    ).json().event.costLines.at(-1);
    const onPo = await eventWithPeople(PAST_2);
    expect((await create(s.world.p1.id, [lineOf(onPo, 'VOC').id])).statusCode).toBe(201);
    const before = await testDb().purchaseOrder.count();

    const bad = [
      lineOf(paid, 'VOC').id, // paid
      lineOf(zero, 'VOC').id, // amount 0
      lineOf(cancelled, 'VOC').id, // cancelled event
      lineOf(deleted, 'VOC').id, // deleted event
      lineOf(played, 'BASS').id, // another person's
      lineOf(played, 'OFFICE').id, // nobody's
      fuel.id, // FUEL
      lineOf(onPo, 'VOC').id, // already on an OPEN PO
      UNKNOWN_ID,
    ];
    const res = await create(s.world.p1.id, [lineOf(upcoming, 'VOC').id, lineOf(played, 'VOC').id, ...bad]);
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toMatchObject({ code: 'COST_LINE_NOT_ELIGIBLE', details: { costLineIds: bad } });
    expect(await testDb().purchaseOrder.count()).toBe(before);

    // Another person's line alone → 409 too
    const other = await create(s.world.p1.id, [lineOf(upcoming, 'BASS').id]);
    expect(other.statusCode).toBe(409);
    expect(other.json().error.details).toEqual({ costLineIds: [lineOf(upcoming, 'BASS').id] });
  });

  it('400 for personId REQUIRED / UNKNOWN_REFERENCE and costLineIds REQUIRED / INVALID_VALUE (reported together)', async () => {
    const g = await eventWithPeople(PAST);
    const voc = lineOf(g, 'VOC').id;
    const expectFields = async (payload: unknown, fields: Record<string, string>) => {
      const res = await call(s, 'POST', '/api/purchase-orders', payload);
      expect(res.statusCode).toBe(400);
      expect(res.json().error).toMatchObject({ code: 'VALIDATION_ERROR', fields });
      expect(Object.keys(res.json().error.fields).sort()).toEqual(Object.keys(fields).sort());
    };
    await expectFields({}, { personId: 'REQUIRED', costLineIds: 'REQUIRED' });
    await expectFields({ personId: UNKNOWN_ID, costLineIds: [voc] }, { personId: 'UNKNOWN_REFERENCE' });
    await expectFields({ personId: 'nope', costLineIds: [voc] }, { personId: 'UNKNOWN_REFERENCE' });
    await expectFields({ personId: 42, costLineIds: [voc] }, { personId: 'INVALID_VALUE' });
    await expectFields({ personId: s.world.p1.id, costLineIds: [] }, { costLineIds: 'INVALID_VALUE' });
    await expectFields({ personId: s.world.p1.id, costLineIds: [voc, voc] }, { costLineIds: 'INVALID_VALUE' });
    await expectFields({ personId: s.world.p1.id, costLineIds: ['nope'] }, { costLineIds: 'INVALID_VALUE' });
    const many = Array.from({ length: 201 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`);
    await expectFields({ personId: s.world.p1.id, costLineIds: many }, { costLineIds: 'INVALID_VALUE' });
    expect(await testDb().purchaseOrder.count()).toBe(0);
  });

  it('401 without a session', async () => {
    const res = await s.app.inject({ method: 'POST', url: '/api/purchase-orders', payload: { personId: s.world.p1.id, costLineIds: [UNKNOWN_ID] } });
    expect(res.statusCode).toBe(401);
  });

  it('works for an inactive person too (exception tool)', async () => {
    const g = await eventWithPeople(PAST);
    await call(s, 'PATCH', `/api/people/${s.world.p1.id}`, { active: false });
    expect((await create(s.world.p1.id, [lineOf(g, 'VOC').id])).statusCode).toBe(201);
  });

  it('concurrent with the freelancer link on the same line: exactly one PO gets it', async () => {
    const token = await freelancerToken(s.world.p1.id);
    for (let round = 0; round < 5; round++) {
      const g = await eventWithPeople(PAST);
      const voc = lineOf(g, 'VOC').id;
      const results = await Promise.all([
        create(s.world.p1.id, [voc]),
        s.app.inject({ method: 'POST', url: `/api/public/freelancers/${token}/purchase-orders`, payload: { costLineIds: [voc] } }),
        create(s.world.p1.id, [voc]),
      ]);
      expect(results.map((r) => r.statusCode).sort()).toEqual([201, 409, 409]);
      for (const r of results.filter((x) => x.statusCode === 409)) {
        expect(r.json().error).toMatchObject({ code: 'COST_LINE_NOT_ELIGIBLE', details: { costLineIds: [voc] } });
      }
      expect(await testDb().purchaseOrderLine.count({ where: { costLineId: voc, active: true } })).toBe(1);
    }
  });
});
