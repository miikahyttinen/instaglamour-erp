import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { invalidateYearData, rootKeys } from '../../api/cache';
import { offersApi } from '../../api/endpoints';
import type { Id, OfferDetail, OfferListQuery } from '../../api/types';

// Every offer query starts with ['offers'] (rootKeys.offers).
export const offerKeys = {
  all: rootKeys.offers,
  lists: [...rootKeys.offers, 'list'] as const,
  list: (query: OfferListQuery) => [...rootKeys.offers, 'list', query] as const,
  detail: (id: Id) => [...rootKeys.offers, 'detail', id] as const,
  history: (id: Id) => [...rootKeys.offers, 'history', id] as const,
  allStats: [...rootKeys.offers, 'stats'] as const,
};

/** KPI cards (BR-122): all offers of all years; the year series are around the current year. */
export function useOfferStats() {
  return useQuery({ queryKey: offerKeys.allStats, queryFn: () => offersApi.stats() });
}

export function useOfferList(query: OfferListQuery) {
  return useQuery({
    queryKey: offerKeys.list(query),
    queryFn: () => offersApi.list(query),
    placeholderData: (previous) => previous,
  });
}

export function useOffer(id: Id | null) {
  return useQuery({
    queryKey: offerKeys.detail(id ?? ''),
    queryFn: () => offersApi.get(id!),
    enabled: Boolean(id),
  });
}

export function useOfferHistory(id: Id) {
  return useQuery({ queryKey: offerKeys.history(id), queryFn: () => offersApi.history(id) });
}

/**
 * After any offer mutation: lists (summary), KPI stats, the page, its history, the client pages
 * and the offers section of My gigs (follow-up done, disposition, seller…).
 */
export function refreshAfterOfferChange(queryClient: QueryClient, offer: OfferDetail | null, id: Id) {
  if (offer) queryClient.setQueryData(offerKeys.detail(id), offer);
  else void queryClient.invalidateQueries({ queryKey: offerKeys.detail(id) });
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: offerKeys.lists }),
    queryClient.invalidateQueries({ queryKey: offerKeys.allStats }),
    queryClient.invalidateQueries({ queryKey: offerKeys.history(id) }),
    queryClient.invalidateQueries({ queryKey: rootKeys.clients }),
    queryClient.invalidateQueries({ queryKey: rootKeys.myOffers }),
  ]).then(() => undefined);
}

export function useApplyOffer() {
  const queryClient = useQueryClient();
  return useCallback(
    (offer: OfferDetail | null, id: Id) => refreshAfterOfferChange(queryClient, offer, id),
    [queryClient],
  );
}

/** After convert: the offer, and every event-derived view (an event was created). */
export function useApplyConvert() {
  const queryClient = useQueryClient();
  return useCallback(
    (offer: OfferDetail) => {
      void invalidateYearData(queryClient, 'events');
      return refreshAfterOfferChange(queryClient, offer, offer.id);
    },
    [queryClient],
  );
}

/** Absolute public URL of the offer (UC-030), from the API's `sharePath`. */
export function publicOfferUrl(sharePath: string, origin = window.location.origin): string {
  return new URL(sharePath, origin).href;
}
