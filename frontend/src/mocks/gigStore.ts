// In-memory mock of the gig domain (gigs, cost lines, attachments, history, people).
// Implements the rules of docs/api-contract.md (Gigs, Cost lines, Attachments) so the UI
// behaves like the real backend: economics, played, notFullyStaffed, BR-020/021 line creation,
// BR-022 double booking, BR-026 load-in switch, BR-027 seller/producer change, history events.
// Synthetic data only (BR-090). This file does not import mocks/data.ts (no import cycle):
// callers pass in the settings and templates they need.
import type { CostType, GigEventType, GigStatus, TechnicalSetup } from '../api/enums';
import { isMusicianRole } from '../api/enums';
import type {
  Attachment,
  CostLine,
  FieldChange,
  GigDetail,
  GigEvent,
  GigSummary,
  Id,
  IsoDate,
  LineupTemplate,
  Person,
  PersonDoubleBookedWarning,
  Settings,
  YearGigTotals,
} from '../api/types';
import { todayIso } from '../lib/format';

export interface MockGig {
  id: Id;
  startDate: IsoDate;
  endDate: IsoDate | null;
  status: GigStatus;
  lineupTemplateId: Id | null;
  lineupName: string;
  venue: string;
  technicalSetup: TechnicalSetup[];
  sellerId: Id;
  producerId: Id;
  priceCents: number;
  additionalSalesCents: number;
  additionalSalesDescription: string | null;
  notes: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MockAttachment extends Attachment {
  deletedAt: string | null;
  /** File content for the download endpoint. */
  content: Blob;
}

export interface GigState {
  people: Person[];
  gigs: MockGig[];
  /** Kept in creation order (contract: lines ordered by creation time). */
  costLines: CostLine[];
  attachments: MockAttachment[];
  events: GigEvent[];
}

export function emptyGigState(): GigState {
  return { people: [], gigs: [], costLines: [], attachments: [], events: [] };
}

let idCounter = 0;
/** UUID-shaped id. */
export function mockId(): Id {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  idCounter += 1;
  return `00000000-0000-4000-9000-${String(idCounter).padStart(12, '0')}`;
}

/** Monotonic timestamps so events created in the same millisecond keep their order. */
let lastTs = 0;
export function nowTs(): string {
  const ms = Math.max(Date.now(), lastTs + 1);
  lastTs = ms;
  return new Date(ms).toISOString();
}

// ---------- Derived values ----------

export function pct(margin: number, total: number): number | null {
  if (total === 0) return null;
  return Math.round((margin / total) * 1000) / 10;
}

export function linesOf(state: GigState, gigId: Id): CostLine[] {
  return state.costLines.filter((l) => l.gigId === gigId);
}

export function toSummary(state: GigState, gig: MockGig, today = todayIso()): GigSummary {
  const lines = linesOf(state, gig.id);
  const totalPriceCents = gig.priceCents + gig.additionalSalesCents;
  const budgetedCostsCents = lines.reduce((sum, l) => sum + l.budgetedCents, 0);
  const actualCostsCents = lines.reduce(
    (sum, l) => sum + (l.paidAt !== null ? (l.actualCents ?? 0) : 0),
    0,
  );
  const marginBudgetCents = totalPriceCents - budgetedCostsCents;
  const marginActualCents = totalPriceCents - actualCostsCents;
  return {
    id: gig.id,
    startDate: gig.startDate,
    endDate: gig.endDate,
    year: Number(gig.startDate.slice(0, 4)),
    status: gig.status,
    played: gig.status === 'SOLD' && gig.startDate < today,
    lineupTemplateId: gig.lineupTemplateId,
    lineupName: gig.lineupName,
    venue: gig.venue,
    technicalSetup: [...gig.technicalSetup],
    sellerId: gig.sellerId,
    producerId: gig.producerId,
    priceCents: gig.priceCents,
    additionalSalesCents: gig.additionalSalesCents,
    additionalSalesDescription: gig.additionalSalesDescription,
    notes: gig.notes,
    totalPriceCents,
    budgetedCostsCents,
    actualCostsCents,
    marginBudgetCents,
    marginActualCents,
    marginBudgetPct: pct(marginBudgetCents, totalPriceCents),
    marginActualPct: pct(marginActualCents, totalPriceCents),
    notFullyStaffed: lines.some((l) => isMusicianRole(l.type) && l.personId === null),
    deletedAt: gig.deletedAt,
    createdAt: gig.createdAt,
    updatedAt: gig.updatedAt,
  };
}

export function toDetail(state: GigState, gig: MockGig): GigDetail {
  return {
    ...toSummary(state, gig),
    costLines: linesOf(state, gig.id).map((l) => ({ ...l })),
    attachments: state.attachments
      .filter((a) => a.gigId === gig.id && a.deletedAt === null)
      .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt))
      .map(publicAttachment),
  };
}

/** Attachment as the API returns it (without mock-only fields). */
export function publicAttachment(a: MockAttachment): Attachment {
  return {
    id: a.id,
    gigId: a.gigId,
    filename: a.filename,
    contentType: a.contentType,
    sizeBytes: a.sizeBytes,
    uploadedBy: a.uploadedBy,
    uploadedAt: a.uploadedAt,
  };
}

/** `gigs` object of GET /api/years/{year}: non-deleted gigs of the year, cancelled included. */
export function yearTotals(state: GigState, year: number): YearGigTotals {
  const gigs = state.gigs
    .filter((g) => g.deletedAt === null && g.startDate.startsWith(`${year}-`))
    .map((g) => toSummary(state, g));
  const sum = (pick: (g: GigSummary) => number) => gigs.reduce((s, g) => s + pick(g), 0);
  return {
    gigCount: gigs.filter((g) => g.status === 'SOLD').length,
    cancelledCount: gigs.filter((g) => g.status === 'CANCELLED').length,
    soldGigsSumCents: sum((g) => g.totalPriceCents),
    budgetedCostsCents: sum((g) => g.budgetedCostsCents),
    actualCostsCents: sum((g) => g.actualCostsCents),
    marginBudgetCents: sum((g) => g.marginBudgetCents),
    marginActualCents: sum((g) => g.marginActualCents),
  };
}

// ---------- History ----------

export function logEvent(
  state: GigState,
  gigId: Id,
  type: GigEventType,
  partnerId: Id,
  details: object = {},
  reason: string | null = null,
): void {
  state.events.push({
    id: mockId(),
    gigId,
    type,
    partnerId,
    at: nowTs(),
    reason,
    details,
  } as GigEvent);
}

// ---------- Double booking (BR-022) ----------

function overlaps(a: MockGig, b: MockGig): boolean {
  const aEnd = a.endDate ?? a.startDate;
  const bEnd = b.endDate ?? b.startDate;
  return a.startDate <= bEnd && b.startDate <= aEnd;
}

/** One warning per (person, other gig) where the person is on another active, overlapping gig. */
export function doubleBookingWarnings(
  state: GigState,
  gig: MockGig,
  personIds: (Id | null)[],
): PersonDoubleBookedWarning[] {
  const warnings: PersonDoubleBookedWarning[] = [];
  const unique = [...new Set(personIds.filter((p): p is Id => p !== null))];
  for (const personId of unique) {
    for (const other of state.gigs) {
      if (other.id === gig.id || other.deletedAt !== null || other.status !== 'SOLD') continue;
      if (!overlaps(gig, other)) continue;
      if (!linesOf(state, other.id).some((l) => l.personId === personId)) continue;
      warnings.push({
        code: 'PERSON_DOUBLE_BOOKED',
        personId,
        otherGigId: other.id,
        otherGigStartDate: other.startDate,
        otherGigLineupName: other.lineupName,
      });
    }
  }
  return warnings;
}

// ---------- Mutations used by handlers and the seed ----------

export interface NewGigInput {
  startDate: IsoDate;
  endDate: IsoDate | null;
  lineupTemplateId: Id | null;
  lineupName: string | null;
  venue: string;
  technicalSetup: TechnicalSetup[];
  sellerId: Id;
  producerId: Id;
  priceCents: number;
  additionalSalesCents: number;
  additionalSalesDescription: string | null;
  notes: string | null;
}

export function partnerPersonId(partners: { id: Id; personId: Id }[], partnerId: Id): Id | null {
  return partners.find((p) => p.id === partnerId)?.personId ?? null;
}

function newLine(gigId: Id, type: CostType, personId: Id | null, budgetedCents: number): CostLine {
  return {
    id: mockId(),
    gigId,
    type,
    personId,
    description: null,
    budgetedCents,
    joinsLoadIn: isMusicianRole(type) ? true : null,
    loadInDeductionAppliedCents: null,
    actualCents: null,
    paidAt: null,
    paidBy: null,
  };
}

/** Creates a SOLD gig with BR-020 / BR-021 cost lines and logs CREATED. */
export function createGig(
  state: GigState,
  input: NewGigInput,
  actorId: Id,
  ctx: { templates: LineupTemplate[]; settings: Settings; partners: { id: Id; personId: Id }[] },
): MockGig {
  const template = ctx.templates.find((t) => t.id === input.lineupTemplateId) ?? null;
  const ts = nowTs();
  const gig: MockGig = {
    id: mockId(),
    startDate: input.startDate,
    endDate: input.endDate,
    status: 'SOLD',
    lineupTemplateId: template?.id ?? null,
    lineupName: input.lineupName ?? template?.name ?? '',
    venue: input.venue,
    technicalSetup: [...input.technicalSetup],
    sellerId: input.sellerId,
    producerId: input.producerId,
    priceCents: input.priceCents,
    additionalSalesCents: input.additionalSalesCents,
    additionalSalesDescription: input.additionalSalesDescription,
    notes: input.notes,
    deletedAt: null,
    createdAt: ts,
    updatedAt: ts,
  };
  state.gigs.push(gig);
  for (const role of template?.roles ?? []) {
    state.costLines.push(newLine(gig.id, role.role, null, role.defaultFeeCents));
  }
  state.costLines.push(newLine(gig.id, 'OFFICE', null, ctx.settings.officeDefaultCents));
  state.costLines.push(
    newLine(gig.id, 'SALES', partnerPersonId(ctx.partners, gig.sellerId), ctx.settings.salesDefaultCents),
  );
  state.costLines.push(
    newLine(
      gig.id,
      'PRODUCTION',
      partnerPersonId(ctx.partners, gig.producerId),
      ctx.settings.productionDefaultCents,
    ),
  );
  logEvent(state, gig.id, 'CREATED', actorId);
  return gig;
}

export function addCostLine(
  state: GigState,
  gig: MockGig,
  input: { type: CostType; personId: Id | null; description: string | null; budgetedCents: number },
  actorId: Id,
): CostLine {
  const line = { ...newLine(gig.id, input.type, input.personId, input.budgetedCents), description: input.description };
  state.costLines.push(line);
  logEvent(state, gig.id, 'COST_ADDED', actorId, {
    costLineId: line.id,
    type: line.type,
    personId: line.personId,
    budgetedCents: line.budgetedCents,
  });
  return line;
}

export interface CostLinePatch {
  personId?: Id | null;
  description?: string | null;
  budgetedCents?: number;
  joinsLoadIn?: boolean;
}

/** Applies a PATCH (budget first, then the load-in switch, BR-026) and logs COST_UPDATED. */
export function updateCostLine(
  state: GigState,
  line: CostLine,
  patch: CostLinePatch,
  loadInDeductionCents: number,
  actorId: Id,
): FieldChange[] {
  const changes: FieldChange[] = [];
  const set = <K extends keyof CostLine>(field: K, value: CostLine[K]) => {
    if (line[field] === value) return;
    changes.push({ field, from: line[field], to: value });
    line[field] = value;
  };
  if (patch.personId !== undefined) set('personId', patch.personId);
  if (patch.description !== undefined) set('description', patch.description);
  if (patch.budgetedCents !== undefined) set('budgetedCents', patch.budgetedCents);
  if (patch.joinsLoadIn !== undefined && patch.joinsLoadIn !== line.joinsLoadIn) {
    if (patch.joinsLoadIn === false) {
      const deducted = Math.min(loadInDeductionCents, line.budgetedCents);
      set('budgetedCents', line.budgetedCents - deducted);
      line.loadInDeductionAppliedCents = deducted;
    } else {
      set('budgetedCents', line.budgetedCents + (line.loadInDeductionAppliedCents ?? 0));
      line.loadInDeductionAppliedCents = null;
    }
    set('joinsLoadIn', patch.joinsLoadIn);
  }
  if (changes.length > 0) {
    logEvent(state, line.gigId, 'COST_UPDATED', actorId, {
      costLineId: line.id,
      type: line.type,
      changes,
    });
  }
  return changes;
}

export function payCostLine(state: GigState, line: CostLine, actualCents: number, actorId: Id): void {
  line.actualCents = actualCents;
  line.paidAt = nowTs();
  line.paidBy = actorId;
  logEvent(state, line.gigId, 'COST_PAID', actorId, {
    costLineId: line.id,
    type: line.type,
    actualCents,
  });
}

export function unpayCostLine(state: GigState, line: CostLine, actorId: Id): void {
  if (line.paidAt === null) return;
  const previousActualCents = line.actualCents ?? 0;
  line.actualCents = null;
  line.paidAt = null;
  line.paidBy = null;
  logEvent(state, line.gigId, 'COST_UNPAID', actorId, {
    costLineId: line.id,
    type: line.type,
    previousActualCents,
  });
}

export function removeCostLine(state: GigState, line: CostLine, actorId: Id): void {
  state.costLines = state.costLines.filter((l) => l.id !== line.id);
  logEvent(state, line.gigId, 'COST_REMOVED', actorId, {
    costLineId: line.id,
    type: line.type,
    personId: line.personId,
    budgetedCents: line.budgetedCents,
  });
}

export type GigPatchField =
  | 'lineupName'
  | 'venue'
  | 'technicalSetup'
  | 'sellerId'
  | 'producerId'
  | 'priceCents'
  | 'additionalSalesCents'
  | 'additionalSalesDescription'
  | 'notes';

export const GIG_PATCH_FIELDS: GigPatchField[] = [
  'lineupName',
  'venue',
  'technicalSetup',
  'sellerId',
  'producerId',
  'priceCents',
  'additionalSalesCents',
  'additionalSalesDescription',
  'notes',
];

function sameValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Applies a GigUpdate. Seller/producer change moves the old holder's unpaid SALES / PRODUCTION
 * lines to the new one (BR-027). Logs one UPDATED event with all changed fields.
 */
export function updateGig(
  state: GigState,
  gig: MockGig,
  patch: Partial<Pick<MockGig, GigPatchField>>,
  partners: { id: Id; personId: Id }[],
  actorId: Id,
): { changes: FieldChange[]; movedCostLineIds: Id[] } {
  const changes: FieldChange[] = [];
  const movedCostLineIds: Id[] = [];
  const oldSeller = gig.sellerId;
  const oldProducer = gig.producerId;
  for (const field of GIG_PATCH_FIELDS) {
    const value = patch[field];
    if (value === undefined || sameValue(gig[field], value)) continue;
    changes.push({ field, from: gig[field], to: value });
    (gig as unknown as Record<string, unknown>)[field] = value;
  }
  const moveLines = (type: CostType, fromPartner: Id, toPartner: Id) => {
    if (fromPartner === toPartner) return;
    const fromPerson = partnerPersonId(partners, fromPartner);
    const toPerson = partnerPersonId(partners, toPartner);
    for (const line of linesOf(state, gig.id)) {
      if (line.type !== type || line.paidAt !== null || line.personId !== fromPerson) continue;
      line.personId = toPerson;
      movedCostLineIds.push(line.id);
    }
  };
  moveLines('SALES', oldSeller, gig.sellerId);
  moveLines('PRODUCTION', oldProducer, gig.producerId);
  if (changes.length > 0) {
    gig.updatedAt = nowTs();
    logEvent(state, gig.id, 'UPDATED', actorId, { changes, movedCostLineIds });
  }
  return { changes, movedCostLineIds };
}

export function addAttachment(
  state: GigState,
  gig: MockGig,
  file: { filename: string; contentType: string; content: Blob },
  actorId: Id,
): MockAttachment {
  const attachment: MockAttachment = {
    id: mockId(),
    gigId: gig.id,
    filename: file.filename,
    contentType: file.contentType,
    sizeBytes: file.content.size,
    uploadedBy: actorId,
    uploadedAt: nowTs(),
    deletedAt: null,
    content: file.content,
  };
  state.attachments.push(attachment);
  logEvent(state, gig.id, 'ATTACHMENT_ADDED', actorId, {
    attachmentId: attachment.id,
    filename: attachment.filename,
  });
  return attachment;
}
