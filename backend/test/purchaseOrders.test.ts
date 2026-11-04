/**
 * Purchase orders (UC-033, UC-034, BR-113…BR-119): freelancer link, public view + create, partner
 * list/detail/pay/unpay/cancel/history/events, the BR-118 lock and concurrency.
 * Synthetic data only; money is multiples of 10000 cents.
 */
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { currentYear } from '../src/domain/dates.js';
import { PUBLIC_RATE_LIMIT } from '../src/http/publicGuard.js';
import { closeTestDb, resetDb, testDb } from './helpers.js';
import { call, createEvent, FEES, history, startSession, UNKNOWN_ID, type Json, type Session } from './eventFixtures.js';

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

/** Anonymous request (no cookie). */
const anon = (method: 'GET' | 'POST', url: string, payload?: unknown, remoteAddress = '10.0.0.1') =>
  s.app.inject({ method, url, remoteAddress, ...(payload !== undefined && { payload: payload as object }) });

async function tokenOf(personId: string): Promise<string> {
  const res = await call(s, 'GET', `/api/people/${personId}/freelancer-link`);
  expect(res.statusCode).toBe(200);
  const { sharePath } = res.json<{ sharePath: string }>();
  expect(sharePath).toMatch(/^\/f\/[A-Za-z0-9_-]{43}$/);
  return sharePath.slice(3);
}

/** The given fields of each row, e.g. pick(lines, 'state', 'amountCents') → [['PAID', 1000], …]. */
const pick = (rows: Record<string, unknown>[], ...keys: string[]): unknown[][] => rows.map((r) => keys.map((k) => r[k]));

/** PO line breakdown with sound check and no VAT (legacy body, 30000 VOC fee). */
const NO_EXTRAS = { baseCents: 30000, soundcheck: true, deductionCents: 0, vatCents: 0 };

const lineOf = (event: Json, type: string): Json => event.costLines.find((l: Json) => l.type === type);

/** An event (Template A: VOC 30000, BASS 20000 + internal lines) with Person 1 on VOC, Person 2 on BASS. */
async function eventWithPeople(startDate: string, overrides: Record<string, unknown> = {}): Promise<Json> {
  const event = await createEvent(s, { startDate, ...overrides });
  await call(s, 'PATCH', `/api/cost-lines/${lineOf(event, 'VOC').id}`, { personId: s.world.p1.id });
  const res = await call(s, 'PATCH', `/api/cost-lines/${lineOf(event, 'BASS').id}`, { personId: s.world.p2.id });
  return res.json().event;
}

const view = async (token: string): Promise<Json> => {
  const res = await anon('GET', `/api/public/freelancers/${token}`);
  expect(res.statusCode).toBe(200);
  return res.json();
};

async function createPo(token: string, costLineIds: string[]): Promise<Json> {
  const res = await anon('POST', `/api/public/freelancers/${token}/purchase-orders`, { costLineIds });
  if (res.statusCode !== 201) throw new Error(`create PO failed: ${res.statusCode} ${res.body}`);
  return res.json();
}

/** Partner view of the PO with this number (via search). */
async function poByNumber(number: string): Promise<Json> {
  const res = await call(s, 'GET', `/api/purchase-orders?q=${encodeURIComponent(number)}`);
  expect(res.statusCode).toBe(200);
  const po = res.json().purchaseOrders.find((p: Json) => p.number === number);
  expect(po).toBeDefined();
  return po;
}

const getEvent = async (id: string): Promise<Json> => (await call(s, 'GET', `/api/events/${id}`)).json();

/** Played event + Person 1's VOC line on an OPEN PO. */
async function openPo() {
  const event = await eventWithPeople(PAST);
  const token = await tokenOf(s.world.p1.id);
  const voc = lineOf(event, 'VOC');
  const created = await createPo(token, [voc.id]);
  const po = await poByNumber(created.number);
  return { event, token, voc, created, po };
}

// ======================================================================== freelancer link
describe('freelancer link (BR-113)', () => {
  it('every person has a link; regenerate replaces it and the old one is 404', async () => {
    const token = await tokenOf(s.world.p1.id);
    expect(await tokenOf(s.world.p1.id)).toBe(token); // stable
    expect(await tokenOf(s.world.p2.id)).not.toBe(token);

    const res = await call(s, 'POST', `/api/people/${s.world.p1.id}/freelancer-link/regenerate`);
    expect(res.statusCode).toBe(200);
    const fresh = res.json().sharePath.slice(3);
    expect(fresh).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(fresh).not.toBe(token);
    expect(await tokenOf(s.world.p1.id)).toBe(fresh);
    expect((await anon('GET', `/api/public/freelancers/${token}`)).statusCode).toBe(404);
    expect((await anon('GET', `/api/public/freelancers/${fresh}`)).statusCode).toBe(200);
  });

  it('a person created in the app gets a link', async () => {
    const res = await call(s, 'POST', '/api/people', { name: 'Person 9' });
    const id = res.json().person.id;
    const token = await tokenOf(id);
    expect((await view(token)).name).toBe('Person 9');
    // The token is never part of Person
    expect(JSON.stringify(res.json())).not.toContain(token);
  });

  it('an inactive person still has a link (200); its public page is 404 until active again', async () => {
    const token = await tokenOf(s.world.p1.id);
    await call(s, 'PATCH', `/api/people/${s.world.p1.id}`, { active: false });
    expect(await tokenOf(s.world.p1.id)).toBe(token);
    expect((await anon('GET', `/api/public/freelancers/${token}`)).statusCode).toBe(404);
    await call(s, 'PATCH', `/api/people/${s.world.p1.id}`, { active: true });
    expect((await anon('GET', `/api/public/freelancers/${token}`)).statusCode).toBe(200);
  });

  it('404 for unknown or malformed person ids; 401 without a session', async () => {
    for (const id of [UNKNOWN_ID, 'nope']) {
      expect((await call(s, 'GET', `/api/people/${id}/freelancer-link`)).statusCode).toBe(404);
      expect((await call(s, 'POST', `/api/people/${id}/freelancer-link/regenerate`)).statusCode).toBe(404);
    }
    expect((await anon('GET', `/api/people/${s.world.p1.id}/freelancer-link`)).statusCode).toBe(401);
    expect((await anon('POST', `/api/people/${s.world.p1.id}/freelancer-link/regenerate`)).statusCode).toBe(401);
  });
});

// ======================================================================== partners (BR-113, 2026-10-18)
describe('active partners have no freelancer link (BR-113)', () => {
  const makePartner = (personId: string) => call(s, 'PUT', `/api/people/${personId}/partner`, { email: 'person.1@example.com' });
  const removePartner = (personId: string) => call(s, 'DELETE', `/api/people/${personId}/partner`);

  it('link endpoints: 409 PERSON_IS_PARTNER for an active partner; regenerate changes nothing', async () => {
    for (const p of [s.world.a, s.world.b]) {
      for (const [method, path] of [
        ['GET', ''],
        ['POST', '/regenerate'],
      ] as const) {
        const res = await call(s, method, `/api/people/${p.personId}/freelancer-link${path}`);
        expect(res.statusCode).toBe(409);
        expect(res.json()).toEqual({ error: { code: 'PERSON_IS_PARTNER', message: expect.any(String) } });
      }
    }
    const after = await testDb().person.findUniqueOrThrow({ where: { id: s.world.b.personId } });
    expect(after.freelancerToken).toBe(s.world.b.person.freelancerToken);
  });

  it('unknown person is still 404 (checked first)', async () => {
    expect((await call(s, 'GET', `/api/people/${UNKNOWN_ID}/freelancer-link`)).statusCode).toBe(404);
  });

  it('public GET/POST are 404 for an active partner; removing partner status restores the same link', async () => {
    const event = await eventWithPeople(PAST);
    const voc = lineOf(event, 'VOC');
    const token = await tokenOf(s.world.p1.id);

    expect((await makePartner(s.world.p1.id)).statusCode).toBe(200);
    const get = await anon('GET', `/api/public/freelancers/${token}`);
    expect(get.statusCode).toBe(404);
    expect(get.json().error.code).toBe('NOT_FOUND');
    const post = await anon('POST', `/api/public/freelancers/${token}/purchase-orders`, { costLineIds: [voc.id] });
    expect(post.statusCode).toBe(404);
    expect(post.json().error.code).toBe('NOT_FOUND');
    expect(await testDb().purchaseOrder.count()).toBe(0);
    expect((await call(s, 'GET', `/api/people/${s.world.p1.id}/freelancer-link`)).statusCode).toBe(409);

    expect((await removePartner(s.world.p1.id)).statusCode).toBe(200);
    expect(await tokenOf(s.world.p1.id)).toBe(token);
    expect((await view(token)).name).toBe('Person 1');
    await createPo(token, [voc.id]);
  });

  it('a seeded partner has a 404 public link too', async () => {
    expect((await anon('GET', `/api/public/freelancers/${s.world.c.person.freelancerToken}`)).statusCode).toBe(404);
  });

  it('POs of a person who becomes a partner stay manageable (list, pay, unpay, cancel)', async () => {
    const g1 = await eventWithPeople(PAST);
    const g2 = await eventWithPeople(PAST_2);
    const token = await tokenOf(s.world.p1.id);
    const first = await createPo(token, [lineOf(g1, 'VOC').id]);
    const second = await createPo(token, [lineOf(g2, 'VOC').id]);
    expect((await makePartner(s.world.p1.id)).statusCode).toBe(200);

    const po1 = await poByNumber(first.number);
    const po2 = await poByNumber(second.number);
    expect(po1.status).toBe('OPEN');
    expect((await call(s, 'GET', `/api/purchase-orders/${po1.id}`)).statusCode).toBe(200);
    expect((await call(s, 'POST', `/api/purchase-orders/${po1.id}/pay`)).json().status).toBe('PAID');
    expect((await call(s, 'POST', `/api/purchase-orders/${po1.id}/unpay`)).json().status).toBe('OPEN');
    const cancelled = await call(s, 'POST', `/api/purchase-orders/${po2.id}/cancel`, { reason: 'Reason 1' });
    expect(cancelled.json().status).toBe('CANCELLED');
  });
});

// ======================================================================== public view
describe('GET /api/public/freelancers/{token} (UC-033)', () => {
  it('shows only own fee lines with their states, newest event first (BR-113, BR-114)', async () => {
    const old = await eventWithPeople('2025-12-01');
    const played = await eventWithPeople(PAST);
    const upcoming = await eventWithPeople(FUTURE);
    // Paid line
    await call(s, 'POST', `/api/cost-lines/${lineOf(old, 'VOC').id}/pay`, { actualCents: 40000 });
    // Hidden: deleted event, cancelled event, zero amount, FUEL, other person
    const deleted = await eventWithPeople(PAST);
    await call(s, 'POST', `/api/events/${deleted.id}/delete`, { reason: 'Reason 1' });
    const cancelled = await eventWithPeople(PAST);
    await call(s, 'POST', `/api/events/${cancelled.id}/cancel`, { reason: 'Reason 1' });
    const zero = await eventWithPeople(PAST_2);
    await call(s, 'PATCH', `/api/cost-lines/${lineOf(zero, 'VOC').id}`, { budgetedCents: 0 });
    await call(s, 'POST', `/api/events/${played.id}/cost-lines`, { type: 'FUEL', personId: s.world.p1.id, budgetedCents: 10000 });
    // A second own line on the played event (description shown)
    const extra = (
      await call(s, 'POST', `/api/events/${played.id}/cost-lines`, {
        type: 'OTHER_ROLE',
        personId: s.world.p1.id,
        description: 'Role 1',
        budgetedCents: 10000,
      })
    ).json();
    const extraLine = extra.event.costLines.at(-1);

    const v = await view(await tokenOf(s.world.p1.id));
    expect(Object.keys(v).sort()).toEqual(['lines', 'name', 'purchaseOrders', 'settings']);
    // Settings for the amount preview: the load-in deduction setting, VAT rate default 1350 (no row)
    expect(v.settings).toEqual({ soundcheckDeductionCents: FEES.loadInDeduction, vatRateBp: 1350 });
    expect(v.name).toBe('Person 1');
    expect(v.purchaseOrders).toEqual([]);
    expect(v.lines).toEqual([
      {
        costLineId: lineOf(upcoming, 'VOC').id,
        eventStartDate: FUTURE,
        eventEndDate: null,
        venue: 'Venue X',
        type: 'VOC',
        description: null,
        amountCents: 30000,
        state: 'UPCOMING',
        purchaseOrderNumber: null,
      },
      expect.objectContaining({ costLineId: lineOf(played, 'VOC').id, eventStartDate: PAST, state: 'SELECTABLE', amountCents: 30000 }),
      expect.objectContaining({ costLineId: extraLine.id, description: 'Role 1', type: 'OTHER_ROLE', state: 'SELECTABLE', amountCents: 10000 }),
      expect.objectContaining({ costLineId: lineOf(old, 'VOC').id, eventStartDate: '2025-12-01', state: 'PAID', amountCents: 40000 }),
    ]);
  });

  it('never leaks client, price, notes, other people or partner data; noindex, no session needed', async () => {
    const client = await testDb().client.create({ data: { name: 'Client Secret Oy', notes: 'Client secret note' } });
    const event = await eventWithPeople(PAST, { priceCents: 1230000, notes: 'Internal event note', clientId: client.id });
    const token = await tokenOf(s.world.p1.id);
    await createPo(token, [lineOf(event, 'VOC').id]);

    const res = await anon('GET', `/api/public/freelancers/${token}`);
    expect(res.statusCode).toBe(200);
    expect(res.headers['x-robots-tag']).toBe('noindex');
    expect(res.headers['cache-control']).toBe('no-store');
    const raw = res.body;
    for (const secret of [
      '1230000',
      'Client Secret Oy',
      'Client secret note',
      'Internal event note',
      'Person 2',
      'Partner A',
      'partner.a@example.com',
      event.id,
      s.world.a.id,
      s.world.p1.id,
      s.world.p2.id,
      lineOf(event, 'BASS').id,
      'Template A',
    ]) {
      expect(raw).not.toContain(secret);
    }
    const v = res.json();
    expect(Object.keys(v.lines[0]).sort()).toEqual(
      ['amountCents', 'costLineId', 'description', 'eventEndDate', 'eventStartDate', 'purchaseOrderNumber', 'state', 'type', 'venue'].sort(),
    );
    expect(Object.keys(v.purchaseOrders[0]).sort()).toEqual(
      ['createdAt', 'lines', 'number', 'paidAt', 'status', 'totalCents', 'vatLiable'].sort(),
    );
    expect(Object.keys(v.purchaseOrders[0].lines[0]).sort()).toEqual(
      ['amountCents', 'baseCents', 'deductionCents', 'description', 'eventStartDate', 'soundcheck', 'type', 'vatCents', 'venue'].sort(),
    );
  });

  it('404 for unknown, malformed, regenerated tokens and inactive people', async () => {
    const token = await tokenOf(s.world.p1.id);
    const unknown = 'A'.repeat(43);
    for (const t of [unknown, 'short', `${token}x`.slice(1), encodeURIComponent('../../etc')]) {
      const res = await anon('GET', `/api/public/freelancers/${t}`);
      expect(res.statusCode).toBe(404);
      expect(res.json().error.code).toBe('NOT_FOUND');
      expect(res.headers['x-robots-tag']).toBe('noindex');
    }
    await call(s, 'PATCH', `/api/people/${s.world.p1.id}`, { active: false });
    expect((await anon('GET', `/api/public/freelancers/${token}`)).statusCode).toBe(404);
    expect((await anon('POST', `/api/public/freelancers/${token}/purchase-orders`, { costLineIds: [UNKNOWN_ID] })).statusCode).toBe(404);
    await call(s, 'PATCH', `/api/people/${s.world.p1.id}`, { active: true });
    expect((await anon('GET', `/api/public/freelancers/${token}`)).statusCode).toBe(200);
  });

  it('only the exact public patterns skip the session', async () => {
    expect((await anon('GET', '/api/public/freelancers')).statusCode).toBe(401);
    expect((await anon('GET', `/api/public/freelancers/${'A'.repeat(43)}/other`)).statusCode).toBe(401);
    expect((await anon('GET', '/api/purchase-orders?year=2026')).statusCode).toBe(401);
  });

  it(`shares the ${PUBLIC_RATE_LIMIT}/min/IP limit with the public offer page (429 RATE_LIMITED)`, async () => {
    const token = await tokenOf(s.world.p1.id);
    const ip = '10.0.0.77';
    for (let i = 0; i < PUBLIC_RATE_LIMIT / 2; i++) {
      expect((await anon('GET', `/api/public/freelancers/${token}`, undefined, ip)).statusCode).toBe(200);
      expect((await anon('GET', `/api/public/offers/${'A'.repeat(43)}`, undefined, ip)).statusCode).toBe(404);
    }
    for (const res of [
      await anon('GET', `/api/public/freelancers/${token}`, undefined, ip),
      await anon('POST', `/api/public/freelancers/${token}/purchase-orders`, { costLineIds: [UNKNOWN_ID] }, ip),
      await anon('GET', `/api/public/offers/${'A'.repeat(43)}`, undefined, ip),
    ]) {
      expect(res.statusCode).toBe(429);
      expect(res.json().error.code).toBe('RATE_LIMITED');
      expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
      expect(res.headers['x-robots-tag']).toBe('noindex');
    }
    // Another IP is unaffected
    expect((await anon('GET', `/api/public/freelancers/${token}`, undefined, '10.0.0.78')).statusCode).toBe(200);
  });
});

// ======================================================================== public create
describe('POST /api/public/freelancers/{token}/purchase-orders (BR-114…BR-116)', () => {
  it('creates one PO from fees of several events; lines show ON_PO; partners see it; logged CREATED by the freelancer', async () => {
    const g1 = await eventWithPeople(PAST);
    const g2 = await eventWithPeople(PAST_2);
    const token = await tokenOf(s.world.p1.id);
    const res = await anon('POST', `/api/public/freelancers/${token}/purchase-orders`, {
      costLineIds: [lineOf(g2, 'VOC').id, lineOf(g1, 'VOC').id],
    });
    expect(res.statusCode).toBe(201);
    expect(res.headers['x-robots-tag']).toBe('noindex');
    const created = res.json();
    expect(created).toEqual({
      number: expect.stringMatching(/^PERSON-1-\d{4,}$/),
      status: 'OPEN',
      totalCents: 60000,
      createdAt: expect.any(String),
      paidAt: null,
      vatLiable: false,
      // Oldest event first; legacy body = no VAT, sound check on every line
      lines: [
        { eventStartDate: PAST, venue: 'Venue X', type: 'VOC', description: null, amountCents: 30000, ...NO_EXTRAS },
        { eventStartDate: PAST_2, venue: 'Venue X', type: 'VOC', description: null, amountCents: 30000, ...NO_EXTRAS },
      ],
    });

    const v = await view(token);
    expect(v.purchaseOrders).toEqual([created]);
    expect(pick(v.lines, 'state', 'purchaseOrderNumber')).toEqual([
      ['ON_PO', created.number],
      ['ON_PO', created.number],
    ]);

    const po = await poByNumber(created.number);
    expect(po).toEqual({
      id: expect.any(String),
      number: created.number,
      personId: s.world.p1.id,
      personName: 'Person 1',
      status: 'OPEN',
      totalCents: 60000,
      createdAt: created.createdAt,
      paidAt: null,
      paidBy: null,
      cancelledAt: null,
      cancelledBy: null,
      cancelReason: null,
      vatLiable: false,
      lines: [
        {
          costLineId: lineOf(g1, 'VOC').id,
          eventId: g1.id,
          eventStartDate: PAST,
          eventVenue: 'Venue X',
          eventLineupName: 'Template A',
          type: 'VOC',
          description: null,
          amountCents: 30000,
          ...NO_EXTRAS,
        },
        expect.objectContaining({ costLineId: lineOf(g2, 'VOC').id, eventId: g2.id, eventStartDate: PAST_2 }),
      ],
    });

    const hist = (await call(s, 'GET', `/api/purchase-orders/${po.id}/history`)).json();
    expect(hist).toEqual([
      { id: expect.any(String), purchaseOrderId: po.id, number: po.number, type: 'CREATED', partnerId: null, at: expect.any(String), details: {} },
    ]);
  });

  it('numbers use the name at creation and a global running number', async () => {
    const g = await eventWithPeople(PAST);
    await testDb().person.update({ where: { id: s.world.p1.id }, data: { name: 'Pärsön Ö' } });
    const a = await createPo(await tokenOf(s.world.p1.id), [lineOf(g, 'VOC').id]);
    const b = await createPo(await tokenOf(s.world.p2.id), [lineOf(g, 'BASS').id]);
    const seqA = Number(a.number.split('-').at(-1));
    expect(a.number).toMatch(/^PARSON-O-\d{4,}$/);
    expect(b.number).toBe(`PERSON-2-${String(seqA + 1).padStart(4, '0')}`);
    // Renaming later doesn't change the number
    await testDb().person.update({ where: { id: s.world.p1.id }, data: { name: 'Person 1' } });
    expect((await poByNumber(a.number)).personName).toBe('Person 1');
  });

  it('400 legacy costLineIds: REQUIRED / INVALID_VALUE (checked before the token)', async () => {
    const token = await tokenOf(s.world.p1.id);
    const url = `/api/public/freelancers/${token}/purchase-orders`;
    const expectField = async (payload: unknown, code: string, t = url) => {
      const res = await anon('POST', t, payload);
      expect(res.statusCode).toBe(400);
      expect(res.json().error).toMatchObject({ code: 'VALIDATION_ERROR', fields: { costLineIds: code } });
    };
    await expectField({ costLineIds: null }, 'REQUIRED');
    await expectField({ costLineIds: [] }, 'INVALID_VALUE');
    await expectField({ costLineIds: 'x' }, 'INVALID_VALUE');
    await expectField({ costLineIds: ['nope'] }, 'INVALID_VALUE');
    await expectField({ costLineIds: [UNKNOWN_ID, UNKNOWN_ID] }, 'INVALID_VALUE');
    await expectField({ costLineIds: [UNKNOWN_ID, UNKNOWN_ID.toUpperCase()] }, 'INVALID_VALUE');
    const many = Array.from({ length: 201 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`);
    await expectField({ costLineIds: many }, 'INVALID_VALUE');
    await expectField({ costLineIds: null }, 'REQUIRED', `/api/public/freelancers/${'A'.repeat(43)}/purchase-orders`);
  });

  it('409 COST_LINE_NOT_ELIGIBLE lists exactly the offending ids; nothing is created', async () => {
    const played = await eventWithPeople(PAST);
    const upcoming = await eventWithPeople(FUTURE);
    const paid = await eventWithPeople(PAST_2);
    await call(s, 'POST', `/api/cost-lines/${lineOf(paid, 'VOC').id}/pay`, {});
    const zero = await eventWithPeople(PAST);
    await call(s, 'PATCH', `/api/cost-lines/${lineOf(zero, 'VOC').id}`, { budgetedCents: 0 });
    const cancelled = await eventWithPeople(PAST);
    await call(s, 'POST', `/api/events/${cancelled.id}/cancel`, { reason: 'Reason 1' });
    const deleted = await eventWithPeople(PAST);
    await call(s, 'POST', `/api/events/${deleted.id}/delete`, { reason: 'Reason 1' });
    const fuel = (
      await call(s, 'POST', `/api/events/${played.id}/cost-lines`, { type: 'FUEL', personId: s.world.p1.id, budgetedCents: 10000 })
    ).json().event.costLines.at(-1);
    const token = await tokenOf(s.world.p1.id);
    const onPo = await eventWithPeople(PAST);
    await createPo(token, [lineOf(onPo, 'VOC').id]);
    const before = await testDb().purchaseOrder.count();

    const bad = [
      lineOf(upcoming, 'VOC').id, // not played
      lineOf(paid, 'VOC').id, // paid
      lineOf(zero, 'VOC').id, // amount 0
      lineOf(cancelled, 'VOC').id, // cancelled event
      lineOf(deleted, 'VOC').id, // deleted event
      lineOf(played, 'BASS').id, // someone else's
      lineOf(played, 'OFFICE').id, // nobody's
      fuel.id, // FUEL can't be paid
      lineOf(onPo, 'VOC').id, // already on an OPEN PO
      UNKNOWN_ID,
    ];
    const res = await anon('POST', `/api/public/freelancers/${token}/purchase-orders`, {
      costLineIds: [lineOf(played, 'VOC').id, ...bad],
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toMatchObject({ code: 'COST_LINE_NOT_ELIGIBLE', details: { costLineIds: bad } });
    expect(await testDb().purchaseOrder.count()).toBe(before);
    expect(await testDb().purchaseOrderLine.count({ where: { costLineId: lineOf(played, 'VOC').id } })).toBe(0);
    // The good line alone still works
    await createPo(token, [lineOf(played, 'VOC').id]);
  });

  it('two parallel creates with the same line: one 201, one 409 (advisory + row locks)', async () => {
    const g = await eventWithPeople(PAST);
    const g2 = await eventWithPeople(PAST_2);
    const token = await tokenOf(s.world.p1.id);
    const url = `/api/public/freelancers/${token}/purchase-orders`;
    for (let round = 0; round < 3; round++) {
      const shared = round === 0 ? lineOf(g, 'VOC').id : round === 1 ? lineOf(g2, 'VOC').id : null;
      if (!shared) break;
      const results = await Promise.all([
        anon('POST', url, { costLineIds: [shared] }, '10.0.1.1'),
        anon('POST', url, { costLineIds: [shared] }, '10.0.1.2'),
        anon('POST', url, { costLineIds: [shared] }, '10.0.1.3'),
      ]);
      expect(results.map((r) => r.statusCode).sort()).toEqual([201, 409, 409]);
      expect(await testDb().purchaseOrderLine.count({ where: { costLineId: shared, active: true } })).toBe(1);
    }
  });

  it('parallel event cancel / amount change and PO creation never leave a locked line changed', async () => {
    const token = await tokenOf(s.world.p1.id);
    for (let round = 0; round < 5; round++) {
      const g = await eventWithPeople(PAST);
      const voc = lineOf(g, 'VOC');
      const [created, cancelled, patched] = await Promise.all([
        anon('POST', `/api/public/freelancers/${token}/purchase-orders`, { costLineIds: [voc.id] }),
        call(s, 'POST', `/api/events/${g.id}/cancel`, { reason: 'Reason 1' }),
        call(s, 'PATCH', `/api/cost-lines/${voc.id}`, { budgetedCents: 10000 }),
      ]);
      const after = await getEvent(g.id);
      const line = lineOf(after, 'VOC');
      if (created.statusCode === 201) {
        // The PO snapshot is the line's amount and the event stayed SOLD.
        expect(cancelled.statusCode).toBe(409);
        expect(after.status).toBe('SOLD');
        expect(created.json().totalCents).toBe(line.budgetedCents);
        if (patched.statusCode === 200) expect(line.budgetedCents).toBe(10000);
        else expect(patched.statusCode).toBe(409);
      } else {
        expect(created.statusCode).toBe(409);
        expect(cancelled.statusCode).toBe(200);
        expect(patched.statusCode).toBe(200);
        expect(line.purchaseOrder).toBeNull();
      }
    }
  });
});

// ======================================================================== partner list
describe('GET /api/purchase-orders (UC-034)', () => {
  it('year (by creation, Helsinki) is optional; q searches number and name in all years; status filter', async () => {
    const g = await eventWithPeople(PAST);
    const g2 = await eventWithPeople(PAST_2);
    const a = await createPo(await tokenOf(s.world.p1.id), [lineOf(g, 'VOC').id]);
    const b = await createPo(await tokenOf(s.world.p2.id), [lineOf(g, 'BASS').id]);
    const c = await createPo(await tokenOf(s.world.p1.id), [lineOf(g2, 'VOC').id]);
    // `a` was created in an earlier year: 31 Dec 23:30 Helsinki = 21:30 UTC
    const last = currentYear() - 1;
    await testDb().purchaseOrder.update({ where: { number: a.number }, data: { createdAt: new Date(`${last}-12-31T21:30:00.000Z`) } });
    // `b` on 1 Jan 00:30 Helsinki (still 31 Dec in UTC) belongs to this year
    await testDb().purchaseOrder.update({ where: { number: b.number }, data: { createdAt: new Date(`${last}-12-31T22:30:00.000Z`) } });

    const list = async (qs: string): Promise<string[]> => {
      const res = await call(s, 'GET', `/api/purchase-orders${qs}`);
      expect(res.statusCode).toBe(200);
      return (res.json().purchaseOrders as { number: string }[]).map((p) => p.number);
    };
    expect(await list(`?year=${currentYear()}`)).toEqual([c.number, b.number]);
    expect(await list(`?year=${last}`)).toEqual([a.number]);
    expect(await list(`?year=${currentYear() + 1}`)).toEqual([]);
    // No year: all years, newest first
    expect(await list('')).toEqual([c.number, b.number, a.number]);
    expect(await list('?q=')).toEqual([c.number, b.number, a.number]);
    // q ignores year
    expect(await list(`?year=${currentYear() + 1}&q=person-1`)).toEqual([c.number, a.number]);
    expect(await list(`?q=${a.number.slice(-4)}`)).toEqual([a.number]);
    expect(await list('?q=PERSON 2')).toEqual([b.number]);
    expect(await list('?q=%20%20person%202%20')).toEqual([b.number]);
    expect(await list('?q=nobody')).toEqual([]);

    await call(s, 'POST', `/api/purchase-orders/${(await poByNumber(c.number)).id}/pay`);
    expect(await list(`?year=${currentYear()}&status=PAID`)).toEqual([c.number]);
    expect(await list(`?year=${currentYear()}&status=OPEN`)).toEqual([b.number]);
    expect(await list('?q=person&status=OPEN')).toEqual([b.number, a.number]);
    expect(await list(`?year=${currentYear()}&status=CANCELLED`)).toEqual([]);
    expect(await list('?status=OPEN')).toEqual([b.number, a.number]);
  });

  it('400 for a bad year and bad status', async () => {
    const expectField = async (qs: string, field: string, code: string) => {
      const res = await call(s, 'GET', `/api/purchase-orders${qs}`);
      expect(res.statusCode).toBe(400);
      expect(res.json().error.fields).toEqual({ [field]: code });
    };
    await expectField('?year=26', 'year', 'INVALID_VALUE');
    await expectField('?year=', 'year', 'INVALID_VALUE');
    await expectField('?year=2026&status=DONE', 'status', 'INVALID_VALUE');
  });
});

// ======================================================================== detail + state changes
describe('PO detail, pay, unpay, cancel (BR-117)', () => {
  it('GET detail; 404 unknown / malformed', async () => {
    const { po } = await openPo();
    expect((await call(s, 'GET', `/api/purchase-orders/${po.id}`)).json()).toEqual(po);
    for (const id of [UNKNOWN_ID, 'nope']) {
      for (const [method, path] of [
        ['GET', ''],
        ['GET', '/history'],
        ['POST', '/pay'],
        ['POST', '/unpay'],
      ] as const) {
        const res = await call(s, method, `/api/purchase-orders/${id}${path}`);
        expect(res.statusCode).toBe(404);
        expect(res.json().error.code).toBe('NOT_FOUND');
      }
      expect((await call(s, 'POST', `/api/purchase-orders/${id}/cancel`, { reason: 'Reason 1' })).statusCode).toBe(404);
    }
  });

  it('pay marks every line paid with the PO amount, logs on the event with the PO number; unpay reverts', async () => {
    const g1 = await eventWithPeople(PAST);
    const g2 = await eventWithPeople(PAST_2);
    const token = await tokenOf(s.world.p1.id);
    const created = await createPo(token, [lineOf(g1, 'VOC').id, lineOf(g2, 'VOC').id]);
    const po = await poByNumber(created.number);

    const paid = await call(s, 'POST', `/api/purchase-orders/${po.id}/pay`);
    expect(paid.statusCode).toBe(200);
    const paidPo = paid.json();
    expect(paidPo).toMatchObject({ status: 'PAID', paidBy: s.world.a.id, paidAt: expect.any(String) });

    const event1 = await getEvent(g1.id);
    expect(lineOf(event1, 'VOC')).toMatchObject({
      actualCents: 30000,
      paidAt: paidPo.paidAt,
      paidBy: s.world.a.id,
      purchaseOrder: { id: po.id, number: po.number, status: 'PAID' },
    });
    expect(event1.actualCostsCents).toBe(30000);
    const ev = (await history(s, g1.id))[0]!;
    expect(ev).toMatchObject({
      type: 'COST_PAID',
      partnerId: s.world.a.id,
      details: { costLineId: lineOf(g1, 'VOC').id, type: 'VOC', actualCents: 30000, purchaseOrderNumber: po.number },
    });
    // Freelancer sees PAID with the number
    const v = await view(token);
    expect(pick(v.lines, 'state', 'purchaseOrderNumber', 'amountCents')).toEqual([
      ['PAID', po.number, 30000],
      ['PAID', po.number, 30000],
    ]);
    expect(v.purchaseOrders[0]).toMatchObject({ status: 'PAID', paidAt: paidPo.paidAt });

    // Pay again → 409
    const again = await call(s, 'POST', `/api/purchase-orders/${po.id}/pay`);
    expect(again.statusCode).toBe(409);
    expect(again.json().error.code).toBe('INVALID_STATUS_TRANSITION');
    // Cancel a PAID PO → 409
    expect((await call(s, 'POST', `/api/purchase-orders/${po.id}/cancel`, { reason: 'Reason 1' })).statusCode).toBe(409);

    const unpaid = await call(s, 'POST', `/api/purchase-orders/${po.id}/unpay`);
    expect(unpaid.statusCode).toBe(200);
    expect(unpaid.json()).toMatchObject({ status: 'OPEN', paidAt: null, paidBy: null });
    const event1b = await getEvent(g1.id);
    expect(lineOf(event1b, 'VOC')).toMatchObject({
      actualCents: null,
      paidAt: null,
      paidBy: null,
      purchaseOrder: { id: po.id, number: po.number, status: 'OPEN' },
    });
    expect(event1b.actualCostsCents).toBe(0);
    expect((await history(s, g1.id))[0]).toMatchObject({
      type: 'COST_UNPAID',
      details: { costLineId: lineOf(g1, 'VOC').id, type: 'VOC', previousActualCents: 30000, purchaseOrderNumber: po.number },
    });
    // Unpay an OPEN PO → 409
    const again2 = await call(s, 'POST', `/api/purchase-orders/${po.id}/unpay`);
    expect(again2.statusCode).toBe(409);
    expect(again2.json().error.code).toBe('INVALID_STATUS_TRANSITION');

    const hist = (await call(s, 'GET', `/api/purchase-orders/${po.id}/history`)).json();
    expect(pick(hist, 'type', 'partnerId', 'details')).toEqual([
      ['UNPAID', s.world.a.id, {}],
      ['PAID', s.world.a.id, { totalCents: 60000 }],
      ['CREATED', null, {}],
    ]);
  });

  it('cancel needs a reason, frees the lines (selectable again) and is final', async () => {
    const { po, voc, event, token } = await openPo();
    for (const [body, code] of [
      [{}, 'REQUIRED'],
      [{ reason: '  ' }, 'REQUIRED'],
      [{ reason: 'x'.repeat(501) }, 'TOO_LONG'],
    ] as const) {
      const res = await call(s, 'POST', `/api/purchase-orders/${po.id}/cancel`, body);
      expect(res.statusCode).toBe(400);
      expect(res.json().error.fields).toEqual({ reason: code });
    }
    // Validation before existence
    expect((await call(s, 'POST', `/api/purchase-orders/${UNKNOWN_ID}/cancel`, {})).statusCode).toBe(400);

    const res = await call(s, 'POST', `/api/purchase-orders/${po.id}/cancel`, { reason: ' Reason 1 ' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      status: 'CANCELLED',
      cancelledBy: s.world.a.id,
      cancelledAt: expect.any(String),
      cancelReason: 'Reason 1',
      lines: po.lines,
    });
    expect(lineOf(await getEvent(event.id), 'VOC').purchaseOrder).toBeNull();
    const v = await view(token);
    expect(v.lines[0]).toMatchObject({ costLineId: voc.id, state: 'SELECTABLE', purchaseOrderNumber: null });
    expect(v.purchaseOrders[0]).toMatchObject({ number: po.number, status: 'CANCELLED' });
    expect(JSON.stringify(v)).not.toContain('Reason 1');

    for (const path of ['pay', 'unpay']) {
      expect((await call(s, 'POST', `/api/purchase-orders/${po.id}/${path}`)).statusCode).toBe(409);
    }
    expect((await call(s, 'POST', `/api/purchase-orders/${po.id}/cancel`, { reason: 'Reason 2' })).statusCode).toBe(409);
    expect((await call(s, 'GET', `/api/purchase-orders/${po.id}/history`)).json()[0]).toMatchObject({
      type: 'CANCELLED',
      partnerId: s.world.a.id,
      details: { reason: 'Reason 1' },
    });

    // The fee can go on a new PO; the cancelled one keeps its lines
    const again = await createPo(token, [voc.id]);
    expect(again.number).not.toBe(po.number);
    expect((await call(s, 'GET', `/api/purchase-orders/${po.id}`)).json().lines).toEqual(po.lines);

    // A cancelled PO keeps its lines even after the cost line is deleted
    await call(s, 'POST', `/api/purchase-orders/${(await poByNumber(again.number)).id}/cancel`, { reason: 'Reason 3' });
    expect((await call(s, 'DELETE', `/api/cost-lines/${voc.id}`)).statusCode).toBe(200);
    const kept = (await call(s, 'GET', `/api/purchase-orders/${po.id}`)).json();
    expect(kept.lines).toEqual(po.lines);
  });

  it('GET /api/purchase-orders/events: newest first across POs, limit 1…200', async () => {
    const g = await eventWithPeople(PAST);
    const a = await createPo(await tokenOf(s.world.p1.id), [lineOf(g, 'VOC').id]);
    const b = await createPo(await tokenOf(s.world.p2.id), [lineOf(g, 'BASS').id]);
    const poA = await poByNumber(a.number);
    await call(s, 'POST', `/api/purchase-orders/${poA.id}/pay`);

    const res = await call(s, 'GET', '/api/purchase-orders/events');
    expect(res.statusCode).toBe(200);
    expect(pick(res.json(), 'number', 'type')).toEqual([
      [a.number, 'PAID'],
      [b.number, 'CREATED'],
      [a.number, 'CREATED'],
    ]);
    expect(res.json()[0]).toEqual({
      id: expect.any(String),
      purchaseOrderId: poA.id,
      number: a.number,
      type: 'PAID',
      partnerId: s.world.a.id,
      at: expect.any(String),
      details: { totalCents: 30000 },
    });
    expect((await call(s, 'GET', '/api/purchase-orders/events?limit=2')).json()).toHaveLength(2);
    expect((await call(s, 'GET', '/api/purchase-orders/events?limit=200')).json()).toHaveLength(3);
    for (const limit of ['0', '201', 'x', '-1', '1.5']) {
      const bad = await call(s, 'GET', `/api/purchase-orders/events?limit=${limit}`);
      expect(bad.statusCode).toBe(400);
      expect(bad.json().error.fields).toEqual({ limit: 'INVALID_VALUE' });
    }
  });
});

// ======================================================================== lock
describe('lock (BR-118)', () => {
  const expectLocked = (res: { statusCode: number; json: () => Json }, number: string) => {
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toMatchObject({ code: 'COST_LINE_ON_PURCHASE_ORDER', details: { purchaseOrderNumber: number } });
  };

  it('CostLine.purchaseOrder in event detail, cost line responses and person cost lines', async () => {
    const { event, voc, po } = await openPo();
    const ref = { id: po.id, number: po.number, status: 'OPEN' };
    const detail = await getEvent(event.id);
    expect(lineOf(detail, 'VOC').purchaseOrder).toEqual(ref);
    expect(lineOf(detail, 'BASS').purchaseOrder).toBeNull();
    const patched = await call(s, 'PATCH', `/api/cost-lines/${voc.id}`, { description: 'Note 1' });
    expect(lineOf(patched.json().event, 'VOC').purchaseOrder).toEqual(ref);
    const people = (await call(s, 'GET', `/api/people/${s.world.p1.id}/cost-lines?year=2026`)).json();
    expect(people.lines[0].costLine.purchaseOrder).toEqual(ref);
  });

  it('OPEN PO: person, amount, load-in, delete, pay, unpay → 409; description and same values OK; event cancel/delete → 409', async () => {
    const { event, voc, po } = await openPo();
    const url = `/api/cost-lines/${voc.id}`;
    expectLocked(await call(s, 'PATCH', url, { personId: s.world.p2.id }), po.number);
    expectLocked(await call(s, 'PATCH', url, { personId: null }), po.number);
    expectLocked(await call(s, 'PATCH', url, { budgetedCents: 10000 }), po.number);
    expectLocked(await call(s, 'PATCH', url, { joinsLoadIn: false }), po.number);
    expectLocked(await call(s, 'DELETE', url), po.number);
    expectLocked(await call(s, 'POST', `${url}/pay`, {}), po.number);
    expectLocked(await call(s, 'POST', `${url}/unpay`), po.number);
    expectLocked(await call(s, 'POST', `/api/events/${event.id}/cancel`, { reason: 'Reason 1' }), po.number);
    expectLocked(await call(s, 'POST', `/api/events/${event.id}/delete`, { reason: 'Reason 1' }), po.number);

    // Validation still comes first
    expect((await call(s, 'PATCH', url, { budgetedCents: -1 })).statusCode).toBe(400);

    const ok = await call(s, 'PATCH', url, {
      description: 'Note 1',
      personId: s.world.p1.id,
      budgetedCents: 30000,
      joinsLoadIn: true,
    });
    expect(ok.statusCode).toBe(200);
    expect(lineOf(ok.json().event, 'VOC')).toMatchObject({ description: 'Note 1', personId: s.world.p1.id, budgetedCents: 30000 });
    // The PO shows the current description
    expect((await call(s, 'GET', `/api/purchase-orders/${po.id}`)).json().lines[0].description).toBe('Note 1');

    // Nothing changed on the line or event
    const after = await getEvent(event.id);
    expect(after.status).toBe('SOLD');
    expect(after.deletedAt).toBeNull();
    expect(lineOf(after, 'VOC')).toMatchObject({ personId: s.world.p1.id, budgetedCents: 30000, paidAt: null });
    // Other lines of the event are not locked
    expect((await call(s, 'PATCH', `/api/cost-lines/${lineOf(event, 'BASS').id}`, { budgetedCents: 10000 })).statusCode).toBe(200);
  });

  it('PAID PO: the line stays locked but the event can be cancelled; cancelled PO unlocks', async () => {
    const { event, voc, po } = await openPo();
    await call(s, 'POST', `/api/purchase-orders/${po.id}/pay`);
    expectLocked(await call(s, 'POST', `/api/cost-lines/${voc.id}/unpay`), po.number);
    expectLocked(await call(s, 'PATCH', `/api/cost-lines/${voc.id}`, { budgetedCents: 10000 }), po.number);
    expect((await call(s, 'POST', `/api/events/${event.id}/cancel`, { reason: 'Reason 1' })).statusCode).toBe(200);
    await call(s, 'POST', `/api/events/${event.id}/uncancel`, { reason: 'Reason 1' });

    await call(s, 'POST', `/api/purchase-orders/${po.id}/unpay`);
    await call(s, 'POST', `/api/purchase-orders/${po.id}/cancel`, { reason: 'Reason 1' });
    expect((await call(s, 'PATCH', `/api/cost-lines/${voc.id}`, { budgetedCents: 10000 })).statusCode).toBe(200);
    expect((await call(s, 'POST', `/api/events/${event.id}/delete`, { reason: 'Reason 1' })).statusCode).toBe(204);
  });

  it('changing the seller does not move a SALES line that is on a PO (BR-027 + BR-118)', async () => {
    const { c } = s.world;
    const event = await createEvent(s, { startDate: PAST, sellerId: c.id });
    const sales = lineOf(event, 'SALES');
    expect(sales.personId).toBe(c.personId);
    // Active partners have no freelancer link (BR-113): the PO is made while C is not a partner.
    expect((await call(s, 'DELETE', `/api/people/${c.personId}/partner`)).statusCode).toBe(200);
    const created = await createPo(await tokenOf(c.personId), [sales.id]);
    expect((await call(s, 'PUT', `/api/people/${c.personId}/partner`, { email: c.email })).statusCode).toBe(200);
    const res = await call(s, 'PATCH', `/api/events/${event.id}`, { sellerId: s.world.a.id });
    expect(res.statusCode).toBe(200);
    expect(res.json().movedCostLineIds).toEqual([]);
    expect(lineOf(res.json().event, 'SALES')).toMatchObject({ personId: c.personId, purchaseOrder: { number: created.number } });
  });
});
