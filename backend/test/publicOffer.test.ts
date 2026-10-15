/**
 * Public offer endpoint (UC-030, BR-104, BR-108): no session, exact whitelist, no internal data,
 * uniform 404s, noindex, rate limit; token-scoped reference photos. Synthetic data only; money is
 * multiples of 10000 cents.
 */
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FixedWindowRateLimiter } from '../src/http/rateLimit.js';
import { SPOTIFY_URL } from '../src/offers/constants.js';
import { PUBLIC_OFFER_RATE_LIMIT } from '../src/routes/publicOffers.js';
import { closeTestDb, resetDb, testDb } from './helpers.js';
import { call, startSession, UNKNOWN_ID, type Json, type Session } from './gigFixtures.js';
import { createReference, JPG, PNG, uploadImage } from './referenceFixtures.js';

let s: Session;
let offer: Json;
let token: string;
let uploadDir: string;
/** Active, with photo (PNG) and EN quote. */
let withImage: Json;
/** Active, no photo, no EN quote. */
let noImage: Json;
/** Inactive, with photo. */
let inactive: Json;

/** A distinctive price so any leak is easy to spot in the raw response text. */
const PRICE = 1230000;

beforeEach(async () => {
  await resetDb();
  uploadDir = await mkdtemp(path.join(os.tmpdir(), 'instaglamour-test-public-'));
  s = await startSession({ config: { uploadDir } });
  await testDb().partner.update({ where: { id: s.world.a.id }, data: { phone: '+358 40 000 0001' } });
  withImage = await createReference(s, { quoteFi: 'Viite 1\nRivi 2', quoteEn: 'Reference 1\nLine 2', author: '— Person 1' });
  noImage = await createReference(s, { quoteFi: 'Viite 2', author: '— Person 2' });
  inactive = await createReference(s, { quoteFi: 'Viite 3', author: '— Person 3', active: false });
  expect((await uploadImage(s, withImage.id, PNG)).statusCode).toBe(200);
  expect((await uploadImage(s, inactive.id, JPG, { filename: 'p.jpg', contentType: 'image/jpeg' })).statusCode).toBe(200);
  const client = await testDb().client.create({ data: { name: 'Client A Oy', notes: 'Internal client notes' } });
  const res = await call(s, 'POST', '/api/offers', {
    clientId: client.id,
    eventName: 'Event 1',
    eventDate: '2026-11-14',
    venue: 'Venue X',
    city: 'City A',
    lineup: ['Vocals', 'Guitar'],
    includesText: 'Included 1\nIncluded 2',
    showReferences: true,
    priceCents: PRICE,
    source: 'INSTAGRAM',
    eventType: 'WEDDING',
  });
  offer = res.json();
  await call(s, 'PATCH', `/api/offers/${offer.id}`, { disposition: 'NO_CAPACITY' });
  token = offer.sharePath.slice('/o/'.length);
  withImageUrl = await versionedUrl(token, withImage.id as string);
});
afterEach(async () => {
  await s.app.close();
  await rm(uploadDir, { recursive: true, force: true });
});
afterAll(closeTestDb);

/** Anonymous request: no cookie at all. */
const anon = (t: string, remoteAddress = '10.0.0.1', headers: Record<string, string> = {}) =>
  s.app.inject({ method: 'GET', url: `/api/public/offers/${t}`, remoteAddress, headers });

/** The photo route without `?v=`. */
const imageUrl = (t: string, id: string) => `/api/public/offers/${t}/references/${id}/image`;
/** Current imageVersion of a reference (upload time in epoch ms). */
const versionOf = async (id: string) => String((await testDb().reference.findUniqueOrThrow({ where: { id } })).imageUploadedAt!.getTime());
/** The versioned photo URL the API hands out. */
const versionedUrl = async (t: string, id: string) => `${imageUrl(t, id)}?v=${await versionOf(id)}`;
/** withImage's URL on `token`, set in beforeEach. */
let withImageUrl: string;

const expected = () => ({
  eventName: 'Event 1',
  clientName: 'Client A Oy',
  eventDate: '2026-11-14',
  venue: 'Venue X',
  city: 'City A',
  lineup: ['Vocals', 'Guitar'],
  includesText: 'Included 1\nIncluded 2',
  spotifyUrl: SPOTIFY_URL,
  references: [
    { id: withImage.id, quote: { fi: 'Viite 1\nRivi 2', en: 'Reference 1\nLine 2' }, author: '— Person 1', imageUrl: withImageUrl },
    { id: noImage.id, quote: { fi: 'Viite 2', en: null }, author: '— Person 2', imageUrl: null },
  ],
  seller: { name: 'Partner A', email: 'partner.a@example.com', phone: '+358 40 000 0001' },
});

/** Every key path in a JSON value, e.g. "seller.name". */
function keyPaths(value: unknown, prefix = ''): string[] {
  if (Array.isArray(value)) return value.flatMap((v) => keyPaths(v, prefix));
  if (value && typeof value === 'object')
    return Object.entries(value).flatMap(([k, v]) => [`${prefix}${k}`, ...keyPaths(v, `${prefix}${k}.`)]);
  return [];
}

describe('GET /api/public/offers/{token}', () => {
  it('works without a session and returns exactly the whitelisted fields', async () => {
    const res = await anon(token);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toStrictEqual(expected());
    expect([...new Set(keyPaths(res.json()))].sort()).toEqual(
      [
        'eventName', 'clientName', 'eventDate', 'venue', 'city', 'lineup', 'includesText', 'spotifyUrl', 'references',
        'references.id', 'references.quote', 'references.quote.fi', 'references.quote.en', 'references.author',
        'references.imageUrl', 'seller', 'seller.name', 'seller.email', 'seller.phone',
      ].sort(),
    );
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it('never exposes price, disposition, source, event type, gig, notes, ids or the token', async () => {
    // Convert so the offer also has a gig, then look again.
    await call(s, 'POST', `/api/offers/${offer.id}/convert`);
    const res = await anon(token);
    expect(res.statusCode).toBe(200);
    // Reference ids and the token-scoped photo URLs are public by contract (BR-108); check the rest.
    const json = res.json();
    for (const r of json.references) expect(r.imageUrl === null || r.imageUrl === (await versionedUrl(token, r.id as string))).toBe(true);
    const body = JSON.stringify({ ...json, references: json.references.map((r: Record<string, unknown>) => ({ ...r, id: null, imageUrl: null })) });
    const internal = [
      String(PRICE),
      'priceCents',
      'price',
      'disposition',
      'NO_CAPACITY',
      'WON',
      'ACCEPTED',
      'status',
      'INSTAGRAM',
      'WEDDING',
      'source',
      'eventType',
      'gigId',
      'gig',
      'notes',
      'Internal client notes',
      'sharePath',
      'showReferences',
      'deletedAt',
      'createdAt',
      offer.id,
      offer.clientId,
      s.world.a.id,
      s.world.a.personId,
      token,
      'hasImage',
      'sortOrder',
      'active',
      'Viite 3', // inactive reference
      inactive.id,
    ];
    for (const needle of internal) expect(body, needle).not.toContain(needle);
    // No id-shaped value anywhere.
    expect(body).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  });

  it('always returns the fixed Spotify link, ignoring an old per-offer value in the database', async () => {
    await testDb().offer.update({ where: { id: offer.id as string }, data: { spotifyUrl: 'https://example.com/old' } });
    expect((await anon(token)).json().spotifyUrl).toBe(SPOTIFY_URL);
    const detail = (await call(s, 'GET', `/api/offers/${offer.id}`)).json();
    expect(detail.preview.spotifyUrl).toBe(SPOTIFY_URL);
    expect(detail).not.toHaveProperty('spotifyUrl');
  });

  it('OfferDetail.preview deep-equals the public response', async () => {
    const detail = (await call(s, 'GET', `/api/offers/${offer.id}`)).json();
    expect(detail.preview).toStrictEqual((await anon(token)).json());

    // Also without references and with empty optional fields.
    const cleared = await call(s, 'PATCH', `/api/offers/${offer.id}`, { showReferences: false, city: null, includesText: null });
    expect(cleared.statusCode).toBe(200);
    await testDb().partner.update({ where: { id: s.world.a.id }, data: { phone: null } });
    const pub = (await anon(token)).json();
    // The Spotify link is fixed in code (TASK-022), never empty.
    expect(pub).toMatchObject({ references: null, city: null, includesText: null, spotifyUrl: SPOTIFY_URL, seller: { phone: null } });
    expect((await call(s, 'GET', `/api/offers/${offer.id}`)).json().preview).toStrictEqual(pub);

    // After a link regeneration the preview's photo URLs use the new token, like the public page.
    await call(s, 'PATCH', `/api/offers/${offer.id}`, { showReferences: true });
    const fresh = (await call(s, 'POST', `/api/offers/${offer.id}/regenerate-link`)).json();
    const freshToken = fresh.sharePath.slice(3);
    expect(fresh.preview).toStrictEqual((await anon(freshToken)).json());
    expect(fresh.preview.references[0].imageUrl).toBe(await versionedUrl(freshToken, withImage.id as string));
  });

  it('references: active ones in sort order; [] when none are active; reorder and edits show up', async () => {
    await call(s, 'POST', '/api/references/reorder', { ids: [noImage.id, inactive.id, withImage.id] });
    expect((await anon(token)).json().references.map((r: Json) => r.id as string)).toEqual([noImage.id, withImage.id]);
    await call(s, 'PATCH', `/api/references/${inactive.id}`, { active: true });
    const refs = (await anon(token)).json().references;
    expect(refs.map((r: Json) => r.id as string)).toEqual([noImage.id, inactive.id, withImage.id]);
    expect(refs[1].imageUrl).toBe(await versionedUrl(token, inactive.id as string));
    for (const r of [withImage, noImage, inactive]) await call(s, 'PATCH', `/api/references/${r.id}`, { active: false });
    expect((await anon(token)).json().references).toEqual([]);
  });

  it('the old reference text settings are ignored', async () => {
    await testDb().setting.create({ data: { key: 'offers.references_fi', valueText: 'Old text' } });
    const res = await anon(token);
    expect(res.body).not.toContain('Old text');
    expect(res.json().references).toHaveLength(2);
  });

  it('unknown, malformed, regenerated and deleted tokens all give the same 404', async () => {
    const other = Buffer.alloc(32, 7).toString('base64url');
    const bodies: string[] = [];
    const check = async (t: string) => {
      const res = await anon(t);
      expect(res.statusCode, t).toBe(404);
      expect(res.headers['x-robots-tag']).toBe('noindex');
      bodies.push(res.body);
    };
    await check(other); // well-formed, unknown
    await check('abc'); // malformed
    await check(token.slice(0, -1)); // truncated
    await check(`${token}A`); // too long
    await check(token.toUpperCase() === token ? token.toLowerCase() : token.toUpperCase()); // case matters
    await check(encodeURIComponent("' OR 1=1 --"));

    await call(s, 'POST', `/api/offers/${offer.id}/regenerate-link`);
    await check(token); // regenerated

    const fresh = (await call(s, 'GET', `/api/offers/${offer.id}`)).json().sharePath.slice(3);
    expect((await anon(fresh)).statusCode).toBe(200);
    await call(s, 'POST', `/api/offers/${offer.id}/delete`);
    await check(fresh); // deleted

    expect(new Set(bodies).size).toBe(1);
    expect(JSON.parse(bodies[0]!)).toEqual({ error: { code: 'NOT_FOUND', message: 'Offer not found' } });
  });

  it('sends X-Robots-Tag: noindex and Cache-Control: no-store', async () => {
    const res = await anon(token);
    expect(res.headers['x-robots-tag']).toBe('noindex');
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('a session cookie is not needed and a bogus one does not matter', async () => {
    const res = await anon(token, '10.0.0.1', { cookie: 'ig_session=garbage' });
    expect(res.statusCode).toBe(200);
  });

  it(`rate limits to ${PUBLIC_OFFER_RATE_LIMIT} requests per minute per IP (429 RATE_LIMITED)`, async () => {
    for (let i = 0; i < PUBLIC_OFFER_RATE_LIMIT; i++) {
      const res = await anon(i % 2 === 0 ? token : 'nope', '10.0.0.9');
      expect(res.statusCode).not.toBe(429);
    }
    const limited = await anon(token, '10.0.0.9');
    expect(limited.statusCode).toBe(429);
    expect(limited.json()).toEqual({ error: { code: 'RATE_LIMITED', message: expect.any(String) } });
    expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);
    expect(limited.headers['x-robots-tag']).toBe('noindex');
    expect(limited.body).not.toContain('Event 1');
    // Another client is unaffected.
    expect((await anon(token, '10.0.0.10')).statusCode).toBe(200);
  });
});

describe('FixedWindowRateLimiter', () => {
  it('counts per key, resets each window and refuses new keys over the cap', () => {
    let now = 120_000;
    const limiter = new FixedWindowRateLimiter(2, 60_000, 3, () => now);
    expect(limiter.hit('a').allowed).toBe(true);
    expect(limiter.hit('a').allowed).toBe(true);
    expect(limiter.hit('a')).toEqual({ allowed: false, retryAfterSeconds: 60 });
    expect(limiter.hit('b').allowed).toBe(true);
    expect(limiter.hit('c').allowed).toBe(true);
    expect(limiter.hit('d').allowed).toBe(false); // cap of 3 keys
    now += 30_000;
    expect(limiter.hit('a').retryAfterSeconds).toBe(30);
    now += 30_000;
    expect(limiter.hit('a').allowed).toBe(true);
    expect(limiter.hit('d').allowed).toBe(true);
  });
});

describe('GET /api/public/offers/{token}/references/{id}/image (BR-108)', () => {
  const img = (t: string, id: string, remoteAddress = '10.0.1.1', headers: Record<string, string> = {}) =>
    s.app.inject({ method: 'GET', url: imageUrl(t, id), remoteAddress, headers });

  it('serves the photo without a session: type from content, noindex, private revalidating cache', async () => {
    const res = await img(token, withImage.id);
    expect(res.statusCode).toBe(200);
    expect(res.rawPayload).toEqual(PNG);
    expect(res.headers['content-type']).toBe('image/png');
    expect(res.headers['content-length']).toBe(String(PNG.length));
    expect(res.headers['x-robots-tag']).toBe('noindex');
    expect(res.headers['cache-control']).toBe('private, no-cache');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['referrer-policy']).toBe('no-referrer');
    expect(res.headers.etag).toBe(`"${await versionOf(withImage.id as string)}"`);
    expect(res.headers['set-cookie']).toBeUndefined();

    // Revalidation: same photo → 304 (still behind the access checks); a new photo → new ETag.
    const again = await img(token, withImage.id, '10.0.1.1', { 'if-none-match': res.headers.etag as string });
    expect(again.statusCode).toBe(304);
    expect(again.rawPayload).toHaveLength(0);
    await uploadImage(s, withImage.id, JPG, { filename: 'new.jpg', contentType: 'image/jpeg' });
    const replaced = await img(token, withImage.id, '10.0.1.1', { 'if-none-match': res.headers.etag as string });
    expect(replaced.statusCode).toBe(200);
    expect(replaced.headers['content-type']).toBe('image/jpeg');
    expect(replaced.rawPayload).toEqual(JPG);
  });

  it('versioned URLs (?v=) are cached long; stale/missing versions revalidate; other params are ignored', async () => {
    const get = (url: string) => s.app.inject({ method: 'GET', url, remoteAddress: '10.0.1.4' });
    const current = await get(withImageUrl);
    expect(current.statusCode).toBe(200);
    expect(current.headers['cache-control']).toBe('private, max-age=31536000, immutable');
    expect(current.rawPayload).toEqual(PNG);
    expect((await get(`${withImageUrl}&utm_source=x&foo`)).headers['cache-control']).toBe('private, max-age=31536000, immutable');
    expect((await get(`${imageUrl(token, withImage.id)}?foo=bar`)).headers['cache-control']).toBe('private, no-cache');

    // A new photo gets a new version and URL; the old URL still works but is no longer long-cached.
    await uploadImage(s, withImage.id, JPG, { filename: 'new.jpg', contentType: 'image/jpeg' });
    const newUrl = (await anon(token)).json().references[0].imageUrl as string;
    expect(newUrl).not.toBe(withImageUrl);
    expect(newUrl).toBe(await versionedUrl(token, withImage.id as string));
    const stale = await get(withImageUrl);
    expect(stale.statusCode).toBe(200);
    expect(stale.headers['cache-control']).toBe('private, no-cache');
    expect(stale.rawPayload).toEqual(JPG);
    expect((await get(newUrl)).headers['cache-control']).toBe('private, max-age=31536000, immutable');

    // A 404 is never cached, versioned URL or not.
    await call(s, 'PATCH', `/api/references/${withImage.id}`, { active: false });
    const gone = await get(newUrl);
    expect(gone.statusCode).toBe(404);
    expect(gone.headers['cache-control']).toBe('no-store');
  });

  it('any valid offer link that shows references can show any active photo', async () => {
    const other = await call(s, 'POST', '/api/offers', {
      clientId: offer.clientId,
      eventName: 'Event 2',
      eventDate: '2026-12-01',
      venue: 'Venue Y',
      showReferences: true,
    });
    const otherToken = other.json().sharePath.slice(3);
    expect((await img(otherToken, withImage.id)).statusCode).toBe(200);
  });

  it('returns the same 404 in every other case (and never the photo)', async () => {
    const bodies: string[] = [];
    const check = async (label: string, t: string, id: string, headers: Record<string, string> = {}) => {
      const res = await img(t, id, '10.0.1.2', headers);
      expect(res.statusCode, label).toBe(404);
      expect(res.headers['x-robots-tag'], label).toBe('noindex');
      expect(res.headers['cache-control'], label).toBe('no-store');
      expect(res.headers['content-type'], label).toMatch(/^application\/json/);
      expect(res.rawPayload.includes(PNG.subarray(0, 8)), label).toBe(false);
      bodies.push(res.body);
    };
    const wellFormedUnknown = Buffer.alloc(32, 7).toString('base64url');

    await check('unknown token', wellFormedUnknown, withImage.id);
    await check('malformed token', 'abc', withImage.id);
    await check('truncated token', token.slice(0, -1), withImage.id);
    await check('case-changed token', token.toUpperCase() === token ? token.toLowerCase() : token.toUpperCase(), withImage.id);
    await check('unknown reference', token, UNKNOWN_ID);
    await check('malformed reference id', token, 'nope');
    await check('reference without photo', token, noImage.id);
    await check('inactive reference', token, inactive.id);
    // A session does not open any of these either: the rules are the same for partners.
    await check('inactive reference with a session', token, inactive.id, { cookie: s.cookie });

    // File missing on disk.
    const stored = await testDb().reference.findUniqueOrThrow({ where: { id: withImage.id } });
    await rm(path.join(uploadDir, stored.imageStorageKey!));
    await check('photo file missing', token, withImage.id);
    await uploadImage(s, withImage.id, PNG);
    expect((await img(token, withImage.id)).statusCode).toBe(200);

    // Offer hides references.
    await call(s, 'PATCH', `/api/offers/${offer.id}`, { showReferences: false });
    await check('offer hides references', token, withImage.id);
    await call(s, 'PATCH', `/api/offers/${offer.id}`, { showReferences: true });
    expect((await img(token, withImage.id)).statusCode).toBe(200);

    // Photo removed.
    await call(s, 'DELETE', `/api/references/${withImage.id}/image`);
    await check('photo removed', token, withImage.id);
    await uploadImage(s, withImage.id, PNG);

    // Regenerated link: the old token stops working, the new one works.
    const fresh = (await call(s, 'POST', `/api/offers/${offer.id}/regenerate-link`)).json().sharePath.slice(3);
    await check('regenerated token', token, withImage.id);
    expect((await img(fresh, withImage.id)).statusCode).toBe(200);

    // Reference deleted.
    const extra = await createReference(s, { quoteFi: 'Viite 4', author: '— Person 4' });
    await uploadImage(s, extra.id, PNG);
    expect((await img(fresh, extra.id)).statusCode).toBe(200);
    await call(s, 'DELETE', `/api/references/${extra.id}`);
    await check('deleted reference', fresh, extra.id);

    // Deleted offer.
    await call(s, 'POST', `/api/offers/${offer.id}/delete`);
    await check('deleted offer', fresh, withImage.id);

    expect(new Set(bodies).size).toBe(1);
    expect(JSON.parse(bodies[0]!)).toEqual({ error: { code: 'NOT_FOUND', message: 'Not found' } });
  });

  it('only the exact photo route is public; neighbouring paths need a session', async () => {
    for (const url of [
      `/api/public/offers/${token}/references/${withImage.id}`,
      `/api/public/offers/${token}/references`,
      `/api/public/offers/${token}/references/${withImage.id}/image/x`,
      `/api/references/${withImage.id}/image`,
    ]) {
      const res = await s.app.inject({ method: 'GET', url, remoteAddress: '10.0.1.3' });
      expect(res.statusCode, url).toBe(401);
    }
    const put = await s.app.inject({ method: 'PUT', url: imageUrl(token, withImage.id), remoteAddress: '10.0.1.3' });
    expect(put.statusCode).toBe(401);
  });

  it(`rate limits to ${PUBLIC_OFFER_RATE_LIMIT} requests per minute per IP (429 RATE_LIMITED)`, async () => {
    for (let i = 0; i < PUBLIC_OFFER_RATE_LIMIT; i++) {
      const res = await img(i % 2 === 0 ? token : 'nope', withImage.id, '10.0.1.9');
      expect(res.statusCode).not.toBe(429);
    }
    const limited = await img(token, withImage.id, '10.0.1.9');
    expect(limited.statusCode).toBe(429);
    expect(limited.json()).toEqual({ error: { code: 'RATE_LIMITED', message: expect.any(String) } });
    expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);
    expect(limited.headers['x-robots-tag']).toBe('noindex');
    expect(limited.rawPayload.includes(PNG.subarray(0, 8))).toBe(false);
    // Photos have their own budget: the page itself still loads for this IP; other IPs are unaffected.
    expect((await anon(token, '10.0.1.9')).statusCode).toBe(200);
    expect((await img(token, withImage.id, '10.0.1.10')).statusCode).toBe(200);
  });
});
