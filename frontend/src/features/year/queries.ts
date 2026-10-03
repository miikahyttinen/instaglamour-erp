import { useQuery } from '@tanstack/react-query';
import { rootKeys } from '../../api/cache';
import { yearsApi } from '../../api/endpoints';

export const yearPageKey = (year: number) => [...rootKeys.years, year] as const;

/**
 * GET /api/years/{year} (UC-022). Gig, cost line, hours and budget mutations invalidate it
 * (api/cache.ts); it is also refetched whenever the page opens (staleTime 0), so changes made
 * by other partners show too.
 */
export function useYearPage(year: number) {
  return useQuery({ queryKey: yearPageKey(year), queryFn: () => yearsApi.get(year), staleTime: 0 });
}
