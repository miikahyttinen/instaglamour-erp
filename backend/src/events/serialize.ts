/** Event rows → contract JSON (docs/api-contract.md: EventSummary, EventDetail, CostLine, EventHistoryEntry). */
import { isoFromDate } from '../domain/dates.js';
import { eventEconomics, isNotFullyStaffed, isPlayed } from '../domain/eventEconomics.js';
import { invoicing } from '../domain/invoicing.js';
import type {
  CostLine,
  Event,
  EventHistory,
  InvoiceRow,
  Prisma,
  PurchaseOrderStatus,
} from '../generated/prisma/client.js';

/**
 * Prisma include for a cost line's OPEN/PAID purchase order (CostLine.purchaseOrder). A line is on
 * at most one active PO line (partial unique index), so the list has 0 or 1 entries.
 */
export const costLinePurchaseOrderInclude = {
  purchaseOrderLines: {
    where: { active: true },
    select: { purchaseOrder: { select: { id: true, number: true, status: true } } },
  },
} as const satisfies Prisma.CostLineInclude;

export type CostLineWithPurchaseOrder = CostLine & {
  purchaseOrderLines: { purchaseOrder: { id: string; number: string; status: PurchaseOrderStatus } }[];
};

export interface CostLineDto {
  id: string;
  eventId: string;
  type: string;
  personId: string | null;
  description: string | null;
  budgetedCents: number;
  joinsLoadIn: boolean | null;
  loadInDeductionAppliedCents: number | null;
  actualCents: number | null;
  paidAt: string | null;
  paidBy: string | null;
  purchaseOrder: { id: string; number: string; status: PurchaseOrderStatus } | null;
}

export function toCostLineDto(line: CostLineWithPurchaseOrder): CostLineDto {
  const po = line.purchaseOrderLines[0]?.purchaseOrder;
  return {
    id: line.id,
    eventId: line.eventId,
    type: line.type,
    personId: line.personId,
    description: line.description,
    budgetedCents: line.budgetedCents,
    joinsLoadIn: line.joinsLoadIn,
    loadInDeductionAppliedCents: line.loadInDeductionAppliedCents,
    actualCents: line.actualCents,
    paidAt: line.paidAt?.toISOString() ?? null,
    paidBy: line.paidById,
    purchaseOrder: po ? { id: po.id, number: po.number, status: po.status } : null,
  };
}

export function toInvoiceRowDto(row: InvoiceRow) {
  return {
    id: row.id,
    eventId: row.eventId,
    description: row.description,
    amountCents: row.amountCents,
    status: row.status,
    statusAt: row.statusAt.toISOString(),
    statusBy: row.statusById,
    createdAt: row.createdAt.toISOString(),
    createdBy: row.createdById,
    auto: row.auto,
  };
}

export type InvoiceRowDto = ReturnType<typeof toInvoiceRowDto>;

/** Contract order of an event's invoice rows: creation order (time, then id). */
export function compareInvoiceRows(a: InvoiceRow, b: InvoiceRow): number {
  const t = a.createdAt.getTime() - b.createdAt.getTime();
  if (t !== 0) return t;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** Contract order of an event's cost lines: creation time, then id. */
export function compareCostLines(a: CostLine, b: CostLine): number {
  const t = a.createdAt.getTime() - b.createdAt.getTime();
  if (t !== 0) return t;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** An event as the serializers need it: its cost lines and the name of its client (BR-100). */
export type EventWithLines = Event & {
  costLines: CostLine[];
  client: { name: string } | null;
  invoiceRows: InvoiceRow[];
};
export type EventWithDetail = Omit<EventWithLines, 'costLines'> & {
  costLines: CostLineWithPurchaseOrder[];
};

export function toEventSummaryDto(event: EventWithLines, today: string) {
  const startDate = isoFromDate(event.startDate);
  const economics = eventEconomics(event);
  const played = isPlayed(event.status, startDate, today);
  return {
    id: event.id,
    startDate,
    endDate: event.endDate ? isoFromDate(event.endDate) : null,
    year: event.startDate.getUTCFullYear(),
    status: event.status,
    played,
    lineupTemplateId: event.lineupTemplateId,
    lineupName: event.lineupName,
    venue: event.venue,
    technicalSetup: event.technicalSetup,
    logistics: event.logistics,
    houseTechnician: event.houseTechnician,
    sellerId: event.sellerId,
    producerId: event.producerId,
    priceCents: event.priceCents,
    additionalSalesCents: event.additionalSalesCents,
    additionalSalesDescription: event.additionalSalesDescription,
    notes: event.notes,
    clientId: event.clientId,
    clientName: event.client?.name ?? null,
    offerId: event.offerId,
    ...economics,
    notFullyStaffed: isNotFullyStaffed(event.costLines),
    // sentCents, notSentCents, uninvoicedCents, balanceCents (may be negative), invoiceState
    // (api-contract "Invoicing v3").
    ...invoicing(economics.totalPriceCents, event.invoiceRows, { played, cancelled: event.status === 'CANCELLED' }),
    deletedAt: event.deletedAt?.toISOString() ?? null,
    createdAt: event.createdAt.toISOString(),
    updatedAt: event.updatedAt.toISOString(),
  };
}

export type EventSummaryDto = ReturnType<typeof toEventSummaryDto>;

export function toEventDetailDto(event: EventWithDetail, today: string) {
  return {
    ...toEventSummaryDto(event, today),
    costLines: [...event.costLines].sort(compareCostLines).map(toCostLineDto),
    invoiceRows: [...event.invoiceRows].sort(compareInvoiceRows).map(toInvoiceRowDto),
  };
}

export type EventDetailDto = ReturnType<typeof toEventDetailDto>;

export function toEventHistoryEntryDto(e: EventHistory) {
  return {
    id: e.id,
    eventId: e.eventId,
    type: e.type,
    partnerId: e.partnerId,
    at: e.at.toISOString(),
    reason: e.reason,
    details: e.details,
  };
}
