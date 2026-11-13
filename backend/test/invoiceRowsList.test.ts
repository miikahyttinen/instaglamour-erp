/**
 * TASK-061: GET /api/invoice-rows (api-contract "Laskutus page: all invoice rows"). Synthetic data only (BR-090).
 */
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeTestDb, resetDb, testApp, testDb } from './helpers.js';
import { call, createEvent, startSession, type Session } from './eventFixtures.js';

let s: Session;

beforeEach(async () => {
  await resetDb();
  s = await startSession();
});
afterEach(async () => {
  await s.app.close();
});
afterAll(closeTestDb);

type ListRow = Record<string, unknown> & { description: string; auto: boolean };

const list = async (): Promise<ListRow[]> => {
  const res = await call(s, 'GET', '/api/invoice-rows');
  expect(res.statusCode).toBe(200);
  return res.json<ListRow[]>();
};

/** A row inserted directly so createdAt / id / auto can be controlled. */
function insertRow(
  eventId: string,
  data: { description: string; status?: 'NOT_SENT' | 'SENT'; createdAt: string; id?: string; auto?: boolean },
) {
  const createdAt = new Date(data.createdAt);
  return testDb().invoiceRow.create({
    data: {
      ...(data.id && { id: data.id }),
      eventId,
      description: data.description,
      amountCents: 10000,
      status: data.status ?? 'NOT_SENT',
      statusAt: createdAt,
      createdAt,
      auto: data.auto ?? false,
    },
  });
}

describe('GET /api/invoice-rows', () => {
  it('requires a session', async () => {
    const app = await testApp();
    try {
      const res = await app.inject({ method: 'GET', url: '/api/invoice-rows' });
      expect(res.statusCode).toBe(401);
      expect(res.json()).toMatchObject({ error: { code: 'UNAUTHENTICATED' } });
    } finally {
      await app.close();
    }
  });

  it('empty list when there are no rows', async () => {
    expect(await list()).toEqual([]);
  });

  it('returns the full shape: InvoiceRow fields + event fields, client name and invoicingDetails', async () => {
    const client = await testDb().client.create({ data: { name: 'Client A' } });
    const event = await createEvent(s, {
      startDate: '2025-09-20',
      lineupName: 'Lineup A',
      venue: 'Venue X',
      clientId: client.id,
      invoicingDetails: 'Line 1\nLine 2',
    });
    const res = await call(s, 'POST', `/api/events/${event.id}/invoice-rows`, { description: 'Lasku', amountCents: 50000 });
    expect(res.statusCode).toBe(200);
    const created = res.json().invoiceRows[0];

    const rows = await list();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({
      ...created,
      eventStartDate: '2025-09-20',
      eventLineupName: 'Lineup A',
      eventVenue: 'Venue X',
      eventStatus: 'SOLD',
      clientName: 'Client A',
      invoicingDetails: 'Line 1\nLine 2',
    });
    expect(rows[0]).toMatchObject({
      eventId: event.id,
      description: 'Lasku',
      amountCents: 50000,
      status: 'NOT_SENT',
      statusBy: s.world.a.id,
      createdBy: s.world.a.id,
      auto: false,
    });
  });

  it('clientName and invoicingDetails are null when the event has none', async () => {
    const event = await createEvent(s);
    await insertRow(event.id, { description: 'Lasku', createdAt: '2026-01-01T10:00:00Z' });
    const [row] = await list();
    expect(row).toMatchObject({ clientName: null, invoicingDetails: null, statusBy: null, createdBy: null });
  });

  it('auto flag is passed through', async () => {
    const event = await createEvent(s);
    await insertRow(event.id, { description: 'Loppulasku', createdAt: '2026-01-02T10:00:00Z', auto: true });
    await insertRow(event.id, { description: 'Lasku', createdAt: '2026-01-01T10:00:00Z' });
    const rows = await list();
    expect(rows.map((r) => [r.description, r.auto])).toEqual([
      ['Loppulasku', true],
      ['Lasku', false],
    ]);
  });

  it('excludes rows of deleted events; includes cancelled events; all years', async () => {
    const deleted = await createEvent(s, { startDate: '2026-03-01' });
    const cancelled = await createEvent(s, { startDate: '2024-03-01' });
    const other = await createEvent(s, { startDate: '2027-03-01' });
    await insertRow(deleted.id, { description: 'Deleted', createdAt: '2026-01-03T10:00:00Z' });
    await insertRow(cancelled.id, { description: 'Cancelled', createdAt: '2026-01-02T10:00:00Z' });
    await insertRow(other.id, { description: 'Other', createdAt: '2026-01-01T10:00:00Z' });
    expect((await call(s, 'POST', `/api/events/${cancelled.id}/cancel`, { reason: 'Client cancelled' })).statusCode).toBe(200);
    expect((await call(s, 'POST', `/api/events/${deleted.id}/delete`, { reason: 'Mistake' })).statusCode).toBe(204);

    const rows = await list();
    expect(rows.map((r) => r.description)).toEqual(['Cancelled', 'Other']);
    expect(rows[0]).toMatchObject({ eventStatus: 'CANCELLED', eventStartDate: '2024-03-01' });
    expect(rows[1]).toMatchObject({ eventStatus: 'SOLD', eventStartDate: '2027-03-01' });

    // Restoring the event brings its rows back.
    expect((await call(s, 'POST', `/api/events/${deleted.id}/restore`)).statusCode).toBe(200);
    expect((await list()).map((r) => r.description)).toEqual(['Deleted', 'Cancelled', 'Other']);
  });

  it('orders NOT_SENT first, then SENT; newest createdAt first within a group; ties by id', async () => {
    const e1 = await createEvent(s, { startDate: '2026-02-01' });
    const e2 = await createEvent(s, { startDate: '2025-02-01' });
    const tie = '2026-03-01T10:00:00Z';
    await insertRow(e1.id, { description: 'sent old', status: 'SENT', createdAt: '2026-01-01T10:00:00Z' });
    await insertRow(e2.id, { description: 'sent new', status: 'SENT', createdAt: '2026-04-01T10:00:00Z' });
    await insertRow(e1.id, { description: 'open old', createdAt: '2025-12-01T10:00:00Z' });
    await insertRow(e2.id, { description: 'open tie b', createdAt: tie, id: '00000000-0000-4000-8000-00000000000b' });
    await insertRow(e1.id, { description: 'open tie a', createdAt: tie, id: '00000000-0000-4000-8000-00000000000a' });
    await insertRow(e1.id, { description: 'open new', createdAt: '2026-05-01T10:00:00Z' });

    expect((await list()).map((r) => r.description)).toEqual([
      'open new',
      'open tie a',
      'open tie b',
      'open old',
      'sent new',
      'sent old',
    ]);
  });
});
