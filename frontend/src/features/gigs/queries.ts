import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { gigsApi, peopleApi } from '../../api/endpoints';
import type { GigDetail, GigListQuery, Id, Person } from '../../api/types';

export const gigKeys = {
  all: ['gigs'] as const,
  lists: ['gigs', 'list'] as const,
  list: (query: GigListQuery) => ['gigs', 'list', query] as const,
  detail: (id: Id) => ['gigs', 'detail', id] as const,
  history: (id: Id) => ['gigs', 'history', id] as const,
};

export const peopleKey = ['people', 'all'] as const;

export function useGigList(query: GigListQuery) {
  return useQuery({
    queryKey: gigKeys.list(query),
    queryFn: () => gigsApi.list(query),
    placeholderData: (previous) => previous,
  });
}

export function useGig(id: Id) {
  return useQuery({ queryKey: gigKeys.detail(id), queryFn: () => gigsApi.get(id) });
}

export function useGigHistory(id: Id) {
  return useQuery({ queryKey: gigKeys.history(id), queryFn: () => gigsApi.history(id) });
}

/** All people (active and inactive), so names on old lines resolve; pickers offer active ones. */
export function usePeople() {
  return useQuery({ queryKey: peopleKey, queryFn: () => peopleApi.list('all') });
}

export function personName(people: Person[] | undefined, id: Id | null): string | null {
  if (!id) return null;
  return people?.find((p) => p.id === id)?.name ?? null;
}

/**
 * After any gig mutation: put the returned gig in the cache (or refetch it when the response
 * has no gig) and refresh lists, history and year totals.
 */
export function useApplyGig() {
  const queryClient = useQueryClient();
  return useCallback(
    (gig: GigDetail | null, gigId: Id) => {
      if (gig) queryClient.setQueryData(gigKeys.detail(gig.id), gig);
      else void queryClient.invalidateQueries({ queryKey: gigKeys.detail(gigId) });
      void queryClient.invalidateQueries({ queryKey: gigKeys.lists });
      void queryClient.invalidateQueries({ queryKey: gigKeys.history(gigId) });
      void queryClient.invalidateQueries({ queryKey: ['years'] });
      void queryClient.invalidateQueries({ queryKey: ['people', 'cost-lines'] });
    },
    [queryClient],
  );
}
