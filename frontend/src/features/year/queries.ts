import { useQuery } from '@tanstack/react-query';
import { yearsApi } from '../../api/endpoints';

export const yearPageKey = (year: number) => ['years', year] as const;

/**
 * GET /api/years/{year} (UC-022). Always refetched when the page opens (staleTime 0), so
 * changes made on other pages (gigs, hours, budget) show without cross-feature invalidation.
 */
export function useYearPage(year: number) {
  return useQuery({ queryKey: yearPageKey(year), queryFn: () => yearsApi.get(year), staleTime: 0 });
}
