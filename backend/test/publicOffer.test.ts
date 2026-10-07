/**
 * Public offer endpoint (UC-030, BR-104): no session, exact whitelist, no internal data,
 * uniform 404s, noindex, rate limit. Synthetic data only; money is multiples of 10000 cents.
 */
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { OFFER_SETTING_KEYS } from '../src/domain/enums.js';
import { FixedWindowRateLimiter } from '../src/http/rateLimit.js';
import { PUBLIC_OFFER_RATE_LIMIT } from '../src/routes/publicOffers.js';
import { closeTestDb, resetDb, testDb } from './helpers.js';
import { call, startSession, type Json, type Session } from './gigFixtures.js';

let s: Session;
let offer: Json;
let token: string;

/** A distinctive price so any leak is easy to spot in the raw response text. */
const PRICE = 1230000;

async function setTextSetting(key: string, valueText: string) {
  await testDb().setting.upsert({ where: { key }, create: { key, valueText }, update: { valueText, valueCents: null } });
}

beforeEach(async () => {
  await resetDb();
  s = await startSession();
  await testDb().partner.update({ where: { id: s.world.a.id }, data: { phone: '+358 40 000 0001' } });
  await setTextSetting(OFFER_SETTING_KEYS.referencesFi, 'Viite 1\nViite 2');
  await setTextSetting(OFFER_SETTING_KEYS.referencesEn, 'Reference 1\nReference 2');
  const client = await testDb().client.create({ data: { name: 'Client A Oy', notes: 'Internal client notes' } });
  const res = await call(s, 'POST', '/api/offers', {
    clientId: client.id,
    eventName: 'Event 1',
    eventDate: '2026-11-14',
    venue: 'Venue X',
    city: 'City A',
    lineup: ['Vocals', 'Guitar'],
    includesText: 'Included 1\nIncluded 2',
    spotifyUrl: 'https://open.spotify.com/',
    showReferences: true,
    priceCents: PRICE,
    source: 'INSTAGRAM',
    eventType: 'WEDDING',
  });
  offer = res.json();
  await call(s, 'PATCH', `/api/offers/${offer.id}`, { disposition: 'NO_CAPACITY' });
  token = offer.sharePath.slice('/o/'.length);
});
afterEach(async () => {
  await s.app.close();
});
afterAll(closeTestDb);

/** Anonymous request: no cookie at all. */
const anon = (t: string, remoteAddress = '10.0.0.1', headers: Record<string, string> = {}) =>
  s.app.inject({ method: 'GET', url: `/api/public/offers/${t}`, remoteAddress, headers });

const EXPECTED = {
  eventName: 'Event 1',
  clientName: 'Client A Oy',
  eventDate: '2026-11-14',
  venue: 'Venue X',
  city: 'City A',
  lineup: ['Vocals', 'Guitar'],
  includesText: 'Included 1\nIncluded 2',
  spotifyUrl: 'https://open.spotify.com/',
  references: { fi: 'Viite 1\nViite 2', en: 'Reference 1\nReference 2' },
  seller: { name: 'Partner A', email: 'partner.a@example.com', phone: '+358 40 000 0001' },
};

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
    expect(res.json()).toStrictEqual(EXPECTED);
    expect(keyPaths(res.json()).sort()).toEqual(
      [
        'eventName', 'clientName', 'eventDate', 'venue', 'city', 'lineup', 'includesText', 'spotifyUrl', 'references',
        'references.fi', 'references.en', 'seller', 'seller.name', 'seller.email', 'seller.phone',
      ].sort(),
    );
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it('never exposes price, disposition, source, event type, gig, notes, ids or the token', async () => {
    // Convert so the offer also has a gig, then look again.
    await call(s, 'POST', `/api/offers/${offer.id}/convert`);
    const res = await anon(token);
    expect(res.statusCode).toBe(200);
    const body = res.body;
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
    ];
    for (const needle of internal) expect(body, needle).not.toContain(needle);
    // No id-shaped value anywhere.
    expect(body).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  });

  it('OfferDetail.preview deep-equals the public response', async () => {
    const detail = (await call(s, 'GET', `/api/offers/${offer.id}`)).json();
    expect(detail.preview).toStrictEqual((await anon(token)).json());

    // Also without references and with empty optional fields.
    await call(s, 'PATCH', `/api/offers/${offer.id}`, { showReferences: false, city: null, includesText: null, spotifyUrl: null });
    await testDb().partner.update({ where: { id: s.world.a.id }, data: { phone: null } });
    const pub = (await anon(token)).json();
    expect(pub).toMatchObject({ references: null, city: null, includesText: null, spotifyUrl: null, seller: { phone: null } });
    expect((await call(s, 'GET', `/api/offers/${offer.id}`)).json().preview).toStrictEqual(pub);
  });

  it('references texts default to empty strings when the settings are missing', async () => {
    await testDb().setting.deleteMany({ where: { key: { startsWith: 'offers.' } } });
    expect((await anon(token)).json().references).toEqual({ fi: '', en: '' });
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
