/**
 * Invoice rows per event (api-contract "Invoice rows", TASK-046; "Invoicing v3", TASK-049): endpoints,
 * derived fields (sent / not sent / uninvoiced / balance, invoiceState), ?invoiceState= filter, history,
 * seed/import. Synthetic data only (BR-090).
 */
import path from 'node:path';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadSeed, readSeedFile } from '../seed/load.js';
import { validateSeed } from '../seed/schema.js';
import { closeTestDb, login, resetDb, testDb } from './helpers.js';
import { call, createEvent, history, startSession, UNKNOWN_ID, type Json, type Session } from './eventFixtures.js';

let s: Session;
const NOW = '2026-06-15T09:00:00.000Z';

beforeEach(async () => {
  await resetDb();
  s = await startSession();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(NOW));
});
afterEach(async () => {
  vi.useRealTimers();
  await s.app.close();
});
afterAll(closeTestDb);

const addRow = (eventId: string, body: unknown) => call(s, 'POST', `/api/events/${eventId}/invoice-rows`, body);
const patchRow = (id: string, body: unknown) => call(s, 'PATCH', `/api/invoice-rows/${id}`, body);
const deleteRow = (id: string) => call(s, 'DELETE', `/api/invoice-rows/${id}`);

async function added(eventId: string, body: Record<string, unknown>): Promise<Json> {
  const res = await addRow(eventId, body);
  if (res.statusCode !== 200) throw new Error(`add row failed: ${res.statusCode} ${res.body}`);
  return res.json();
}

const lastRow = (event: Json): Json => event.invoiceRows[event.invoiceRows.length - 1];

describe('EventSummary / EventDetail fields', () => {
  it('a new played event: no rows, NONE (no label before the first invoice), balance = uninvoiced = total price; old fields are gone', async () => {
    const event = await createEvent(s, { priceCents: 100000, additionalSalesCents: 20000 });
    const expected = {
      totalPriceCents: 120000,
      sentCents: 0,
      notSentCents: 0,
      uninvoicedCents: 120000,
      balanceCents: 120000,
      invoiceState: 'NONE',
    };
    expect(event).toMatchObject({ ...expected, invoiceRows: [] });
    const removed = ['invoiceStatus', 'invoiceStatusAt', 'invoiceStatusBy', 'prepaymentCents', 'invoiceCoverage', 'paymentState'];
    removed.push('paidCents', 'openCents', 'readyCents', 'invoicedCents', 'finalInvoiceCreatedAt');
    for (const field of removed) expect(event).not.toHaveProperty(field);
    expect((await call(s, 'GET', `/api/events/${event.id}`)).json()).toMatchObject(expected);
    const summary = (await call(s, 'GET', '/api/events?year=2026')).json().events[0];
    expect(summary).toMatchObject(expected);
    expect(summary).not.toHaveProperty('invoiceRows'); // EventDetail only
    for (const field of removed) expect(summary).not.toHaveProperty(field);
  });

  it('an event with total 0: NONE without rows; NOT_SENT → OPEN_INVOICES; SENT only → NONE', async () => {
    const event = await createEvent(s, { priceCents: 0, additionalSalesCents: 0 });
    expect(event).toMatchObject({ totalPriceCents: 0, invoiceState: 'NONE', uninvoicedCents: 0, balanceCents: 0 });
    let e = await added(event.id, { description: 'Lasku', amountCents: 1000 });
    expect(e).toMatchObject({ invoiceState: 'OPEN_INVOICES', notSentCents: 1000, sentCents: 0, uninvoicedCents: 0 });
    e = (await patchRow(lastRow(e).id, { status: 'SENT' })).json();
    expect(e).toMatchObject({ invoiceState: 'NONE', sentCents: 1000, notSentCents: 0, balanceCents: -1000 });
    e = (await deleteRow(lastRow(e).id)).json();
    expect(e).toMatchObject({ invoiceState: 'NONE', sentCents: 0 });
  });

  it('derived fields follow the rows (list and detail)', async () => {
    const event = await createEvent(s, { priceCents: 100000, additionalSalesCents: 20000 });
    let e = await added(event.id, { description: 'Ennakkomaksu', amountCents: 30000, status: 'SENT' });
    expect(e).toMatchObject({ sentCents: 30000, notSentCents: 0, uninvoicedCents: 90000, balanceCents: 90000, invoiceState: 'PARTLY_INVOICED' });
    e = await added(event.id, { description: 'Lasku', amountCents: 50000 }); // NOT_SENT by default
    const open = { sentCents: 30000, notSentCents: 50000, uninvoicedCents: 40000, balanceCents: 90000, invoiceState: 'OPEN_INVOICES' };
    expect(e).toMatchObject(open);
    expect((await call(s, 'GET', '/api/events?year=2026')).json().events[0]).toMatchObject(open);
    e = (await patchRow(lastRow(e).id, { amountCents: 90000, status: 'SENT' })).json();
    const full = { sentCents: 120000, notSentCents: 0, uninvoicedCents: 0, balanceCents: 0, invoiceState: 'FULLY_INVOICED' };
    expect(e).toMatchObject(full);
    expect((await call(s, 'GET', '/api/events?year=2026')).json().events[0]).toMatchObject(full);
  });

  it('more sent than the total: balance negative, uninvoiced 0, still FULLY_INVOICED; a NOT_SENT row wins', async () => {
    const event = await createEvent(s, { priceCents: 100000 });
    let e = await added(event.id, { description: 'Lasku', amountCents: 120000, status: 'SENT' });
    expect(e).toMatchObject({ balanceCents: -20000, uninvoicedCents: 0, invoiceState: 'FULLY_INVOICED' });
    e = await added(event.id, { description: 'Lisälasku', amountCents: 5000 });
    expect(e).toMatchObject({ balanceCents: -20000, notSentCents: 5000, invoiceState: 'OPEN_INVOICES' });
  });

  it('PARTLY_INVOICED only for played events with rows: played without rows, upcoming (incl. today) and cancelled without rows are NONE', async () => {
    const played = await createEvent(s, { startDate: '2026-06-14', priceCents: 100000 });
    const today = await createEvent(s, { startDate: '2026-06-15', priceCents: 100000 });
    const upcoming = await createEvent(s, { startDate: '2026-07-01', priceCents: 100000 });
    const cancelled = await createEvent(s, { startDate: '2026-05-01', priceCents: 100000 });
    await call(s, 'POST', `/api/events/${cancelled.id}/cancel`, { reason: 'Client cancelled' });
    const expected: Record<string, [boolean, string]> = {
      [played.id]: [true, 'NONE'],
      [today.id]: [false, 'NONE'],
      [upcoming.id]: [false, 'NONE'],
      [cancelled.id]: [false, 'NONE'],
    };
    for (const [id, [isPlayed, invoiceState]] of Object.entries(expected)) {
      expect((await call(s, 'GET', `/api/events/${id}`)).json()).toMatchObject({ played: isPlayed, invoiceState, balanceCents: 100000 });
    }
    const listed = (await call(s, 'GET', '/api/events?year=2026&status=ALL')).json<{ events: Json[] }>().events;
    expect(Object.fromEntries(listed.map((e) => [e.id, e.invoiceState]))).toEqual(
      Object.fromEntries(Object.entries(expected).map(([id, [, state]]) => [id, state])),
    );
    // Played: the first (partial) SENT row → PARTLY_INVOICED.
    const p = await added(played.id, { description: 'Ennakkomaksu', amountCents: 30000, status: 'SENT' });
    expect(p).toMatchObject({ invoiceState: 'PARTLY_INVOICED', sentCents: 30000, balanceCents: 70000 });
    // Upcoming: a partial SENT row stays NONE; NOT_SENT → OPEN_INVOICES; all sent → FULLY_INVOICED.
    let e = await added(upcoming.id, { description: 'Ennakkomaksu', amountCents: 30000, status: 'SENT' });
    expect(e).toMatchObject({ invoiceState: 'NONE', sentCents: 30000, balanceCents: 70000 });
    e = await added(upcoming.id, { description: 'Lasku', amountCents: 70000 });
    expect(e).toMatchObject({ invoiceState: 'OPEN_INVOICES' });
    e = (await patchRow(lastRow(e).id, { status: 'SENT' })).json();
    expect(e).toMatchObject({ invoiceState: 'FULLY_INVOICED' });
  });

  it('an upcoming event with a SENT row becomes PARTLY_INVOICED the day after its start date (Helsinki)', async () => {
    const event = await createEvent(s, { startDate: '2026-06-15', priceCents: 100000 });
    await added(event.id, { description: 'Ennakkomaksu', amountCents: 30000, status: 'SENT' });
    expect((await call(s, 'GET', `/api/events/${event.id}`)).json()).toMatchObject({ played: false, invoiceState: 'NONE' });
    vi.setSystemTime(new Date('2026-06-15T20:59:00.000Z')); // 23:59 in Helsinki
    expect((await call(s, 'GET', `/api/events/${event.id}`)).json()).toMatchObject({ played: false, invoiceState: 'NONE' });
    vi.setSystemTime(new Date('2026-06-15T21:00:00.000Z')); // 00:00 on the 16th in Helsinki
    expect((await call(s, 'GET', `/api/events/${event.id}`)).json()).toMatchObject({ played: true, invoiceState: 'PARTLY_INVOICED' });
  });

  it('a cancelled event with rows keeps its derived fields (same formulas)', async () => {
    const event = await createEvent(s, { priceCents: 100000 });
    const row = lastRow(await added(event.id, { description: 'Lasku', amountCents: 40000 }));
    await call(s, 'POST', `/api/events/${event.id}/cancel`, { reason: 'Client cancelled' });
    let expected: Json = { status: 'CANCELLED', notSentCents: 40000, uninvoicedCents: 60000, invoiceState: 'OPEN_INVOICES' };
    expect((await call(s, 'GET', `/api/events/${event.id}`)).json()).toMatchObject(expected);
    expect((await call(s, 'GET', '/api/events?year=2026&status=CANCELLED')).json().events[0]).toMatchObject(expected);
    // Cancelled with a sent row below the total: PARTLY_INVOICED (only cancelled without rows is NONE).
    await patchRow(row.id, { status: 'SENT' });
    expected = { status: 'CANCELLED', sentCents: 40000, balanceCents: 60000, invoiceState: 'PARTLY_INVOICED' };
    expect((await call(s, 'GET', `/api/events/${event.id}`)).json()).toMatchObject(expected);
  });
});

describe('POST /api/events/{id}/invoice-rows', () => {
  it('adds a NOT_SENT row by default with created/status at/by = now/me and logs INVOICE_ROW_ADDED', async () => {
    const event = await createEvent(s);
    const res = await addRow(event.id, { description: '  Lasku 1  ', amountCents: 50000 });
    expect(res.statusCode).toBe(200);
    const e = res.json();
    expect(e.id).toBe(event.id);
    expect(e.costLines).toBeDefined(); // a full EventDetail
    expect(e.invoiceRows).toEqual([
      {
        id: expect.any(String),
        eventId: event.id,
        description: 'Lasku 1',
        amountCents: 50000,
        status: 'NOT_SENT',
        statusAt: NOW,
        statusBy: s.world.a.id,
        createdAt: NOW,
        createdBy: s.world.a.id,
        auto: false,
      },
    ]);
    const [entry] = await history(s, event.id);
    expect(entry).toMatchObject({
      type: 'INVOICE_ROW_ADDED',
      partnerId: s.world.a.id,
      details: { invoiceRowId: e.invoiceRows[0].id, description: 'Lasku 1', amountCents: 50000, status: 'NOT_SENT' },
    });
    expect(entry!.details).not.toHaveProperty('auto');
  });

  it.each(['NOT_SENT', 'SENT'])('accepts status %s', async (status) => {
    const event = await createEvent(s);
    expect(lastRow(await added(event.id, { description: 'Lasku', amountCents: 1, status })).status).toBe(status);
  });

  it('rows stay in creation order (also when created in the same millisecond)', async () => {
    const event = await createEvent(s);
    for (const d of ['Row 1', 'Row 2', 'Row 3']) await added(event.id, { description: d, amountCents: 1000 });
    const e = (await call(s, 'GET', `/api/events/${event.id}`)).json();
    expect(e.invoiceRows.map((r: { description: string }) => r.description)).toEqual(['Row 1', 'Row 2', 'Row 3']);
  });

  it.each([
    [{ amountCents: 1000 }, { description: 'REQUIRED' }],
    [{ description: null, amountCents: 1000 }, { description: 'REQUIRED' }],
    [{ description: '   ', amountCents: 1000 }, { description: 'REQUIRED' }],
    [{ description: 'x'.repeat(501), amountCents: 1000 }, { description: 'TOO_LONG' }],
    [{ description: 5, amountCents: 1000 }, { description: 'INVALID_VALUE' }],
    [{ description: 'Lasku' }, { amountCents: 'REQUIRED' }],
    [{ description: 'Lasku', amountCents: 0 }, { amountCents: 'INVALID_VALUE' }],
    [{ description: 'Lasku', amountCents: -100 }, { amountCents: 'INVALID_VALUE' }],
    [{ description: 'Lasku', amountCents: 10.5 }, { amountCents: 'INVALID_VALUE' }],
    [{ description: 'Lasku', amountCents: '1000' }, { amountCents: 'INVALID_VALUE' }],
    [{ description: 'Lasku', amountCents: 3_000_000_000 }, { amountCents: 'INVALID_VALUE' }],
    [{ description: 'Lasku', amountCents: 1000, status: 'INVOICED' }, { status: 'INVALID_VALUE' }],
    [{ description: 'Lasku', amountCents: 1000, status: 'READY' }, { status: 'INVALID_VALUE' }], // pre-v3
    [{ description: 'Lasku', amountCents: 1000, status: 'PAID' }, { status: 'INVALID_VALUE' }], // pre-v3
    [{ description: 'Lasku', amountCents: 1000, status: null }, { status: 'INVALID_VALUE' }],
    [{}, { description: 'REQUIRED', amountCents: 'REQUIRED' }],
  ])('%j → 400 %j', async (body, fields) => {
    const event = await createEvent(s);
    const res = await addRow(event.id, body);
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatchObject({ code: 'VALIDATION_ERROR', fields });
    expect((await call(s, 'GET', `/api/events/${event.id}`)).json().invoiceRows).toEqual([]);
  });

  it('a 500-character description is fine', async () => {
    const event = await createEvent(s);
    expect((await addRow(event.id, { description: 'x'.repeat(500), amountCents: 1 })).statusCode).toBe(200);
  });

  it('allowed on a cancelled event; cancel/uncancel keep the rows', async () => {
    const event = await createEvent(s);
    await added(event.id, { description: 'Lasku', amountCents: 1000 });
    await call(s, 'POST', `/api/events/${event.id}/cancel`, { reason: 'Client cancelled' });
    const e = await added(event.id, { description: 'Peruutusmaksu', amountCents: 2000, status: 'SENT' });
    expect(e.status).toBe('CANCELLED');
    expect(e.invoiceRows).toHaveLength(2);
    const back = (await call(s, 'POST', `/api/events/${event.id}/uncancel`, { reason: 'Back on' })).json();
    expect(back.invoiceRows).toHaveLength(2);
  });

  it('validation → 400 before existence → 404 before deleted → 409; no session → 401', async () => {
    const event = await createEvent(s);
    await call(s, 'POST', `/api/events/${event.id}/delete`, { reason: 'Duplicate' });
    expect((await addRow(UNKNOWN_ID, {})).statusCode).toBe(400);
    expect((await addRow(event.id, {})).statusCode).toBe(400);
    expect((await addRow(UNKNOWN_ID, { description: 'Lasku', amountCents: 1 })).statusCode).toBe(404);
    expect((await addRow('not-a-uuid', { description: 'Lasku', amountCents: 1 })).statusCode).toBe(404);
    const res = await addRow(event.id, { description: 'Lasku', amountCents: 1 });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('EVENT_DELETED');
    const anon = await s.app.inject({
      method: 'POST',
      url: `/api/events/${event.id}/invoice-rows`,
      payload: { description: 'Lasku', amountCents: 1 },
    });
    expect(anon.statusCode).toBe(401);
  });
});

describe('PATCH /api/invoice-rows/{id}', () => {
  async function eventWithRow(body: Record<string, unknown> = { description: 'Lasku', amountCents: 50000 }) {
    const event = await createEvent(s);
    const e = await added(event.id, body);
    return { eventId: event.id as string, row: lastRow(e) };
  }

  it('changes description and amount: one INVOICE_ROW_UPDATED, status at/by unchanged', async () => {
    const { eventId, row } = await eventWithRow();
    vi.setSystemTime(new Date('2026-06-16T10:00:00.000Z'));
    const res = await patchRow(row.id, { description: 'Lasku 1', amountCents: 40000 });
    expect(res.statusCode).toBe(200);
    expect(lastRow(res.json())).toMatchObject({ description: 'Lasku 1', amountCents: 40000, status: 'NOT_SENT', statusAt: NOW });
    const [entry] = await history(s, eventId);
    expect(entry).toMatchObject({
      type: 'INVOICE_ROW_UPDATED',
      partnerId: s.world.a.id,
      details: {
        invoiceRowId: row.id,
        description: 'Lasku 1',
        changes: [
          { field: 'description', from: 'Lasku', to: 'Lasku 1' },
          { field: 'amountCents', from: 50000, to: 40000 },
        ],
      },
    });
  });

  it('any status → any status; at/by follow the last status change', async () => {
    const { eventId, row } = await eventWithRow({ description: 'Lasku', amountCents: 50000, status: 'SENT' });
    const b = { ...s, cookie: await login(s.app, 'partner.b@example.com') };
    vi.setSystemTime(new Date('2026-06-16T10:00:00.000Z'));
    const res = await call(b, 'PATCH', `/api/invoice-rows/${row.id}`, { status: 'NOT_SENT' });
    expect(res.statusCode).toBe(200);
    expect(lastRow(res.json())).toMatchObject({
      status: 'NOT_SENT',
      statusAt: '2026-06-16T10:00:00.000Z',
      statusBy: s.world.b.id,
      createdAt: NOW,
      createdBy: s.world.a.id,
    });
    const [entry] = await history(s, eventId);
    expect(entry).toMatchObject({
      type: 'INVOICE_ROW_UPDATED',
      partnerId: s.world.b.id,
      details: { changes: [{ field: 'status', from: 'SENT', to: 'NOT_SENT' }] },
    });
  });

  it('the same values or an empty body are a no-op: 200, no history, nothing changes', async () => {
    const { eventId, row } = await eventWithRow();
    const before = await history(s, eventId);
    for (const body of [{}, { description: 'Lasku', amountCents: 50000, status: 'NOT_SENT' }, { description: ' Lasku ' }]) {
      const res = await patchRow(row.id, body);
      expect(res.statusCode).toBe(200);
      expect(lastRow(res.json())).toEqual(row);
    }
    expect(await history(s, eventId)).toHaveLength(before.length);
  });

  it.each([
    [{ description: null }, { description: 'REQUIRED' }],
    [{ description: '' }, { description: 'REQUIRED' }],
    [{ description: 'x'.repeat(501) }, { description: 'TOO_LONG' }],
    [{ amountCents: 0 }, { amountCents: 'INVALID_VALUE' }],
    [{ amountCents: null }, { amountCents: 'REQUIRED' }],
    [{ amountCents: 1.5 }, { amountCents: 'INVALID_VALUE' }],
    [{ status: 'NONE' }, { status: 'INVALID_VALUE' }],
    [{ status: 'READY' }, { status: 'INVALID_VALUE' }],
    [{ status: 'PAID' }, { status: 'INVALID_VALUE' }],
    [{ status: null }, { status: 'INVALID_VALUE' }],
  ])('%j → 400 %j', async (body, fields) => {
    const { row } = await eventWithRow();
    const res = await patchRow(row.id, body);
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatchObject({ code: 'VALIDATION_ERROR', fields });
  });

  it('unknown / malformed id → 404 (after validation); deleted event → 409 EVENT_DELETED', async () => {
    const { eventId, row } = await eventWithRow();
    expect((await patchRow(UNKNOWN_ID, { amountCents: 0 })).statusCode).toBe(400);
    expect((await patchRow(UNKNOWN_ID, { amountCents: 1 })).statusCode).toBe(404);
    expect((await patchRow('nope', { amountCents: 1 })).statusCode).toBe(404);
    await call(s, 'POST', `/api/events/${eventId}/delete`, { reason: 'Duplicate' });
    const res = await patchRow(row.id, { amountCents: 1 });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('EVENT_DELETED');
    // Restored: editable again.
    await call(s, 'POST', `/api/events/${eventId}/restore`);
    expect((await patchRow(row.id, { amountCents: 1 })).statusCode).toBe(200);
  });

  it('allowed on a cancelled event', async () => {
    const { eventId, row } = await eventWithRow();
    await call(s, 'POST', `/api/events/${eventId}/cancel`, { reason: 'Client cancelled' });
    expect((await patchRow(row.id, { status: 'SENT' })).statusCode).toBe(200);
  });
});

describe('DELETE /api/invoice-rows/{id}', () => {
  it('removes the row, logs INVOICE_ROW_REMOVED and returns the event', async () => {
    const event = await createEvent(s);
    const row = lastRow(await added(event.id, { description: 'Lasku', amountCents: 50000, status: 'SENT' }));
    const res = await deleteRow(row.id);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ id: event.id, invoiceRows: [], invoiceState: 'NONE', sentCents: 0, notSentCents: 0 });
    const [entry] = await history(s, event.id);
    expect(entry).toMatchObject({
      type: 'INVOICE_ROW_REMOVED',
      partnerId: s.world.a.id,
      details: { invoiceRowId: row.id, description: 'Lasku', amountCents: 50000, status: 'SENT' },
    });
    expect((await deleteRow(row.id)).statusCode).toBe(404);
  });

  it('deleted event → 409; cancelled event is fine', async () => {
    const event = await createEvent(s);
    const e = await added(event.id, { description: 'Lasku', amountCents: 1000 });
    await added(event.id, { description: 'Lasku 2', amountCents: 1000 });
    await call(s, 'POST', `/api/events/${event.id}/cancel`, { reason: 'Client cancelled' });
    expect((await deleteRow(e.invoiceRows[0].id)).statusCode).toBe(200);
    await call(s, 'POST', `/api/events/${event.id}/delete`, { reason: 'Duplicate' });
    const res = await deleteRow((await call(s, 'GET', `/api/events/${event.id}`)).json().invoiceRows[0].id);
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('EVENT_DELETED');
  });
});

describe('removed TASK-045 inputs', () => {
  it('PATCH /api/events ignores invoiceStatus / prepaymentCents (no change, no history)', async () => {
    const event = await createEvent(s);
    const before = await history(s, event.id);
    const res = await call(s, 'PATCH', `/api/events/${event.id}`, { invoiceStatus: 'PAID', prepaymentCents: 1000 });
    expect(res.statusCode).toBe(200);
    expect(res.json().event).toMatchObject({ invoiceState: 'NONE', balanceCents: 100000 });
    expect(await history(s, event.id)).toHaveLength(before.length);
  });
});

describe('GET /api/events ?invoiceState=', () => {
  async function venues(query: string) {
    const res = await call(s, 'GET', `/api/events?year=2026${query}`);
    expect(res.statusCode).toBe(200);
    return res.json<{ events: { venue: string }[] }>().events.map((e) => e.venue).sort();
  }

  // venue, total, rows → invoiceState
  async function world() {
    const rows: [string, number, [string, number][], string?][] = [
      ['Venue A', 0, []], // NONE (total 0)
      ['Venue B', 100000, []], // NONE (played, no rows yet)
      ['Venue C', 100000, [['SENT', 1000]]], // PARTLY_INVOICED
      ['Venue D', 100000, [['NOT_SENT', 1000], ['SENT', 1000]]], // OPEN_INVOICES
      ['Venue E', 100000, [['SENT', 100000], ['NOT_SENT', 1000]]], // OPEN_INVOICES (beats FULLY_INVOICED)
      ['Venue F', 100000, [['SENT', 60000], ['SENT', 40000]]], // FULLY_INVOICED
      ['Venue G', 100000, [['SENT', 120000]]], // FULLY_INVOICED (more than the total)
      ['Venue H', 100000, [], '2026-07-01'], // NONE (upcoming)
      ['Venue I', 100000, [['SENT', 1000]], '2026-06-15'], // NONE (starts today: not played yet)
    ];
    for (const [venue, priceCents, list, startDate = '2026-05-01'] of rows) {
      const event = await createEvent(s, { venue, priceCents, additionalSalesCents: 0, startDate });
      for (const [status, amountCents] of list) await added(event.id, { description: 'Lasku', amountCents, status });
    }
  }

  it('filters by one or several (repeated, OR) values; without it, all', async () => {
    await world();
    expect(await venues('')).toEqual(['Venue A', 'Venue B', 'Venue C', 'Venue D', 'Venue E', 'Venue F', 'Venue G', 'Venue H', 'Venue I']);
    expect(await venues('&invoiceState=NONE')).toEqual(['Venue A', 'Venue B', 'Venue H', 'Venue I']);
    expect(await venues('&invoiceState=PARTLY_INVOICED')).toEqual(['Venue C']);
    expect(await venues('&invoiceState=OPEN_INVOICES')).toEqual(['Venue D', 'Venue E']);
    expect(await venues('&invoiceState=FULLY_INVOICED')).toEqual(['Venue F', 'Venue G']);
    expect(await venues('&invoiceState=OPEN_INVOICES&invoiceState=PARTLY_INVOICED')).toEqual(['Venue C', 'Venue D', 'Venue E']);
    expect(await venues('&invoiceState=NONE&invoiceState=FULLY_INVOICED&invoiceState=FULLY_INVOICED')).toEqual([
      'Venue A',
      'Venue B',
      'Venue F',
      'Venue G',
      'Venue H',
      'Venue I',
    ]);
  });

  it('the summary carries the same invoiceState the filter uses', async () => {
    await world();
    const events = (await call(s, 'GET', '/api/events?year=2026')).json<{ events: { venue: string; invoiceState: string }[] }>().events;
    const byVenue = Object.fromEntries(events.map((e) => [e.venue, e.invoiceState]));
    expect(byVenue).toEqual({
      'Venue A': 'NONE',
      'Venue B': 'NONE',
      'Venue C': 'PARTLY_INVOICED',
      'Venue D': 'OPEN_INVOICES',
      'Venue E': 'OPEN_INVOICES',
      'Venue F': 'FULLY_INVOICED',
      'Venue G': 'FULLY_INVOICED',
      'Venue H': 'NONE',
      'Venue I': 'NONE',
    });
  });

  it('the removed ?invoiceCoverage= / ?paymentState= are ignored like any unknown key', async () => {
    await world();
    expect(await venues('&invoiceCoverage=NONE')).toHaveLength(9);
    expect(await venues('&paymentState=FULLY_PAID')).toHaveLength(9);
  });

  it('combines with the status filter (cancelled events too)', async () => {
    const event = await createEvent(s, { venue: 'Venue A' });
    await added(event.id, { description: 'Lasku', amountCents: 1000 });
    await call(s, 'POST', `/api/events/${event.id}/cancel`, { reason: 'Client cancelled' });
    const b = await createEvent(s, { venue: 'Venue B' });
    await added(b.id, { description: 'Lasku', amountCents: 1000, status: 'SENT' });
    expect(await venues('&invoiceState=OPEN_INVOICES')).toEqual([]); // default status=SOLD
    expect(await venues('&status=ALL&invoiceState=OPEN_INVOICES')).toEqual(['Venue A']);
    expect(await venues('&status=CANCELLED&invoiceState=PARTLY_INVOICED')).toEqual([]);
    expect(await venues('&status=ALL&invoiceState=PARTLY_INVOICED')).toEqual(['Venue B']);
    expect(await venues('&status=ALL&invoiceState=NONE')).toEqual([]); // the cancelled one has an open invoice
    await call(s, 'DELETE', `/api/invoice-rows/${(await call(s, 'GET', `/api/events/${event.id}`)).json().invoiceRows[0].id}`);
    expect(await venues('&status=ALL&invoiceState=NONE')).toEqual(['Venue A']); // cancelled without rows → NONE
    expect(await venues('&status=ALL&invoiceState=PARTLY_INVOICED')).toEqual(['Venue B']);
  });

  it('an unknown invoiceState value → 400 INVALID_VALUE (old values too)', async () => {
    const old = ['PAID', 'ROWS_TO_INVOICE', 'NEEDS_INVOICES', 'FULLY_PAID', 'PARTLY_PAID', 'READY', 'SENT', 'NOT_SENT'];
    for (const value of ['UNKNOWN', 'NONE&invoiceState=nope', 'open_invoices', '', ...old]) {
      const res = await call(s, 'GET', `/api/events?year=2026&invoiceState=${value}`);
      expect(res.statusCode).toBe(400);
      expect(res.json().error).toMatchObject({ code: 'VALIDATION_ERROR', fields: { invoiceState: 'INVALID_VALUE' } });
    }
  });
});

describe('seed / import', () => {
  const exampleSeedPath = path.resolve(import.meta.dirname, '../seed/seed.example.json');
  type Doc = Record<string, unknown> & { events: Record<string, unknown>[] };
  const example = () => structuredClone(readSeedFile(exampleSeedPath)) as Doc;
  const bare = (e: Record<string, unknown>) => {
    delete e.invoiceRows;
    delete e.invoiceStatus;
    delete e.prepaymentCents;
    return e;
  };
  const rowsOf = async (e: Record<string, unknown>) => {
    const event = await testDb().event.findFirstOrThrow({
      where: { venue: e.venue as string, startDate: new Date(`${e.startDate as string}T00:00:00Z`) },
      include: { invoiceRows: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] } },
    });
    return event.invoiceRows;
  };

  beforeEach(async () => {
    vi.useRealTimers();
    await resetDb();
  });

  it('loads invoiceRows in file order (default NOT_SENT, legacy READY/PAID converted; created/status by null); re-run adds nothing', async () => {
    const doc = example();
    doc.events.forEach(bare);
    doc.events[0]!.invoiceRows = [
      { description: 'Ennakkomaksu', amountCents: 50000, status: 'PAID' },
      { description: 'Lasku', amountCents: 20000 },
      { description: 'Lasku 2', amountCents: 10000, status: 'SENT' },
      { description: 'Lasku 3', amountCents: 5000, status: 'READY' },
      { description: 'Lasku 4', amountCents: 4000, status: 'NOT_SENT' },
    ];
    await loadSeed(testDb(), doc);
    const rows = await rowsOf(doc.events[0]!);
    expect(rows.map((r) => [r.description, r.amountCents, r.status, r.createdById, r.statusById])).toEqual([
      ['Ennakkomaksu', 50000, 'SENT', null, null],
      ['Lasku', 20000, 'NOT_SENT', null, null],
      ['Lasku 2', 10000, 'SENT', null, null],
      ['Lasku 3', 5000, 'NOT_SENT', null, null],
      ['Lasku 4', 4000, 'NOT_SENT', null, null],
    ]);
    expect(await rowsOf(doc.events[1]!)).toEqual([]);
    await loadSeed(testDb(), doc);
    expect(await testDb().invoiceRow.count()).toBe(5);
  });

  it('converts the legacy invoiceStatus / prepaymentCents (prepayment → SENT, READY → NOT_SENT, INVOICED/PAID → SENT)', async () => {
    const doc = example();
    doc.events.forEach(bare);
    const total = (e: Record<string, unknown>) => (e.priceCents as number) + ((e.additionalSalesCents as number) ?? 0);
    Object.assign(doc.events[0]!, { invoiceStatus: 'INVOICED', prepaymentCents: 50000 });
    Object.assign(doc.events[1]!, { invoiceStatus: 'PREPAYMENT_PAID', prepaymentCents: 10000 });
    Object.assign(doc.events[2]!, { invoiceStatus: 'READY' });
    await loadSeed(testDb(), doc);
    const pick = (rows: Awaited<ReturnType<typeof rowsOf>>) => rows.map((r) => [r.description, r.amountCents, r.status]);
    expect(pick(await rowsOf(doc.events[0]!))).toEqual([
      ['Ennakkomaksu', 50000, 'SENT'],
      ['Lasku', total(doc.events[0]!) - 50000, 'SENT'],
    ]);
    expect(pick(await rowsOf(doc.events[1]!))).toEqual([['Ennakkomaksu', 10000, 'SENT']]);
    expect(pick(await rowsOf(doc.events[2]!))).toEqual([['Lasku', total(doc.events[2]!), 'NOT_SENT']]);
  });

  it('the example seed validates', () => {
    expect(validateSeed(example()).ok).toBe(true);
  });

  it('rejects invalid rows and invoiceRows together with the legacy fields', () => {
    const doc = example();
    doc.events.forEach(bare);
    doc.events[0]!.invoiceRows = [
      { description: '', amountCents: 1000 },
      { description: 'Lasku', amountCents: 0 },
      { description: 'Lasku', amountCents: 1000, status: 'INVOICED' },
      { description: 'Lasku', amountCents: 1000, extra: true },
    ];
    Object.assign(doc.events[2]!, { invoiceStatus: 'SENT', prepaymentCents: -1 });
    const result = validateSeed(doc);
    expect(result.ok).toBe(false);
    const errors = result.ok ? [] : result.errors;
    for (const prefix of [
      'events.0.invoiceRows.0.description',
      'events.0.invoiceRows.1.amountCents',
      'events.0.invoiceRows.2.status',
      'events.0.invoiceRows.3',
      'events.2.invoiceStatus',
      'events.2.prepaymentCents',
    ]) {
      expect(errors.some((e) => e.startsWith(prefix)), prefix).toBe(true);
    }

    // Both formats on one event (checked once the structure is valid).
    const both = example();
    both.events.forEach(bare);
    Object.assign(both.events[1]!, { invoiceRows: [], invoiceStatus: 'READY' });
    const r2 = validateSeed(both);
    expect(r2.ok ? [] : r2.errors).toEqual([
      'events.1.invoiceRows: use either invoiceRows or the legacy invoiceStatus/prepaymentCents, not both',
    ]);
  });
});
