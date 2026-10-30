/** "Ready to be invoiced" flag (api-contract "Gig status labels and Ready to be invoiced", TASK-044). Synthetic data only. */
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { closeTestDb, login, resetDb } from './helpers.js';
import { call, createEvent, history, startSession, UNKNOWN_ID, type Session } from './eventFixtures.js';

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

const path = (id: string) => `/api/events/${id}/ready-for-invoice`;

describe('ready to be invoiced', () => {
  it('new events are not ready; the fields are in EventDetail', async () => {
    const event = await createEvent(s);
    expect(event).toMatchObject({ readyForInvoiceAt: null, readyForInvoiceBy: null });
    const res = await call(s, 'GET', `/api/events/${event.id}`);
    expect(res.json()).toMatchObject({ readyForInvoiceAt: null, readyForInvoiceBy: null });
  });

  it('POST sets now/me and logs READY_FOR_INVOICE; a second POST is a no-op', async () => {
    const event = await createEvent(s, { startDate: '2026-08-01' }); // upcoming
    const res = await call(s, 'POST', path(event.id));
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      id: event.id,
      status: 'SOLD',
      played: false,
      readyForInvoiceAt: '2026-06-15T09:00:00.000Z',
      readyForInvoiceBy: s.world.a.id,
      costLines: expect.any(Array),
      attachments: [],
    });

    vi.setSystemTime(new Date('2026-06-16T09:00:00.000Z'));
    const again = await call(s, 'POST', path(event.id));
    expect(again.statusCode).toBe(200);
    expect(again.json()).toMatchObject({ readyForInvoiceAt: '2026-06-15T09:00:00.000Z', readyForInvoiceBy: s.world.a.id });

    const entries = await history(s, event.id);
    expect(entries.map((e) => e.type)).toEqual(['READY_FOR_INVOICE', 'CREATED']);
    expect(entries[0]).toMatchObject({ partnerId: s.world.a.id, reason: null, details: {} });
  });

  it('works for a played event', async () => {
    const event = await createEvent(s, { startDate: '2026-03-01' });
    const res = await call(s, 'POST', path(event.id));
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ played: true, readyForInvoiceBy: s.world.a.id });
  });

  it('DELETE clears both fields and logs READY_FOR_INVOICE_CLEARED with the clearing partner; not set → no-op', async () => {
    const event = await createEvent(s);
    const notSet = await call(s, 'DELETE', path(event.id));
    expect(notSet.statusCode).toBe(200);
    expect(notSet.json()).toMatchObject({ id: event.id, readyForInvoiceAt: null, readyForInvoiceBy: null });
    expect((await history(s, event.id)).map((e) => e.type)).toEqual(['CREATED']);

    await call(s, 'POST', path(event.id));
    const otherCookie = await login(s.app, 'partner.b@example.com');
    const cleared = await s.app.inject({ method: 'DELETE', url: path(event.id), headers: { cookie: otherCookie } });
    expect(cleared.statusCode).toBe(200);
    expect(cleared.json()).toMatchObject({ readyForInvoiceAt: null, readyForInvoiceBy: null });

    expect((await call(s, 'DELETE', path(event.id))).statusCode).toBe(200);
    const entries = await history(s, event.id);
    expect(entries.map((e) => [e.type, e.partnerId])).toEqual([
      ['READY_FOR_INVOICE_CLEARED', s.world.b.id],
      ['READY_FOR_INVOICE', s.world.a.id],
      ['CREATED', s.world.a.id],
    ]);
  });

  it('POST on a cancelled event is 409 INVALID_STATUS_TRANSITION; cancelling keeps the values; DELETE still clears', async () => {
    const cancelled = await createEvent(s);
    await call(s, 'POST', `/api/events/${cancelled.id}/cancel`, { reason: 'Client cancelled' });
    const res = await call(s, 'POST', path(cancelled.id));
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('INVALID_STATUS_TRANSITION');

    const event = await createEvent(s);
    await call(s, 'POST', path(event.id));
    const afterCancel = await call(s, 'POST', `/api/events/${event.id}/cancel`, { reason: 'Client cancelled' });
    expect(afterCancel.json()).toMatchObject({ status: 'CANCELLED', readyForInvoiceAt: '2026-06-15T09:00:00.000Z', readyForInvoiceBy: s.world.a.id });
    expect((await call(s, 'POST', path(event.id))).statusCode).toBe(409);
    const cleared = await call(s, 'DELETE', path(event.id));
    expect(cleared.statusCode).toBe(200);
    expect(cleared.json()).toMatchObject({ readyForInvoiceAt: null, readyForInvoiceBy: null });
  });

  it('deleted event → 409 EVENT_DELETED for both; unknown/malformed id → 404; no session → 401', async () => {
    const event = await createEvent(s);
    await call(s, 'POST', path(event.id));
    await call(s, 'POST', `/api/events/${event.id}/delete`, { reason: 'Duplicate' });
    for (const method of ['POST', 'DELETE'] as const) {
      const res = await call(s, method, path(event.id));
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe('EVENT_DELETED');
      expect((await call(s, method, path(UNKNOWN_ID))).statusCode).toBe(404);
      expect((await call(s, method, path('not-a-uuid'))).statusCode).toBe(404);
      expect((await s.app.inject({ method, url: path(event.id) })).statusCode).toBe(401);
    }
    expect((await history(s, event.id)).map((e) => e.type)).toEqual(['DELETED', 'READY_FOR_INVOICE', 'CREATED']);
  });

  it('GET /api/events list includes the fields', async () => {
    const ready = await createEvent(s, { venue: 'Venue A' });
    await createEvent(s, { venue: 'Venue B' });
    await call(s, 'POST', path(ready.id));
    const res = await call(s, 'GET', '/api/events?year=2026');
    expect(res.statusCode).toBe(200);
    const byVenue = Object.fromEntries(
      res.json().events.map((e: { venue: string; readyForInvoiceAt: string | null; readyForInvoiceBy: string | null }) => [
        e.venue,
        [e.readyForInvoiceAt, e.readyForInvoiceBy],
      ]),
    );
    expect(byVenue).toEqual({
      'Venue A': ['2026-06-15T09:00:00.000Z', s.world.a.id],
      'Venue B': [null, null],
    });
  });
});
