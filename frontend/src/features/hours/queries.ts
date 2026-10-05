import { useMutation, useQueries, useQuery } from '@tanstack/react-query';
import { rootKeys, useInvalidateYearData } from '../../api/cache';
import { hoursApi } from '../../api/endpoints';
import type { HourEntry, HourEntryCreate, HourEntryUpdate, Id } from '../../api/types';

export const hoursKey = rootKeys.hours;

const entriesKey = (year: number, partnerId: Id | null) => [...hoursKey, 'entries', year, partnerId];

export function useHourEntries(year: number, partnerId: Id | null) {
  return useQuery({
    queryKey: entriesKey(year, partnerId),
    queryFn: () => hoursApi.list(year, partnerId ?? undefined),
    enabled: partnerId !== null,
  });
}

export interface PartnersHourEntries {
  /** Each partner's list (API order, newest first) once every list has loaded. */
  data: { partnerId: Id; entries: HourEntry[] }[] | undefined;
  isPending: boolean;
  error: unknown;
  refetch: () => void;
}

/**
 * Entries of several partners for one year. The contract has no "all partners" listing, so this
 * is one `GET /api/hours?year=&partnerId=` per partner, run in parallel. The cache keys are the
 * same as `useHourEntries`, so "My hours" and the totals table share the own list.
 */
export function usePartnersHourEntries(year: number, partnerIds: readonly Id[]): PartnersHourEntries {
  return useQueries({
    queries: partnerIds.map((partnerId) => ({
      queryKey: entriesKey(year, partnerId),
      queryFn: () => hoursApi.list(year, partnerId),
    })),
    combine: (results) => {
      const failed = results.filter((r) => r.isError);
      return {
        data: results.every((r) => r.data !== undefined)
          ? results.map((r, i) => ({ partnerId: partnerIds[i]!, entries: r.data! }))
          : undefined,
        isPending: results.some((r) => r.isPending),
        error: failed[0]?.error ?? null,
        refetch: () => {
          for (const r of failed) void r.refetch();
        },
      };
    },
  });
}

/** After a change: refetch every hours list and total, and the year page (hours sum). */
function useInvalidateHours() {
  const invalidate = useInvalidateYearData();
  return () => invalidate('hours');
}

export function useCreateHourEntry() {
  const invalidate = useInvalidateHours();
  return useMutation({
    mutationFn: (body: HourEntryCreate) => hoursApi.create(body),
    onSuccess: invalidate,
  });
}

export function useUpdateHourEntry() {
  const invalidate = useInvalidateHours();
  return useMutation({
    mutationFn: ({ id, body }: { id: Id; body: HourEntryUpdate }) => hoursApi.update(id, body),
    onSuccess: invalidate,
  });
}

export function useDeleteHourEntry() {
  const invalidate = useInvalidateHours();
  return useMutation({
    mutationFn: (id: Id) => hoursApi.remove(id),
    onSuccess: invalidate,
  });
}
