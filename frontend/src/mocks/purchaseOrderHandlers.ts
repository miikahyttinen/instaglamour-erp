// Mock handlers for docs/api-contract.md "Purchase orders" — partner endpoints (UC-034).
// The public freelancer endpoints (UC-033) are TASK-151's; they can reuse
// `createPurchaseOrder` from purchaseOrderStore.ts. Business logic lives in that store.
import { http, HttpResponse } from 'msw';
import { PURCHASE_ORDER_STATUSES } from '../api/enums';
import type { PurchaseOrder, PurchaseOrderListResponse, ReasonRequest } from '../api/types';
import { db } from './data';
import {
  cancelPurchaseOrder,
  payPurchaseOrder,
  toPurchaseOrder,
  unpayPurchaseOrder,
} from './purchaseOrderStore';
import { currentPartner, errorResponse, unauthenticated, validationError } from './util';

const MAX_REASON = 500;

const notFound = () => errorResponse(404, 'NOT_FOUND', 'Not found');
const badTransition = () =>
  errorResponse(409, 'INVALID_STATUS_TRANSITION', 'Not possible in this status');

const findPo = (id: unknown): PurchaseOrder | undefined =>
  db.freelancer.purchaseOrders.find((po) => po.id === id);

const newestFirst = <T extends { createdAt: string } | { at: string }>(a: T, b: T) => {
  const ta = 'createdAt' in a ? a.createdAt : a.at;
  const tb = 'createdAt' in b ? b.createdAt : b.at;
  return tb.localeCompare(ta);
};

/** Year of a UTC timestamp in Europe/Helsinki (contract: "today" and years are Helsinki). */
function helsinkiYear(ts: string): number {
  return Number(
    new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Helsinki', year: 'numeric' }).format(new Date(ts)),
  );
}

export const purchaseOrderHandlers = [
  http.get('/api/purchase-orders', ({ request }) => {
    if (!currentPartner()) return unauthenticated();
    const params = new URL(request.url).searchParams;
    const q = params.get('q')?.trim().toLowerCase() ?? '';
    const yearParam = params.get('year');
    const status = params.get('status');
    if (!q && !yearParam) return validationError({ year: 'REQUIRED' });
    if (!q && !/^\d{4}$/.test(yearParam ?? '')) return validationError({ year: 'INVALID_VALUE' });
    if (status && !(PURCHASE_ORDER_STATUSES as readonly string[]).includes(status)) {
      return validationError({ status: 'INVALID_VALUE' });
    }
    const year = Number(yearParam);
    const orders = db.freelancer.purchaseOrders
      // With q: every year (BR-119); otherwise the year of creation.
      .filter((po) =>
        q
          ? po.number.toLowerCase().includes(q) || po.personName.toLowerCase().includes(q)
          : helsinkiYear(po.createdAt) === year,
      )
      .filter((po) => !status || po.status === status)
      .sort(newestFirst)
      .map(toPurchaseOrder);
    const body: PurchaseOrderListResponse = { purchaseOrders: orders };
    return HttpResponse.json(body);
  }),

  // Before /:id so "events" is not taken for an id.
  http.get('/api/purchase-orders/events', ({ request }) => {
    if (!currentPartner()) return unauthenticated();
    const raw = new URL(request.url).searchParams.get('limit');
    const limit = raw === null ? 50 : Number(raw);
    if (!Number.isInteger(limit) || limit < 1 || limit > 200) return validationError({ limit: 'INVALID_VALUE' });
    return HttpResponse.json([...db.freelancer.events].sort(newestFirst).slice(0, limit));
  }),

  http.get('/api/purchase-orders/:id', ({ params }) => {
    if (!currentPartner()) return unauthenticated();
    const po = findPo(params.id);
    return po ? HttpResponse.json(toPurchaseOrder(po)) : notFound();
  }),

  http.get('/api/purchase-orders/:id/history', ({ params }) => {
    if (!currentPartner()) return unauthenticated();
    if (!findPo(params.id)) return notFound();
    const events = db.freelancer.events.filter((e) => e.purchaseOrderId === params.id).sort(newestFirst);
    return HttpResponse.json(events);
  }),

  http.post('/api/purchase-orders/:id/pay', ({ params }) => {
    const me = currentPartner();
    if (!me) return unauthenticated();
    const po = findPo(params.id);
    if (!po) return notFound();
    if (po.status !== 'OPEN') return badTransition();
    payPurchaseOrder(db.freelancer, db.gigs, po, me.id);
    return HttpResponse.json(toPurchaseOrder(po));
  }),

  http.post('/api/purchase-orders/:id/unpay', ({ params }) => {
    const me = currentPartner();
    if (!me) return unauthenticated();
    const po = findPo(params.id);
    if (!po) return notFound();
    if (po.status !== 'PAID') return badTransition();
    unpayPurchaseOrder(db.freelancer, db.gigs, po, me.id);
    return HttpResponse.json(toPurchaseOrder(po));
  }),

  http.post('/api/purchase-orders/:id/cancel', async ({ params, request }) => {
    const me = currentPartner();
    if (!me) return unauthenticated();
    const body: Partial<ReasonRequest> = await request
      .json()
      .then((json) => (typeof json === 'object' && json !== null ? (json as Partial<ReasonRequest>) : {}))
      .catch(() => ({}));
    const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
    if (!reason) return validationError({ reason: 'REQUIRED' });
    if (reason.length > MAX_REASON) return validationError({ reason: 'TOO_LONG' });
    const po = findPo(params.id);
    if (!po) return notFound();
    if (po.status !== 'OPEN') return badTransition();
    cancelPurchaseOrder(db.freelancer, db.gigs, po, me.id, reason);
    return HttpResponse.json(toPurchaseOrder(po));
  }),
];
