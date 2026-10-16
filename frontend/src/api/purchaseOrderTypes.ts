// Purchase orders (UC-033, UC-034, BR-113…BR-119): code lists and shapes from
// docs/api-contract.md "Purchase orders". Re-exported from types.ts / enums.ts.
// Money fields ending in `Cents` are integer cents. Dates are `YYYY-MM-DD`; timestamps ISO 8601 UTC.
import type { CostType } from './enums';

type Id = string;
type IsoDate = string;
type IsoTimestamp = string;
type Cents = number;

export const PURCHASE_ORDER_STATUSES = ['OPEN', 'PAID', 'CANCELLED'] as const;
export type PurchaseOrderStatus = (typeof PURCHASE_ORDER_STATUSES)[number];

export const PURCHASE_ORDER_EVENT_TYPES = ['CREATED', 'PAID', 'UNPAID', 'CANCELLED'] as const;
export type PurchaseOrderEventType = (typeof PURCHASE_ORDER_EVENT_TYPES)[number];

/** `CostLine.purchaseOrder`: the OPEN or PAID PO the line is on (cancelled POs don't count). */
export interface CostLinePurchaseOrder {
  id: Id;
  number: string;
  status: Exclude<PurchaseOrderStatus, 'CANCELLED'>;
}

export interface PurchaseOrderLine {
  costLineId: Id;
  gigId: Id;
  gigStartDate: IsoDate;
  gigVenue: string;
  gigLineupName: string;
  type: CostType;
  description: string | null;
  /** Snapshot of the fee when the PO was created (BR-115). */
  amountCents: Cents;
}

export interface PurchaseOrder {
  id: Id;
  /** BR-116, e.g. `PERSON-1-0042`. */
  number: string;
  personId: Id;
  personName: string;
  status: PurchaseOrderStatus;
  totalCents: Cents;
  createdAt: IsoTimestamp;
  paidAt: IsoTimestamp | null;
  /** Partner id */
  paidBy: Id | null;
  cancelledAt: IsoTimestamp | null;
  /** Partner id */
  cancelledBy: Id | null;
  cancelReason: string | null;
  lines: PurchaseOrderLine[];
}

interface PurchaseOrderEventBase<T extends PurchaseOrderEventType, D> {
  id: Id;
  purchaseOrderId: Id;
  number: string;
  type: T;
  /** null = the freelancer through their link. */
  partnerId: Id | null;
  at: IsoTimestamp;
  details: D;
}

type EmptyDetails = Record<string, never>;

export type PurchaseOrderEvent =
  | PurchaseOrderEventBase<'CREATED' | 'UNPAID', EmptyDetails>
  | PurchaseOrderEventBase<'PAID', { totalCents: Cents }>
  | PurchaseOrderEventBase<'CANCELLED', { reason: string }>;

/** `GET /api/purchase-orders` query: `year` is required unless `q` is given (then all years). */
export interface PurchaseOrderListQuery {
  year?: number;
  q?: string;
  status?: PurchaseOrderStatus;
}

export interface PurchaseOrderListResponse {
  purchaseOrders: PurchaseOrder[];
}

export interface PurchaseOrderCancelRequest {
  reason: string;
}

export interface FreelancerLinkResponse {
  sharePath: string;
}
