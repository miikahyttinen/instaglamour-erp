import type { OfferSummary } from '../../api/types';

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
