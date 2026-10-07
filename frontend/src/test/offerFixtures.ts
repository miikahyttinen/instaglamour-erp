// Synthetic offer summaries for client tests (BR-090). Test-only helper.
import type { OfferSummary } from '../api/types';
import { db } from '../mocks/data';
import { mockId } from '../mocks/gigStore';
import { TEST_YEAR } from './gigFixtures';

export function mockOffer(overrides: Partial<OfferSummary> & { clientId: string }): OfferSummary {
  const ts = new Date().toISOString();
  return {
    id: mockId(),
    clientName: db.gigs.clients.find((c) => c.id === overrides.clientId)?.name ?? '',
    eventName: 'Event 1',
    eventDate: `${TEST_YEAR}-06-01`,
    venue: 'Venue X',
    city: null,
    priceCents: 100000,
    sellerId: db.partners[0]!.id,
    source: null,
    eventType: null,
    disposition: 'PENDING',
    status: 'OPEN',
    expired: false,
    gigId: null,
    createdAt: ts,
    updatedAt: ts,
    deletedAt: null,
    ...overrides,
  };
}
