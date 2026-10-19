import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { importApi } from '../../api/endpoints';

export const importKeys = {
  runs: ['import', 'runs'] as const,
};

/** Import history (real imports only), newest first. */
export function useImportRuns() {
  return useQuery({ queryKey: importKeys.runs, queryFn: importApi.runs });
}

/** Dry run: validates and counts, saves nothing. */
export function useImportCheck() {
  return useMutation({
    mutationFn: ({ document, filename }: { document: unknown; filename: string }) =>
      importApi.run(document, { dryRun: true, filename }),
  });
}

/** Real import. Anything may have changed, so every query is refetched afterwards. */
export function useRunImport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ document, filename }: { document: unknown; filename: string }) =>
      importApi.run(document, { dryRun: false, filename }),
    onSuccess: () => queryClient.invalidateQueries(),
  });
}
