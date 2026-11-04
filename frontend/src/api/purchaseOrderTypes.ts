// Purchase order shapes (UC-033, UC-034, BR-113…BR-119), exactly per docs/api-contract.md
// "Purchase orders". Shared by the freelancer page (TASK-151) and the partner PO pages
// (TASK-152); re-exported from types.ts. Money in integer cents, dates `YYYY-MM-DD`,
// timestamps ISO 8601 UTC.

import type { CostType } from './enums';

type Id = string;
type IsoDate = string;
type IsoTimestamp = string;
type Cents = number;

export const PURCHASE_ORDER_STATUSES = ['OPEN', 'PAID', 'CANCELLED'] as const;
export type PurchaseOrderStatus = (typeof PURCHASE_ORDER_STATUSES)[number];

export const PURCHASE_ORDER_EVENT_TYPES = ['CREATED', 'PAID', 'UNPAID', 'CANCELLED'] as const;
export type PurchaseOrderEventType = (typeof PURCHASE_ORDER_EVENT_TYPES)[number];

/** State of one fee on the freelancer page. */
export const FREELANCER_LINE_STATES = ['SELECTABLE', 'UPCOMING', 'ON_PO', 'PAID'] as const;
export type FreelancerLineState = (typeof FREELANCER_LINE_STATES)[number];

/** `CostLine.purchaseOrder`: the OPEN or PAID PO the line is on (cancelled POs don't count). */
export interface CostLinePurchaseOrder {
  id: Id;
  number: string;
  status: PurchaseOrderStatus;
}

// ---------- Partner side (signed in) ----------

export interface PurchaseOrderLine {
  costLineId: Id;
  eventId: Id;
  eventStartDate: IsoDate;
  eventVenue: string;
  eventLineupName: string;
  type: CostType;
  description: string | null;
  /** Fee excl. VAT (snapshot when the PO was created). */
  baseCents: Cents;
  /** false = not at the sound check: `deductionCents` was deducted. Partner-created: true. */
  soundcheck: boolean;
  deductionCents: Cents;
  vatCents: Cents;
  /** Final amount = base − deduction + VAT (snapshot taken when the PO was created). */
  amountCents: Cents;
}

export interface PurchaseOrder {
  id: Id;
  /** BR-116, e.g. `PERSON-1-0042`. */
  number: string;
  personId: Id;
  personName: string;
  status: PurchaseOrderStatus;
  /** = vatRateBp > 0. */
  vatLiable: boolean;
  /** Chosen VAT rate in basis points (0 = no VAT, e.g. 1350 = 13.5 %); partner-created POs: 0. */
  vatRateBp: number;
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

export interface PurchaseOrderListQuery {
  /** Optional: without it all years; ignored with `q` (all years are searched). */
  year?: number;
  q?: string;
  status?: PurchaseOrderStatus;
}

export interface PurchaseOrderListResponse {
  purchaseOrders: PurchaseOrder[];
}

export interface PurchaseOrderCancelRequest {
  /** Required, ≤ 500 chars. */
  reason: string;
}

/** CANCELLED `{ reason }`, PAID `{ totalCents }`, CREATED / UNPAID `{}`. */
export type PurchaseOrderEventDetails =
  | { reason: string }
  | { totalCents: Cents }
  | Record<string, never>;

export interface PurchaseOrderEvent {
  id: Id;
  purchaseOrderId: Id;
  number: string;
  type: PurchaseOrderEventType;
  /** null = the freelancer, via the link. */
  partnerId: Id | null;
  at: IsoTimestamp;
  details: PurchaseOrderEventDetails;
}

/**
 * `GET /api/people/{id}/po-eligible-lines?eventId=`: the person's fees a partner can put on a PO
 * by hand (amount > 0, unpaid, not on an OPEN/PAID PO, non-deleted SOLD events played or
 * upcoming, no FUEL). Newest event first.
 */
export interface PoEligibleLine {
  costLineId: Id;
  eventId: Id;
  eventStartDate: IsoDate;
  eventVenue: string;
  eventLineupName: string;
  type: CostType;
  description: string | null;
  amountCents: Cents;
}

/** `POST /api/purchase-orders` (partner, by hand): 1…200 unique ids of that person's eligible fees. */
export interface PurchaseOrderCreate {
  personId: Id;
  costLineIds: Id[];
}

/** `GET /api/people/{id}/freelancer-link` and `POST …/freelancer-link/regenerate`. */
export interface FreelancerLink {
  /** `/f/<token>` */
  sharePath: string;
}

// ---------- Public freelancer page (no session) ----------

export interface FreelancerLine {
  costLineId: Id;
  eventStartDate: IsoDate;
  eventEndDate: IsoDate | null;
  venue: string;
  type: CostType;
  description: string | null;
  /** PO snapshot when ON_PO, actual when PAID, else budgeted. */
  amountCents: Cents;
  state: FreelancerLineState;
  purchaseOrderNumber: string | null;
}

export interface PublicPurchaseOrderLine {
  eventStartDate: IsoDate;
  venue: string;
  type: CostType;
  description: string | null;
  /** Fee excl. VAT. */
  baseCents: Cents;
  soundcheck: boolean;
  deductionCents: Cents;
  vatCents: Cents;
  /** Final amount = base − deduction + VAT. */
  amountCents: Cents;
}

/** No ids, partner names or cancel reason. */
export interface PublicPurchaseOrder {
  number: string;
  status: PurchaseOrderStatus;
  /** = vatRateBp > 0. */
  vatLiable: boolean;
  /** Chosen VAT rate in basis points (0 = no VAT). */
  vatRateBp: number;
  totalCents: Cents;
  createdAt: IsoTimestamp;
  paidAt: IsoTimestamp | null;
  lines: PublicPurchaseOrderLine[];
}

/** `GET /api/public/freelancers/{token}`: lines newest event first, POs newest first (incl. cancelled). */
export interface FreelancerView {
  name: string;
  lines: FreelancerLine[];
  purchaseOrders: PublicPurchaseOrder[];
  /** For the amount preview of the create dialog. */
  settings: FreelancerSettings;
}

export interface FreelancerSettings {
  /** Deducted from a fee when the person was not at the sound check. */
  soundcheckDeductionCents: Cents;
  /** VAT rates the freelancer can choose, basis points (e.g. [1350, 2550]); "no VAT" (0) is always offered too. */
  vatRatesBp: number[];
}

/**
 * `POST /api/public/freelancers/{token}/purchase-orders`: VAT choice and 1…200 unique lines with
 * the sound check flag. (The backend still accepts the legacy `{ costLineIds }`; the UI does not
 * send it.)
 */
export interface PublicPurchaseOrderCreate {
  /** 0 or one of `FreelancerSettings.vatRatesBp`. */
  vatRateBp: number;
  lines: { costLineId: Id; soundcheck: boolean }[];
}
