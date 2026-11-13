import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { rootKeys } from '../../api/cache';
import { clientsApi } from '../../api/endpoints';
import type { ClientCreate, ClientUpdate, Id } from '../../api/types';

// Every client query starts with ['clients'] (rootKeys.clients), so event mutations refresh the
// counts and the client pages through invalidateYearData (api/cache.ts).
export const clientKeys = {
  all: rootKeys.clients,
  list: (q: string) => [...rootKeys.clients, 'list', q] as const,
  detail: (id: Id) => [...rootKeys.clients, 'detail', id] as const,
};

/** Client changes also change the client name shown on events (detail pages, lists, search) and
 *  on the Laskutus page. */
function refreshAfterClientChange(queryClient: QueryClient) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: clientKeys.all }),
    queryClient.invalidateQueries({ queryKey: ['events'] }),
    queryClient.invalidateQueries({ queryKey: rootKeys.invoiceRows }),
  ]);
}

/** Clients sorted by name; `q` filters by name on the server. '' = all (also the pickers). */
export function useClientList(q = '') {
  return useQuery({
    queryKey: clientKeys.list(q),
    queryFn: () => clientsApi.list(q),
    placeholderData: (previous) => previous,
  });
}

export function useClient(id: Id) {
  return useQuery({ queryKey: clientKeys.detail(id), queryFn: () => clientsApi.get(id) });
}

export function useCreateClient() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: ClientCreate) => clientsApi.create(body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: clientKeys.all }),
  });
}

export function useUpdateClient() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: Id; body: ClientUpdate }) => clientsApi.update(id, body),
    onSuccess: () => refreshAfterClientChange(queryClient),
  });
}

export function useDeleteClient() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: Id) => clientsApi.remove(id),
    onSuccess: (_data, id) => {
      queryClient.removeQueries({ queryKey: clientKeys.detail(id) });
      return queryClient.invalidateQueries({ queryKey: clientKeys.all });
    },
  });
}
