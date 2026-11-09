import { describe, expect, it } from 'vitest';
import type { OfferSummary } from '../../api/types';
import { canConvertOffer, offerDisplayStatus, offerTieBreak } from './offerStatus';

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
  followUpDone: false,
  eventId: null,
  createdAt: '2030-01-01T10:00:00.000Z',
  updatedAt: '2030-01-01T10:00:00.000Z',
  deletedAt: null,
};
const offer = (o: Partial<OfferSummary>): OfferSummary => ({ ...base, ...o });

describe('offer display status', () => {
  it('shows open offers past their date as expired', () => {
    expect(offerDisplayStatus(offer({}))).toBe('OPEN');
    expect(offerDisplayStatus(offer({ expired: true }))).toBe('EXPIRED');
    expect(offerDisplayStatus(offer({ status: 'ACCEPTED' }))).toBe('ACCEPTED');
    expect(offerDisplayStatus(offer({ status: 'REJECTED' }))).toBe('REJECTED');
  });

  it('breaks ties by event date, then creation time', () => {
    const a = offer({ eventDate: '2030-02-01' });
    const b = offer({ eventDate: '2030-01-01' });
    const c = offer({ eventDate: '2030-01-01', createdAt: '2029-12-01T00:00:00.000Z' });
    expect([a, b, c].sort(offerTieBreak)).toEqual([c, b, a]);
  });
});

describe('canConvertOffer (BR-109)', () => {
  const today = '2030-06-01';
  it('needs an accepted offer dated today or later without an event', () => {
    expect(canConvertOffer(offer({ status: 'ACCEPTED', eventDate: today }), today)).toBe(true);
    expect(canConvertOffer(offer({ status: 'ACCEPTED', eventDate: '2030-06-02' }), today)).toBe(true);
    expect(canConvertOffer(offer({ status: 'ACCEPTED', eventDate: '2030-05-31' }), today)).toBe(false);
    expect(canConvertOffer(offer({ status: 'OPEN', eventDate: today }), today)).toBe(false);
    expect(canConvertOffer(offer({ status: 'REJECTED', eventDate: today }), today)).toBe(false);
    expect(canConvertOffer(offer({ status: 'ACCEPTED', eventDate: today, eventId: 'g' }), today)).toBe(false);
  });
});
