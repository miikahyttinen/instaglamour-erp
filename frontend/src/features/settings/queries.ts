import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { rootKeys } from '../../api/cache';
import { lineupsApi } from '../../api/endpoints';
import type { Id, LineupTemplate, LineupTemplateCreate, LineupTemplateUpdate } from '../../api/types';
import { referenceKey } from '../../reference/useReference';

export const lineupKeys = {
  list: rootKeys.lineups,
};

/** Puts a changed lineup into the cached list and refetches the reference (active lineups). */
function applyLineup(queryClient: QueryClient, lineup: LineupTemplate) {
  queryClient.setQueryData<LineupTemplate[]>(lineupKeys.list, (prev) => {
    if (!prev) return [lineup];
    return prev.some((l) => l.id === lineup.id)
      ? prev.map((l) => (l.id === lineup.id ? lineup : l))
      : [...prev, lineup];
  });
  return queryClient.invalidateQueries({ queryKey: referenceKey });
}

/** All lineups (active first, then by name). There is no single-lineup GET: pages pick from this. */
export function useLineups() {
  return useQuery({ queryKey: lineupKeys.list, queryFn: lineupsApi.list });
}

export function useCreateLineup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: LineupTemplateCreate) => lineupsApi.create(body),
    onSuccess: (lineup) => applyLineup(queryClient, lineup),
  });
}

export function useUpdateLineup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: Id; body: LineupTemplateUpdate }) => lineupsApi.update(id, body),
    onSuccess: (lineup) => applyLineup(queryClient, lineup),
  });
}

export function useDeleteLineup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: Id) => lineupsApi.remove(id),
    onSuccess: (_data, id) => {
      queryClient.setQueryData<LineupTemplate[]>(lineupKeys.list, (prev) => prev?.filter((l) => l.id !== id));
      return Promise.all([
        queryClient.invalidateQueries({ queryKey: lineupKeys.list }),
        queryClient.invalidateQueries({ queryKey: referenceKey }),
      ]);
    },
    // LINEUP_IN_USE: a gig was linked meanwhile; refresh the gig counts.
    onError: () => queryClient.invalidateQueries({ queryKey: lineupKeys.list }),
  });
}
