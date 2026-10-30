/**
 * Invoice status, prepayment and balance (api-contract "Invoice status, prepayment and balance", TASK-045).
 * Synthetic data only (BR-090).
 */
import path from 'node:path';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { INVOICE_STATUSES } from '../src/domain/enums.js';
import { loadSeed, readSeedFile } from '../seed/load.js';
import { validateSeed } from '../seed/schema.js';
import { closeTestDb, login, resetDb, testDb } from './helpers.js';
import { call, createEvent, history, startSession, UNKNOWN_ID, type Json, type Session } from './eventFixtures.js';

let s: Session;

beforeEach(async () => {
  await resetDb();
  s = await startSession();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-06-15T09:00:00.000Z'));
});
afterEach(async () => {
  vi.useRealTimers();
  await s.app.close();
});
afterAll(closeTestDb);

const patch = (id: string, body: unknown) => call(s, 'PATCH', `/api/events/${id}`, body);

describe('EventSummary / EventDetail fields', () => {
  it('new events: NONE, no at/by, prepayment 0, balance = total price; old ready fields are gone', async () => {
    const event = await createEvent(s, { priceCents: 100000, additionalSalesCents: 20000 });
    const expected = {
      invoiceStatus: 'NONE',
      invoiceStatusAt: null,
      invoiceStatusBy: null,
      prepaymentCents: 0,
      totalPriceCents: 120000,
      balanceCents: 120000,
    };
    expect(event).toMatchObject(expected);
    expect(event).not.toHaveProperty('readyForInvoiceAt');
    expect(event).not.toHaveProperty('readyForInvoiceBy');
    expect((await call(s, 'GET', `/api/events/${event.id}`)).json()).toMatchObject(expected);
    const list = (await call(s, 'GET', '/api/events?year=2026')).json();
    expect(list.events[0]).toMatchObject(expected);
  });

  it('the ready-for-invoice endpoints are removed', async () => {
    const event = await createEvent(s);
    for (const method of ['POST', 'DELETE'] as const) {
      expect((await call(s, method, `/api/events/${event.id}/ready-for-invoice`)).statusCode).toBe(404);
    }
  });
});

describe('PATCH invoiceStatus', () => {
  it.each(INVOICE_STATUSES.filter((v) => v !== 'NONE'))('NONE → %s sets at/by and logs an UPDATED change', async (status) => {
    const event = await createEvent(s);
    const res = await patch(event.id, { invoiceStatus: status });
    expect(res.statusCode).toBe(200);
    expect(res.json().event).toMatchObject({
      invoiceStatus: status,
      invoiceStatusAt: '2026-06-15T09:00:00.000Z',
      invoiceStatusBy: s.world.a.id,
    });
    const [entry] = await history(s, event.id);
    expect(entry).toMatchObject({
      type: 'UPDATED',
      partnerId: s.world.a.id,
      details: { changes: [{ field: 'invoiceStatus', from: 'NONE', to: status }], movedCostLineIds: [] },
    });
  });

  it('any value → any value, also back to NONE; at/by follow the last change', async () => {
    const event = await createEvent(s);
    await patch(event.id, { invoiceStatus: 'PAID' });

    vi.setSystemTime(new Date('2026-06-16T10:00:00.000Z'));
    const otherCookie = await login(s.app, 'partner.b@example.com');
    const back = await s.app.inject({
      method: 'PATCH',
      url: `/api/events/${event.id}`,
      headers: { cookie: otherCookie },
      payload: { invoiceStatus: 'READY' },
    });
    expect(back.json().event).toMatchObject({
      invoiceStatus: 'READY',
      invoiceStatusAt: '2026-06-16T10:00:00.000Z',
      invoiceStatusBy: s.world.b.id,
    });

    vi.setSystemTime(new Date('2026-06-17T10:00:00.000Z'));
    const none = await patch(event.id, { invoiceStatus: 'NONE' });
    expect(none.json().event).toMatchObject({
      invoiceStatus: 'NONE',
      invoiceStatusAt: '2026-06-17T10:00:00.000Z',
      invoiceStatusBy: s.world.a.id,
    });

    const entries = await history(s, event.id);
    expect(entries.map((e) => [e.type, e.partnerId, (e.details as { changes?: unknown[] }).changes?.[0]])).toEqual([
      ['UPDATED', s.world.a.id, { field: 'invoiceStatus', from: 'READY', to: 'NONE' }],
      ['UPDATED', s.world.b.id, { field: 'invoiceStatus', from: 'PAID', to: 'READY' }],
      ['UPDATED', s.world.a.id, { field: 'invoiceStatus', from: 'NONE', to: 'PAID' }],
      ['CREATED', s.world.a.id, undefined],
    ]);
  });

  it('the same status again is a no-op: at/by unchanged, no history', async () => {
    const event = await createEvent(s);
    await patch(event.id, { invoiceStatus: 'INVOICED' });
    vi.setSystemTime(new Date('2026-06-20T09:00:00.000Z'));
    const res = await patch(event.id, { invoiceStatus: 'INVOICED' });
    expect(res.json().event).toMatchObject({ invoiceStatus: 'INVOICED', invoiceStatusAt: '2026-06-15T09:00:00.000Z' });
    expect((await history(s, event.id)).map((e) => e.type)).toEqual(['UPDATED', 'CREATED']);
  });

  it('changing only other fields keeps at/by', async () => {
    const event = await createEvent(s);
    await patch(event.id, { invoiceStatus: 'READY' });
    vi.setSystemTime(new Date('2026-06-20T09:00:00.000Z'));
    const res = await patch(event.id, { notes: 'Note', prepaymentCents: 10000 });
    expect(res.json().event).toMatchObject({ invoiceStatus: 'READY', invoiceStatusAt: '2026-06-15T09:00:00.000Z' });
  });

  it.each([['UNKNOWN'], ['ready'], [null], [1]])('rejects %j with 400 INVALID_VALUE', async (value) => {
    const event = await createEvent(s);
    const res = await patch(event.id, { invoiceStatus: value });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatchObject({ code: 'VALIDATION_ERROR', fields: { invoiceStatus: 'INVALID_VALUE' } });
  });
});

describe('PATCH prepaymentCents and balance', () => {
  it('sets the prepayment, logs it and derives the balance (incl. additional sales)', async () => {
    const event = await createEvent(s, { priceCents: 100000, additionalSalesCents: 20000 });
    const res = await patch(event.id, { prepaymentCents: 50000 });
    expect(res.statusCode).toBe(200);
    expect(res.json().event).toMatchObject({ prepaymentCents: 50000, totalPriceCents: 120000, balanceCents: 70000 });
    const [entry] = await history(s, event.id);
    expect(entry!.details).toEqual({ changes: [{ field: 'prepaymentCents', from: 0, to: 50000 }], movedCostLineIds: [] });

    // Changing the price moves the balance.
    const more = await patch(event.id, { additionalSalesCents: 30000 });
    expect(more.json().event).toMatchObject({ totalPriceCents: 130000, balanceCents: 80000 });
  });

  it('the balance may be negative when the prepayment exceeds the total price', async () => {
    const event = await createEvent(s, { priceCents: 100000 });
    const res = await patch(event.id, { prepaymentCents: 150000 });
    expect(res.statusCode).toBe(200);
    expect(res.json().event).toMatchObject({ prepaymentCents: 150000, balanceCents: -50000 });
  });

  it('accepts 0 (back to no prepayment)', async () => {
    const event = await createEvent(s);
    await patch(event.id, { prepaymentCents: 10000 });
    const res = await patch(event.id, { prepaymentCents: 0 });
    expect(res.json().event).toMatchObject({ prepaymentCents: 0, balanceCents: event.totalPriceCents });
  });

  it.each([[-1], [10.5], ['10000'], [null], [true], [3_000_000_000]])('rejects %j with 400 INVALID_VALUE', async (value) => {
    const event = await createEvent(s);
    const res = await patch(event.id, { prepaymentCents: value });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatchObject({ code: 'VALIDATION_ERROR', fields: { prepaymentCents: 'INVALID_VALUE' } });
    expect((await call(s, 'GET', `/api/events/${event.id}`)).json().prepaymentCents).toBe(0);
  });

  it('status and prepayment together: one UPDATED entry with both changes', async () => {
    const event = await createEvent(s);
    await patch(event.id, { invoiceStatus: 'PREPAYMENT_PAID', prepaymentCents: 20000 });
    const [entry] = await history(s, event.id);
    expect((entry!.details as Json).changes).toEqual([
      { field: 'invoiceStatus', from: 'NONE', to: 'PREPAYMENT_PAID' },
      { field: 'prepaymentCents', from: 0, to: 20000 },
    ]);
  });
});

describe('event state', () => {
  it('allowed on a cancelled event (cancellation fees can be invoiced)', async () => {
    const event = await createEvent(s);
    await call(s, 'POST', `/api/events/${event.id}/cancel`, { reason: 'Client cancelled' });
    const res = await patch(event.id, { invoiceStatus: 'INVOICED', prepaymentCents: 10000 });
    expect(res.statusCode).toBe(200);
    expect(res.json().event).toMatchObject({ status: 'CANCELLED', invoiceStatus: 'INVOICED', prepaymentCents: 10000 });
  });

  it('cancelling and uncancelling keep the values', async () => {
    const event = await createEvent(s);
    await patch(event.id, { invoiceStatus: 'READY', prepaymentCents: 10000 });
    const cancelled = await call(s, 'POST', `/api/events/${event.id}/cancel`, { reason: 'Client cancelled' });
    expect(cancelled.json()).toMatchObject({ invoiceStatus: 'READY', prepaymentCents: 10000 });
    const back = await call(s, 'POST', `/api/events/${event.id}/uncancel`, { reason: 'Back on' });
    expect(back.json()).toMatchObject({ invoiceStatus: 'READY', prepaymentCents: 10000 });
  });

  it('deleted event → 409 EVENT_DELETED; unknown id → 404; no session → 401', async () => {
    const event = await createEvent(s);
    await call(s, 'POST', `/api/events/${event.id}/delete`, { reason: 'Duplicate' });
    for (const body of [{ invoiceStatus: 'PAID' }, { prepaymentCents: 10000 }]) {
      const res = await patch(event.id, body);
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe('EVENT_DELETED');
    }
    expect((await patch(UNKNOWN_ID, { invoiceStatus: 'PAID' })).statusCode).toBe(404);
    expect((await s.app.inject({ method: 'PATCH', url: `/api/events/${event.id}`, payload: { invoiceStatus: 'PAID' } })).statusCode).toBe(401);
  });
});

describe('GET /api/events ?invoiceStatus=', () => {
  async function venues(query: string) {
    const res = await call(s, 'GET', `/api/events?year=2026${query}`);
    expect(res.statusCode).toBe(200);
    return res.json<{ events: { venue: string }[] }>().events.map((e) => e.venue).sort();
  }

  it('filters by one or several (repeated) statuses; without it, all', async () => {
    for (const [venue, status] of [
      ['Venue A', 'NONE'],
      ['Venue B', 'READY'],
      ['Venue C', 'INVOICED'],
      ['Venue D', 'PAID'],
    ] as const) {
      const event = await createEvent(s, { venue });
      if (status !== 'NONE') await patch(event.id, { invoiceStatus: status });
    }
    expect(await venues('')).toEqual(['Venue A', 'Venue B', 'Venue C', 'Venue D']);
    expect(await venues('&invoiceStatus=READY')).toEqual(['Venue B']);
    expect(await venues('&invoiceStatus=NONE')).toEqual(['Venue A']);
    expect(await venues('&invoiceStatus=INVOICED&invoiceStatus=PAID')).toEqual(['Venue C', 'Venue D']);
    expect(await venues('&invoiceStatus=PREPAYMENT_PAID')).toEqual([]);
  });

  it('combines with the status filter (cancelled events too)', async () => {
    const event = await createEvent(s, { venue: 'Venue A' });
    await patch(event.id, { invoiceStatus: 'INVOICED' });
    await call(s, 'POST', `/api/events/${event.id}/cancel`, { reason: 'Client cancelled' });
    await createEvent(s, { venue: 'Venue B' });
    expect(await venues('&invoiceStatus=INVOICED')).toEqual([]); // default status=SOLD
    expect(await venues('&status=ALL&invoiceStatus=INVOICED')).toEqual(['Venue A']);
  });

  it('an unknown value → 400 INVALID_VALUE', async () => {
    for (const query of ['&invoiceStatus=UNKNOWN', '&invoiceStatus=READY&invoiceStatus=nope']) {
      const res = await call(s, 'GET', `/api/events?year=2026${query}`);
      expect(res.statusCode).toBe(400);
      expect(res.json().error).toMatchObject({ code: 'VALIDATION_ERROR', fields: { invoiceStatus: 'INVALID_VALUE' } });
    }
  });
});

describe('seed / import', () => {
  const exampleSeedPath = path.resolve(import.meta.dirname, '../seed/seed.example.json');
  type Doc = Record<string, unknown> & { events: Record<string, unknown>[] };
  const example = () => structuredClone(readSeedFile(exampleSeedPath)) as Doc;

  beforeEach(async () => {
    vi.useRealTimers();
    await resetDb();
  });

  it('loads optional invoiceStatus / prepaymentCents (default NONE / 0; at/by stay null)', async () => {
    const doc = example();
    Object.assign(doc.events[0]!, { invoiceStatus: 'PREPAYMENT_PAID', prepaymentCents: 50000 });
    delete doc.events[1]!.invoiceStatus;
    delete doc.events[1]!.prepaymentCents;
    await loadSeed(testDb(), doc);
    const [first, second] = await Promise.all(
      [doc.events[0]!, doc.events[1]!].map((e) =>
        testDb().event.findFirstOrThrow({ where: { venue: e.venue as string, startDate: new Date(`${e.startDate as string}T00:00:00Z`) } }),
      ),
    );
    expect(first).toMatchObject({ invoiceStatus: 'PREPAYMENT_PAID', prepaymentCents: 50000, invoiceStatusAt: null, invoiceStatusById: null });
    expect(second).toMatchObject({ invoiceStatus: 'NONE', prepaymentCents: 0, invoiceStatusAt: null, invoiceStatusById: null });
  });

  it('rejects an unknown status and a negative / fractional prepayment', () => {
    const doc = example();
    Object.assign(doc.events[0]!, { invoiceStatus: 'SENT', prepaymentCents: -1 });
    Object.assign(doc.events[1]!, { prepaymentCents: 1.5 });
    const result = validateSeed(doc);
    expect(result.ok).toBe(false);
    const errors = result.ok ? [] : result.errors;
    expect(errors.filter((e) => e.startsWith('events.0.invoiceStatus'))).toHaveLength(1);
    expect(errors.filter((e) => e.startsWith('events.0.prepaymentCents'))).toHaveLength(1);
    expect(errors.filter((e) => e.startsWith('events.1.prepaymentCents'))).toHaveLength(1);
  });
});
