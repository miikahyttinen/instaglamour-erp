/**
 * Offers (UC-028, UC-029, UC-031; BR-102, BR-103, BR-105, BR-106) and the client/gig links.
 * Synthetic data only; money is 1000 or multiples of 10000 cents.
 */
import { createHash } from 'node:crypto';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { todayIso } from '../src/domain/dates.js';
import { OFFER_SETTING_KEYS } from '../src/domain/enums.js';
import { SPOTIFY_URL } from '../src/offers/constants.js';
import { closeTestDb, resetDb, testApp, testDb } from './helpers.js';
import { call, startSession, UNKNOWN_ID, type Json, type Session } from './gigFixtures.js';

let s: Session;
let clientA: Json;
let clientB: Json;

export async function setTextSetting(key: string, valueText: string) {
  await testDb().setting.upsert({ where: { key }, create: { key, valueText }, update: { valueText, valueCents: null } });
}

beforeEach(async () => {
  await resetDb();
  s = await startSession();
  clientA = await testDb().client.create({ data: { name: 'Client A Oy' } });
  clientB = await testDb().client.create({ data: { name: 'Client B ry' } });
});
afterEach(async () => {
  await s.app.close();
});
afterAll(closeTestDb);

const YEAR = 2026;
const list = (query = `year=${YEAR}`) => call(s, 'GET', `/api/offers?${query}`);
const post = (body: unknown) => call(s, 'POST', '/api/offers', body);
const get = (id: string) => call(s, 'GET', `/api/offers/${id}`);
const patch = (id: string, body: unknown) => call(s, 'PATCH', `/api/offers/${id}`, body);
const action = (id: string, name: string) => call(s, 'POST', `/api/offers/${id}/${name}`);
const publicGet = (path: string) => s.app.inject({ method: 'GET', url: `/api${path.replace(/^\/o\//, '/public/offers/')}` });

function offerBody(overrides: Record<string, unknown> = {}) {
  return {
    clientId: clientA.id,
    eventName: 'Event 1',
    eventDate: `${YEAR}-11-14`,
    venue: 'Venue X',
    city: 'City A',
    lineup: ['Vocals', 'Guitar'],
    priceCents: 300000,
    source: 'EMAIL',
    eventType: 'CORPORATE',
    ...overrides,
  };
}

async function createOffer(overrides: Record<string, unknown> = {}): Promise<Json> {
  const res = await post(offerBody(overrides));
  if (res.statusCode !== 201) throw new Error(`create offer failed: ${res.statusCode} ${res.body}`);
  return res.json();
}

interface OfferEventJson {
  id: string;
  offerId: string;
  type: string;
  partnerId: string;
  at: string;
  details: Record<string, unknown>;
}

async function history(id: string): Promise<OfferEventJson[]> {
  const res = await call(s, 'GET', `/api/offers/${id}/history`);
  expect(res.statusCode).toBe(200);
  return res.json<OfferEventJson[]>();
}

function shiftDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const validation = (fields: Record<string, string>) => ({
  error: { code: 'VALIDATION_ERROR', message: expect.any(String), fields },
});

describe('authentication', () => {
  it('every internal offer endpoint needs a session (401)', async () => {
    const app = await testApp();
    try {
      for (const [method, url] of [
        ['GET', `/api/offers?year=${YEAR}`],
        ['POST', '/api/offers'],
        ['GET', `/api/offers/${UNKNOWN_ID}`],
        ['PATCH', `/api/offers/${UNKNOWN_ID}`],
        ['POST', `/api/offers/${UNKNOWN_ID}/regenerate-link`],
        ['POST', `/api/offers/${UNKNOWN_ID}/convert`],
        ['POST', `/api/offers/${UNKNOWN_ID}/delete`],
        ['POST', `/api/offers/${UNKNOWN_ID}/restore`],
        ['GET', `/api/offers/${UNKNOWN_ID}/history`],
        // Only the exact public offer route is open; anything else under /api/public needs a session.
        ['GET', '/api/public/offers'],
        ['GET', '/api/public/clients'],
        ['GET', `/api/public/offers/x/y`],
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

describe('POST /api/offers', () => {
  it('creates an offer and returns OfferDetail; seller defaults to me; logs CREATED', async () => {
    const res = await post(offerBody());
    expect(res.statusCode).toBe(201);
    const offer = res.json();
    expect(offer).toEqual({
      id: expect.any(String),
      clientId: clientA.id,
      clientName: 'Client A Oy',
      eventName: 'Event 1',
      eventDate: `${YEAR}-11-14`,
      venue: 'Venue X',
      city: 'City A',
      priceCents: 300000,
      sellerId: s.world.a.id,
      source: 'EMAIL',
      eventType: 'CORPORATE',
      disposition: 'PENDING',
      status: 'OPEN',
      expired: false,
      gigId: null,
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
      deletedAt: null,
      lineup: ['Vocals', 'Guitar'],
      includesText: null,
      showReferences: false,
      sharePath: expect.stringMatching(/^\/o\/[A-Za-z0-9_-]{43}$/),
      preview: {
        eventName: 'Event 1',
        clientName: 'Client A Oy',
        eventDate: `${YEAR}-11-14`,
        venue: 'Venue X',
        city: 'City A',
        lineup: ['Vocals', 'Guitar'],
        includesText: null,
        spotifyUrl: SPOTIFY_URL,
        references: null,
        seller: { name: 'Partner A', email: 'partner.a@example.com', phone: null },
      },
    });
    const events = await history(offer.id);
    expect(events).toEqual([
      { id: expect.any(String), offerId: offer.id, type: 'CREATED', partnerId: s.world.a.id, at: expect.any(String), details: {} },
    ]);
  });

  it('defaults includesText from the settings; explicit values (and null) win', async () => {
    await setTextSetting(OFFER_SETTING_KEYS.defaultIncludes, 'Placeholder includes.\nLine 2.');
    const defaulted = await createOffer();
    expect(defaulted.includesText).toBe('Placeholder includes.\nLine 2.');
    const explicit = await createOffer({ eventName: 'Event 2', includesText: 'Own text' });
    expect(explicit).toMatchObject({ includesText: 'Own text' });
    const cleared = await createOffer({ eventName: 'Event 3', includesText: null });
    expect(cleared).toMatchObject({ includesText: null });
  });

  it('uses the fixed Spotify link: OfferDetail has no spotifyUrl, the preview always has the constant', async () => {
    // An old setting row from before TASK-022 is ignored.
    await setTextSetting('offers.default_spotify_url', 'https://example.com/old');
    const offer = await createOffer();
    expect(offer).not.toHaveProperty('spotifyUrl');
    expect(offer.preview.spotifyUrl).toBe(SPOTIFY_URL);
    expect((await call(s, 'GET', `/api/offers/${offer.id}`)).json().preview.spotifyUrl).toBe(SPOTIFY_URL);
  });

  it('only the four required fields are needed; optional ones default', async () => {
    const offer = await createOffer({
      city: undefined,
      lineup: undefined,
      priceCents: undefined,
      source: undefined,
      eventType: undefined,
    });
    expect(offer).toMatchObject({ city: null, lineup: [], priceCents: null, source: null, eventType: null, showReferences: false });
  });

  it('accepts another seller; lineup items are trimmed and blank ones dropped', async () => {
    const offer = await createOffer({ sellerId: s.world.b.id, lineup: ['  Vocals ', '', '   ', 'Bass'], showReferences: true });
    expect(offer).toMatchObject({ sellerId: s.world.b.id, lineup: ['Vocals', 'Bass'], showReferences: true });
  });

  it.each<[string, Record<string, unknown>, Record<string, string>]>([
    ['missing required fields', { clientId: undefined, eventName: undefined, eventDate: undefined, venue: undefined }, {
      clientId: 'REQUIRED',
      eventName: 'REQUIRED',
      eventDate: 'REQUIRED',
      venue: 'REQUIRED',
    }],
    ['blank texts', { eventName: '  ', venue: '' }, { eventName: 'REQUIRED', venue: 'REQUIRED' }],
    ['bad date', { eventDate: '2026-02-30' }, { eventDate: 'INVALID_DATE' }],
    ['negative price', { priceCents: -10000 }, { priceCents: 'NEGATIVE_AMOUNT' }],
    ['fractional price', { priceCents: 1000.5 }, { priceCents: 'INVALID_VALUE' }],
    ['bad enums', { source: 'FAX', eventType: 'PARTY' }, { source: 'INVALID_VALUE', eventType: 'INVALID_VALUE' }],
    ['a spotify link (fixed in code)', { spotifyUrl: 'https://open.spotify.com/x' }, { spotifyUrl: 'INVALID_VALUE' }],
    ['a null spotify link', { spotifyUrl: null }, { spotifyUrl: 'INVALID_VALUE' }],
    ['an empty spotify link', { spotifyUrl: '' }, { spotifyUrl: 'INVALID_VALUE' }],
    ['lineup not a list', { lineup: 'Vocals' }, { lineup: 'INVALID_VALUE' }],
    ['lineup with non-strings', { lineup: ['Vocals', 5] }, { lineup: 'INVALID_VALUE' }],
    ['lineup item too long', { lineup: ['x'.repeat(501)] }, { lineup: 'TOO_LONG' }],
    ['too many lineup items', { lineup: Array.from({ length: 101 }, (_, i) => `Item ${i}`) }, { lineup: 'INVALID_VALUE' }],
    ['showReferences not boolean', { showReferences: 'yes' }, { showReferences: 'INVALID_VALUE' }],
    ['event name too long', { eventName: 'x'.repeat(501) }, { eventName: 'TOO_LONG' }],
  ])('400 for %s', async (_name, overrides, fields) => {
    const res = await post(offerBody(overrides));
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual(validation(fields));
    expect(await testDb().offer.count()).toBe(0);
  });

  it('400 UNKNOWN_REFERENCE for unknown / malformed / deleted client and unknown seller', async () => {
    await testDb().client.update({ where: { id: clientB.id }, data: { deletedAt: new Date() } });
    for (const clientId of [UNKNOWN_ID, 'nope', clientB.id]) {
      const res = await post(offerBody({ clientId }));
      expect(res.statusCode).toBe(400);
      expect(res.json()).toEqual(validation({ clientId: 'UNKNOWN_REFERENCE' }));
    }
    const res = await post(offerBody({ sellerId: UNKNOWN_ID }));
    expect(res.json()).toEqual(validation({ sellerId: 'UNKNOWN_REFERENCE' }));
    expect(await testDb().offer.count()).toBe(0);
  });

  it('share tokens are 32 random bytes, base64url, unique; only their SHA-256 is used for lookup', async () => {
    const tokens = new Set<string>();
    for (let i = 0; i < 5; i++) {
      const offer = await createOffer({ eventName: `Event ${i}` });
      const token = offer.sharePath.slice('/o/'.length);
      expect(Buffer.from(token, 'base64url')).toHaveLength(32);
      tokens.add(token);
      const row = await testDb().offer.findUniqueOrThrow({ where: { id: offer.id } });
      expect(row.shareToken).toBe(token);
      expect(row.shareTokenHash).toBe(createHash('sha256').update(token).digest('hex'));
    }
    expect(tokens.size).toBe(5);
  });

  it('the database refuses short tokens', async () => {
    await expect(
      testDb().offer.create({
        data: {
          clientId: clientA.id,
          eventName: 'Event 1',
          eventDate: new Date('2026-01-01'),
          venue: 'Venue X',
          sellerId: s.world.a.id,
          shareToken: 'short',
          shareTokenHash: 'h',
        },
      }),
    ).rejects.toThrow();
  });
});

describe('GET /api/offers/{id}', () => {
  it('returns OfferDetail; 404 for unknown and malformed ids', async () => {
    const offer = await createOffer();
    const res = await get(offer.id);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual(offer);
    for (const id of [UNKNOWN_ID, 'nope']) {
      const missing = await get(id);
      expect(missing.statusCode).toBe(404);
      expect(missing.json().error.code).toBe('NOT_FOUND');
    }
  });

  it('preview includes the active references in order (line breaks kept) and the seller phone when enabled', async () => {
    const second = await testDb().reference.create({ data: { quoteFi: 'Viite 2', author: '— Person 2', sortOrder: 1 } });
    const first = await testDb().reference.create({
      data: { quoteFi: 'Viite 1\nRivi 2', quoteEn: 'Reference 1\nLine 2', author: '— Person 1', sortOrder: 0 },
    });
    await testDb().reference.create({ data: { quoteFi: 'Piilotettu', author: '— Person 3', sortOrder: 2, active: false } });
    await testDb().partner.update({ where: { id: s.world.a.id }, data: { phone: '+358 40 000 0001' } });
    const offer = await createOffer({ showReferences: true });
    expect(offer.preview.references).toEqual([
      { id: first.id, quote: { fi: 'Viite 1\nRivi 2', en: 'Reference 1\nLine 2' }, author: '— Person 1', imageUrl: null },
      { id: second.id, quote: { fi: 'Viite 2', en: null }, author: '— Person 2', imageUrl: null },
    ]);
    expect(offer.preview.seller).toEqual({ name: 'Partner A', email: 'partner.a@example.com', phone: '+358 40 000 0001' });
  });
});

describe('derived status (BR-102)', () => {
  it('status follows disposition; expired = OPEN and event date before today (Helsinki)', async () => {
    const today = todayIso();
    const yesterday = shiftDays(today, -1);
    const pastOpen = await createOffer({ eventName: 'Past', eventDate: yesterday });
    const todayOpen = await createOffer({ eventName: 'Today', eventDate: today });
    expect(pastOpen).toMatchObject({ status: 'OPEN', expired: true });
    expect(todayOpen).toMatchObject({ status: 'OPEN', expired: false });

    const cases: [string, string][] = [
      ['PENDING', 'OPEN'],
      ['WON', 'ACCEPTED'],
      ['CANCELLED', 'REJECTED'],
      ['NO_RESPONSE', 'REJECTED'],
      ['LOST_PRICE', 'REJECTED'],
      ['LOST_COMPETITOR', 'REJECTED'],
      ['LOST_OTHER', 'REJECTED'],
      ['NO_CAPACITY', 'REJECTED'],
    ];
    for (const [disposition, status] of cases) {
      const res = await patch(pastOpen.id, { disposition });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ disposition, status, expired: status === 'OPEN' });
    }
  });
});

describe('GET /api/offers', () => {
  it('needs a 4-digit year; malformed filters are 400', async () => {
    for (const [query, field, code] of [
      ['', 'year', 'REQUIRED'],
      ['year=26', 'year', 'INVALID_VALUE'],
      [`year=${YEAR}&status=MAYBE`, 'status', 'INVALID_VALUE'],
      [`year=${YEAR}&sellerId=nope`, 'sellerId', 'INVALID_VALUE'],
      [`year=${YEAR}&disposition=WHATEVER`, 'disposition', 'INVALID_VALUE'],
      [`year=${YEAR}&eventType=X`, 'eventType', 'INVALID_VALUE'],
      [`year=${YEAR}&source=X`, 'source', 'INVALID_VALUE'],
    ] as const) {
      const res = await list(query);
      expect(res.statusCode, query).toBe(400);
      expect(res.json()).toEqual(validation({ [field]: code }));
    }
  });

  it('lists non-deleted offers of the year by event date; filters and search', async () => {
    const o1 = await createOffer({ eventName: 'Event 1', eventDate: `${YEAR}-11-14`, city: 'City A' });
    const o2 = await createOffer({
      eventName: 'Event 2',
      eventDate: `${YEAR}-03-01`,
      clientId: clientB.id,
      city: null,
      venue: 'Venue Y',
      sellerId: s.world.b.id,
      source: 'WEBSITE',
      eventType: 'WEDDING',
    });
    const o3 = await createOffer({ eventName: 'Event 3', eventDate: `${YEAR}-06-01` });
    await patch(o3.id, { disposition: 'LOST_PRICE' });
    await createOffer({ eventName: 'Other year', eventDate: `${YEAR + 1}-01-01` });
    const deleted = await createOffer({ eventName: 'Deleted', eventDate: `${YEAR}-05-01` });
    await action(deleted.id, 'delete');

    const ids = async (query: string): Promise<string[]> =>
      (await list(`year=${YEAR}${query}`)).json<{ offers: { id: string }[] }>().offers.map((o) => o.id);
    expect(await ids('')).toEqual([o2.id, o3.id, o1.id]);
    expect(await ids('&status=OPEN')).toEqual([o2.id, o1.id]);
    expect(await ids('&status=REJECTED')).toEqual([o3.id]);
    expect(await ids('&status=ACCEPTED')).toEqual([]);
    expect(await ids(`&sellerId=${s.world.b.id}`)).toEqual([o2.id]);
    expect(await ids(`&sellerId=${UNKNOWN_ID}`)).toEqual([]);
    expect(await ids('&disposition=LOST_PRICE')).toEqual([o3.id]);
    expect(await ids('&eventType=WEDDING')).toEqual([o2.id]);
    expect(await ids('&source=WEBSITE')).toEqual([o2.id]);
    expect(await ids('&q=client%20b')).toEqual([o2.id]); // client name
    expect(await ids('&q=city%20a')).toEqual([o3.id, o1.id]); // city (both default City A)
    expect(await ids('&q=venue%20y')).toEqual([o2.id]); // venue
    expect(await ids('&q=EVENT%203')).toEqual([o3.id]); // event name
    expect(await ids('&deleted=true')).toEqual([deleted.id]);

    const item = (await list()).json().offers[0];
    // OfferSummary only: no detail fields, no token.
    expect(Object.keys(item).sort()).toEqual(
      [
        'id', 'clientId', 'clientName', 'eventName', 'eventDate', 'venue', 'city', 'priceCents', 'sellerId', 'source',
        'eventType', 'disposition', 'status', 'expired', 'gigId', 'createdAt', 'updatedAt', 'deletedAt',
      ].sort(),
    );
  });

  it('status=EXPIRED lists only open offers whose date has passed', async () => {
    const today = todayIso();
    const expired = await createOffer({ eventName: 'Expired', eventDate: shiftDays(today, -1) });
    await createOffer({ eventName: 'Future', eventDate: shiftDays(today, 1) });
    const lost = await createOffer({ eventName: 'Lost', eventDate: shiftDays(today, -1) });
    await patch(lost.id, { disposition: 'LOST_OTHER' });
    const res = await list(`year=${expired.eventDate.slice(0, 4)}&status=EXPIRED`);
    expect(res.json().offers.map((o: { id: string }) => o.id)).toEqual([expired.id]);
  });

  it('summary per BR-106: open non-expired value, win rate over decided (not PENDING / CANCELLED); ignores filters', async () => {
    const today = todayIso();
    const year = Number(today.slice(0, 4));
    // A date later this year when possible, else today (still not expired).
    const later = `${year}-12-31`;
    const earlier = `${year}-01-01` < today ? `${year}-01-01` : null;

    await createOffer({ eventName: 'Open 1', eventDate: later, priceCents: 300000 });
    await createOffer({ eventName: 'Open 2', eventDate: later, priceCents: 200000, sellerId: s.world.b.id });
    await createOffer({ eventName: 'Open no price', eventDate: later, priceCents: null });
    if (earlier) await createOffer({ eventName: 'Expired', eventDate: earlier, priceCents: 400000 });
    const won = await createOffer({ eventName: 'Won', eventDate: later, priceCents: 100000 });
    await patch(won.id, { disposition: 'WON' });
    const lost1 = await createOffer({ eventName: 'Lost 1', eventDate: later });
    await patch(lost1.id, { disposition: 'LOST_PRICE' });
    const lost2 = await createOffer({ eventName: 'Lost 2', eventDate: later });
    await patch(lost2.id, { disposition: 'NO_RESPONSE' });
    const cancelled = await createOffer({ eventName: 'Cancelled', eventDate: later });
    await patch(cancelled.id, { disposition: 'CANCELLED' });
    const deleted = await createOffer({ eventName: 'Deleted', eventDate: later, priceCents: 100000 });
    await patch(deleted.id, { disposition: 'WON' });
    await action(deleted.id, 'delete');
    await createOffer({ eventName: 'Next year', eventDate: `${year + 1}-06-01`, priceCents: 100000 });

    const expected = { openValueCents: 500000, winRatePct: 33.3, wonCount: 1, decidedCount: 3 };
    expect((await list(`year=${year}`)).json().summary).toEqual(expected);
    expect((await list(`year=${year}&sellerId=${s.world.b.id}&status=REJECTED&q=zzz`)).json().summary).toEqual(expected);
    expect((await list(`year=${year}&deleted=true`)).json().summary).toEqual(expected);
  });

  it('win rate is null when nothing is decided', async () => {
    await createOffer();
    const cancelled = await createOffer({ eventName: 'Cancelled' });
    await patch(cancelled.id, { disposition: 'CANCELLED' });
    expect((await list()).json().summary).toMatchObject({ winRatePct: null, wonCount: 0, decidedCount: 0 });
  });
});

describe('PATCH /api/offers/{id} (BR-103)', () => {
  it('updates every editable field and logs one UPDATED with old → new', async () => {
    const offer = await createOffer();
    const res = await patch(offer.id, {
      clientId: clientB.id,
      eventName: 'Event 2',
      eventDate: `${YEAR}-12-01`,
      venue: 'Venue Y',
      city: null,
      lineup: ['DJ'],
      includesText: 'Text',
      showReferences: true,
      priceCents: 200000,
      sellerId: s.world.b.id,
      source: null,
      eventType: 'WEDDING',
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      clientId: clientB.id,
      clientName: 'Client B ry',
      eventName: 'Event 2',
      eventDate: `${YEAR}-12-01`,
      venue: 'Venue Y',
      city: null,
      lineup: ['DJ'],
      includesText: 'Text',
      showReferences: true,
      priceCents: 200000,
      sellerId: s.world.b.id,
      source: null,
      eventType: 'WEDDING',
      disposition: 'PENDING',
      sharePath: offer.sharePath,
    });
    const updated = (await history(offer.id))[0]!;
    expect(updated.type).toBe('UPDATED');
    expect(updated.details.changes).toEqual([
      { field: 'clientId', from: clientA.id, to: clientB.id },
      { field: 'eventName', from: 'Event 1', to: 'Event 2' },
      { field: 'eventDate', from: `${YEAR}-11-14`, to: `${YEAR}-12-01` },
      { field: 'venue', from: 'Venue X', to: 'Venue Y' },
      { field: 'city', from: 'City A', to: null },
      { field: 'lineup', from: ['Vocals', 'Guitar'], to: ['DJ'] },
      { field: 'includesText', from: null, to: 'Text' },
      { field: 'showReferences', from: false, to: true },
      { field: 'priceCents', from: 300000, to: 200000 },
      { field: 'sellerId', from: s.world.a.id, to: s.world.b.id },
      { field: 'source', from: 'EMAIL', to: null },
      { field: 'eventType', from: 'CORPORATE', to: 'WEDDING' },
    ]);
  });

  it('disposition changes log DISPOSITION_CHANGED old → new (separately from other fields)', async () => {
    const offer = await createOffer();
    await patch(offer.id, { disposition: 'NO_RESPONSE' });
    await patch(offer.id, { disposition: 'PENDING', venue: 'Venue Z' });
    const events = await history(offer.id);
    expect(events.map((e) => [e.type, e.details])).toEqual([
      ['DISPOSITION_CHANGED', { from: 'NO_RESPONSE', to: 'PENDING' }],
      ['UPDATED', { changes: [{ field: 'venue', from: 'Venue X', to: 'Venue Z' }] }],
      ['DISPOSITION_CHANGED', { from: 'PENDING', to: 'NO_RESPONSE' }],
      ['CREATED', {}],
    ]);
    expect(events.every((e) => e.partnerId === s.world.a.id)).toBe(true);
  });

  it('a no-op request writes no event', async () => {
    const offer = await createOffer();
    const res = await patch(offer.id, { venue: 'Venue X', disposition: 'PENDING', lineup: ['Vocals', ' Guitar '] });
    expect(res.statusCode).toBe(200);
    expect(await history(offer.id)).toHaveLength(1);
  });

  it('validation, existence and state errors', async () => {
    const offer = await createOffer();
    expect((await patch(offer.id, { clientId: null })).json()).toEqual(validation({ clientId: 'REQUIRED' }));
    expect((await patch(offer.id, { eventName: '' })).json()).toEqual(validation({ eventName: 'REQUIRED' }));
    expect((await patch(offer.id, { disposition: 'MAYBE' })).json()).toEqual(validation({ disposition: 'INVALID_VALUE' }));
    expect((await patch(offer.id, { disposition: null })).json()).toEqual(validation({ disposition: 'REQUIRED' }));
    expect((await patch(offer.id, { clientId: UNKNOWN_ID })).json()).toEqual(validation({ clientId: 'UNKNOWN_REFERENCE' }));
    expect((await patch(offer.id, { sellerId: UNKNOWN_ID })).json()).toEqual(validation({ sellerId: 'UNKNOWN_REFERENCE' }));
    // The Spotify link is fixed in code (TASK-022): any value, null included, is rejected; nothing changes.
    for (const spotifyUrl of ['https://open.spotify.com/x', null, '']) {
      const res = await patch(offer.id, { venue: 'Venue Y', spotifyUrl });
      expect(res.statusCode).toBe(400);
      expect(res.json()).toEqual(validation({ spotifyUrl: 'INVALID_VALUE' }));
    }
    expect((await call(s, 'GET', `/api/offers/${offer.id}`)).json().venue).toBe('Venue X');
    expect((await patch(UNKNOWN_ID, { venue: 'Venue Y' })).statusCode).toBe(404);

    await action(offer.id, 'delete');
    const res = await patch(offer.id, { venue: 'Venue Y' });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('INVALID_STATUS_TRANSITION');
  });
});

describe('POST /api/offers/{id}/regenerate-link (BR-104)', () => {
  it('issues a new token, invalidates the old link and logs LINK_REGENERATED without the token', async () => {
    const offer = await createOffer();
    expect((await publicGet(offer.sharePath)).statusCode).toBe(200);

    const res = await action(offer.id, 'regenerate-link');
    expect(res.statusCode).toBe(200);
    const updated = res.json();
    expect(updated.sharePath).toMatch(/^\/o\/[A-Za-z0-9_-]{43}$/);
    expect(updated.sharePath).not.toBe(offer.sharePath);

    expect((await publicGet(offer.sharePath)).statusCode).toBe(404);
    expect((await publicGet(updated.sharePath)).statusCode).toBe(200);

    const [event] = await history(offer.id);
    expect(event).toMatchObject({ type: 'LINK_REGENERATED', details: {} });
    const historyText = JSON.stringify(await history(offer.id));
    expect(historyText).not.toContain(offer.sharePath.slice(3));
    expect(historyText).not.toContain(updated.sharePath.slice(3));
  });

  it('404 unknown, 409 deleted', async () => {
    expect((await action(UNKNOWN_ID, 'regenerate-link')).statusCode).toBe(404);
    const offer = await createOffer();
    await action(offer.id, 'delete');
    expect((await action(offer.id, 'regenerate-link')).statusCode).toBe(409);
  });
});

describe('POST /api/offers/{id}/convert (BR-105)', () => {
  it('creates the gig per BR-105, links it, sets WON and logs both sides', async () => {
    const offer = await createOffer({ sellerId: s.world.b.id });
    const res = await action(offer.id, 'convert');
    expect(res.statusCode).toBe(201);
    const { offer: converted, gig } = res.json();

    expect(gig).toMatchObject({
      startDate: `${YEAR}-11-14`,
      endDate: null,
      status: 'SOLD',
      lineupTemplateId: null,
      lineupName: 'Event 1',
      venue: 'Venue X, City A',
      clientId: clientA.id,
      clientName: 'Client A Oy',
      offerId: offer.id,
      priceCents: 300000,
      sellerId: s.world.b.id,
      producerId: s.world.b.id,
    });
    expect(gig.costLines.map((l: { type: string; personId: string | null }) => [l.type, l.personId])).toEqual([
      ['OFFICE', null],
      ['SALES', s.world.b.personId],
      ['PRODUCTION', s.world.b.personId],
    ]);
    expect(converted).toMatchObject({ id: offer.id, gigId: gig.id, disposition: 'WON', status: 'ACCEPTED' });

    const events = await history(offer.id);
    expect(events.map((e) => [e.type, e.details])).toEqual([
      ['CONVERTED', { gigId: gig.id }],
      ['DISPOSITION_CHANGED', { from: 'PENDING', to: 'WON' }],
      ['CREATED', {}],
    ]);
    const gigEvents = (await call(s, 'GET', `/api/gigs/${gig.id}/history`)).json();
    expect(gigEvents.map((e: { type: string }) => e.type)).toEqual(['CREATED']);

    // The gig counts in the year like any gig, and every gig response carries offerId.
    const gigs = (await call(s, 'GET', `/api/gigs?year=${YEAR}`)).json().gigs;
    expect(gigs.find((g: Json) => g.id === gig.id)).toMatchObject({ offerId: offer.id });
    expect((await call(s, 'GET', `/api/gigs/${gig.id}`)).json().offerId).toBe(offer.id);
  });

  it('price 0 when empty; venue without city; an already WON offer logs no disposition change', async () => {
    const offer = await createOffer({ priceCents: null, city: null });
    await patch(offer.id, { disposition: 'WON' });
    const { gig } = (await action(offer.id, 'convert')).json();
    expect(gig).toMatchObject({ priceCents: 0, venue: 'Venue X' });
    expect((await history(offer.id)).map((e) => e.type)).toEqual(['CONVERTED', 'DISPOSITION_CHANGED', 'CREATED']);
  });

  it('a second request is 409 ALREADY_CONVERTED and creates no gig', async () => {
    const offer = await createOffer();
    expect((await action(offer.id, 'convert')).statusCode).toBe(201);
    const res = await action(offer.id, 'convert');
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('ALREADY_CONVERTED');
    expect(await testDb().gig.count()).toBe(1);
  });

  it('is idempotent under concurrent requests: exactly one gig, the rest 409', async () => {
    const offer = await createOffer();
    const results = await Promise.all(Array.from({ length: 8 }, () => action(offer.id, 'convert')));
    const codes = results.map((r) => r.statusCode).sort();
    expect(codes.filter((c) => c === 201)).toHaveLength(1);
    expect(codes.filter((c) => c === 409)).toHaveLength(7);
    for (const r of results.filter((x) => x.statusCode === 409)) expect(r.json().error.code).toBe('ALREADY_CONVERTED');
    expect(await testDb().gig.count({ where: { offerId: offer.id } })).toBe(1);
    expect((await history(offer.id)).filter((e) => e.type === 'CONVERTED')).toHaveLength(1);
  });

  it('the database allows at most one gig per offer', async () => {
    const offer = await createOffer();
    const { gig } = (await action(offer.id, 'convert')).json();
    const row = await testDb().gig.findUniqueOrThrow({ where: { id: gig.id } });
    await expect(
      testDb().gig.create({
        data: {
          startDate: row.startDate,
          lineupName: 'Copy',
          venue: 'Venue X',
          sellerId: row.sellerId,
          producerId: row.producerId,
          priceCents: 0,
          offerId: offer.id,
        },
      }),
    ).rejects.toThrow();
  });

  it('404 unknown; 409 deleted offer; still ALREADY_CONVERTED after the gig is deleted', async () => {
    expect((await action(UNKNOWN_ID, 'convert')).statusCode).toBe(404);
    const deleted = await createOffer({ eventName: 'Deleted' });
    await action(deleted.id, 'delete');
    const res = await action(deleted.id, 'convert');
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('INVALID_STATUS_TRANSITION');

    const offer = await createOffer();
    const { gig } = (await action(offer.id, 'convert')).json();
    await call(s, 'POST', `/api/gigs/${gig.id}/delete`, { reason: 'Test' });
    expect((await action(offer.id, 'convert')).json().error.code).toBe('ALREADY_CONVERTED');
  });
});

describe('GET /api/offers/{id}/gig-draft (BR-105)', () => {
  const draft = (id: string) => call(s, 'GET', `/api/offers/${id}/gig-draft`);

  it('returns the BR-105 prefill as a GigCreate', async () => {
    const offer = await createOffer({ sellerId: s.world.b.id });
    const res = await draft(offer.id);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      startDate: `${YEAR}-11-14`,
      endDate: null,
      lineupTemplateId: null,
      lineupName: 'Event 1',
      venue: 'Venue X, City A',
      technicalSetup: null,
      logistics: null,
      houseTechnician: false,
      sellerId: s.world.b.id,
      producerId: s.world.b.id,
      priceCents: 300000,
      additionalSalesCents: 0,
      additionalSalesDescription: null,
      notes: null,
      clientId: clientA.id,
    });
    // Reading the draft changes nothing.
    expect(await testDb().gig.count()).toBe(0);
    expect((await history(offer.id)).map((e) => e.type)).toEqual(['CREATED']);
  });

  it('price 0 when empty; venue without city', async () => {
    const offer = await createOffer({ priceCents: null, city: null });
    expect((await draft(offer.id)).json()).toMatchObject({ priceCents: 0, venue: 'Venue X' });
  });

  it('an inactive seller falls back to the caller as seller and producer (BR-111)', async () => {
    const offer = await createOffer({ sellerId: s.world.c.id });
    await testDb().partner.update({ where: { id: s.world.c.id }, data: { active: false } });
    expect((await draft(offer.id)).json()).toMatchObject({ sellerId: s.world.a.id, producerId: s.world.a.id });
  });

  it("clientId null when the offer's client is deleted; that draft converts cleanly", async () => {
    const offer = await createOffer();
    await testDb().client.update({ where: { id: clientA.id }, data: { deletedAt: new Date() } });
    const body = (await draft(offer.id)).json();
    expect(body).toMatchObject({ clientId: null, lineupName: 'Event 1' });
    const res = await call(s, 'POST', `/api/offers/${offer.id}/convert`, body);
    expect(res.statusCode).toBe(201);
    expect(res.json().gig).toMatchObject({ clientId: null, offerId: offer.id });
  });

  it('404 unknown; 409 deleted; 409 already converted', async () => {
    expect((await draft(UNKNOWN_ID)).statusCode).toBe(404);
    expect((await draft('not-a-uuid')).statusCode).toBe(404);

    const deleted = await createOffer({ eventName: 'Deleted' });
    await action(deleted.id, 'delete');
    const del = await draft(deleted.id);
    expect(del.statusCode).toBe(409);
    expect(del.json().error.code).toBe('INVALID_STATUS_TRANSITION');

    const offer = await createOffer();
    await action(offer.id, 'convert');
    const conv = await draft(offer.id);
    expect(conv.statusCode).toBe(409);
    expect(conv.json().error.code).toBe('ALREADY_CONVERTED');
  });

  it('needs a session', async () => {
    const res = await s.app.inject({ method: 'GET', url: `/api/offers/${UNKNOWN_ID}/gig-draft` });
    expect(res.statusCode).toBe(401);
  });
});

describe('POST /api/offers/{id}/convert with an edited GigCreate', () => {
  const convert = (id: string, body: unknown) => call(s, 'POST', `/api/offers/${id}/convert`, body);
  const draftOf = async (id: string) =>
    (await call(s, 'GET', `/api/offers/${id}/gig-draft`)).json<Record<string, unknown>>();

  it('the unchanged draft gives the same gig as no body', async () => {
    const offer = await createOffer({ sellerId: s.world.b.id });
    const res = await convert(offer.id, await draftOf(offer.id));
    expect(res.statusCode).toBe(201);
    expect(res.json().gig).toMatchObject({
      startDate: `${YEAR}-11-14`,
      lineupTemplateId: null,
      lineupName: 'Event 1',
      venue: 'Venue X, City A',
      clientId: clientA.id,
      offerId: offer.id,
      priceCents: 300000,
      sellerId: s.world.b.id,
      producerId: s.world.b.id,
    });
  });

  it('creates the gig from the body (overrides), with BR-020/021 cost lines, link, WON and logs', async () => {
    const offer = await createOffer({ sellerId: s.world.b.id });
    const body = {
      ...(await draftOf(offer.id)),
      startDate: `${YEAR}-11-15`,
      endDate: `${YEAR}-11-16`,
      lineupTemplateId: s.world.templateA.id,
      lineupName: null,
      venue: 'Venue Y',
      technicalSetup: 'SET_A',
      logistics: 'OWN_VAN',
      houseTechnician: true,
      sellerId: s.world.a.id,
      producerId: s.world.c.id,
      priceCents: 200000,
      additionalSalesCents: 10000,
      additionalSalesDescription: 'Extra 1',
      notes: 'Note 1',
      clientId: clientB.id,
    };
    const res = await convert(offer.id, body);
    expect(res.statusCode).toBe(201);
    const { offer: converted, gig } = res.json();
    expect(gig).toMatchObject({
      startDate: `${YEAR}-11-15`,
      endDate: `${YEAR}-11-16`,
      lineupTemplateId: s.world.templateA.id,
      lineupName: 'Template A',
      venue: 'Venue Y',
      technicalSetup: 'SET_A',
      logistics: 'OWN_VAN',
      houseTechnician: true,
      sellerId: s.world.a.id,
      producerId: s.world.c.id,
      priceCents: 200000,
      additionalSalesCents: 10000,
      additionalSalesDescription: 'Extra 1',
      notes: 'Note 1',
      clientId: clientB.id,
      offerId: offer.id,
    });
    expect(gig.costLines.map((l: { type: string; personId: string | null }) => [l.type, l.personId])).toEqual([
      ['VOC', null],
      ['BASS', null],
      ['OFFICE', null],
      ['SALES', s.world.a.personId],
      ['PRODUCTION', s.world.c.personId],
    ]);
    expect(converted).toMatchObject({ id: offer.id, gigId: gig.id, disposition: 'WON', status: 'ACCEPTED' });
    // The offer itself is not changed by the edited gig.
    expect(converted).toMatchObject({ clientId: clientA.id, sellerId: s.world.b.id, venue: 'Venue X' });

    expect((await history(offer.id)).map((e) => [e.type, e.details])).toEqual([
      ['CONVERTED', { gigId: gig.id }],
      ['DISPOSITION_CHANGED', { from: 'PENDING', to: 'WON' }],
      ['CREATED', {}],
    ]);
    const gigEvents = (await call(s, 'GET', `/api/gigs/${gig.id}/history`)).json();
    expect(gigEvents.map((e: { type: string; partnerId: string }) => [e.type, e.partnerId])).toEqual([['CREATED', s.world.a.id]]);
  });

  it('clientId null is allowed (as in POST /api/gigs)', async () => {
    const offer = await createOffer();
    const res = await convert(offer.id, { ...(await draftOf(offer.id)), clientId: null });
    expect(res.statusCode).toBe(201);
    expect(res.json().gig).toMatchObject({ clientId: null, offerId: offer.id });
  });

  it('400 with the same field errors as POST /api/gigs; nothing is created or logged', async () => {
    const offer = await createOffer({ sellerId: s.world.b.id });
    const base = await draftOf(offer.id);
    await testDb().partner.update({ where: { id: s.world.c.id }, data: { active: false } });
    const cases: [Record<string, unknown>, Record<string, string>][] = [
      [{ lineupName: null }, { lineupName: 'REQUIRED' }],
      [{ venue: '  ' }, { venue: 'REQUIRED' }],
      [{ priceCents: -1 }, { priceCents: 'NEGATIVE_AMOUNT' }],
      [{ startDate: `${YEAR}-02-30` }, { startDate: 'INVALID_DATE' }],
      [{ endDate: `${YEAR}-11-13` }, { endDate: 'END_BEFORE_START' }],
      [{ lineupTemplateId: UNKNOWN_ID }, { lineupTemplateId: 'UNKNOWN_REFERENCE' }],
      [{ sellerId: s.world.c.id, producerId: UNKNOWN_ID }, { sellerId: 'UNKNOWN_REFERENCE', producerId: 'UNKNOWN_REFERENCE' }],
      [{ clientId: UNKNOWN_ID }, { clientId: 'UNKNOWN_REFERENCE' }],
      [{ technicalSetup: 'NOPE' }, { technicalSetup: 'INVALID_VALUE' }],
    ];
    for (const [override, fields] of cases) {
      const body = { ...base, ...override };
      const res = await convert(offer.id, body);
      expect(res.statusCode, JSON.stringify(override)).toBe(400);
      expect(res.json(), JSON.stringify(override)).toEqual(validation(fields));
      // Same answer as POST /api/gigs for the same body.
      const viaGigs = await call(s, 'POST', '/api/gigs', body);
      expect(viaGigs.json(), JSON.stringify(override)).toEqual(res.json());
    }
    const missing = await convert(offer.id, {});
    expect(missing.statusCode).toBe(400);
    expect(missing.json().error.fields).toMatchObject({ startDate: 'REQUIRED', venue: 'REQUIRED', priceCents: 'REQUIRED' });

    expect(await testDb().gig.count()).toBe(0);
    const after = (await get(offer.id)).json();
    expect(after).toMatchObject({ gigId: null, disposition: 'PENDING' });
    expect((await history(offer.id)).map((e) => e.type)).toEqual(['CREATED']);
  });

  it('409 ALREADY_CONVERTED / INVALID_STATUS_TRANSITION take precedence over the body', async () => {
    const offer = await createOffer();
    const body = await draftOf(offer.id);
    expect((await convert(offer.id, body)).statusCode).toBe(201);
    const again = await convert(offer.id, body);
    expect(again.statusCode).toBe(409);
    expect(again.json().error.code).toBe('ALREADY_CONVERTED');

    const deleted = await createOffer({ eventName: 'Deleted' });
    await action(deleted.id, 'delete');
    const del = await convert(deleted.id, body);
    expect(del.statusCode).toBe(409);
    expect(del.json().error.code).toBe('INVALID_STATUS_TRANSITION');
    expect((await convert(UNKNOWN_ID, body)).statusCode).toBe(404);
    expect(await testDb().gig.count()).toBe(1);
  });

  it('is still one gig per offer under concurrent requests with a body', async () => {
    const offer = await createOffer();
    const body = await draftOf(offer.id);
    const results = await Promise.all(Array.from({ length: 8 }, () => convert(offer.id, body)));
    const codes = results.map((r) => r.statusCode);
    expect(codes.filter((c) => c === 201)).toHaveLength(1);
    expect(codes.filter((c) => c === 409)).toHaveLength(7);
    for (const r of results.filter((x) => x.statusCode === 409)) expect(r.json().error.code).toBe('ALREADY_CONVERTED');
    expect(await testDb().gig.count({ where: { offerId: offer.id } })).toBe(1);
    expect((await history(offer.id)).filter((e) => e.type === 'CONVERTED')).toHaveLength(1);
  });
});

describe('delete / restore / history', () => {
  it('soft-deletes and restores with history; state errors are 409', async () => {
    const offer = await createOffer();
    const del = await action(offer.id, 'delete');
    expect(del.statusCode).toBe(204);
    expect((await get(offer.id)).json().deletedAt).not.toBeNull();
    expect((await action(offer.id, 'delete')).statusCode).toBe(409);
    expect((await publicGet(offer.sharePath)).statusCode).toBe(404);

    const restored = await action(offer.id, 'restore');
    expect(restored.statusCode).toBe(200);
    expect(restored.json()).toMatchObject({ id: offer.id, deletedAt: null });
    expect((await action(offer.id, 'restore')).statusCode).toBe(409);
    expect((await publicGet(offer.sharePath)).statusCode).toBe(200);

    expect((await history(offer.id)).map((e) => e.type)).toEqual(['RESTORED', 'DELETED', 'CREATED']);
    expect((await action(UNKNOWN_ID, 'delete')).statusCode).toBe(404);
    expect((await action(UNKNOWN_ID, 'restore')).statusCode).toBe(404);
    expect((await call(s, 'GET', `/api/offers/${UNKNOWN_ID}/history`)).statusCode).toBe(404);
  });
});

describe('clients and offers', () => {
  it('clients count and list their non-deleted offers', async () => {
    const o1 = await createOffer({ eventName: 'Event 1', eventDate: `${YEAR}-03-01` });
    const o2 = await createOffer({ eventName: 'Event 2', eventDate: `${YEAR + 1}-03-01` });
    const deleted = await createOffer({ eventName: 'Deleted' });
    await action(deleted.id, 'delete');

    const clients = (await call(s, 'GET', '/api/clients')).json();
    expect(clients.find((c: Json) => c.id === clientA.id)).toMatchObject({ offerCount: 2 });
    expect(clients.find((c: Json) => c.id === clientB.id)).toMatchObject({ offerCount: 0 });

    const detail = (await call(s, 'GET', `/api/clients/${clientA.id}`)).json();
    expect(detail.offers.map((o: { id: string }) => o.id)).toEqual([o2.id, o1.id]); // newest first
    expect(detail.offers[0]).not.toHaveProperty('sharePath');
  });

  it('a client with offers (deleted ones too) cannot be deleted', async () => {
    const offer = await createOffer({ clientId: clientB.id });
    let res = await call(s, 'DELETE', `/api/clients/${clientB.id}`);
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('CLIENT_IN_USE');
    await action(offer.id, 'delete');
    res = await call(s, 'DELETE', `/api/clients/${clientB.id}`);
    expect(res.statusCode).toBe(409);
  });

  it('a client deleted while an offer is being created is never linked (no race)', async () => {
    const results = await Promise.all([post(offerBody({ clientId: clientB.id })), call(s, 'DELETE', `/api/clients/${clientB.id}`)]);
    const [created, deleted] = results;
    // Either the offer won (client delete refused) or the delete won (offer refused) — never both.
    expect([created.statusCode, deleted.statusCode].sort()).toEqual(
      created.statusCode === 201 ? [201, 409] : [204, 400],
    );
    const client = await testDb().client.findUniqueOrThrow({ where: { id: clientB.id } });
    const offers = await testDb().offer.count({ where: { clientId: clientB.id } });
    expect(client.deletedAt !== null && offers > 0).toBe(false);
  });
});
