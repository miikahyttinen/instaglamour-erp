// In-memory mock of the event domain (events, cost lines, history, people, clients).
// Offers live in offerStore.ts (db.offers).
// Implements the rules of docs/api-contract.md (Events, Cost lines, Invoice rows) so the UI
// behaves like the real backend: economics, played, notFullyStaffed, BR-020/021 line creation,
// BR-022 double booking, BR-026 load-in switch, BR-027 seller/producer change, history events.
// Synthetic data only (BR-090). This file does not import mocks/data.ts (no import cycle):
// callers pass in the settings and templates they need.
import type {
  CostType,
  EventHistoryType,
  EventStatus,
  InvoiceRowStatus,
  InvoiceState,
  Logistics,
  TechnicalSetup,
} from '../api/enums';
import { isMusicianRole } from '../api/enums';
import type {
  CostLine,
  FieldChange,
  EventDetail,
  EventHistoryEntry,
  EventSummary,
  Id,
  InvoiceListRow,
  InvoiceRow,
  IsoDate,
  LineupLine,
  Person,
  PersonDoubleBookedWarning,
  YearEventTotals,
} from '../api/types';
import { todayIso } from '../lib/format';

export interface MockEvent {
  id: Id;
  startDate: IsoDate;
  endDate: IsoDate | null;
  status: EventStatus;
  lineupTemplateId: Id | null;
  lineupName: string;
  venue: string;
  technicalSetup: TechnicalSetup | null;
  logistics: Logistics | null;
  houseTechnician: boolean;
  contractDone: boolean;
  sellerId: Id;
  producerId: Id;
  priceCents: number;
  additionalSalesCents: number;
  additionalSalesDescription: string | null;
  notes: string | null;
  /** "Laskutustiedot" free text (owner request 2026-11-11); detail only. */
  invoicingDetails: string | null;
  clientId: Id | null;
  offerId: Id | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Client (UC-027). Soft-deleted clients keep their row so old links still resolve a name. */
export interface MockClient {
  id: Id;
  name: string;
  notes: string | null;
  deletedAt: string | null;
}

/**
 * A stored person; `partner` is derived from `db.partners` and `eventCount` from the events when the
 * API returns it (UC-032, people roles).
 */
export type MockPerson = Omit<Person, 'partner' | 'eventCount'>;

export interface EventState {
  people: MockPerson[];
  clients: MockClient[];
  events: MockEvent[];
  /** Kept in creation order (contract: lines ordered by creation time). */
  costLines: CostLine[];
  /** Kept in creation order (contract: invoice rows in creation order). */
  invoiceRows: InvoiceRow[];
  history: EventHistoryEntry[];
}

export function emptyEventState(): EventState {
  return { people: [], clients: [], events: [], costLines: [], invoiceRows: [], history: [] };
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

export function linesOf(state: EventState, eventId: Id): CostLine[] {
  return state.costLines.filter((l) => l.eventId === eventId);
}

export function invoiceRowsOf(state: EventState, eventId: Id): InvoiceRow[] {
  return state.invoiceRows.filter((r) => r.eventId === eventId);
}

export interface InvoiceFigures {
  sentCents: number;
  notSentCents: number;
  uninvoicedCents: number;
  balanceCents: number;
  invoiceState: InvoiceState;
}

/**
 * Derived invoicing figures of a gig (api-contract "Invoicing v3"): sent = Σ SENT, notSent =
 * Σ NOT_SENT, uninvoiced = max(total − sent − notSent, 0), balance = total − sent.
 * State, first match wins: any NOT_SENT row → OPEN_INVOICES; sent ≥ total > 0 → FULLY_INVOICED;
 * at least one row, played (SOLD, start date passed) or cancelled, and sent < total → PARTLY_INVOICED;
 * otherwise NONE (no rows at all — also a played gig before its first invoice, owner decision
 * 2026-11-07 —, upcoming not fully sent, total 0 with only SENT rows).
 */
export function invoiceFigures(
  rows: Pick<InvoiceRow, 'status' | 'amountCents'>[],
  totalPriceCents: number,
  played: boolean,
  cancelled = false,
): InvoiceFigures {
  const sum = (status: InvoiceRowStatus) =>
    rows.filter((r) => r.status === status).reduce((s, r) => s + r.amountCents, 0);
  const total = totalPriceCents;
  const sentCents = sum('SENT');
  const notSentCents = sum('NOT_SENT');
  const invoiceState: InvoiceState = rows.some((r) => r.status === 'NOT_SENT')
    ? 'OPEN_INVOICES'
    : total > 0 && sentCents >= total
      ? 'FULLY_INVOICED'
      : rows.length > 0 && (played || cancelled) && sentCents < total
        ? 'PARTLY_INVOICED'
        : 'NONE';
  return {
    sentCents,
    notSentCents,
    uninvoicedCents: Math.max(total - sentCents - notSentCents, 0),
    balanceCents: total - sentCents,
    invoiceState,
  };
}

export function toSummary(state: EventState, event: MockEvent, today = todayIso()): EventSummary {
  const lines = linesOf(state, event.id);
  const totalPriceCents = event.priceCents + event.additionalSalesCents;
  const budgetedCostsCents = lines.reduce((sum, l) => sum + l.budgetedCents, 0);
  const actualCostsCents = lines.reduce(
    (sum, l) => sum + (l.paidAt !== null ? (l.actualCents ?? 0) : 0),
    0,
  );
  const marginBudgetCents = totalPriceCents - budgetedCostsCents;
  const marginActualCents = totalPriceCents - actualCostsCents;
  const played = event.status === 'SOLD' && event.startDate < today;
  return {
    id: event.id,
    startDate: event.startDate,
    endDate: event.endDate,
    year: Number(event.startDate.slice(0, 4)),
    status: event.status,
    played,
    lineupTemplateId: event.lineupTemplateId,
    lineupName: event.lineupName,
    venue: event.venue,
    technicalSetup: event.technicalSetup,
    logistics: event.logistics,
    houseTechnician: event.houseTechnician,
    contractDone: event.contractDone,
    sellerId: event.sellerId,
    producerId: event.producerId,
    priceCents: event.priceCents,
    additionalSalesCents: event.additionalSalesCents,
    additionalSalesDescription: event.additionalSalesDescription,
    notes: event.notes,
    totalPriceCents,
    budgetedCostsCents,
    actualCostsCents,
    marginBudgetCents,
    marginActualCents,
    marginBudgetPct: pct(marginBudgetCents, totalPriceCents),
    marginActualPct: pct(marginActualCents, totalPriceCents),
    notFullyStaffed: lines.some((l) => isMusicianRole(l.type) && l.personId === null),
    clientId: event.clientId,
    clientName: state.clients.find((c) => c.id === event.clientId)?.name ?? null,
    offerId: event.offerId,
    ...invoiceFigures(invoiceRowsOf(state, event.id), totalPriceCents, played, event.status === 'CANCELLED'),
    deletedAt: event.deletedAt,
    createdAt: event.createdAt,
    updatedAt: event.updatedAt,
  };
}

export function toDetail(state: EventState, event: MockEvent): EventDetail {
  return {
    ...toSummary(state, event),
    invoicingDetails: event.invoicingDetails ?? null,
    costLines: linesOf(state, event.id).map((l) => ({ ...l })),
    invoiceRows: invoiceRowsOf(state, event.id).map((r) => ({ ...r })),
  };
}

/** `events` object of GET /api/years/{year}: non-deleted events of the year, cancelled included. */
export function yearTotals(state: EventState, year: number): YearEventTotals {
  const events = state.events
    .filter((g) => g.deletedAt === null && g.startDate.startsWith(`${year}-`))
    .map((g) => toSummary(state, g));
  const sum = (pick: (g: EventSummary) => number) => events.reduce((s, g) => s + pick(g), 0);
  return {
    eventCount: events.filter((g) => g.status === 'SOLD').length,
    cancelledCount: events.filter((g) => g.status === 'CANCELLED').length,
    soldEventsSumCents: sum((g) => g.totalPriceCents),
    budgetedCostsCents: sum((g) => g.budgetedCostsCents),
    actualCostsCents: sum((g) => g.actualCostsCents),
    marginBudgetCents: sum((g) => g.marginBudgetCents),
    marginActualCents: sum((g) => g.marginActualCents),
  };
}

// ---------- History ----------

export function logEvent(
  state: EventState,
  eventId: Id,
  type: EventHistoryType,
  partnerId: Id | null,
  details: object = {},
  reason: string | null = null,
): void {
  state.history.push({
    id: mockId(),
    eventId,
    type,
    partnerId,
    at: nowTs(),
    reason,
    details,
  } as EventHistoryEntry);
}

// ---------- Double booking (BR-022) ----------

function overlaps(a: MockEvent, b: MockEvent): boolean {
  const aEnd = a.endDate ?? a.startDate;
  const bEnd = b.endDate ?? b.startDate;
  return a.startDate <= bEnd && b.startDate <= aEnd;
}

/**
 * One warning per (person, other event) where a person on one of `lines` also has a line on
 * another active, overlapping event. Performers only: just musician-role lines count, on both
 * sides; Office, Sales, Production and expense lines never warn (BR-022).
 */
export function doubleBookingWarnings(
  state: EventState,
  event: MockEvent,
  lines: Pick<CostLine, 'type' | 'personId'>[],
): PersonDoubleBookedWarning[] {
  const warnings: PersonDoubleBookedWarning[] = [];
  const performerIds = lines.filter((l) => isMusicianRole(l.type)).map((l) => l.personId);
  const unique = [...new Set(performerIds.filter((p): p is Id => p !== null))];
  for (const personId of unique) {
    for (const other of state.events) {
      if (other.id === event.id || other.deletedAt !== null || other.status !== 'SOLD') continue;
      if (!overlaps(event, other)) continue;
      if (!linesOf(state, other.id).some((l) => l.personId === personId && isMusicianRole(l.type))) continue;
      warnings.push({
        code: 'PERSON_DOUBLE_BOOKED',
        personId,
        otherEventId: other.id,
        otherEventStartDate: other.startDate,
        otherEventLineupName: other.lineupName,
      });
    }
  }
  return warnings;
}

// ---------- Mutations used by handlers and the seed ----------

export interface NewEventInput {
  startDate: IsoDate;
  endDate: IsoDate | null;
  lineupTemplateId: Id | null;
  lineupName: string | null;
  venue: string;
  technicalSetup: TechnicalSetup | null;
  logistics: Logistics | null;
  houseTechnician: boolean;
  /** Default false. */
  contractDone?: boolean;
  sellerId: Id;
  producerId: Id;
  priceCents: number;
  additionalSalesCents: number;
  additionalSalesDescription: string | null;
  notes: string | null;
  /** Optional, default null. */
  invoicingDetails?: string | null;
  clientId?: Id | null;
}

export function partnerPersonId(partners: { id: Id; personId: Id }[], partnerId: Id): Id | null {
  return partners.find((p) => p.id === partnerId)?.personId ?? null;
}

function newLine(eventId: Id, type: CostType, personId: Id | null, budgetedCents: number): CostLine {
  return {
    id: mockId(),
    eventId,
    type,
    personId,
    description: null,
    budgetedCents,
    joinsLoadIn: isMusicianRole(type) ? true : null,
    loadInDeductionAppliedCents: null,
    actualCents: null,
    paidAt: null,
    paidBy: null,
    purchaseOrder: null,
  };
}

/** A lineup as event creation needs it (the store's lineups or the reference shape). */
export interface LineupForCreate {
  id: Id;
  name: string;
  lines: LineupLine[];
}

/**
 * Creates a SOLD event with the BR-020 / BR-021 (revised 2026-11-06) cost lines and logs CREATED:
 * one line per lineup line (amount, description; musician roles join the load-in; SALES = seller,
 * PRODUCTION = producer), plus SALES / PRODUCTION at 0 € when the lineup lacks them. Without a
 * lineup: OFFICE, SALES, PRODUCTION at 0 €.
 */
export function createEvent(
  state: EventState,
  input: NewEventInput,
  actorId: Id,
  ctx: { templates: LineupForCreate[]; partners: { id: Id; personId: Id }[] },
): MockEvent {
  const template = ctx.templates.find((t) => t.id === input.lineupTemplateId) ?? null;
  const ts = nowTs();
  const event: MockEvent = {
    id: mockId(),
    startDate: input.startDate,
    endDate: input.endDate,
    status: 'SOLD',
    lineupTemplateId: template?.id ?? null,
    lineupName: input.lineupName ?? template?.name ?? '',
    venue: input.venue,
    technicalSetup: input.technicalSetup,
    logistics: input.logistics,
    houseTechnician: input.houseTechnician,
    contractDone: input.contractDone ?? false,
    sellerId: input.sellerId,
    producerId: input.producerId,
    priceCents: input.priceCents,
    additionalSalesCents: input.additionalSalesCents,
    additionalSalesDescription: input.additionalSalesDescription,
    notes: input.notes,
    invoicingDetails: input.invoicingDetails ?? null,
    clientId: input.clientId ?? null,
    offerId: null,
    deletedAt: null,
    createdAt: ts,
    updatedAt: ts,
  };
  state.events.push(event);
  const seller = partnerPersonId(ctx.partners, event.sellerId);
  const producer = partnerPersonId(ctx.partners, event.producerId);
  const personFor = (type: CostType) => (type === 'SALES' ? seller : type === 'PRODUCTION' ? producer : null);
  const lines = template?.lines ?? [{ type: 'OFFICE' as const, description: null, defaultCents: 0 }];
  for (const line of lines) {
    state.costLines.push({
      ...newLine(event.id, line.type, personFor(line.type), line.defaultCents),
      description: line.description,
    });
  }
  for (const type of ['SALES', 'PRODUCTION'] as const) {
    if (!lines.some((l) => l.type === type)) state.costLines.push(newLine(event.id, type, personFor(type), 0));
  }
  logEvent(state, event.id, 'CREATED', actorId);
  return event;
}

export function addCostLine(
  state: EventState,
  event: MockEvent,
  input: { type: CostType; personId: Id | null; description: string | null; budgetedCents: number },
  actorId: Id,
): CostLine {
  const line = { ...newLine(event.id, input.type, input.personId, input.budgetedCents), description: input.description };
  state.costLines.push(line);
  logEvent(state, event.id, 'COST_ADDED', actorId, {
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
  state: EventState,
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
    logEvent(state, line.eventId, 'COST_UPDATED', actorId, {
      costLineId: line.id,
      type: line.type,
      changes,
    });
  }
  return changes;
}

/**
 * Marks a line paid. An already-paid line only gets its amount updated (original paid time and
 * partner kept); paying again with the same amount changes nothing and logs nothing.
 */
export function payCostLine(state: EventState, line: CostLine, actualCents: number, actorId: Id): void {
  if (line.paidAt !== null && line.actualCents === actualCents) return;
  line.actualCents = actualCents;
  if (line.paidAt === null) {
    line.paidAt = nowTs();
    line.paidBy = actorId;
  }
  logEvent(state, line.eventId, 'COST_PAID', actorId, {
    costLineId: line.id,
    type: line.type,
    actualCents,
  });
}

export function unpayCostLine(state: EventState, line: CostLine, actorId: Id): void {
  if (line.paidAt === null) return;
  const previousActualCents = line.actualCents ?? 0;
  line.actualCents = null;
  line.paidAt = null;
  line.paidBy = null;
  logEvent(state, line.eventId, 'COST_UNPAID', actorId, {
    costLineId: line.id,
    type: line.type,
    previousActualCents,
  });
}

export function removeCostLine(state: EventState, line: CostLine, actorId: Id): void {
  state.costLines = state.costLines.filter((l) => l.id !== line.id);
  logEvent(state, line.eventId, 'COST_REMOVED', actorId, {
    costLineId: line.id,
    type: line.type,
    personId: line.personId,
    budgetedCents: line.budgetedCents,
  });
}

export type EventPatchField =
  | 'lineupName'
  | 'venue'
  | 'technicalSetup'
  | 'logistics'
  | 'houseTechnician'
  | 'contractDone'
  | 'sellerId'
  | 'producerId'
  | 'priceCents'
  | 'additionalSalesCents'
  | 'additionalSalesDescription'
  | 'notes'
  | 'invoicingDetails'
  | 'clientId';

export const EVENT_PATCH_FIELDS: EventPatchField[] = [
  'lineupName',
  'venue',
  'technicalSetup',
  'logistics',
  'houseTechnician',
  'contractDone',
  'sellerId',
  'producerId',
  'priceCents',
  'additionalSalesCents',
  'additionalSalesDescription',
  'notes',
  'invoicingDetails',
  'clientId',
];

function sameValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Applies a EventUpdate. Seller/producer change moves the old holder's unpaid SALES / PRODUCTION
 * lines to the new one (BR-027). Logs one UPDATED event with all changed fields.
 */
export function updateEvent(
  state: EventState,
  event: MockEvent,
  patch: Partial<Pick<MockEvent, EventPatchField>>,
  partners: { id: Id; personId: Id }[],
  actorId: Id,
): { changes: FieldChange[]; movedCostLineIds: Id[] } {
  const changes: FieldChange[] = [];
  const movedCostLineIds: Id[] = [];
  const oldSeller = event.sellerId;
  const oldProducer = event.producerId;
  for (const field of EVENT_PATCH_FIELDS) {
    const value = patch[field];
    if (value === undefined || sameValue(event[field], value)) continue;
    changes.push({ field, from: event[field], to: value });
    (event as unknown as Record<string, unknown>)[field] = value;
  }
  const moveLines = (type: CostType, fromPartner: Id, toPartner: Id) => {
    if (fromPartner === toPartner) return;
    const fromPerson = partnerPersonId(partners, fromPartner);
    const toPerson = partnerPersonId(partners, toPartner);
    for (const line of linesOf(state, event.id)) {
      // Lines on a purchase order keep their person (BR-118).
      if (line.type !== type || line.paidAt !== null || line.purchaseOrder || line.personId !== fromPerson) continue;
      line.personId = toPerson;
      movedCostLineIds.push(line.id);
    }
  };
  moveLines('SALES', oldSeller, event.sellerId);
  moveLines('PRODUCTION', oldProducer, event.producerId);
  if (changes.length > 0) {
    event.updatedAt = nowTs();
    logEvent(state, event.id, 'UPDATED', actorId, { changes, movedCostLineIds });
  }
  return { changes, movedCostLineIds };
}

// ---------- Invoice rows (api-contract "Invoice rows") ----------

/**
 * Laskutus page (`GET /api/invoice-rows`): every invoice row of non-deleted gigs (any status, all
 * years) with its gig's data; NOT_SENT first, then SENT; newest `createdAt` first, ties by id.
 */
export function listInvoiceRows(state: EventState): InvoiceListRow[] {
  const events = new Map(state.events.filter((e) => !e.deletedAt).map((e) => [e.id, e]));
  const rank = (status: InvoiceRowStatus) => (status === 'NOT_SENT' ? 0 : 1);
  return state.invoiceRows
    .filter((r) => events.has(r.eventId))
    .sort(
      (a, b) =>
        rank(a.status) - rank(b.status) ||
        b.createdAt.localeCompare(a.createdAt) ||
        b.id.localeCompare(a.id),
    )
    .map((r) => {
      const event = events.get(r.eventId)!;
      return {
        ...r,
        eventStartDate: event.startDate,
        eventLineupName: event.lineupName,
        eventVenue: event.venue,
        eventStatus: event.status,
        clientName: state.clients.find((c) => c.id === event.clientId)?.name ?? null,
        invoicingDetails: event.invoicingDetails,
      };
    });
}

/** Description of the automatic final invoice row. */
export const FINAL_INVOICE_DESCRIPTION = 'Loppulasku';

const rowSnapshot = (row: InvoiceRow) => ({
  invoiceRowId: row.id,
  description: row.description,
  amountCents: row.amountCents,
  status: row.status,
});

export function addInvoiceRow(
  state: EventState,
  event: MockEvent,
  input: { description: string; amountCents: number; status?: InvoiceRowStatus },
  actorId: Id | null,
): InvoiceRow {
  const ts = nowTs();
  const row: InvoiceRow = {
    id: mockId(),
    eventId: event.id,
    description: input.description,
    amountCents: input.amountCents,
    status: input.status ?? 'NOT_SENT',
    statusAt: actorId ? ts : null,
    statusBy: actorId,
    createdAt: ts,
    createdBy: actorId,
    auto: false,
  };
  state.invoiceRows.push(row);
  event.updatedAt = ts;
  if (actorId) logEvent(state, event.id, 'INVOICE_ROW_ADDED', actorId, rowSnapshot(row));
  return row;
}

/**
 * The automatic final invoice (api-contract "Invoicing v3"): one NOT_SENT "Loppulasku" row for the
 * uninvoiced amount, no creator, history INVOICE_ROW_ADDED by the system with `auto: true`. The
 * mock has no timer job; the seed and tests call this to get such a row.
 */
export function addAutoFinalInvoice(state: EventState, event: MockEvent): InvoiceRow | null {
  const total = event.priceCents + event.additionalSalesCents;
  const { uninvoicedCents } = invoiceFigures(invoiceRowsOf(state, event.id), total, false);
  if (uninvoicedCents <= 0) return null;
  const row = addInvoiceRow(state, event, { description: FINAL_INVOICE_DESCRIPTION, amountCents: uninvoicedCents }, null);
  row.auto = true;
  logEvent(state, event.id, 'INVOICE_ROW_ADDED', null, { ...rowSnapshot(row), auto: true });
  return row;
}

/** Applies a row PATCH; a status change sets statusAt/By. Logs INVOICE_ROW_UPDATED with the changes. */
export function updateInvoiceRow(
  state: EventState,
  event: MockEvent,
  row: InvoiceRow,
  patch: { description?: string; amountCents?: number; status?: InvoiceRowStatus },
  actorId: Id,
): FieldChange[] {
  const changes: FieldChange[] = [];
  for (const field of ['description', 'amountCents', 'status'] as const) {
    const value = patch[field];
    if (value === undefined || row[field] === value) continue;
    changes.push({ field, from: row[field], to: value });
    (row as unknown as Record<string, unknown>)[field] = value;
  }
  if (changes.some((c) => c.field === 'status')) {
    row.statusAt = nowTs();
    row.statusBy = actorId;
  }
  if (changes.length > 0) {
    event.updatedAt = nowTs();
    logEvent(state, event.id, 'INVOICE_ROW_UPDATED', actorId, {
      invoiceRowId: row.id,
      description: row.description,
      changes,
    });
  }
  return changes;
}

export function removeInvoiceRow(state: EventState, event: MockEvent, row: InvoiceRow, actorId: Id): void {
  state.invoiceRows = state.invoiceRows.filter((r) => r.id !== row.id);
  event.updatedAt = nowTs();
  logEvent(state, event.id, 'INVOICE_ROW_REMOVED', actorId, rowSnapshot(row));
}
