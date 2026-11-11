/**
 * TASK-059: event invoicingDetails (EventDetail only; create, convert, PATCH; seed/import).
 * Synthetic data only (BR-090).
 */
import path from 'node:path';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { newShareToken } from '../src/offers/shareToken.js';
import { loadSeed, readSeedFile } from '../seed/load.js';
import { validateSeed } from '../seed/schema.js';
import { call, createEvent, eventBody, history, startSession, type Session } from './eventFixtures.js';
import { closeTestDb, resetDb, testDb } from './helpers.js';

let s: Session;
let clientId: string;

beforeEach(async () => {
  await resetDb();
  s = await startSession();
  clientId = (await testDb().client.create({ data: { name: 'Client A' } })).id;
});
afterEach(async () => {
  await s.app.close();
});
afterAll(closeTestDb);

async function wonOffer(eventName: string) {
  const token = newShareToken();
  return testDb().offer.create({
    data: {
      clientId,
      eventName,
      eventDate: new Date('2099-07-01T00:00:00.000Z'),
      venue: 'Venue X',
      priceCents: 100000,
      sellerId: s.world.a.id,
      disposition: 'WON',
      shareToken: token.token,
      shareTokenHash: token.hash,
    },
  });
}

describe('event invoicingDetails', () => {
  it('defaults to null; on detail but not on summary', async () => {
    const event = await createEvent(s, { startDate: '2026-07-01' });
    expect(event.invoicingDetails).toBeNull();
    const detail = (await call(s, 'GET', `/api/events/${event.id}`)).json();
    expect(detail.invoicingDetails).toBeNull();
    const list = (await call(s, 'GET', '/api/events?year=2026')).json();
    expect(list.events[0]).not.toHaveProperty('invoicingDetails');
  });

  it('is accepted on create (trimmed); blank → null', async () => {
    const event = await createEvent(s, { invoicingDetails: '  Ref 123\nPO 456  ' });
    expect(event.invoicingDetails).toBe('Ref 123\nPO 456');
    expect((await testDb().event.findUniqueOrThrow({ where: { id: event.id } })).invoicingDetails).toBe('Ref 123\nPO 456');

    const blank = await createEvent(s, { invoicingDetails: '   ' });
    expect(blank.invoicingDetails).toBeNull();
    const nulled = await createEvent(s, { invoicingDetails: null });
    expect(nulled.invoicingDetails).toBeNull();
  });

  it('accepts 5000 characters; > 5000 → TOO_LONG on create and PATCH', async () => {
    const ok = await createEvent(s, { invoicingDetails: 'x'.repeat(5000) });
    expect(ok.invoicingDetails).toHaveLength(5000);

    const res = await call(s, 'POST', '/api/events', eventBody(s.world, { invoicingDetails: 'x'.repeat(5001) }));
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
    expect(res.json().error.fields).toEqual({ invoicingDetails: 'TOO_LONG' });

    const patch = await call(s, 'PATCH', `/api/events/${ok.id}`, { invoicingDetails: 'x'.repeat(5001) });
    expect(patch.statusCode).toBe(400);
    expect(patch.json().error.fields).toEqual({ invoicingDetails: 'TOO_LONG' });
  });

  it('rejects a non-string with INVALID_VALUE', async () => {
    const event = await createEvent(s);
    const patch = await call(s, 'PATCH', `/api/events/${event.id}`, { invoicingDetails: 12 });
    expect(patch.statusCode).toBe(400);
    expect(patch.json().error.fields).toEqual({ invoicingDetails: 'INVALID_VALUE' });
  });

  it('PATCH sets, trims and clears it; logged in UPDATED; unchanged value not logged', async () => {
    const event = await createEvent(s);
    const res = await call(s, 'PATCH', `/api/events/${event.id}`, { invoicingDetails: ' Ref 1 ' });
    expect(res.statusCode).toBe(200);
    expect(res.json().event.invoicingDetails).toBe('Ref 1');
    let entries = await history(s, event.id);
    expect(entries[0]).toMatchObject({
      type: 'UPDATED',
      partnerId: s.world.a.id,
      details: { changes: [{ field: 'invoicingDetails', from: null, to: 'Ref 1' }] },
    });

    await call(s, 'PATCH', `/api/events/${event.id}`, { invoicingDetails: 'Ref 1' });
    entries = await history(s, event.id);
    expect(entries.filter((e) => e.type === 'UPDATED')).toHaveLength(1);

    const cleared = await call(s, 'PATCH', `/api/events/${event.id}`, { invoicingDetails: '' });
    expect(cleared.statusCode).toBe(200);
    expect(cleared.json().event.invoicingDetails).toBeNull();
    entries = await history(s, event.id);
    expect(entries[0]).toMatchObject({
      type: 'UPDATED',
      details: { changes: [{ field: 'invoicingDetails', from: 'Ref 1', to: null }] },
    });
  });

  it('is accepted in the offer convert body; convert without body → null', async () => {
    const o1 = await wonOffer('Event 1');
    const res = await call(
      s,
      'POST',
      `/api/offers/${o1.id}/convert`,
      eventBody(s.world, { startDate: '2099-07-01', invoicingDetails: 'Ref 9' }),
    );
    expect(res.statusCode).toBe(201);
    expect(res.json().event.invoicingDetails).toBe('Ref 9');

    const o2 = await wonOffer('Event 2');
    const res2 = await call(s, 'POST', `/api/offers/${o2.id}/convert`);
    expect(res2.statusCode).toBe(201);
    expect(res2.json().event.invoicingDetails).toBeNull();

    const o3 = await wonOffer('Event 3');
    const tooLong = await call(
      s,
      'POST',
      `/api/offers/${o3.id}/convert`,
      eventBody(s.world, { startDate: '2099-07-01', invoicingDetails: 'x'.repeat(5001) }),
    );
    expect(tooLong.statusCode).toBe(400);
    expect(tooLong.json().error.fields).toEqual({ invoicingDetails: 'TOO_LONG' });
  });
});

describe('seed / import: invoicingDetails', () => {
  const exampleSeedPath = path.resolve(import.meta.dirname, '../seed/seed.example.json');
  type Doc = Record<string, unknown> & { events: Record<string, unknown>[] };
  const example = () => structuredClone(readSeedFile(exampleSeedPath)) as Doc;

  it('absent → null; given → stored (trimmed); blank → null', async () => {
    await resetDb();
    const doc = example();
    expect(doc.events.length).toBeGreaterThanOrEqual(2);
    expect(doc.events.every((e) => e.invoicingDetails === undefined)).toBe(true);
    doc.events[0]!.invoicingDetails = '  Ref A  ';
    doc.events[1]!.invoicingDetails = '   ';

    await loadSeed(testDb(), doc);

    const events = await testDb().event.findMany({ where: { offerId: null } });
    const find = (g: Record<string, unknown>) =>
      events.find((e) => e.startDate.toISOString().slice(0, 10) === g.startDate && e.venue === g.venue)!;
    expect(find(doc.events[0]!).invoicingDetails).toBe('Ref A');
    expect(find(doc.events[1]!).invoicingDetails).toBeNull();
    expect(events.filter((e) => e.invoicingDetails !== null)).toHaveLength(1);
  });

  it('rejects a non-string or > 5000 characters', () => {
    const doc = example();
    doc.events[0]!.invoicingDetails = 5;
    doc.events[1]!.invoicingDetails = 'x'.repeat(5001);
    const result = validateSeed(doc);
    expect(result.ok).toBe(false);
    const errors = result.ok ? [] : result.errors;
    expect(errors.some((e) => e.startsWith('events.0.invoicingDetails'))).toBe(true);
    expect(errors.some((e) => e.startsWith('events.1.invoicingDetails'))).toBe(true);
  });
});
