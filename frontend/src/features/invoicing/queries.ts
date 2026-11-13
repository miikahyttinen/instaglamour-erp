import { useQuery } from '@tanstack/react-query';
import { rootKeys } from '../../api/cache';
import { invoiceRowsApi } from '../../api/endpoints';

/** ['invoice-rows']: refetched after every invoice row / gig change (api/cache.ts, events). */
export const invoiceRowsKey = rootKeys.invoiceRows;

/** Laskutus page: every invoice row, in API order. */
export function useInvoiceRows() {
  return useQuery({ queryKey: invoiceRowsKey, queryFn: () => invoiceRowsApi.list() });
}
