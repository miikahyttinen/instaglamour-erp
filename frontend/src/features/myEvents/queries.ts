import { useQuery } from '@tanstack/react-query';
import { rootKeys } from '../../api/cache';
import { myEventsApi } from '../../api/endpoints';

export const myEventsKey = rootKeys.myEvents;

/**
 * GET /api/me/events (My gigs). Event and cost line mutations invalidate it (api/cache.ts); it is
 * also refetched whenever the page opens (staleTime 0), so changes made by other partners show too.
 */
export function useMyEvents() {
  return useQuery({ queryKey: myEventsKey, queryFn: () => myEventsApi.list(), staleTime: 0 });
}
