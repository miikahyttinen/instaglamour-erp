import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { rootKeys } from '../../api/cache';
import { peopleApi } from '../../api/endpoints';
import type { MusicianRole } from '../../api/enums';
import type { Id, PeopleActiveFilter, PeoplePartnerFilter, PersonUpdate } from '../../api/types';
import { meKey } from '../../auth/useMe';
import { referenceKey } from '../../reference/useReference';

// Every people query starts with ['people'] so one invalidation refreshes this register and
// the gig person pickers (gigs/queries.ts uses ['people', 'all']). Gig mutations refresh the
// cost lines through invalidateYearData (api/cache.ts).
export const peopleKeys = {
  all: ['people'] as const,
  list: (filter: PeopleActiveFilter, partner?: PeoplePartnerFilter, role?: MusicianRole) =>
    ['people', 'list', filter, partner ?? 'any', role ?? 'any'] as const,
  costLines: (id: Id, year: number) => [...rootKeys.personCostLines, id, year] as const,
};

export function usePeopleList(
  filter: PeopleActiveFilter,
  partner?: PeoplePartnerFilter,
  role?: MusicianRole,
) {
  return useQuery({
    queryKey: peopleKeys.list(filter, partner, role),
    queryFn: () => peopleApi.list(filter, partner, role),
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

/**
 * Partner status changes (UC-032) refresh the people lists and the reference data (partner
 * pickers, names); a change to the signed-in partner's own record also refreshes `me`.
 */
function usePartnerInvalidation() {
  const queryClient = useQueryClient();
  return (personId: Id, isMe: boolean) =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: peopleKeys.all }),
      queryClient.invalidateQueries({ queryKey: referenceKey }),
      isMe ? queryClient.invalidateQueries({ queryKey: meKey }) : null,
    ]).then(() => personId);
}

/** PUT /api/people/{id}/partner: make a partner or change the email. */
export function useSetPartner(isMe: boolean) {
  const invalidate = usePartnerInvalidation();
  return useMutation({
    mutationFn: ({ id, email }: { id: Id; email: string }) => peopleApi.setPartner(id, { email }),
    onSuccess: (person) => invalidate(person.id, isMe),
  });
}

/** DELETE /api/people/{id}/partner: remove partner status (sign-in stops immediately). */
export function useRemovePartner() {
  const invalidate = usePartnerInvalidation();
  return useMutation({
    mutationFn: (id: Id) => peopleApi.removePartner(id),
    onSuccess: (person) => invalidate(person.id, false),
  });
}
