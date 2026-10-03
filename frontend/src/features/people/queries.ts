import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { rootKeys } from '../../api/cache';
import { peopleApi } from '../../api/endpoints';
import type { Id, PeopleActiveFilter, PersonUpdate } from '../../api/types';

// Every people query starts with ['people'] so one invalidation refreshes this register and
// the gig person pickers (gigs/queries.ts uses ['people', 'all']). Gig mutations refresh the
// cost lines through invalidateYearData (api/cache.ts).
export const peopleKeys = {
  all: ['people'] as const,
  list: (filter: PeopleActiveFilter) => ['people', 'list', filter] as const,
  costLines: (id: Id, year: number) => [...rootKeys.personCostLines, id, year] as const,
};

export function usePeopleList(filter: PeopleActiveFilter) {
  return useQuery({
    queryKey: peopleKeys.list(filter),
    queryFn: () => peopleApi.list(filter),
    placeholderData: (previous) => previous,
  });
}

export function usePersonCostLines(id: Id, year: number) {
  return useQuery({
    queryKey: peopleKeys.costLines(id, year),
    queryFn: () => peopleApi.costLines(id, year),
  });
}

export function useCreatePerson() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => peopleApi.create({ name }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: peopleKeys.all }),
  });
}

export function useUpdatePerson() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: Id; body: PersonUpdate }) => peopleApi.update(id, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: peopleKeys.all }),
  });
}
