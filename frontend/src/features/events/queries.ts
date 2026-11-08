import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { invalidateYearData, rootKeys } from '../../api/cache';
import { eventsApi, peopleApi } from '../../api/endpoints';
import type { EventDetail, EventListQuery, Id, Person } from '../../api/types';

export const eventKeys = {
  all: ['events'] as const,
  lists: rootKeys.eventLists,
  list: (query: EventListQuery) => [...rootKeys.eventLists, query] as const,
  detail: (id: Id) => ['events', 'detail', id] as const,
  history: (id: Id) => ['events', 'history', id] as const,
};

export const peopleKey = ['people', 'all'] as const;

export function useEventList(query: EventListQuery) {
  return useQuery({
    queryKey: eventKeys.list(query),
    queryFn: () => eventsApi.list(query),
    placeholderData: (previous) => previous,
  });
}

export function useEvent(id: Id) {
  return useQuery({ queryKey: eventKeys.detail(id), queryFn: () => eventsApi.get(id) });
}

export function useEventHistory(id: Id) {
  return useQuery({ queryKey: eventKeys.history(id), queryFn: () => eventsApi.history(id) });
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
 * After any event mutation: put the returned event in the cache (or refetch it when the response
 * has no event) and refresh its history, the event lists, person cost lines and My gigs.
 */
export function useApplyEvent() {
  const queryClient = useQueryClient();
  return useCallback(
    (event: EventDetail | null, eventId: Id) => {
      if (event) queryClient.setQueryData(eventKeys.detail(event.id), event);
      else void queryClient.invalidateQueries({ queryKey: eventKeys.detail(eventId) });
      void queryClient.invalidateQueries({ queryKey: eventKeys.history(eventId) });
      void invalidateYearData(queryClient, 'events');
    },
    [queryClient],
  );
}
