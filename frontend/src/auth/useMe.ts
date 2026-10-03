import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { isApiError } from '../api/client';
import { meApi } from '../api/endpoints';
import type { Partner, UpdateMeRequest } from '../api/types';
import { setLanguage } from '../i18n';

export const meKey = ['me'] as const;

/** Signed-in partner, or `null` when there is no session (401). */
export async function fetchMeOrNull(): Promise<Partner | null> {
  try {
    return await meApi.get();
  } catch (error) {
    if (isApiError(error) && error.status === 401) return null;
    throw error;
  }
}

export function useMe() {
  return useQuery({ queryKey: meKey, queryFn: fetchMeOrNull, staleTime: Infinity });
}

/**
 * PATCH /api/me with optimistic update: the header and language change immediately and
 * roll back if saving fails.
 */
export function useUpdateMe() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateMeRequest) => meApi.update(body),
    onMutate: async (body) => {
      await queryClient.cancelQueries({ queryKey: meKey });
      const previous = queryClient.getQueryData<Partner | null>(meKey);
      if (previous) {
        queryClient.setQueryData<Partner>(meKey, { ...previous, ...body });
        if (body.language) setLanguage(body.language);
      }
      return { previous };
    },
    onError: (_error, _body, context) => {
      const previous = context?.previous;
      if (previous && queryClient.getQueryData(meKey)) {
        queryClient.setQueryData(meKey, previous);
        setLanguage(previous.language);
      }
    },
    onSuccess: (partner) => {
      queryClient.setQueryData(meKey, partner);
      setLanguage(partner.language);
    },
  });
}
