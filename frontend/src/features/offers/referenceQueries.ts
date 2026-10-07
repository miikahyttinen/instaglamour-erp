import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { rootKeys } from '../../api/cache';
import { referencesApi } from '../../api/endpoints';
import type { Id, Reference } from '../../api/types';

export const referenceKeys = {
  all: ['references'] as const,
};

export function useReferences() {
  return useQuery({ queryKey: referenceKeys.all, queryFn: referencesApi.list });
}

/**
 * After any reference change: put the new list (or one changed item) in the cache and refresh
 * the offers, whose previews show the references (BR-108).
 */
export function useApplyReferences() {
  const queryClient = useQueryClient();
  return useCallback(
    (next: Reference[] | Reference | { removed: Id } | null) => {
      if (Array.isArray(next)) {
        queryClient.setQueryData<Reference[]>(referenceKeys.all, next);
      } else if (next && 'removed' in next) {
        queryClient.setQueryData<Reference[]>(referenceKeys.all, (list) =>
          list?.filter((r) => r.id !== next.removed),
        );
      } else if (next) {
        queryClient.setQueryData<Reference[]>(referenceKeys.all, (list) =>
          list?.some((r) => r.id === next.id)
            ? list.map((r) => (r.id === next.id ? next : r))
            : [...(list ?? []), next],
        );
      } else {
        void queryClient.invalidateQueries({ queryKey: referenceKeys.all });
      }
      void queryClient.invalidateQueries({ queryKey: rootKeys.offers });
    },
    [queryClient],
  );
}
