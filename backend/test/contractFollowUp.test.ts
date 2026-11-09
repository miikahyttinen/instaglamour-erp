/**
 * TASK-058: event contractDone, offer followUpDone, GET /api/me/offers, seed/import defaults.
 * Synthetic data only (BR-090).
 */
import path from 'node:path';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { OfferDisposition } from '../src/generated/prisma/client.js';
import { newShareToken } from '../src/offers/shareToken.js';
import { loadSeed, readSeedFile } from '../seed/load.js';
import { validateSeed } from '../seed/schema.js';
import { call, createEvent, eventBody, history, startSession, type Json, type Session } from './eventFixtures.js';
import { closeTestDb, resetDb, testDb } from './helpers.js';

let s: Session;
let clientId: string;

/** Freeze "today" (Helsinki): 2026-06-15. */
function freezeToday() {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-06-15T09:00:00.000Z'));
}

beforeEach(async () => {
  await resetDb();
  s = await startSession();
  clientId = (await testDb().client.create({ data: { name: 'Client A' } })).id;
  freezeToday();
});
afterEach(async () => {
  vi.useRealTimers();
  await s.app.close();
});
afterAll(closeTestDb);

let createdClock = Date.UTC(2026, 0, 1);

/** An offer written directly (fields the API cannot set, e.g. a deleted one). */
async function offer(
  options: {
    eventName?: string;
    eventDate?: string;
    sellerId?: string;
    disposition?: OfferDisposition;
    followUpDone?: boolean;
    deleted?: boolean;
    city?: string | null;
    priceCents?: number | null;
  } = {},
) {
  const token = newShareToken();
  createdClock += 1000;
  return testDb().offer.create({
    data: {
      clientId,
      eventName: options.eventName ?? 'Event 1',
      eventDate: new Date(`${options.eventDate ?? '2026-07-01'}T00:00:00.000Z`),
      venue: 'Venue X',
      city: options.city === undefined ? 'City A' : options.city,
      priceCents: options.priceCents === undefined ? 100000 : options.priceCents,
      sellerId: options.sellerId ?? s.world.a.id,
      disposition: options.disposition ?? 'PENDING',
      followUpDone: options.followUpDone ?? false,
      deletedAt: options.deleted ? new Date() : null,
      shareToken: token.token,
      shareTokenHash: token.hash,
      createdAt: new Date(createdClock),
    },
  });
}

/** A gig converted from `offerId`, written directly. */
async function gigFor(
  offerId: string,
  options: { contractDone?: boolean; status?: 'SOLD' | 'CANCELLED'; deleted?: boolean } = {},
) {
  return testDb().event.create({
    data: {
      startDate: new Date('2026-07-01T00:00:00.000Z'),
      lineupName: 'Lineup X',
      venue: 'Venue X',
      sellerId: s.world.a.id,
      producerId: s.world.a.id,
      priceCents: 100000,
      offerId,
      contractDone: options.contractDone ?? false,
      status: options.status ?? 'SOLD',
      deletedAt: options.deleted ? new Date() : null,
      deletedById: options.deleted ? s.world.a.id : null,
    },
  });
}

async function myOffers(): Promise<{ contractMissing: Json[]; followUp: Json[] }> {
  const res = await call(s, 'GET', '/api/me/offers');
  expect(res.statusCode).toBe(200);
  return res.json();
}

const names = (rows: { eventName: string }[]): string[] => rows.map((r) => r.eventName);

describe('event contractDone', () => {
  it('defaults to false on create and is returned on summary and detail', async () => {
    const event = await createEvent(s, { startDate: '2026-07-01' });
    expect(event.contractDone).toBe(false);
    const list = (await call(s, 'GET', '/api/events?year=2026')).json();
    expect(list.events[0].contractDone).toBe(false);
  });

  it('is accepted on create', async () => {
    const event = await createEvent(s, { contractDone: true });
    expect(event.contractDone).toBe(true);
    expect((await testDb().event.findUniqueOrThrow({ where: { id: event.id } })).contractDone).toBe(true);
  });

  it.each([null, 'yes', 1])('rejects %s on create and PATCH with INVALID_VALUE', async (value) => {
    const res = await call(s, 'POST', '/api/events', eventBody(s.world, { contractDone: value }));
    expect(res.statusCode).toBe(400);
    expect(res.json().error.fields).toEqual({ contractDone: 'INVALID_VALUE' });
    const event = await createEvent(s);
    const patch = await call(s, 'PATCH', `/api/events/${event.id}`, { contractDone: value });
    expect(patch.statusCode).toBe(400);
    expect(patch.json().error.fields).toEqual({ contractDone: 'INVALID_VALUE' });
  });

  it('PATCH changes it and logs UPDATED; an unchanged value is not logged', async () => {
    const event = await createEvent(s);
    const res = await call(s, 'PATCH', `/api/events/${event.id}`, { contractDone: true });
    expect(res.statusCode).toBe(200);
    expect(res.json().event.contractDone).toBe(true);
    let entries = await history(s, event.id);
    expect(entries[0]).toMatchObject({
      type: 'UPDATED',
      partnerId: s.world.a.id,
      details: { changes: [{ field: 'contractDone', from: false, to: true }] },
    });

    await call(s, 'PATCH', `/api/events/${event.id}`, { contractDone: true });
    entries = await history(s, event.id);
    expect(entries.filter((e) => e.type === 'UPDATED')).toHaveLength(1);
  });

  it('is accepted in the offer convert body; convert without body → false', async () => {
    const o1 = await offer({ disposition: 'WON', eventName: 'Event 1' });
    const res = await call(s, 'POST', `/api/offers/${o1.id}/convert`, eventBody(s.world, { startDate: '2026-07-01', contractDone: true }));
    expect(res.statusCode).toBe(201);
    expect(res.json().event.contractDone).toBe(true);

    const o2 = await offer({ disposition: 'WON', eventName: 'Event 2' });
    const res2 = await call(s, 'POST', `/api/offers/${o2.id}/convert`);
    expect(res2.statusCode).toBe(201);
    expect(res2.json().event.contractDone).toBe(false);
  });
});

describe('offer followUpDone', () => {
  it('defaults to false and is returned on list and detail', async () => {
    const res = await call(s, 'POST', '/api/offers', {
      clientId,
      eventName: 'Event 1',
      eventDate: '2026-07-01',
      venue: 'Venue X',
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().followUpDone).toBe(false);
    const list = (await call(s, 'GET', '/api/offers')).json();
    expect(list.offers[0].followUpDone).toBe(false);
  });

  it('PATCH changes it and logs UPDATED', async () => {
    const o = await offer();
    const res = await call(s, 'PATCH', `/api/offers/${o.id}`, { followUpDone: true });
    expect(res.statusCode).toBe(200);
    expect(res.json().followUpDone).toBe(true);
    const hist = (await call(s, 'GET', `/api/offers/${o.id}/history`)).json();
    expect(hist[0]).toMatchObject({
      type: 'UPDATED',
      partnerId: s.world.a.id,
      details: { changes: [{ field: 'followUpDone', from: false, to: true }] },
    });
  });

  it.each([null, 'true'])('rejects %s with INVALID_VALUE', async (value) => {
    const o = await offer();
    const res = await call(s, 'PATCH', `/api/offers/${o.id}`, { followUpDone: value });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.fields).toEqual({ followUpDone: 'INVALID_VALUE' });
  });

  it('a deleted offer cannot be changed (409)', async () => {
    const o = await offer({ deleted: true });
    const res = await call(s, 'PATCH', `/api/offers/${o.id}`, { followUpDone: true });
    expect(res.statusCode).toBe(409);
  });
});

describe('GET /api/me/offers', () => {
  it('requires a session', async () => {
    const res = await s.app.inject({ method: 'GET', url: '/api/me/offers' });
    expect(res.statusCode).toBe(401);
  });

  it('empty → both lists empty', async () => {
    expect(await myOffers()).toEqual({ contractMissing: [], followUp: [] });
  });

  it('returns the MyOffer shape', async () => {
    const o = await offer({ disposition: 'WON', city: null, priceCents: null });
    const gig = await gigFor(o.id);
    const open = await offer({ eventName: 'Event 2' });
    expect(await myOffers()).toEqual({
      contractMissing: [
        {
          offerId: o.id,
          eventName: 'Event 1',
          eventDate: '2026-07-01',
          clientName: 'Client A',
          venue: 'Venue X',
          city: null,
          priceCents: null,
          eventId: gig.id,
        },
      ],
      followUp: [
        {
          offerId: open.id,
          eventName: 'Event 2',
          eventDate: '2026-07-01',
          clientName: 'Client A',
          venue: 'Venue X',
          city: 'City A',
          priceCents: 100000,
          eventId: null,
        },
      ],
    });
  });

  it('contractMissing: accepted offers not converted or with an open contract; sorted by event date', async () => {
    await offer({ disposition: 'WON', eventName: 'Not converted', eventDate: '2026-08-01' });
    // Only event dates today or later (Helsinki, today = 2026-06-15): past accepted offers are not listed.
    await offer({ disposition: 'WON', eventName: 'Past not converted', eventDate: '2026-06-14' });
    const past = await offer({ disposition: 'WON', eventName: 'Past contract open', eventDate: '2026-01-10' });
    await gigFor(past.id, { contractDone: false });
    await offer({ disposition: 'WON', eventName: 'Today not converted', eventDate: '2026-06-15' });
    const open = await offer({ disposition: 'WON', eventName: 'Contract open', eventDate: '2026-07-01' });
    await gigFor(open.id, { contractDone: false });
    const done = await offer({ disposition: 'WON', eventName: 'Contract done', eventDate: '2026-07-02' });
    await gigFor(done.id, { contractDone: true });
    const cancelled = await offer({ disposition: 'WON', eventName: 'Cancelled gig', eventDate: '2026-07-03' });
    await gigFor(cancelled.id, { status: 'CANCELLED' });
    const deletedGig = await offer({ disposition: 'WON', eventName: 'Deleted gig', eventDate: '2026-07-04' });
    await gigFor(deletedGig.id, { deleted: true });
    await offer({ disposition: 'WON', eventName: 'Other seller', sellerId: s.world.b.id });
    await offer({ disposition: 'WON', eventName: 'Deleted offer', deleted: true });
    await offer({ disposition: 'LOST_PRICE', eventName: 'Lost' });
    await offer({ disposition: 'CANCELLED', eventName: 'Cancelled offer' });

    const result = await myOffers();
    expect(names(result.contractMissing)).toEqual(['Today not converted', 'Contract open', 'Not converted']);
    expect(result.followUp).toEqual([]);
  });

  it('followUp: open, not expired, follow-up not done; sorted by event date', async () => {
    await offer({ eventName: 'Later', eventDate: '2026-09-01' });
    await offer({ eventName: 'Today', eventDate: '2026-06-15' });
    await offer({ eventName: 'Expired', eventDate: '2026-06-14' });
    await offer({ eventName: 'Followed up', followUpDone: true });
    await offer({ eventName: 'Other seller', sellerId: s.world.b.id });
    await offer({ eventName: 'Deleted', deleted: true });
    await offer({ eventName: 'Accepted', disposition: 'WON', followUpDone: true });

    const result = await myOffers();
    expect(names(result.followUp)).toEqual(['Today', 'Later']);
    expect(names(result.contractMissing)).toEqual(['Accepted']);
  });

  it('reflects PATCH changes: follow-up done and contract done remove the rows', async () => {
    const open = await offer({ eventName: 'Open' });
    const won = await offer({ disposition: 'WON', eventName: 'Won' });
    const gig = await gigFor(won.id);
    expect(names((await myOffers()).followUp)).toEqual(['Open']);
    expect(names((await myOffers()).contractMissing)).toEqual(['Won']);

    await call(s, 'PATCH', `/api/offers/${open.id}`, { followUpDone: true });
    await call(s, 'PATCH', `/api/events/${gig.id}`, { contractDone: true });
    expect(await myOffers()).toEqual({ contractMissing: [], followUp: [] });
  });
});

describe('seed / import: contractDone and followUpDone', () => {
  const exampleSeedPath = path.resolve(import.meta.dirname, '../seed/seed.example.json');
  type Doc = Record<string, unknown> & { events: Record<string, unknown>[]; offers: Record<string, unknown>[] };
  const example = () => structuredClone(readSeedFile(exampleSeedPath)) as Doc;

  beforeEach(async () => {
    vi.useRealTimers();
    await resetDb();
  });

  it('absent → false (also for past gigs); given → stored', async () => {
    const doc = example();
    const pastGig = doc.events.find((e) => (e.startDate as string) < '2026-06-01')!;
    expect(pastGig.contractDone).toBeUndefined();
    const flagged = doc.events.find((e) => e !== pastGig)!;
    flagged.contractDone = true;
    const followed = doc.offers[0]!;
    followed.followUpDone = true;

    await loadSeed(testDb(), doc);

    const events = await testDb().event.findMany({ where: { offerId: null } });
    const byStart = (iso: unknown) =>
      events.find(
        (e) =>
          e.startDate.toISOString().slice(0, 10) === iso &&
          e.venue === (doc.events.find((g) => g.startDate === iso)!.venue as string),
      )!;
    expect(byStart(pastGig.startDate).contractDone).toBe(false);
    expect(byStart(flagged.startDate).contractDone).toBe(true);
    expect(events.filter((e) => e.contractDone)).toHaveLength(1);

    const offers = await testDb().offer.findMany();
    expect(offers.filter((o) => o.followUpDone).map((o) => o.eventName)).toEqual([followed.eventName]);
  });

  it('rejects non-boolean values', () => {
    const doc = example();
    doc.events[0]!.contractDone = 'yes';
    doc.offers[0]!.followUpDone = 1;
    const result = validateSeed(doc);
    expect(result.ok).toBe(false);
    const errors = result.ok ? [] : result.errors;
    expect(errors.some((e) => e.startsWith('events.0.contractDone'))).toBe(true);
    expect(errors.some((e) => e.startsWith('offers.0.followUpDone'))).toBe(true);
  });
});
