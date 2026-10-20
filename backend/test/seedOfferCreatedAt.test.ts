/** Offer `createdAt` in the seed / import (TASK-028). Synthetic data only (BR-090). */
import path from 'node:path';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { loadSeed, readSeedFile } from '../seed/load.js';
import { validateSeed } from '../seed/schema.js';
import { closeTestDb, createPartner, login, resetDb, testApp, testDb } from './helpers.js';

const exampleSeedPath = path.resolve(import.meta.dirname, '../seed/seed.example.json');
type Doc = Record<string, unknown> & { offers: Record<string, unknown>[] };
const example = () => structuredClone(readSeedFile(exampleSeedPath)) as Doc;

/** The example offer "Event 2" (no createdAt in the example file). */
const event2 = (doc: Doc) => doc.offers.find((o) => o.eventName === 'Event 2')!;
const findOffer = (eventName: string) =>
  testDb().offer.findFirstOrThrow({ where: { eventName }, include: { client: true } });

beforeEach(resetDb);
afterAll(closeTestDb);

describe('validateSeed: offer createdAt (TASK-028)', () => {
  it.each([
    '2026-10-14T17:09:01.341414+00:00',
    '2026-10-14T17:09:01+03:00',
    '2026-10-14T17:09:01.5Z',
    '2020-01-01T00:00:00.000-05:00',
  ])('accepts %s', (createdAt) => {
    const doc = example();
    event2(doc).createdAt = createdAt;
    const result = validateSeed(doc);
    expect(result.ok ? [] : result.errors).toEqual([]);
  });

  it.each(['2026-10-14', '2026-10-14T17:09:01', '14.10.2026 17:09', 'yesterday', '2026-13-01T00:00:00Z', 12345])(
    'rejects %s',
    (createdAt) => {
      const doc = example();
      event2(doc).createdAt = createdAt;
      const result = validateSeed(doc);
      expect(result.ok).toBe(false);
      expect(result.ok ? [] : result.errors.filter((e) => e.startsWith('offers.1.createdAt'))).toHaveLength(1);
    },
  );

  it('rejects a time in the future', () => {
    const doc = example();
    event2(doc).createdAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const result = validateSeed(doc);
    expect(result.ok ? [] : result.errors).toEqual(['offers.1.createdAt: must not be in the future']);
  });
});

describe('loadSeed: offer createdAt (TASK-028)', () => {
  it('sets createdAt, updatedAt and the CREATED event time on insert; default is now', async () => {
    const doc = example();
    event2(doc).createdAt = '2026-10-14T17:09:01.341414+00:00';
    const before = Date.now();
    await loadSeed(testDb(), doc);

    const offer = await findOffer('Event 2');
    // Postgres keeps microseconds, JS Dates milliseconds.
    expect(offer.createdAt.toISOString()).toBe('2026-10-14T17:09:01.341Z');
    expect(offer.updatedAt.toISOString()).toBe('2026-10-14T17:09:01.341Z');
    const events = await testDb().offerEvent.findMany({ where: { offerId: offer.id } });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: 'CREATED', at: offer.createdAt });

    const other = await findOffer('Event 4'); // no createdAt in the file
    expect(other.createdAt.getTime()).toBeGreaterThanOrEqual(before - 1000);
    const otherEvent = await testDb().offerEvent.findFirstOrThrow({ where: { offerId: other.id, type: 'CREATED' } });
    expect(otherEvent.at.getTime()).toBe(other.createdAt.getTime());
  });

  it('a converted offer keeps its original creation event before the conversion', async () => {
    const doc = example();
    const converted = doc.offers.find((o) => o.converted === true)!;
    converted.createdAt = '2026-01-02T03:04:05+02:00';
    await loadSeed(testDb(), doc);
    const offer = await findOffer(converted.eventName as string);
    expect(offer.createdAt.toISOString()).toBe('2026-01-02T01:04:05.000Z');
    const events = await testDb().offerEvent.findMany({ where: { offerId: offer.id }, orderBy: { seq: 'asc' } });
    // Conversion events (disposition → WON, CONVERTED) happen at load time, after the creation.
    expect(events[0]).toMatchObject({ type: 'CREATED', at: new Date('2026-01-02T01:04:05.000Z') });
    expect(events.map((e) => e.type)).toContain('CONVERTED');
    for (const e of events.slice(1)) expect(e.at.getTime()).toBeGreaterThan(events[0]!.at.getTime());
  });

  it('a re-import never changes an existing offer', async () => {
    await loadSeed(testDb(), example());
    const offer = await findOffer('Event 2');
    const events = await testDb().offerEvent.findMany({ where: { offerId: offer.id } });

    const doc = example();
    event2(doc).createdAt = '2024-05-05T12:00:00Z';
    const summary = await loadSeed(testDb(), doc);
    expect(summary.offers.created).toBe(0);

    const again = await findOffer('Event 2');
    expect(again.createdAt).toEqual(offer.createdAt);
    expect(again.updatedAt).toEqual(offer.updatedAt);
    expect(await testDb().offerEvent.findMany({ where: { offerId: offer.id } })).toEqual(events);
  });

  it('the offer year stays its event date, not createdAt', async () => {
    const app = await testApp();
    await createPartner('Partner A', 'partner.a@example.com');
    const cookie = await login(app, 'partner.a@example.com');
    const doc = example();
    event2(doc).createdAt = '2025-03-01T09:00:00+02:00'; // event date is in 2026
    await loadSeed(testDb(), doc);

    const list = async (year: number) => {
      const res = await app.inject({ method: 'GET', url: `/api/offers?year=${year}`, headers: { cookie } });
      expect(res.statusCode).toBe(200);
      return res.json<{ offers: { eventName: string }[] }>().offers.map((o) => o.eventName);
    };
    expect(await list(2026)).toContain('Event 2');
    expect(await list(2025)).not.toContain('Event 2');

    const offer = await findOffer('Event 2');
    const history = await app.inject({ method: 'GET', url: `/api/offers/${offer.id}/history`, headers: { cookie } });
    expect(history.json()).toEqual([expect.objectContaining({ type: 'CREATED', at: '2025-03-01T07:00:00.000Z' })]);
    await app.close();
  });
});
