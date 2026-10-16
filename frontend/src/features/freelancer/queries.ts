import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { peopleApi, publicFreelancersApi } from '../../api/endpoints';
import type { FreelancerView, Id, PublicPurchaseOrder } from '../../api/types';

export const freelancerKeys = {
  /** Public page data (no session). */
  view: (token: string) => ['public-freelancer', token] as const,
  /** Person page: the person's link. Under ['people'] so people invalidations refresh it too. */
  link: (personId: Id) => ['people', 'freelancer-link', personId] as const,
};

export function useFreelancerView(token: string) {
  return useQuery({
    queryKey: freelancerKeys.view(token),
    queryFn: ({ signal }) => publicFreelancersApi.get(token, signal),
  });
}

/**
 * POST a new PO. On success the PO goes to the top of the list and its fees show "on PO" at
 * once; then the view is refetched so everything matches the server.
 */
export function useCreatePurchaseOrder(token: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (costLineIds: Id[]) => publicFreelancersApi.createPurchaseOrder(token, { costLineIds }),
    onSuccess: (po: PublicPurchaseOrder, costLineIds) => {
      queryClient.setQueryData<FreelancerView>(freelancerKeys.view(token), (view) => {
        if (!view) return view;
        const ids = new Set(costLineIds);
        return {
          ...view,
          lines: view.lines.map((line) =>
            ids.has(line.costLineId) ? { ...line, state: 'ON_PO', purchaseOrderNumber: po.number } : line,
          ),
          purchaseOrders: [po, ...view.purchaseOrders.filter((o) => o.number !== po.number)],
        };
      });
      return queryClient.invalidateQueries({ queryKey: freelancerKeys.view(token) });
    },
  });
}

export function useFreelancerLink(personId: Id) {
  return useQuery({
    queryKey: freelancerKeys.link(personId),
    queryFn: () => peopleApi.freelancerLink(personId),
  });
}

/** Absolute URL of a `sharePath` (`/f/<token>`). */
export function freelancerUrl(sharePath: string, origin = window.location.origin): string {
  return new URL(sharePath, origin).href;
}
