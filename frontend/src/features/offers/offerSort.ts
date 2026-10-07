import type { OfferSummary } from '../../api/types';

/** Sortable columns of the offer list (UC-028: every column). */
export const OFFER_SORT_KEYS = [
  'event',
  'client',
  'place',
  'eventDate',
  'created',
  'price',
  'status',
  'seller',
  'source',
  'eventType',
  'disposition',
  'gig',
] as const;
export type OfferSortKey = (typeof OFFER_SORT_KEYS)[number];
export type SortDir = 'asc' | 'desc';

export const DEFAULT_SORT: { key: OfferSortKey; dir: SortDir } = { key: 'eventDate', dir: 'asc' };

export function isOfferSortKey(value: string | null): value is OfferSortKey {
  return value !== null && (OFFER_SORT_KEYS as readonly string[]).includes(value);
}

/** Status order for sorting and the status filter: open, expired, accepted, rejected. */
export type OfferDisplayStatus = 'OPEN' | 'EXPIRED' | 'ACCEPTED' | 'REJECTED';
export const OFFER_DISPLAY_STATUSES: OfferDisplayStatus[] = ['OPEN', 'EXPIRED', 'ACCEPTED', 'REJECTED'];

export function offerDisplayStatus(offer: Pick<OfferSummary, 'status' | 'expired'>): OfferDisplayStatus {
  if (offer.status === 'OPEN') return offer.expired ? 'EXPIRED' : 'OPEN';
  return offer.status;
}

/**
 * Display text of the coded columns (client, seller, source, …) so they sort the way they read
 * in the current language. Supplied by the page.
 */
export interface SortLabels {
  seller: (offer: OfferSummary) => string;
  source: (offer: OfferSummary) => string | null;
  eventType: (offer: OfferSummary) => string | null;
  disposition: (offer: OfferSummary) => string;
}

type SortValue = string | number | null;

function valueOf(offer: OfferSummary, key: OfferSortKey, labels: SortLabels): SortValue {
  switch (key) {
    case 'event':
      return offer.eventName;
    case 'client':
      return offer.clientName;
    case 'place':
      return [offer.venue, offer.city].filter(Boolean).join(', ');
    case 'eventDate':
      return offer.eventDate;
    case 'created':
      return offer.createdAt;
    case 'price':
      return offer.priceCents;
    case 'status':
      return OFFER_DISPLAY_STATUSES.indexOf(offerDisplayStatus(offer));
    case 'seller':
      return labels.seller(offer);
    case 'source':
      return labels.source(offer);
    case 'eventType':
      return labels.eventType(offer);
    case 'disposition':
      return labels.disposition(offer);
    case 'gig':
      return offer.gigId ? 1 : 0;
  }
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

/**
 * Excel-style sort: by one column, empty values always last, ties by event date then creation.
 * Returns a new array.
 */
export function sortOffers(
  offers: readonly OfferSummary[],
  key: OfferSortKey,
  dir: SortDir,
  labels: SortLabels,
): OfferSummary[] {
  const sign = dir === 'asc' ? 1 : -1;
  return [...offers].sort((a, b) => {
    const va = valueOf(a, key, labels);
    const vb = valueOf(b, key, labels);
    const aEmpty = va === null || va === '';
    const bEmpty = vb === null || vb === '';
    if (aEmpty !== bEmpty) return aEmpty ? 1 : -1;
    let cmp = 0;
    if (!aEmpty && !bEmpty) {
      cmp = typeof va === 'number' && typeof vb === 'number' ? va - vb : collator.compare(String(va), String(vb));
    }
    if (cmp !== 0) return cmp * sign;
    return a.eventDate.localeCompare(b.eventDate) || a.createdAt.localeCompare(b.createdAt);
  });
}

/** Next state when a header is clicked: same column flips, a new column starts ascending. */
export function nextSort(current: { key: OfferSortKey; dir: SortDir }, key: OfferSortKey) {
  if (current.key === key) return { key, dir: current.dir === 'asc' ? 'desc' : 'asc' } as const;
  return { key, dir: 'asc' } as const;
}
