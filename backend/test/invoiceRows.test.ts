/**
 * Invoice rows per event (api-contract "Invoice rows", TASK-046): endpoints, derived fields
 * (invoiceState, api-contract "Invoicing: one label"), ?invoiceState= filter, history, seed/import. Synthetic data only (BR-090).
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
  it('a new event: no rows, needs invoices, balance = total price; old fields are gone', async () => {
    const event = await createEvent(s, { priceCents: 100000, additionalSalesCents: 20000 });
    const expected = {
      totalPriceCents: 120000,
      balanceCents: 120000,
      invoicedCents: 0,
      paidCents: 0,
      openCents: 0,
      readyCents: 0,
      invoiceState: 'NEEDS_INVOICES',
    };
    expect(event).toMatchObject({ ...expected, invoiceRows: [] });
    for (const field of ['invoiceStatus', 'invoiceStatusAt', 'invoiceStatusBy', 'prepaymentCents', 'invoiceCoverage', 'paymentState']) {
      expect(event).not.toHaveProperty(field);
    }
    expect((await call(s, 'GET', `/api/events/${event.id}`)).json()).toMatchObject(expected);
    const summary = (await call(s, 'GET', '/api/events?year=2026')).json().events[0];
    expect(summary).toMatchObject(expected);
    expect(summary).not.toHaveProperty('invoiceRows'); // EventDetail only
    expect(summary).not.toHaveProperty('invoiceCoverage');
    expect(summary).not.toHaveProperty('paymentState');
  });

  it('an event with total 0: NONE without rows; READY → ROWS_TO_INVOICE, SENT → OPEN_INVOICES, PAID → PAID', async () => {
    const event = await createEvent(s, { priceCents: 0, additionalSalesCents: 0 });
    expect(event).toMatchObject({ totalPriceCents: 0, invoiceState: 'NONE', openCents: 0 });
    let e = await added(event.id, { description: 'Lasku', amountCents: 1000 });
    expect(e).toMatchObject({ invoiceState: 'ROWS_TO_INVOICE', readyCents: 1000, invoicedCents: 0 });
    e = (await patchRow(lastRow(e).id, { status: 'SENT' })).json();
    expect(e).toMatchObject({ invoiceState: 'OPEN_INVOICES', openCents: 1000 });
    e = (await patchRow(lastRow(e).id, { status: 'PAID' })).json();
    expect(e).toMatchObject({ invoiceState: 'PAID', paidCents: 1000 });
    e = (await deleteRow(lastRow(e).id)).json();
    expect(e).toMatchObject({ invoiceState: 'NONE' });
  });

  it('derived fields follow the rows (list and detail)', async () => {
    const event = await createEvent(s, { priceCents: 100000, additionalSalesCents: 20000 });
    let e = await added(event.id, { description: 'Ennakkomaksu', amountCents: 30000, status: 'PAID' });
    expect(e).toMatchObject({ balanceCents: 90000, invoicedCents: 30000, paidCents: 30000, openCents: 0, invoiceState: 'NEEDS_INVOICES' });
    e = await added(event.id, { description: 'Lasku', amountCents: 90000 }); // READY = draft
    const ready = { balanceCents: 90000, invoicedCents: 30000, paidCents: 30000, openCents: 0, readyCents: 90000, invoiceState: 'ROWS_TO_INVOICE' };
    expect(e).toMatchObject(ready);
    const listed = (await call(s, 'GET', '/api/events?year=2026')).json().events[0];
    expect(listed).toMatchObject(ready);
    e = (await patchRow(lastRow(e).id, { status: 'SENT' })).json();
    expect(e).toMatchObject({
      balanceCents: 90000,
      invoicedCents: 120000,
      paidCents: 30000,
      openCents: 90000,
      readyCents: 0,
      invoiceState: 'OPEN_INVOICES',
    });
    e = (await patchRow(lastRow(e).id, { status: 'PAID' })).json();
    const paid = {
      balanceCents: 0,
      invoicedCents: 120000,
      paidCents: 120000,
      openCents: 0,
      invoiceState: 'PAID',
    };
    expect(e).toMatchObject(paid);
    const summary = (await call(s, 'GET', '/api/events?year=2026')).json().events[0];
    expect(summary).toMatchObject(paid);
  });

  it('the balance may be negative (overpaid); overpaid with READY rows is still PAID', async () => {
    const event = await createEvent(s, { priceCents: 100000 });
    let e = await added(event.id, { description: 'Lasku', amountCents: 120000, status: 'PAID' });
    expect(e).toMatchObject({ balanceCents: -20000, invoiceState: 'PAID' });
    e = await added(event.id, { description: 'Lisälasku', amountCents: 5000 });
    expect(e).toMatchObject({ balanceCents: -20000, readyCents: 5000, invoiceState: 'PAID' });
  });

  it('a cancelled event with rows keeps its derived fields (same formulas)', async () => {
    const event = await createEvent(s, { priceCents: 100000 });
    await added(event.id, { description: 'Lasku', amountCents: 40000, status: 'SENT' });
    await call(s, 'POST', `/api/events/${event.id}/cancel`, { reason: 'Client cancelled' });
    const expected = { status: 'CANCELLED', openCents: 40000, invoiceState: 'OPEN_INVOICES' };
    expect((await call(s, 'GET', `/api/events/${event.id}`)).json()).toMatchObject(expected);
    expect((await call(s, 'GET', '/api/events?year=2026&status=CANCELLED')).json().events[0]).toMatchObject(expected);
  });
});

describe('POST /api/events/{id}/invoice-rows', () => {
  it('adds a READY row by default with created/status at/by = now/me and logs INVOICE_ROW_ADDED', async () => {
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
        status: 'READY',
        statusAt: NOW,
        statusBy: s.world.a.id,
        createdAt: NOW,
        createdBy: s.world.a.id,
      },
    ]);
    const [entry] = await history(s, event.id);
    expect(entry).toMatchObject({
      type: 'INVOICE_ROW_ADDED',
      partnerId: s.world.a.id,
      details: { invoiceRowId: e.invoiceRows[0].id, description: 'Lasku 1', amountCents: 50000, status: 'READY' },
    });
  });

  it.each(['READY', 'SENT', 'PAID'])('accepts status %s', async (status) => {
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
    expect(lastRow(res.json())).toMatchObject({ description: 'Lasku 1', amountCents: 40000, status: 'READY', statusAt: NOW });
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
    const { eventId, row } = await eventWithRow({ description: 'Lasku', amountCents: 50000, status: 'PAID' });
    const b = { ...s, cookie: await login(s.app, 'partner.b@example.com') };
    vi.setSystemTime(new Date('2026-06-16T10:00:00.000Z'));
    const res = await call(b, 'PATCH', `/api/invoice-rows/${row.id}`, { status: 'READY' });
    expect(res.statusCode).toBe(200);
    expect(lastRow(res.json())).toMatchObject({
      status: 'READY',
      statusAt: '2026-06-16T10:00:00.000Z',
      statusBy: s.world.b.id,
      createdAt: NOW,
      createdBy: s.world.a.id,
    });
    const [entry] = await history(s, eventId);
    expect(entry).toMatchObject({
      type: 'INVOICE_ROW_UPDATED',
      partnerId: s.world.b.id,
      details: { changes: [{ field: 'status', from: 'PAID', to: 'READY' }] },
    });
  });

  it('the same values or an empty body are a no-op: 200, no history, nothing changes', async () => {
    const { eventId, row } = await eventWithRow();
    const before = await history(s, eventId);
    for (const body of [{}, { description: 'Lasku', amountCents: 50000, status: 'READY' }, { description: ' Lasku ' }]) {
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
    expect(res.json()).toMatchObject({ id: event.id, invoiceRows: [], invoiceState: 'NEEDS_INVOICES', openCents: 0, invoicedCents: 0 });
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
    expect(res.json().event).toMatchObject({ invoiceState: 'NEEDS_INVOICES', balanceCents: 100000 });
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
    const rows: [string, number, [string, number][]][] = [
      ['Venue A', 0, []], // NONE
      ['Venue B', 100000, []], // NEEDS_INVOICES
      ['Venue C', 100000, [['PAID', 1000]]], // NEEDS_INVOICES
      ['Venue D', 100000, [['READY', 1000], ['SENT', 1000]]], // ROWS_TO_INVOICE
      ['Venue E', 100000, [['PAID', 50000], ['SENT', 50000]]], // OPEN_INVOICES
      ['Venue F', 100000, [['PAID', 100000]]], // PAID
      ['Venue G', 100000, [['PAID', 120000], ['READY', 1000]]], // PAID (overpaid with READY rows)
    ];
    for (const [venue, priceCents, list] of rows) {
      const event = await createEvent(s, { venue, priceCents, additionalSalesCents: 0 });
      for (const [status, amountCents] of list) await added(event.id, { description: 'Lasku', amountCents, status });
    }
  }

  it('filters by one or several (repeated, OR) values; without it, all', async () => {
    await world();
    expect(await venues('')).toEqual(['Venue A', 'Venue B', 'Venue C', 'Venue D', 'Venue E', 'Venue F', 'Venue G']);
    expect(await venues('&invoiceState=NONE')).toEqual(['Venue A']);
    expect(await venues('&invoiceState=NEEDS_INVOICES')).toEqual(['Venue B', 'Venue C']);
    expect(await venues('&invoiceState=ROWS_TO_INVOICE')).toEqual(['Venue D']);
    expect(await venues('&invoiceState=OPEN_INVOICES')).toEqual(['Venue E']);
    expect(await venues('&invoiceState=PAID')).toEqual(['Venue F', 'Venue G']);
    expect(await venues('&invoiceState=OPEN_INVOICES&invoiceState=NEEDS_INVOICES')).toEqual(['Venue B', 'Venue C', 'Venue E']);
    expect(await venues('&invoiceState=NONE&invoiceState=PAID&invoiceState=PAID')).toEqual(['Venue A', 'Venue F', 'Venue G']);
  });

  it('the summary carries the same invoiceState the filter uses', async () => {
    await world();
    const events = (await call(s, 'GET', '/api/events?year=2026')).json<{ events: { venue: string; invoiceState: string }[] }>().events;
    const byVenue = Object.fromEntries(events.map((e) => [e.venue, e.invoiceState]));
    expect(byVenue).toEqual({
      'Venue A': 'NONE',
      'Venue B': 'NEEDS_INVOICES',
      'Venue C': 'NEEDS_INVOICES',
      'Venue D': 'ROWS_TO_INVOICE',
      'Venue E': 'OPEN_INVOICES',
      'Venue F': 'PAID',
      'Venue G': 'PAID',
    });
  });

  it('the removed ?invoiceCoverage= / ?paymentState= are ignored like any unknown key', async () => {
    await world();
    expect(await venues('&invoiceCoverage=NONE')).toHaveLength(7);
    expect(await venues('&paymentState=FULLY_PAID')).toHaveLength(7);
  });

  it('combines with the status filter (cancelled events too)', async () => {
    const event = await createEvent(s, { venue: 'Venue A' });
    await added(event.id, { description: 'Lasku', amountCents: 1000, status: 'SENT' });
    await call(s, 'POST', `/api/events/${event.id}/cancel`, { reason: 'Client cancelled' });
    await createEvent(s, { venue: 'Venue B' });
    expect(await venues('&invoiceState=OPEN_INVOICES')).toEqual([]); // default status=SOLD
    expect(await venues('&status=ALL&invoiceState=OPEN_INVOICES')).toEqual(['Venue A']);
    expect(await venues('&status=CANCELLED&invoiceState=NEEDS_INVOICES')).toEqual([]);
    expect(await venues('&status=ALL&invoiceState=NEEDS_INVOICES')).toEqual(['Venue B']);
  });

  it('an unknown invoiceState value → 400 INVALID_VALUE (old coverage/payment values too)', async () => {
    for (const value of ['UNKNOWN', 'PAID&invoiceState=nope', 'paid', 'FULLY_PAID', 'FULLY_INVOICED', 'PARTLY_PAID', 'READY', 'SENT', '']) {
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

  it('loads invoiceRows in file order (status default READY; created/status by stay null); re-run adds nothing', async () => {
    const doc = example();
    doc.events.forEach(bare);
    doc.events[0]!.invoiceRows = [
      { description: 'Ennakkomaksu', amountCents: 50000, status: 'PAID' },
      { description: 'Lasku', amountCents: 20000 },
      { description: 'Lasku 2', amountCents: 10000, status: 'SENT' },
    ];
    await loadSeed(testDb(), doc);
    const rows = await rowsOf(doc.events[0]!);
    expect(rows.map((r) => [r.description, r.amountCents, r.status, r.createdById, r.statusById])).toEqual([
      ['Ennakkomaksu', 50000, 'PAID', null, null],
      ['Lasku', 20000, 'READY', null, null],
      ['Lasku 2', 10000, 'SENT', null, null],
    ]);
    expect(await rowsOf(doc.events[1]!)).toEqual([]);
    await loadSeed(testDb(), doc);
    expect(await testDb().invoiceRow.count()).toBe(3);
  });

  it('converts the legacy invoiceStatus / prepaymentCents like the migration', async () => {
    const doc = example();
    doc.events.forEach(bare);
    const total = (e: Record<string, unknown>) => (e.priceCents as number) + ((e.additionalSalesCents as number) ?? 0);
    Object.assign(doc.events[0]!, { invoiceStatus: 'INVOICED', prepaymentCents: 50000 });
    Object.assign(doc.events[1]!, { invoiceStatus: 'PREPAYMENT_PAID', prepaymentCents: 10000 });
    Object.assign(doc.events[2]!, { invoiceStatus: 'READY' });
    await loadSeed(testDb(), doc);
    const pick = (rows: Awaited<ReturnType<typeof rowsOf>>) => rows.map((r) => [r.description, r.amountCents, r.status]);
    expect(pick(await rowsOf(doc.events[0]!))).toEqual([
      ['Ennakkomaksu', 50000, 'PAID'],
      ['Lasku', total(doc.events[0]!) - 50000, 'SENT'],
    ]);
    expect(pick(await rowsOf(doc.events[1]!))).toEqual([['Ennakkomaksu', 10000, 'PAID']]);
    expect(pick(await rowsOf(doc.events[2]!))).toEqual([['Lasku', total(doc.events[2]!), 'READY']]);
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
