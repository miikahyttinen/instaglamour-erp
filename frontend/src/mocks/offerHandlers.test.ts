import { beforeEach, describe, expect, it } from 'vitest';
import { ApiError } from '../api/client';
import { eventsApi, offersApi, publicOffersApi } from '../api/endpoints';
import { addMockClient, TEST_YEAR } from '../test/eventFixtures';
import { addMockOffer } from '../test/offerFixtures';
import { signInMock } from '../test/renderApp';
import type { OfferCreate, OfferUpdate } from '../api/types';
import { db } from './data';
import { DEMO_OFFER_TOKEN } from './offerSeed';
import { MOCK_SPOTIFY_URL } from './offerStore';
import { todayIso } from '../lib/format';

const tokenOf = (sharePath: string) => sharePath.replace('/o/', '');

async function expectApiError(promise: Promise<unknown>, status: number, code: string) {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(ApiError);
  expect((error as ApiError).status).toBe(status);
  expect((error as ApiError).code).toBe(code);
  return error as ApiError;
}

describe('offers mock (contract → Offers, BR-102…BR-106)', () => {
  let clientId: string;
  beforeEach(() => {
    signInMock();
    clientId = addMockClient('Client X').id;
  });

  it('summary: open value of open, unexpired offers; win rate = won / decided (BR-106)', async () => {
    addMockOffer({ clientId, priceCents: 100000 });
    addMockOffer({ clientId, priceCents: 50000 });
    addMockOffer({ clientId, priceCents: 70000, disposition: 'WON' });
    addMockOffer({ clientId, priceCents: 90000, disposition: 'LOST_PRICE' });
    addMockOffer({ clientId, priceCents: 90000, disposition: 'NO_RESPONSE' });
    addMockOffer({ clientId, priceCents: 90000, disposition: 'CANCELLED' }); // not decided
    addMockOffer({ clientId, priceCents: 10000, eventDate: `${TEST_YEAR + 1}-01-01` }); // other year
    const { summary, offers } = await offersApi.list({ year: TEST_YEAR, status: 'ACCEPTED' });
    expect(offers).toHaveLength(1); // filters apply to rows only
    expect(summary).toEqual({ openValueCents: 150000, winRatePct: 33.3, wonCount: 1, decidedCount: 3 });
  });

  it('status filter: OPEN includes expired, EXPIRED = open and past (BR-102)', async () => {
    const past = addMockOffer({ clientId, eventName: 'Past', eventDate: '2020-05-01' });
    addMockOffer({ clientId, eventName: 'Past won', eventDate: '2020-05-02', disposition: 'WON' });
    const list = await offersApi.list({ year: 2020, status: 'EXPIRED' });
    expect(list.offers.map((o) => o.id)).toEqual([past.id]);
    expect(list.offers[0]).toMatchObject({ status: 'OPEN', expired: true });
    expect((await offersApi.list({ year: 2020, status: 'OPEN' })).offers).toHaveLength(1);
    expect(list.summary.openValueCents).toBe(0);
  });

  it('create applies setting defaults only when the fields are omitted', async () => {
    const withDefaults = await offersApi.create({ clientId, eventName: 'E', eventDate: `${TEST_YEAR}-05-05`, venue: 'V' });
    expect(withDefaults.includesText).toBe(db.offers.settings.defaultIncludes);
    expect(withDefaults).not.toHaveProperty('spotifyUrl');
    expect(withDefaults.preview.spotifyUrl).toBe(MOCK_SPOTIFY_URL);
    expect(withDefaults.sellerId).toBe(db.partners[0]!.id);
    const none = await offersApi.create({
      clientId,
      eventName: 'E',
      eventDate: `${TEST_YEAR}-05-05`,
      venue: 'V',
      includesText: '',
      lineup: [' A ', '', 'B'],
    });
    expect(none).toMatchObject({ includesText: null, lineup: ['A', 'B'] });
    const error = await expectApiError(
      offersApi.create({
        clientId: '',
        eventName: ' ',
        eventDate: '',
        venue: 'V',
        spotifyUrl: 'https://example.com/other',
      } as OfferCreate),
      400,
      'VALIDATION_ERROR',
    );
    expect(error.fields).toEqual({
      clientId: 'REQUIRED',
      eventName: 'REQUIRED',
      eventDate: 'REQUIRED',
      spotifyUrl: 'INVALID_VALUE',
    });
  });

  it('PATCH with spotifyUrl is refused: the link is fixed (contract 2026-10-15)', async () => {
    const offer = addMockOffer({ clientId });
    const error = await expectApiError(
      offersApi.update(offer.id, { spotifyUrl: 'https://example.com/other' } as OfferUpdate),
      400,
      'VALIDATION_ERROR',
    );
    expect(error.fields).toEqual({ spotifyUrl: 'INVALID_VALUE' });
    const fetched = await offersApi.get(offer.id);
    expect(fetched).not.toHaveProperty('spotifyUrl');
    expect(fetched.preview.spotifyUrl).toBe(MOCK_SPOTIFY_URL);
    expect((await publicOffersApi.get(tokenOf(fetched.sharePath))).spotifyUrl).toBe(MOCK_SPOTIFY_URL);
  });

  it('preview equals the public offer; regenerating the link makes the old token 404 (BR-104)', async () => {
    const offer = await offersApi.create({
      clientId,
      eventName: 'E',
      eventDate: `${TEST_YEAR}-05-05`,
      venue: 'V',
      showReferences: true,
      priceCents: 123400,
    });
    const oldToken = tokenOf(offer.sharePath);
    const pub = await publicOffersApi.get(oldToken);
    expect(pub).toEqual(offer.preview);
    expect(JSON.stringify(pub)).not.toContain('1234');
    const regenerated = await offersApi.regenerateLink(offer.id);
    expect(regenerated.sharePath).not.toBe(offer.sharePath);
    expect(tokenOf(regenerated.sharePath).length).toBeGreaterThanOrEqual(43);
    await expectApiError(publicOffersApi.get(oldToken), 404, 'NOT_FOUND');
    expect((await publicOffersApi.get(tokenOf(regenerated.sharePath))).eventName).toBe('E');
  });

  it('convert creates the event per BR-105, sets WON and refuses a second time (UC-031)', async () => {
    const offer = addMockOffer({
      clientId,
      city: 'City Y',
      priceCents: null,
      sellerId: db.partners[1]!.id,
      disposition: 'WON',
    });
    const { offer: converted, event } = await offersApi.convert(offer.id);
    expect(converted).toMatchObject({ disposition: 'WON', status: 'ACCEPTED', eventId: event.id });
    expect(event).toMatchObject({
      startDate: offer.eventDate,
      venue: 'Venue X, City Y',
      lineupName: 'Event 1',
      lineupTemplateId: null,
      clientId,
      priceCents: 0,
      sellerId: db.partners[1]!.id,
      producerId: db.partners[1]!.id,
      offerId: offer.id,
    });
    expect((await eventsApi.history(event.id)).map((e) => e.type)).toEqual(['CREATED']);
    // Already WON (BR-109), so converting logs no disposition change.
    expect((await offersApi.history(offer.id)).map((e) => e.type)).toEqual(['CONVERTED', 'CREATED']);
    await expectApiError(offersApi.convert(offer.id), 409, 'ALREADY_CONVERTED');
    expect(db.events.events.filter((g) => g.offerId === offer.id)).toHaveLength(1);
  });

  it('event-draft prefills per BR-105, falls back to the caller for an inactive seller, 409s', async () => {
    const offer = addMockOffer({
      clientId,
      city: 'City Y',
      priceCents: 50000,
      sellerId: db.partners[1]!.id,
      disposition: 'WON',
    });
    expect(await offersApi.eventDraft(offer.id)).toMatchObject({
      startDate: offer.eventDate,
      venue: 'Venue X, City Y',
      lineupName: 'Event 1',
      lineupTemplateId: null,
      clientId,
      priceCents: 50000,
      sellerId: db.partners[1]!.id,
      producerId: db.partners[1]!.id,
    });
    db.partners[1]!.active = false;
    const draft = await offersApi.eventDraft(offer.id);
    expect(draft.sellerId).toBe(db.partners[0]!.id);
    expect(draft.producerId).toBe(db.partners[0]!.id);
    await offersApi.convert(offer.id);
    await expectApiError(offersApi.eventDraft(offer.id), 409, 'ALREADY_CONVERTED');
    const deleted = addMockOffer({ clientId });
    await offersApi.delete(deleted.id);
    await expectApiError(offersApi.eventDraft(deleted.id), 409, 'INVALID_STATUS_TRANSITION');
  });

  it('convert with a body creates the event from the body and validates it like POST /api/events', async () => {
    const offer = addMockOffer({ clientId, priceCents: 50000, disposition: 'WON' });
    const draft = await offersApi.eventDraft(offer.id);
    await expectApiError(offersApi.convert(offer.id, { ...draft, venue: ' ' }), 400, 'VALIDATION_ERROR');
    expect((await offersApi.get(offer.id)).eventId).toBeNull();
    const { offer: converted, event } = await offersApi.convert(offer.id, {
      ...draft,
      venue: 'Venue Q',
      lineupName: 'Edited',
      priceCents: 70000,
    });
    expect(event).toMatchObject({ venue: 'Venue Q', lineupName: 'Edited', priceCents: 70000, offerId: offer.id });
    expect(converted).toMatchObject({ disposition: 'WON', eventId: event.id });
  });

  it('only accepted offers dated today or later can be converted (BR-109)', async () => {
    const today = todayIso();
    const blocked = [
      addMockOffer({ clientId }), // pending
      addMockOffer({ clientId, disposition: 'LOST_PRICE' }),
      addMockOffer({ clientId, disposition: 'NO_RESPONSE' }),
      addMockOffer({ clientId, disposition: 'WON', eventDate: '2020-05-02' }), // past
    ];
    for (const offer of blocked) {
      await expectApiError(offersApi.eventDraft(offer.id), 409, 'OFFER_NOT_CONVERTIBLE');
      await expectApiError(offersApi.convert(offer.id), 409, 'OFFER_NOT_CONVERTIBLE');
      expect((await offersApi.get(offer.id)).eventId).toBeNull();
    }
    const todays = addMockOffer({ clientId, disposition: 'WON', eventDate: today });
    expect((await offersApi.eventDraft(todays.id)).startDate).toBe(today);
    const { event } = await offersApi.convert(todays.id);
    expect(event.offerId).toBe(todays.id);
    // ALREADY_CONVERTED is checked first, even once the date has passed.
    db.offers.offers.find((o) => o.id === todays.id)!.eventDate = '2020-01-01';
    await expectApiError(offersApi.convert(todays.id), 409, 'ALREADY_CONVERTED');
    await expectApiError(offersApi.eventDraft(todays.id), 409, 'ALREADY_CONVERTED');
  });

  it('a deleted offer is read-only and its link is gone; restore brings both back', async () => {
    const offer = addMockOffer({ clientId });
    await offersApi.delete(offer.id);
    await expectApiError(offersApi.update(offer.id, { venue: 'Y' }), 409, 'INVALID_STATUS_TRANSITION');
    await expectApiError(offersApi.convert(offer.id), 409, 'INVALID_STATUS_TRANSITION');
    await expectApiError(offersApi.regenerateLink(offer.id), 409, 'INVALID_STATUS_TRANSITION');
    await expectApiError(offersApi.delete(offer.id), 409, 'INVALID_STATUS_TRANSITION');
    await expectApiError(publicOffersApi.get(offer.shareToken), 404, 'NOT_FOUND');
    expect((await offersApi.get(offer.id)).deletedAt).not.toBeNull();
    expect((await offersApi.list({ year: TEST_YEAR, deleted: true })).offers.map((o) => o.id)).toEqual([offer.id]);
    await offersApi.restore(offer.id);
    expect((await publicOffersApi.get(offer.shareToken)).eventName).toBe('Event 1');
  });

  it('logs field changes as UPDATED and disposition as DISPOSITION_CHANGED; no-ops log nothing', async () => {
    const offer = addMockOffer({ clientId });
    await offersApi.update(offer.id, { venue: 'Venue Y', disposition: 'LOST_OTHER' });
    await offersApi.update(offer.id, { venue: 'Venue Y' });
    const history = await offersApi.history(offer.id);
    expect(history.map((e) => e.type)).toEqual(['UPDATED', 'DISPOSITION_CHANGED', 'CREATED']);
    expect(history[0]!.details.changes).toEqual([{ field: 'venue', from: 'Venue X', to: 'Venue Y' }]);
    expect(history[1]!.details).toEqual({ from: 'PENDING', to: 'LOST_OTHER' });
  });

  it('year is optional: all years, newest created first; stats default to the current year (contract)', async () => {
    db.offers.offers.length = 0;
    const old = addMockOffer({ clientId, eventName: 'Old', eventDate: `${TEST_YEAR - 4}-01-01` });
    old.createdAt = `${TEST_YEAR - 5}-01-15T10:00:00.000Z`;
    const later = addMockOffer({ clientId, eventName: 'Later', eventDate: `${TEST_YEAR + 1}-01-01` });
    later.createdAt = `${TEST_YEAR - 1}-01-15T10:00:00.000Z`;
    expect((await offersApi.list({})).offers.map((o) => o.eventName)).toEqual(['Later', 'Old']);
    // With a year: that year only.
    expect((await offersApi.list({ year: TEST_YEAR + 1 })).offers.map((o) => o.eventName)).toEqual(['Later']);

    const year = Number(todayIso().slice(0, 4));
    const stats = await offersApi.stats();
    const range = [-3, -2, -1, 0, 1, 2].map((i) => year + i);
    expect(stats.averageByCreatedYear.map((y) => y.year)).toEqual(range);
    expect(stats.byEventYear.map((y) => y.year)).toEqual(range);
    expect(stats.openValueByEventYear.map((y) => y.year)).toEqual(range);
    await expectApiError(offersApi.list({ year: 12 }), 400, 'VALIDATION_ERROR');
  });

  it('serves the seeded demo link', async () => {
    expect((await publicOffersApi.get(DEMO_OFFER_TOKEN)).eventName).toBe('Summer Party X');
  });
});
