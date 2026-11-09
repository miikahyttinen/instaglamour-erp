import { useQuery } from '@tanstack/react-query';
import { rootKeys } from '../../api/cache';
import { myEventsApi, myOffersApi } from '../../api/endpoints';

export const myEventsKey = rootKeys.myEvents;
export const myOffersKey = rootKeys.myOffers;

/**
 * GET /api/me/events (My gigs). Event and cost line mutations invalidate it (api/cache.ts); it is
 * also refetched whenever the page opens (staleTime 0), so changes made by other partners show too.
 */
export function useMyEvents() {
  return useQuery({ queryKey: myEventsKey, queryFn: () => myEventsApi.list(), staleTime: 0 });
}

/**
 * GET /api/me/offers (My gigs, offers section). Event mutations (contract done, convert) and offer
 * mutations (follow-up done, disposition…) invalidate it; refetched whenever the page opens.
 */
export function useMyOffers() {
  return useQuery({ queryKey: myOffersKey, queryFn: () => myOffersApi.list(), staleTime: 0 });
}
