// Synthetic offers for UI tests (BR-090), written straight into the mock backend (db.offers).
import type { OfferSummary } from '../api/types';
import { db } from '../mocks/data';
import { createOffer, toOfferSummary, type MockOffer, type NewOfferInput } from '../mocks/offerStore';
import { TEST_YEAR } from './gigFixtures';

/**
 * Creates an offer (logged as created by Partner A) in TEST_YEAR. Status and expired are derived
 * from `disposition` and `eventDate` like the real backend (BR-102).
 */
export function addMockOffer(overrides: Partial<NewOfferInput> & { clientId: string }): MockOffer {
  const partnerA = db.partners[0]!;
  return createOffer(
    db.offers,
    {
      eventName: 'Event 1',
      eventDate: `${TEST_YEAR}-06-01`,
      venue: 'Venue X',
      city: null,
      lineup: ['Line 1', 'Line 2'],
      includesText: 'Included 1',
      spotifyUrl: null,
      showReferences: false,
      priceCents: 100000,
      sellerId: partnerA.id,
      source: null,
      eventType: null,
      ...overrides,
    },
    partnerA.id,
  );
}

/** The summary the API would return for a mock offer. */
export function offerSummaryOf(offer: MockOffer): OfferSummary {
  return toOfferSummary(offer, { clients: db.gigs.clients, partners: db.partners });
}
