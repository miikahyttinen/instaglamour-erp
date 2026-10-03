import { useQueryClient, type QueryClient, type QueryKey } from '@tanstack/react-query';
import { useCallback } from 'react';

/**
 * Root query keys shared across features. Each feature builds its own keys under its root,
 * so invalidating a root refreshes every query of that kind.
 */
export const rootKeys = {
  /** Year page: ['years', year] (UC-022). */
  years: ['years'],
  /** Gig lists: ['gigs', 'list', query]. */
  gigLists: ['gigs', 'list'],
  /** Cost lines on the person page: ['people', 'cost-lines', id, year]. */
  personCostLines: ['people', 'cost-lines'],
  /** Hour entries and totals: ['hours', …]. */
  hours: ['hours'],
  /** Budget: ['budget', year]. */
  budget: ['budget'],
} as const satisfies Record<string, QueryKey>;

/** What a mutation changed; decides which lists are refetched besides the year page. */
export type YearDataChange = 'gigs' | 'hours' | 'budget';

const affectedLists: Record<YearDataChange, readonly QueryKey[]> = {
  // Gig and cost line changes: gig lists and person cost lines.
  gigs: [rootKeys.gigLists, rootKeys.personCostLines],
  hours: [rootKeys.hours],
  budget: [rootKeys.budget],
};

/** Refetches the year page and the lists affected by `change`. */
export function invalidateYearData(queryClient: QueryClient, change: YearDataChange): Promise<void> {
  return Promise.all(
    [rootKeys.years, ...affectedLists[change]].map((queryKey) => queryClient.invalidateQueries({ queryKey })),
  ).then(() => undefined);
}

/** Hook form of `invalidateYearData`: use after every gig, cost line, hours or budget mutation. */
export function useInvalidateYearData() {
  const queryClient = useQueryClient();
  return useCallback((change: YearDataChange) => invalidateYearData(queryClient, change), [queryClient]);
}
