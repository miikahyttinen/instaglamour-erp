/**
 * Clients (UC-027, BR-100, BR-101): /api/clients and the event client link. Synthetic data only;
 * money is 1000 or multiples of 10000 cents.
 */
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeTestDb, resetDb, testApp, testDb } from './helpers.js';
import { call, createEvent, eventBody, history, startSession, UNKNOWN_ID, type Json, type Session } from './eventFixtures.js';

let s: Session;

beforeEach(async () => {
  await resetDb();
  s = await startSession();
});
afterEach(async () => {
  await s.app.close();
});
afterAll(closeTestDb);

const list = (query = '') => call(s, 'GET', `/api/clients${query ? `?${query}` : ''}`);
const post = (body: unknown) => call(s, 'POST', '/api/clients', body);
const get = (id: string) => call(s, 'GET', `/api/clients/${id}`);
const patch = (id: string, body: unknown) => call(s, 'PATCH', `/api/clients/${id}`, body);
const del = (id: string) => call(s, 'DELETE', `/api/clients/${id}`);

async function createClient(name: string, notes?: string | null): Promise<Json> {
  const res = await post(notes === undefined ? { name } : { name, notes });
  if (res.statusCode !== 201) throw new Error(`create client failed: ${res.statusCode} ${res.body}`);
  return res.json();
}

const validation = (fields: Record<string, string>) => ({
  error: { code: 'VALIDATION_ERROR', message: expect.any(String), fields },
});

const NAME_CASES: [string, unknown, string][] = [
  ['missing', {}, 'REQUIRED'],
  ['null', { name: null }, 'REQUIRED'],
  ['empty', { name: '' }, 'REQUIRED'],
  ['blank', { name: '   ' }, 'REQUIRED'],
  ['not a string', { name: 5 }, 'INVALID_VALUE'],
  ['over 500 chars', { name: 'x'.repeat(501) }, 'TOO_LONG'],
];

describe('authentication', () => {
  it('every client endpoint needs a session (401)', async () => {
    const app = await testApp();
    try {
      for (const [method, url] of [
        ['GET', '/api/clients'],
        ['POST', '/api/clients'],
        ['GET', `/api/clients/${UNKNOWN_ID}`],
        ['PATCH', `/api/clients/${UNKNOWN_ID}`],
        ['DELETE', `/api/clients/${UNKNOWN_ID}`],
      ] as const) {
        const res = await app.inject({ method, url, payload: method === 'POST' || method === 'PATCH' ? {} : undefined });
        expect(res.statusCode, `${method} ${url}`).toBe(401);
        expect(res.json().error.code).toBe('UNAUTHENTICATED');
      }
    } finally {
      await app.close();
    }
  });
});

describe('POST /api/clients', () => {
  it('creates a client with a trimmed name and notes and returns Client', async () => {
    const res = await post({ name: '  Client A Oy  ', notes: '  Synthetic notes ' });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toEqual({ id: expect.any(String), name: 'Client A Oy', notes: 'Synthetic notes' });
    const row = await testDb().client.findUniqueOrThrow({ where: { id: res.json().id } });
    expect(row).toMatchObject({ name: 'Client A Oy', notes: 'Synthetic notes', deletedAt: null });
  });

  it('notes are optional; blank notes become null', async () => {
    expect((await post({ name: 'Client A Oy' })).json().notes).toBeNull();
    expect((await post({ name: 'Client B ry', notes: '   ' })).json().notes).toBeNull();
    expect((await post({ name: 'Client C Ltd', notes: null })).json().notes).toBeNull();
  });

  it.each(NAME_CASES)('400 for a name that is %s; nothing saved', async (_label, body, code) => {
    const res = await post(body);
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual(validation({ name: code }));
    expect(await testDb().client.count()).toBe(0);
  });

  it('accepts 500-char names and 5000-char notes; longer notes are TOO_LONG', async () => {
    expect((await post({ name: 'x'.repeat(500), notes: 'n'.repeat(5000) })).statusCode).toBe(201);
    const res = await post({ name: 'Client B ry', notes: 'n'.repeat(5001) });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual(validation({ notes: 'TOO_LONG' }));
  });

  it('400 name: DUPLICATE for the name of another active client (case-insensitive, trimmed)', async () => {
    await createClient('Client A Oy');
    for (const name of ['Client A Oy', 'client a oy', '  CLIENT A OY ']) {
      const res = await post({ name });
      expect(res.statusCode).toBe(400);
      expect(res.json()).toEqual(validation({ name: 'DUPLICATE' }));
    }
    expect(await testDb().client.count()).toBe(1);
  });

  it('the name of a deleted client can be used again (a new client)', async () => {
    const old = await createClient('Client A Oy');
    expect((await del(old.id)).statusCode).toBe(204);
    const res = await post({ name: 'Client A Oy' });
    expect(res.statusCode).toBe(201);
    expect(res.json().id).not.toBe(old.id);
  });

  it('the database index rejects a duplicate active name even without the API check', async () => {
    await createClient('Client A Oy');
    await expect(testDb().client.create({ data: { name: ' client a oy' } })).rejects.toThrow();
  });
});

describe('GET /api/clients', () => {
  it('lists active clients sorted by name with eventCount (non-deleted events) and offerCount 0', async () => {
    const b = await createClient('Client B ry', 'Notes B');
    const a = await createClient('Client A Oy');
    const gone = await createClient('Client Z Oy');
    await del(gone.id);
    await createEvent(s, { clientId: a.id });
    await createEvent(s, { clientId: a.id, startDate: '2025-03-01' });
    const deletedEvent = await createEvent(s, { clientId: a.id, startDate: '2026-07-01' });
    await call(s, 'POST', `/api/events/${deletedEvent.id}/delete`, { reason: 'Test' });
    await createEvent(s); // no client

    const res = await list();
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([
      { id: a.id, name: 'Client A Oy', notes: null, eventCount: 2, offerCount: 0 },
      { id: b.id, name: 'Client B ry', notes: 'Notes B', eventCount: 0, offerCount: 0 },
    ]);
  });

  it('q filters by a case-insensitive substring of the name', async () => {
    await createClient('Client A Oy');
    await createClient('Client B ry');
    expect((await list('q=b%20R')).json().map((c: { name: string }) => c.name)).toEqual(['Client B ry']);
    expect((await list('q=client')).json()).toHaveLength(2);
    expect((await list('q=%20%20')).json()).toHaveLength(2);
    expect((await list('q=nothing')).json()).toEqual([]);
  });

  it('400 for a q over 500 chars', async () => {
    const res = await list(`q=${'x'.repeat(501)}`);
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual(validation({ q: 'TOO_LONG' }));
  });
});

describe('GET /api/clients/{id}', () => {
  it('returns the client, its non-deleted events of all years newest first, and offers []', async () => {
    const a = await createClient('Client A Oy', 'Notes');
    const other = await createClient('Client B ry');
    const g2025 = await createEvent(s, { clientId: a.id, startDate: '2025-03-01' });
    const g2027 = await createEvent(s, { clientId: a.id, startDate: '2027-01-10' });
    const g2026 = await createEvent(s, { clientId: a.id, startDate: '2026-05-01', venue: 'Venue Y' });
    await call(s, 'POST', `/api/events/${g2026.id}/cancel`, { reason: 'Test' }); // cancelled events are listed
    const deletedEvent = await createEvent(s, { clientId: a.id, startDate: '2026-09-01' });
    await call(s, 'POST', `/api/events/${deletedEvent.id}/delete`, { reason: 'Test' });
    await createEvent(s, { clientId: other.id });

    const res = await get(a.id);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.client).toEqual({ id: a.id, name: 'Client A Oy', notes: 'Notes' });
    expect(body.offers).toEqual([]);
    expect(body.events.map((g: { id: string }) => g.id)).toEqual([g2027.id, g2026.id, g2025.id]);
    // EventSummary, not EventDetail
    expect(body.events[1]).toMatchObject({ status: 'CANCELLED', venue: 'Venue Y', clientId: a.id, clientName: 'Client A Oy' });
    expect(body.events[0]).not.toHaveProperty('costLines');
  });

  it('404 for unknown, malformed and deleted clients', async () => {
    const gone = await createClient('Client A Oy');
    await del(gone.id);
    for (const id of [UNKNOWN_ID, 'not-a-uuid', gone.id]) {
      const res = await get(id);
      expect(res.statusCode, id).toBe(404);
      expect(res.json().error.code).toBe('NOT_FOUND');
    }
  });
});

describe('PATCH /api/clients/{id}', () => {
  it('updates name (trimmed) and notes and returns Client', async () => {
    const a = await createClient('Client A Oy', 'Old');
    const res = await patch(a.id, { name: ' Client A2 Oy ', notes: 'New' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ id: a.id, name: 'Client A2 Oy', notes: 'New' });
  });

  it('notes null or blank clears them; omitted fields are kept', async () => {
    const a = await createClient('Client A Oy', 'Old');
    expect((await patch(a.id, { notes: null })).json()).toEqual({ id: a.id, name: 'Client A Oy', notes: null });
    await patch(a.id, { notes: 'Again' });
    expect((await patch(a.id, { notes: '  ' })).json().notes).toBeNull();
    await patch(a.id, { notes: 'Kept' });
    expect((await patch(a.id, { name: 'Client A2 Oy' })).json().notes).toBe('Kept');
  });

  it('a no-op request returns 200 without writing', async () => {
    const a = await createClient('Client A Oy', 'Notes');
    const before = await testDb().client.findUniqueOrThrow({ where: { id: a.id } });
    const res = await patch(a.id, { name: 'Client A Oy', notes: 'Notes' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ id: a.id, name: 'Client A Oy', notes: 'Notes' });
    expect((await patch(a.id, {})).statusCode).toBe(200);
    const after = await testDb().client.findUniqueOrThrow({ where: { id: a.id } });
    expect(after.updatedAt).toEqual(before.updatedAt);
  });

  it('a client may change the case of its own name', async () => {
    const a = await createClient('Client A Oy');
    expect((await patch(a.id, { name: 'CLIENT A OY' })).json().name).toBe('CLIENT A OY');
  });

  it('400 DUPLICATE for another active client name; deleted clients do not count', async () => {
    const a = await createClient('Client A Oy');
    await createClient('Client B ry');
    const gone = await createClient('Client C Ltd');
    await del(gone.id);
    const res = await patch(a.id, { name: 'client b RY' });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual(validation({ name: 'DUPLICATE' }));
    expect((await patch(a.id, { name: 'Client C Ltd' })).statusCode).toBe(200);
  });

  it.each(NAME_CASES.filter(([label]) => label !== 'missing'))('400 for a name that is %s', async (_label, body, code) => {
    const a = await createClient('Client A Oy');
    const res = await patch(a.id, body);
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual(validation({ name: code }));
  });

  it('validation comes before existence (400 before 404); 404 for unknown and deleted', async () => {
    expect((await patch(UNKNOWN_ID, { name: '' })).statusCode).toBe(400);
    const gone = await createClient('Client A Oy');
    await del(gone.id);
    for (const id of [UNKNOWN_ID, 'not-a-uuid', gone.id]) {
      expect((await patch(id, { name: 'Client X Oy' })).statusCode, id).toBe(404);
    }
  });

  it('a rename shows on the linked events', async () => {
    const a = await createClient('Client A Oy');
    const event = await createEvent(s, { clientId: a.id });
    await patch(a.id, { name: 'Client A2 Oy' });
    expect((await call(s, 'GET', `/api/events/${event.id}`)).json().clientName).toBe('Client A2 Oy');
  });
});

describe('DELETE /api/clients/{id}', () => {
  it('soft-deletes an unlinked client: 204, hidden from lists, row kept', async () => {
    const a = await createClient('Client A Oy', 'Notes');
    const res = await del(a.id);
    expect(res.statusCode).toBe(204);
    expect(res.body).toBe('');
    expect((await list()).json()).toEqual([]);
    const row = await testDb().client.findUniqueOrThrow({ where: { id: a.id } });
    expect(row.deletedAt).toBeInstanceOf(Date);
    expect(row.notes).toBe('Notes');
  });

  it('409 CLIENT_IN_USE when an event links to it; nothing changes', async () => {
    const a = await createClient('Client A Oy');
    await createEvent(s, { clientId: a.id });
    const res = await del(a.id);
    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual({ error: { code: 'CLIENT_IN_USE', message: expect.any(String) } });
    expect((await testDb().client.findUniqueOrThrow({ where: { id: a.id } })).deletedAt).toBeNull();
  });

  it('a deleted event still links (restoring it must not point to a deleted client)', async () => {
    const a = await createClient('Client A Oy');
    const event = await createEvent(s, { clientId: a.id });
    await call(s, 'POST', `/api/events/${event.id}/delete`, { reason: 'Test' });
    expect((await del(a.id)).statusCode).toBe(409);
  });

  it('can be deleted once its events no longer link to it', async () => {
    const a = await createClient('Client A Oy');
    const event = await createEvent(s, { clientId: a.id });
    await call(s, 'PATCH', `/api/events/${event.id}`, { clientId: null });
    expect((await del(a.id)).statusCode).toBe(204);
  });

  it('404 for unknown, malformed and already deleted clients', async () => {
    const a = await createClient('Client A Oy');
    await del(a.id);
    for (const id of [UNKNOWN_ID, 'not-a-uuid', a.id]) {
      const res = await del(id);
      expect(res.statusCode, id).toBe(404);
      expect(res.json().error.code).toBe('NOT_FOUND');
    }
  });
});

describe('events: clientId / clientName', () => {
  it('an event without a client has clientId and clientName null', async () => {
    const event = await createEvent(s);
    expect(event).toMatchObject({ clientId: null, clientName: null });
  });

  it('POST /api/events accepts clientId and returns clientId + clientName', async () => {
    const a = await createClient('Client A Oy');
    const event = await createEvent(s, { clientId: a.id });
    expect(event).toMatchObject({ clientId: a.id, clientName: 'Client A Oy' });
    const listed = (await call(s, 'GET', '/api/events?year=2026')).json().events;
    expect(listed[0]).toMatchObject({ clientId: a.id, clientName: 'Client A Oy' });
  });

  it('POST /api/events: unknown, malformed or deleted clientId → 400 UNKNOWN_REFERENCE, nothing created', async () => {
    const gone = await createClient('Client A Oy');
    await del(gone.id);
    for (const clientId of [UNKNOWN_ID, 'not-a-uuid', gone.id]) {
      const res = await call(s, 'POST', '/api/events', { ...eventBody(s.world), clientId });
      expect(res.statusCode, clientId).toBe(400);
      expect(res.json()).toEqual(validation({ clientId: 'UNKNOWN_REFERENCE' }));
    }
    const res = await call(s, 'POST', '/api/events', { ...eventBody(s.world), clientId: 5 });
    expect(res.json()).toEqual(validation({ clientId: 'INVALID_VALUE' }));
    expect(await testDb().event.count()).toBe(0);
  });

  it('PATCH sets, changes and clears the client; each change is logged in UPDATED', async () => {
    const a = await createClient('Client A Oy');
    const b = await createClient('Client B ry');
    const event = await createEvent(s);

    let res = await call(s, 'PATCH', `/api/events/${event.id}`, { clientId: a.id });
    expect(res.statusCode).toBe(200);
    expect(res.json().event).toMatchObject({ clientId: a.id, clientName: 'Client A Oy' });

    res = await call(s, 'PATCH', `/api/events/${event.id}`, { clientId: b.id });
    expect(res.json().event).toMatchObject({ clientId: b.id, clientName: 'Client B ry' });

    res = await call(s, 'PATCH', `/api/events/${event.id}`, { clientId: null });
    expect(res.json().event).toMatchObject({ clientId: null, clientName: null });

    const updates = (await history(s, event.id)).filter((e) => e.type === 'UPDATED');
    expect(updates.map((e) => e.details)).toEqual([
      { changes: [{ field: 'clientId', from: b.id, to: null }], movedCostLineIds: [] },
      { changes: [{ field: 'clientId', from: a.id, to: b.id }], movedCostLineIds: [] },
      { changes: [{ field: 'clientId', from: null, to: a.id }], movedCostLineIds: [] },
    ]);
  });

  it('PATCH with the same clientId (or omitted) is a no-op without history', async () => {
    const a = await createClient('Client A Oy');
    const event = await createEvent(s, { clientId: a.id });
    expect((await call(s, 'PATCH', `/api/events/${event.id}`, { clientId: a.id })).statusCode).toBe(200);
    expect((await call(s, 'PATCH', `/api/events/${event.id}`, { venue: 'Venue X' })).json().event.clientId).toBe(a.id);
    expect((await history(s, event.id)).map((e) => e.type)).toEqual(['CREATED']);
  });

  it('PATCH: unknown or deleted clientId → 400 UNKNOWN_REFERENCE, nothing changes', async () => {
    const gone = await createClient('Client A Oy');
    await del(gone.id);
    const event = await createEvent(s);
    for (const clientId of [UNKNOWN_ID, 'not-a-uuid', gone.id]) {
      const res = await call(s, 'PATCH', `/api/events/${event.id}`, { clientId, venue: 'Venue Y' });
      expect(res.statusCode, clientId).toBe(400);
      expect(res.json()).toEqual(validation({ clientId: 'UNKNOWN_REFERENCE' }));
    }
    const row = await testDb().event.findUniqueOrThrow({ where: { id: event.id } });
    expect(row).toMatchObject({ clientId: null, venue: 'Venue X' });
  });

  it('GET /api/events q matches the client name (case-insensitive substring)', async () => {
    const a = await createClient('Client A Oy');
    const withClient = await createEvent(s, { clientId: a.id });
    await createEvent(s, { startDate: '2026-06-01' });
    const res = await call(s, 'GET', '/api/events?year=2026&q=nt%20a%20o');
    expect(res.json().events.map((g: { id: string }) => g.id)).toEqual([withClient.id]);
  });

  it('the year page upcoming events carry clientName too', async () => {
    const a = await createClient('Client A Oy');
    await createEvent(s, { clientId: a.id, startDate: '2099-01-01' });
    const res = await call(s, 'GET', '/api/years/2099');
    expect(res.json().upcomingEvents[0]).toMatchObject({ clientId: a.id, clientName: 'Client A Oy' });
  });
});
