import { useMutation, useQuery } from '@tanstack/react-query';
import { rootKeys, useInvalidateYearData } from '../../api/cache';
import { hoursApi } from '../../api/endpoints';
import type { HourEntryCreate, HourEntryUpdate, Id } from '../../api/types';

export const hoursKey = rootKeys.hours;

export function useHourEntries(year: number, partnerId: Id | null) {
  return useQuery({
    queryKey: [...hoursKey, 'entries', year, partnerId],
    queryFn: () => hoursApi.list(year, partnerId ?? undefined),
    enabled: partnerId !== null,
  });
}

export function useHoursTotals(year: number) {
  return useQuery({
    queryKey: [...hoursKey, 'totals', year],
    queryFn: () => hoursApi.totals(year),
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
