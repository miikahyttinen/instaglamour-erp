import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { invalidateYearData, rootKeys } from '../../api/cache';
import { purchaseOrdersApi } from '../../api/endpoints';
import type { Id, PurchaseOrder, PurchaseOrderListQuery, PurchaseOrderListResponse } from '../../api/types';

// Every purchase order query starts with ['purchase-orders'] (rootKeys.purchaseOrders).
export const purchaseOrderKeys = {
  all: rootKeys.purchaseOrders,
  lists: [...rootKeys.purchaseOrders, 'list'] as const,
  list: (query: PurchaseOrderListQuery) => [...rootKeys.purchaseOrders, 'list', query] as const,
  detail: (id: Id) => [...rootKeys.purchaseOrders, 'detail', id] as const,
  history: (id: Id) => [...rootKeys.purchaseOrders, 'history', id] as const,
  events: [...rootKeys.purchaseOrders, 'events'] as const,
};

/** Number of log rows shown under the list. */
export const LOG_LIMIT = 50;

export function usePurchaseOrderList(query: PurchaseOrderListQuery) {
  return useQuery({
    queryKey: purchaseOrderKeys.list(query),
    queryFn: () => purchaseOrdersApi.list(query),
    placeholderData: (previous) => previous,
  });
}

export function usePurchaseOrder(id: Id) {
  return useQuery({ queryKey: purchaseOrderKeys.detail(id), queryFn: () => purchaseOrdersApi.get(id) });
}

export function usePurchaseOrderHistory(id: Id) {
  return useQuery({ queryKey: purchaseOrderKeys.history(id), queryFn: () => purchaseOrdersApi.history(id) });
}

export function usePurchaseOrderEvents() {
  return useQuery({ queryKey: purchaseOrderKeys.events, queryFn: () => purchaseOrdersApi.events(LOG_LIMIT) });
}

/**
 * After a PO mutation (pay / unpay / cancel) or a 409 that says it changed: put the returned PO
 * in the cache and refresh every PO query, the gig pages (their cost lines changed) and the
 * year-derived lists (actual costs).
 */
export function useApplyPurchaseOrder() {
  const queryClient = useQueryClient();
  return useCallback(
    (po: PurchaseOrder | null) => {
      if (po) {
        // The row shows its new status at once; the refetch below confirms it.
        queryClient.setQueryData(purchaseOrderKeys.detail(po.id), po);
        queryClient.setQueriesData<PurchaseOrderListResponse>({ queryKey: purchaseOrderKeys.lists }, (old) =>
          old ? { purchaseOrders: old.purchaseOrders.map((p) => (p.id === po.id ? po : p)) } : old,
        );
      }
      void queryClient.invalidateQueries({ queryKey: purchaseOrderKeys.all });
      void queryClient.invalidateQueries({ queryKey: ['gigs'] });
      void invalidateYearData(queryClient, 'gigs');
    },
    [queryClient],
  );
}
