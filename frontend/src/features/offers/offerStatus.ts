import type { OfferSummary } from '../../api/types';
import { todayIso } from '../../lib/format';

/** Status as shown in the list: open, expired (open but past its date), accepted, rejected. */
export type OfferDisplayStatus = 'OPEN' | 'EXPIRED' | 'ACCEPTED' | 'REJECTED';
/** Order for sorting and for the status filter. */
export const OFFER_DISPLAY_STATUSES: OfferDisplayStatus[] = ['OPEN', 'EXPIRED', 'ACCEPTED', 'REJECTED'];

export function offerDisplayStatus(offer: Pick<OfferSummary, 'status' | 'expired'>): OfferDisplayStatus {
  if (offer.status === 'OPEN') return offer.expired ? 'EXPIRED' : 'OPEN';
  return offer.status;
}

/** Ties in the offer table (and the order without a sort): event date, then creation time. */
export function offerTieBreak(a: OfferSummary, b: OfferSummary): number {
  return a.eventDate.localeCompare(b.eventDate) || a.createdAt.localeCompare(b.createdAt);
}

/**
 * BR-109: an offer can be converted to an event only when it is accepted (disposition WON), its
 * event date is today or later (local date) and it has no event yet. The server checks the same
 * (409 OFFER_NOT_CONVERTIBLE / ALREADY_CONVERTED).
 */
export function canConvertOffer(
  offer: Pick<OfferSummary, 'status' | 'eventDate' | 'eventId'>,
  today: string = todayIso(),
): boolean {
  return offer.status === 'ACCEPTED' && offer.eventId === null && offer.eventDate >= today;
}
