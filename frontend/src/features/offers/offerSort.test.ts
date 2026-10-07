import { describe, expect, it } from 'vitest';
import type { OfferSummary } from '../../api/types';
import { nextSort, offerDisplayStatus, sortOffers, type SortLabels } from './offerSort';

const base: OfferSummary = {
  id: 'o',
  clientId: 'c',
  clientName: 'Client A',
  eventName: 'Event',
  eventDate: '2030-06-01',
  venue: 'Venue X',
  city: null,
  priceCents: 100000,
  sellerId: 'p',
  source: null,
  eventType: null,
  disposition: 'PENDING',
  status: 'OPEN',
  expired: false,
  gigId: null,
  createdAt: '2030-01-01T10:00:00.000Z',
  updatedAt: '2030-01-01T10:00:00.000Z',
  deletedAt: null,
};
const offer = (o: Partial<OfferSummary>): OfferSummary => ({ ...base, ...o });
const labels: SortLabels = {
  seller: () => 'Partner A',
  source: (o) => o.source,
  eventType: (o) => o.eventType,
  disposition: (o) => o.disposition,
};
const ids = (list: OfferSummary[]) => list.map((o) => o.id);

describe('offer sort (UC-028 Excel-style table)', () => {
  const a = offer({ id: 'a', eventName: 'Event 10', eventDate: '2030-03-01', priceCents: 300 });
  const b = offer({ id: 'b', eventName: 'Event 2', eventDate: '2030-01-01', priceCents: null });
  const c = offer({ id: 'c', eventName: 'event 1', eventDate: '2030-02-01', priceCents: 100 });

  it('sorts text naturally and case-insensitively, both directions', () => {
    expect(ids(sortOffers([a, b, c], 'event', 'asc', labels))).toEqual(['c', 'b', 'a']);
    expect(ids(sortOffers([a, b, c], 'event', 'desc', labels))).toEqual(['a', 'b', 'c']);
  });

  it('keeps empty values last in both directions', () => {
    expect(ids(sortOffers([a, b, c], 'price', 'asc', labels))).toEqual(['c', 'a', 'b']);
    expect(ids(sortOffers([a, b, c], 'price', 'desc', labels))).toEqual(['a', 'c', 'b']);
  });

  it('breaks ties by event date', () => {
    expect(ids(sortOffers([a, b, c], 'seller', 'asc', labels))).toEqual(['b', 'c', 'a']);
  });

  it('orders status open, expired, accepted, rejected', () => {
    const won = offer({ id: 'won', status: 'ACCEPTED', disposition: 'WON' });
    const lost = offer({ id: 'lost', status: 'REJECTED', disposition: 'LOST_PRICE' });
    const expired = offer({ id: 'exp', expired: true });
    const open = offer({ id: 'open' });
    expect(ids(sortOffers([lost, won, expired, open], 'status', 'asc', labels))).toEqual([
      'open',
      'exp',
      'won',
      'lost',
    ]);
    expect(offerDisplayStatus(expired)).toBe('EXPIRED');
  });

  it('flips the direction on the same column and starts a new column ascending', () => {
    expect(nextSort({ key: 'eventDate', dir: 'asc' }, 'eventDate')).toEqual({ key: 'eventDate', dir: 'desc' });
    expect(nextSort({ key: 'eventDate', dir: 'desc' }, 'price')).toEqual({ key: 'price', dir: 'asc' });
  });
});
