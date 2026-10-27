/** Gig rows → contract JSON (docs/api-contract.md: GigSummary, GigDetail, CostLine, Attachment, GigEvent). */
import { isoFromDate } from '../domain/dates.js';
import { gigEconomics, isNotFullyStaffed, isPlayed } from '../domain/gigEconomics.js';
import type { Attachment, CostLine, Gig, GigEvent, Prisma, PurchaseOrderStatus } from '../generated/prisma/client.js';

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
  gigId: string;
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
    gigId: line.gigId,
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

export interface AttachmentDto {
  id: string;
  gigId: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  uploadedBy: string;
  uploadedAt: string;
}

export function toAttachmentDto(a: Attachment): AttachmentDto {
  return {
    id: a.id,
    gigId: a.gigId,
    filename: a.filename,
    contentType: a.contentType,
    sizeBytes: a.sizeBytes,
    uploadedBy: a.uploadedById,
    uploadedAt: a.uploadedAt.toISOString(),
  };
}

/** Contract order of a gig's cost lines: creation time, then id. */
export function compareCostLines(a: CostLine, b: CostLine): number {
  const t = a.createdAt.getTime() - b.createdAt.getTime();
  if (t !== 0) return t;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** A gig as the serializers need it: its cost lines and the name of its client (BR-100). */
export type GigWithLines = Gig & { costLines: CostLine[]; client: { name: string } | null };
export type GigWithDetail = Omit<GigWithLines, 'costLines'> & {
  costLines: CostLineWithPurchaseOrder[];
  attachments: Attachment[];
};

export function toGigSummaryDto(gig: GigWithLines, today: string) {
  const startDate = isoFromDate(gig.startDate);
  return {
    id: gig.id,
    startDate,
    endDate: gig.endDate ? isoFromDate(gig.endDate) : null,
    year: gig.startDate.getUTCFullYear(),
    status: gig.status,
    played: isPlayed(gig.status, startDate, today),
    lineupTemplateId: gig.lineupTemplateId,
    lineupName: gig.lineupName,
    venue: gig.venue,
    technicalSetup: gig.technicalSetup,
    logistics: gig.logistics,
    houseTechnician: gig.houseTechnician,
    sellerId: gig.sellerId,
    producerId: gig.producerId,
    priceCents: gig.priceCents,
    additionalSalesCents: gig.additionalSalesCents,
    additionalSalesDescription: gig.additionalSalesDescription,
    notes: gig.notes,
    clientId: gig.clientId,
    clientName: gig.client?.name ?? null,
    offerId: gig.offerId,
    ...gigEconomics(gig),
    notFullyStaffed: isNotFullyStaffed(gig.costLines),
    deletedAt: gig.deletedAt?.toISOString() ?? null,
    createdAt: gig.createdAt.toISOString(),
    updatedAt: gig.updatedAt.toISOString(),
  };
}

export type GigSummaryDto = ReturnType<typeof toGigSummaryDto>;

export function toGigDetailDto(gig: GigWithDetail, today: string) {
  return {
    ...toGigSummaryDto(gig, today),
    costLines: [...gig.costLines].sort(compareCostLines).map(toCostLineDto),
    attachments: gig.attachments
      .filter((a) => a.deletedAt === null)
      .sort((a, b) => b.uploadedAt.getTime() - a.uploadedAt.getTime() || (a.id < b.id ? 1 : -1))
      .map(toAttachmentDto),
  };
}

export type GigDetailDto = ReturnType<typeof toGigDetailDto>;

export function toGigEventDto(e: GigEvent) {
  return {
    id: e.id,
    gigId: e.gigId,
    type: e.type,
    partnerId: e.partnerId,
    at: e.at.toISOString(),
    reason: e.reason,
    details: e.details,
  };
}
