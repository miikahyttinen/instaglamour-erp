import { useQuery } from '@tanstack/react-query';
import { referenceApi } from '../api/endpoints';
import type { Id, Partner } from '../api/types';

export const referenceKey = ['reference'] as const;

/** Reference data (partners, templates, settings, enums), loaded once per session and cached. */
export function useReference() {
  return useQuery({
    queryKey: referenceKey,
    queryFn: referenceApi.get,
    staleTime: Infinity,
    gcTime: Infinity,
  });
}

export function usePartner(id: Id | null | undefined): Partner | undefined {
  const { data } = useReference();
  return id ? data?.partners.find((p) => p.id === id) : undefined;
}
