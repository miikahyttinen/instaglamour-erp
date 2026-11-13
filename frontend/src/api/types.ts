// TypeScript types for every shared object, request and response in docs/api-contract.md.
// Money fields ending in `Cents` are integer cents. Dates are `YYYY-MM-DD`; timestamps ISO 8601 UTC.

import type {
  CostType,
  LegacyCostType,
  ErrorCode,
  FieldCode,
  EventHistoryType,
  EventStatus,
  InternalRole,
  InvoiceRowStatus,
  InvoiceState,
  Language,
  MusicianRole,
  ExpenseCategory,
  OfferDisposition,
  OfferEventType,
  OfferHistoryType,
  OfferSource,
  OfferStatus,
  OfferStatusFilter,
  TaskStatus,
  TechnicalSetup,
  Logistics,
} from './enums';
import type { CostLinePurchaseOrder } from './purchaseOrderTypes';

export type Id = string;
/** `YYYY-MM-DD` */
export type IsoDate = string;
/** ISO 8601 UTC timestamp */
export type IsoTimestamp = string;
export type Cents = number;

// ---------- Errors & warnings ----------

export interface ApiErrorBody {
  error: {
    code: ErrorCode;
    /** English, for logs only. Never shown to users. */
    message: string;
    fields?: Record<string, FieldCode>;
    /** Extra data of some codes (e.g. `costLineIds`, `purchaseOrderNumber`). */
    details?: Record<string, unknown>;
  };
}

export interface PersonDoubleBookedWarning {
  code: 'PERSON_DOUBLE_BOOKED';
  personId: Id;
  otherEventId: Id;
  otherEventStartDate: IsoDate;
  otherEventLineupName: string;
}

export interface DuplicateNameWarning {
  code: 'DUPLICATE_NAME';
}

export type Warning = PersonDoubleBookedWarning | DuplicateNameWarning;

// ---------- Shared objects ----------

export interface Partner {
  id: Id;
  personId: Id;
  name: string;
  email: string;
  language: Language;
  selectedYear: number;
  /** False = removed partner (UC-032): name stays on old records, not offered for new choices. */
  active: boolean;
}

/** Partner status of a person (UC-032). */
export interface PersonPartner {
  /** Partner id */
  id: Id;
  email: string;
  active: boolean;
}

export interface Person {
  id: Id;
  name: string;
  active: boolean;
  /** null = never a partner; `active: false` = partner status removed. */
  partner: PersonPartner | null;
  /** Roles the person can play: unique, in MUSICIAN_ROLES order. */
  roles: MusicianRole[];
  /** Distinct played events (SOLD, past, not deleted, all years) with a musician-role line. */
  eventCount: number;
}

export interface EventSummary {
  id: Id;
  startDate: IsoDate;
  endDate: IsoDate | null;
  year: number;
  status: EventStatus;
  played: boolean;
  lineupTemplateId: Id | null;
  lineupName: string;
  venue: string;
  technicalSetup: TechnicalSetup | null;
  logistics: Logistics | null;
  houseTechnician: boolean;
  /** "Sopimus tehty / Contract done" (owner request 2026-11-09). */
  contractDone: boolean;
  sellerId: Id;
  producerId: Id;
  priceCents: Cents;
  additionalSalesCents: Cents;
  additionalSalesDescription: string | null;
  notes: string | null;
  totalPriceCents: Cents;
  budgetedCostsCents: Cents;
  actualCostsCents: Cents;
  marginBudgetCents: Cents;
  marginActualCents: Cents;
  /** 1 decimal, null when total price is 0 */
  marginBudgetPct: number | null;
  marginActualPct: number | null;
  notFullyStaffed: boolean;
  /** Client of the event (UC-027), or null. `clientName` is the client's current name. */
  clientId: Id | null;
  clientName: string | null;
  /** Offer the event was converted from (UC-031), or null. */
  offerId: Id | null;
  /** Σ amountCents of SENT invoice rows ("Lähetetty"). */
  sentCents: Cents;
  /** Σ amountCents of NOT_SENT invoice rows ("Lähettämättä"). */
  notSentCents: Cents;
  /** max(total − sentCents − notSentCents, 0): not on any row yet. */
  uninvoicedCents: Cents;
  /** totalPriceCents − sentCents ("Laskuttamatta"); negative when more was sent than the total. */
  balanceCents: Cents;
  /** Invoicing state, derived from the total and the rows (api-contract "Invoicing v3"). */
  invoiceState: InvoiceState;
  deletedAt: IsoTimestamp | null;
  createdAt: IsoTimestamp;
  updatedAt: IsoTimestamp;
}

export interface CostLine {
  id: Id;
  eventId: Id;
  type: CostType;
  personId: Id | null;
  description: string | null;
  budgetedCents: Cents;
  /** boolean for musician roles, null for internal roles and expenses */
  joinsLoadIn: boolean | null;
  loadInDeductionAppliedCents: Cents | null;
  actualCents: Cents | null;
  paidAt: IsoTimestamp | null;
  /** Partner id */
  paidBy: Id | null;
  /** OPEN or PAID purchase order the line is on, else null. Locks person/amount/paid (BR-118). */
  purchaseOrder: CostLinePurchaseOrder | null;
}

/** One invoice of a gig (api-contract "Invoice rows"). */
export interface InvoiceRow {
  id: Id;
  eventId: Id;
  description: string;
  /** > 0 */
  amountCents: Cents;
  status: InvoiceRowStatus;
  /** Last status change: when and by which partner (null = migrated / imported). */
  statusAt: IsoTimestamp | null;
  statusBy: Id | null;
  createdAt: IsoTimestamp;
  createdBy: Id | null;
  /** true only for the automatic final invoice ("Loppulasku", api-contract "Invoicing v3"). */
  auto: boolean;
}

/**
 * One row of the Laskutus page (`GET /api/invoice-rows`, api-contract "Laskutus page: all invoice
 * rows"): an invoice row with its gig's date, lineup name, venue, status, client name and
 * "Laskutustiedot".
 */
export interface InvoiceListRow extends InvoiceRow {
  eventStartDate: IsoDate;
  eventLineupName: string;
  eventVenue: string;
  eventStatus: EventStatus;
  clientName: string | null;
  invoicingDetails: string | null;
}

export interface InvoiceRowCreate {
  /** 1–500 chars */
  description: string;
  /** Integer > 0 */
  amountCents: Cents;
  /** Default NOT_SENT */
  status?: InvoiceRowStatus;
}

export interface InvoiceRowUpdate {
  description?: string;
  amountCents?: Cents;
  status?: InvoiceRowStatus;
}

export interface EventDetail extends EventSummary {
  /** "Laskutustiedot / Invoicing details" free text, ≤ 5000 chars (owner request 2026-11-11). */
  invoicingDetails: string | null;
  costLines: CostLine[];
  /** Creation order. */
  invoiceRows: InvoiceRow[];
}

export interface FieldChange {
  field: string;
  from: unknown;
  to: unknown;
}

export interface DateRange {
  startDate: IsoDate;
  endDate: IsoDate | null;
}

interface EventHistoryEntryBase<T extends EventHistoryType, D> {
  id: Id;
  eventId: Id;
  type: T;
  /** null = done by the system (e.g. the automatic final invoice). */
  partnerId: Id | null;
  at: IsoTimestamp;
  reason: string | null;
  details: D;
}

type EmptyDetails = Record<string, never>;

/**
 * Details of INVOICE_ROW_* history entries (api-contract "Invoice rows", TASK-046): ADDED / REMOVED
 * `{ invoiceRowId, description, amountCents, status }`, UPDATED `{ invoiceRowId, description,
 * changes }` (description after the change). Fields are optional so texts degrade gracefully.
 */
export interface InvoiceRowHistoryDetails {
  invoiceRowId?: Id;
  description?: string;
  amountCents?: Cents;
  /** Current codes, or READY / PAID in entries written before "Invoicing v3". */
  status?: string;
  /** true on the automatic final invoice ("Loppulasku", api-contract "Invoicing v3"). */
  auto?: boolean;
}

/** History keeps the codes it was written with, including removed roles (Role cleanup). */
export type HistoryCostType = CostType | LegacyCostType;

export type EventHistoryEntry =
  | EventHistoryEntryBase<'CREATED', EmptyDetails>
  | EventHistoryEntryBase<'UPDATED', { changes: FieldChange[]; movedCostLineIds: Id[] }>
  | EventHistoryEntryBase<'MOVED', { from: DateRange; to: DateRange }>
  | EventHistoryEntryBase<
      'CANCELLED' | 'UNCANCELLED' | 'DELETED' | 'RESTORED' | 'READY_FOR_INVOICE' | 'READY_FOR_INVOICE_CLEARED',
      EmptyDetails
    >
  | EventHistoryEntryBase<
      'COST_ADDED' | 'COST_REMOVED',
      { costLineId: Id; type: HistoryCostType; personId: Id | null; budgetedCents: Cents }
    >
  | EventHistoryEntryBase<'COST_UPDATED', { costLineId: Id; type: HistoryCostType; changes: FieldChange[] }>
  | EventHistoryEntryBase<
      'COST_PAID',
      { costLineId: Id; type: HistoryCostType; actualCents: Cents; purchaseOrderNumber?: string }
    >
  | EventHistoryEntryBase<
      'COST_UNPAID',
      { costLineId: Id; type: HistoryCostType; previousActualCents: Cents; purchaseOrderNumber?: string }
    >
  | EventHistoryEntryBase<'INVOICE_ROW_ADDED' | 'INVOICE_ROW_REMOVED', InvoiceRowHistoryDetails>
  | EventHistoryEntryBase<'INVOICE_ROW_UPDATED', InvoiceRowHistoryDetails & { changes?: FieldChange[] }>
  | EventHistoryEntryBase<'ATTACHMENT_ADDED' | 'ATTACHMENT_REMOVED', { attachmentId: Id; filename: string }>;

export interface Task {
  id: Id;
  title: string;
  description: string | null;
  dueDate: IsoDate | null;
  ownerId: Id;
  status: TaskStatus;
  completedAt: IsoTimestamp | null;
  overdue: boolean;
}

export interface HourEntry {
  id: Id;
  partnerId: Id;
  date: IsoDate;
  comment: string;
  hours: number;
}

export interface BudgetAmounts {
  budgetExpenseCents: Cents;
  budgetIncomeCents: Cents;
  actualExpenseCents: Cents;
  actualIncomeCents: Cents;
}

export interface BudgetRow extends BudgetAmounts {
  categoryId: Id;
  year: number;
  varianceExpenseCents: Cents;
  varianceIncomeCents: Cents;
}

// ---------- Auth & me ----------

export interface DevLoginRequest {
  email: string;
}

export interface UpdateMeRequest {
  language?: Language;
  selectedYear?: number;
}

// ---------- Public offer (UC-030, no session) ----------

/** One active reference on the public offer (BR-108). The client picks the language. */
export interface PublicOfferReference {
  id: Id;
  /** `en` null → the page shows `fi` (BR-108). */
  quote: { fi: string; en: string | null };
  author: string;
  /** `/api/public/offers/{token}/references/{id}/image?v=<imageVersion>`, scoped to the offer token; null = no photo. */
  imageUrl: string | null;
}

/** Seller contact shown to the customer. */
export interface PublicOfferSeller {
  name: string;
  email: string;
  phone: string | null;
}

/**
 * `GET /api/public/offers/{token}`: exactly these fields, nothing else (BR-104). No price, no
 * internal fields, no ids.
 */
export interface PublicOffer {
  eventName: string;
  clientName: string;
  eventDate: IsoDate;
  venue: string;
  city: string | null;
  lineup: string[];
  includesText: string | null;
  /** Always set: the one fixed listening link from the backend (not editable per offer). */
  spotifyUrl: string;
  /** Active references in sort order; `null` when the offer does not show references. */
  references: PublicOfferReference[] | null;
  seller: PublicOfferSeller;
}

// ---------- Reference data ----------

/** One line of a lineup (cost template), in display order. */
export interface LineupLine {
  type: CostType;
  /** Required for `OTHER` / `OTHER_ROLE` (`DESCRIPTION_REQUIRED`); ≤ 500 chars. */
  description: string | null;
  defaultCents: Cents;
}

/** `GET /api/lineup-templates` item (UI "Kokoonpano"). */
export interface LineupTemplate {
  id: Id;
  name: string;
  active: boolean;
  lines: LineupLine[];
  /** Gigs (incl. deleted) linked to the lineup; > 0 → can't be deleted (`LINEUP_IN_USE`). */
  eventCount: number;
}

/** `POST /api/lineup-templates`. */
export interface LineupTemplateCreate {
  name: string;
  lines?: LineupLine[];
}

/** `PATCH /api/lineup-templates/{id}`; `lines` replaces the whole list. */
export interface LineupTemplateUpdate {
  name?: string;
  active?: boolean;
  lines?: LineupLine[];
}

/** Active lineups in `GET /api/reference`. */
export interface ReferenceLineup {
  id: Id;
  name: string;
  lines: LineupLine[];
}

export interface Settings {
  loadInDeductionCents: Cents;
}

/** Settings → Parameters: value types (only MONEY now; e.g. PERCENT / TEXT may come later). */
export type ParameterType = 'MONEY';

/**
 * An editable parameter (`GET /api/settings/parameters`). Defined in backend code (registry);
 * only the value is stored. MONEY = cents, 0…100 000 000; `null` = no value stored yet.
 */
export interface Parameter {
  key: string;
  type: ParameterType;
  value: number | null;
  updatedAt: IsoTimestamp | null;
  updatedBy: Id | null;
}

export interface ParameterUpdate {
  value: number;
}

/** A budget row (UC-020): partner-managed, one name shown in both languages. Active rows only. */
export interface BudgetCategory {
  id: Id;
  name: string;
}

/** `POST /api/budget-categories`, `PATCH /api/budget-categories/{id}`. */
export interface BudgetCategoryInput {
  name: string;
}

export interface ReferenceData {
  partners: Partner[];
  /** Active lineups only. */
  lineupTemplates: ReferenceLineup[];
  settings: Settings;
  costTypes: {
    musicianRoles: MusicianRole[];
    /** Roles a person can have: `musicianRoles` without OTHER_ROLE (people page choices/filter). */
    personRoles: MusicianRole[];
    internalRoles: InternalRole[];
    expenseCategories: ExpenseCategory[];
  };
  technicalSetups: TechnicalSetup[];
  logistics: Logistics[];
  budgetCategories: BudgetCategory[];
}

// ---------- Year totals (gig list summary) ----------

export interface YearEventTotals {
  eventCount: number;
  cancelledCount: number;
  soldEventsSumCents: Cents;
  budgetedCostsCents: Cents;
  actualCostsCents: Cents;
  marginBudgetCents: Cents;
  marginActualCents: Cents;
}

/** My gigs page (GET /api/me/events): one of the signed-in partner's own roles on a gig. */
export type MyRole = { kind: 'PRODUCER' } | { kind: 'MUSICIAN'; type: CostType; description: string | null };

/** One upcoming gig of the signed-in partner (producer or own musician-role line). */
export interface MyEvent {
  eventId: Id;
  startDate: IsoDate;
  endDate: IsoDate | null;
  lineupName: string;
  venue: string;
  clientName: string | null;
  /** PRODUCER first, then one entry per own musician-role line in cost-line order. */
  roles: MyRole[];
  notFullyStaffed: boolean;
}

/** My gigs page, offers section (GET /api/me/offers): one of the signed-in partner's offers. */
export interface MyOffer {
  offerId: Id;
  eventName: string;
  eventDate: IsoDate;
  clientName: string;
  venue: string;
  city: string | null;
  priceCents: Cents | null;
  eventId: Id | null;
}

/** `GET /api/me/offers`: accepted offers without a done contract, and open offers to follow up. */
export interface MyOffersResponse {
  contractMissing: MyOffer[];
  followUp: MyOffer[];
}

// ---------- Events ----------

export interface EventListQuery {
  year: number;
  status?: 'SOLD' | 'CANCELLED' | 'ALL';
  when?: 'all' | 'upcoming' | 'past';
  sellerId?: Id;
  producerId?: Id;
  notFullyStaffed?: boolean;
  q?: string;
  deleted?: boolean;
}

export interface EventListResponse {
  events: EventSummary[];
  yearSummary: YearEventTotals;
}

export interface EventCreate {
  startDate: IsoDate;
  endDate?: IsoDate | null;
  lineupTemplateId?: Id | null;
  lineupName?: string | null;
  venue: string;
  technicalSetup?: TechnicalSetup | null;
  logistics?: Logistics | null;
  houseTechnician?: boolean;
  /** Default false. */
  contractDone?: boolean;
  sellerId: Id;
  producerId: Id;
  priceCents: Cents;
  additionalSalesCents?: Cents;
  additionalSalesDescription?: string | null;
  notes?: string | null;
  /** Optional, default null; ≤ 5000 chars. */
  invoicingDetails?: string | null;
  /** Optional client; unknown id → UNKNOWN_REFERENCE. */
  clientId?: Id | null;
}

export interface EventUpdate {
  lineupName?: string;
  venue?: string;
  technicalSetup?: TechnicalSetup | null;
  logistics?: Logistics | null;
  houseTechnician?: boolean;
  contractDone?: boolean;
  sellerId?: Id;
  producerId?: Id;
  priceCents?: Cents;
  additionalSalesCents?: Cents;
  additionalSalesDescription?: string | null;
  notes?: string | null;
  /** Blank → null; > 5000 chars → TOO_LONG. */
  invoicingDetails?: string | null;
  /** null clears the client. */
  clientId?: Id | null;
}

export interface EventUpdateResponse {
  event: EventDetail;
  movedCostLineIds: Id[];
}

export interface EventMoveRequest {
  startDate: IsoDate;
  endDate?: IsoDate | null;
  reason?: string;
}

export interface EventWithWarnings {
  event: EventDetail;
  warnings: Warning[];
}

export interface ReasonRequest {
  reason: string;
}

// ---------- Cost lines ----------

export interface CostLineCreate {
  type: CostType;
  personId?: Id | null;
  description?: string | null;
  budgetedCents: Cents;
}

export interface CostLineUpdate {
  personId?: Id | null;
  description?: string | null;
  budgetedCents?: Cents;
  joinsLoadIn?: boolean;
}

export interface CostLinePayRequest {
  actualCents?: Cents;
}

// ---------- People ----------

export type PeopleActiveFilter = 'true' | 'false' | 'all';
/** `?partner=` of GET /api/people (UC-032); undefined = not sent (everyone). */
export type PeoplePartnerFilter = 'true' | 'false';

/** PUT /api/people/{id}/partner */
export interface PersonPartnerUpdate {
  email: string;
}

export interface PersonCreate {
  name: string;
}

export interface PersonUpdate {
  name?: string;
  active?: boolean;
  /** Replaces the list; duplicates or non-musician codes → 400 `roles: INVALID_VALUE`. */
  roles?: MusicianRole[];
}

export interface PersonWithWarnings {
  person: Person;
  warnings: Warning[];
}

export interface PersonCostLine {
  costLine: CostLine;
  eventId: Id;
  eventStartDate: IsoDate;
  eventLineupName: string;
  eventVenue: string;
  eventStatus: EventStatus;
}

export interface PersonCostLinesResponse {
  lines: PersonCostLine[];
  totals: { budgetedCents: Cents; actualCents: Cents };
}

// ---------- Tasks ----------

export interface TaskListQuery {
  status?: TaskStatus | 'ALL';
  ownerId?: Id;
}

export interface TaskCreate {
  title: string;
  ownerId?: Id;
  dueDate?: IsoDate | null;
  description?: string | null;
}

export interface TaskUpdate {
  title?: string;
  ownerId?: Id;
  dueDate?: IsoDate | null;
  description?: string | null;
  status?: TaskStatus;
}

// ---------- Hours ----------

export interface HourEntryCreate {
  date: IsoDate;
  comment: string;
  hours: number;
}

export type HourEntryUpdate = Partial<HourEntryCreate>;

export interface HoursTotals {
  year: number;
  partners: { partnerId: Id; months: number[]; total: number }[];
  grandTotal: number;
}

// ---------- Budget ----------

export interface BudgetResponse {
  year: number;
  rows: BudgetRow[];
  totals: BudgetAmounts & { varianceExpenseCents: Cents; varianceIncomeCents: Cents };
}

export type BudgetRowUpdate = BudgetAmounts;

// ---------- Clients (UC-027) ----------

export interface Client {
  id: Id;
  name: string;
  notes: string | null;
}

/** Row of `GET /api/clients` (sorted by name). */
export interface ClientListItem extends Client {
  eventCount: number;
  offerCount: number;
}

export interface ClientCreate {
  name: string;
  notes?: string | null;
}

export interface ClientUpdate {
  name?: string;
  notes?: string | null;
}

/** `GET /api/clients/{id}`: linked events and offers of all years, newest first. */
export interface ClientDetailResponse {
  client: Client;
  events: EventSummary[];
  offers: OfferSummary[];
}

// ---------- Offers (UC-028) ----------

export interface OfferSummary {
  id: Id;
  clientId: Id;
  clientName: string;
  eventName: string;
  eventDate: IsoDate;
  venue: string;
  city: string | null;
  priceCents: Cents | null;
  sellerId: Id;
  source: OfferSource | null;
  eventType: OfferEventType | null;
  disposition: OfferDisposition;
  status: OfferStatus;
  /** OPEN and the event date is before today (display only, BR-102). */
  expired: boolean;
  /** "Follow-up tehty / Follow-up done" (owner request 2026-11-09; ticked on My gigs only, revised 2026-11-09). */
  followUpDone: boolean;
  eventId: Id | null;
  createdAt: IsoTimestamp;
  updatedAt: IsoTimestamp;
  deletedAt: IsoTimestamp | null;
}

/** `GET /api/offers/{id}`: the summary plus the customer-facing content and the public link. */
export interface OfferDetail extends OfferSummary {
  /** One item per line, shown to the customer. */
  lineup: string[];
  includesText: string | null;
  showReferences: boolean;
  /** `/o/<token>`; the UI makes it absolute with the current origin. */
  sharePath: string;
  /** Exactly what `GET /api/public/offers/{token}` returns for this offer. */
  preview: PublicOffer;
}

export interface OfferListQuery {
  /** Optional: without it, every year (the UI sends none). */
  year?: number;
  q?: string;
  /** OPEN includes expired; EXPIRED = open and past (BR-102). */
  status?: OfferStatusFilter;
  sellerId?: Id;
  disposition?: OfferDisposition;
  eventType?: OfferEventType;
  source?: OfferSource;
  deleted?: boolean;
}

/** BR-106: figures of the year (ignores every filter except `year`). */
export interface OfferYearSummary {
  openValueCents: Cents;
  /** `null` when nothing is decided yet. */
  winRatePct: number | null;
  wonCount: number;
  decidedCount: number;
}

/** `GET /api/offers/stats?year=` (BR-122): KPI cards, all non-deleted offers of all years. */
export interface OfferStats {
  /** The 6 most recent completed months (createdAt, Europe/Helsinki), oldest first. */
  createdByMonth: { month: string; count: number; valueCents: Cents }[];
  /** year-3 … year+2; average over priced offers, `null` when none. */
  averageByCreatedYear: { year: number; averageCents: Cents | null; count: number }[];
  /** year-3 … year+2 by event date, all statuses. */
  byEventYear: { year: number; count: number; valueCents: Cents }[];
  /** year-3 … year+2, open offers by event date. */
  openValueByEventYear: { year: number; valueCents: Cents; count: number }[];
  /** All open offers, sorted by value desc (`null` = no type). */
  openByEventType: { eventType: OfferEventType | null; count: number; valueCents: Cents }[];
  winRate: {
    pct: number | null;
    won: number;
    decided: number;
    /** One item per OFFER_EVENT_TYPES value, in that order. */
    byEventType: { eventType: OfferEventType; pct: number | null; won: number; decided: number }[];
  };
}

export interface OfferListResponse {
  offers: OfferSummary[];
  summary: OfferYearSummary;
}

export interface OfferCreate {
  clientId: Id;
  eventName: string;
  eventDate: IsoDate;
  venue: string;
  city?: string | null;
  lineup?: string[];
  /** Omitted → default text from settings; `null` / `""` → none. */
  includesText?: string | null;
  showReferences?: boolean;
  priceCents?: Cents | null;
  /** Omitted → me. */
  sellerId?: Id;
  source?: OfferSource | null;
  eventType?: OfferEventType | null;
}

/** PATCH: any editable field, including `disposition` (status follows it, BR-102). */
export interface OfferUpdate extends Partial<Omit<OfferCreate, 'clientId' | 'eventName' | 'eventDate' | 'venue'>> {
  clientId?: Id;
  eventName?: string;
  eventDate?: IsoDate;
  venue?: string;
  disposition?: OfferDisposition;
  followUpDone?: boolean;
}

export interface OfferConvertResponse {
  offer: OfferDetail;
  event: EventDetail;
}

/** Offer history entry (BR-103). Unknown or missing `details` are shown without detail lines. */
export interface OfferEvent {
  id: Id;
  offerId: Id;
  type: OfferHistoryType;
  partnerId: Id;
  at: IsoTimestamp;
  details: OfferEventDetails;
}

export interface OfferEventDetails {
  /** UPDATED: field old → new. */
  changes?: FieldChange[];
  /** DISPOSITION_CHANGED: old → new disposition. */
  from?: OfferDisposition;
  to?: OfferDisposition;
  /** CONVERTED: the created event. */
  eventId?: Id;
}

// ---------- References (owner request 2026-10-07, BR-108) ----------

export interface Reference {
  id: Id;
  quoteFi: string;
  quoteEn: string | null;
  author: string;
  hasImage: boolean;
  /** Changes on every photo upload / remove; image URLs carry it as `?v=` (cache busting). */
  imageVersion: string | null;
  sortOrder: number;
  active: boolean;
}

/** `POST /api/references`. Quotes ≤ 5000 chars, author ≤ 200. Appended last. */
export interface ReferenceCreate {
  quoteFi: string;
  quoteEn?: string | null;
  author: string;
  active?: boolean;
}

/** `PATCH /api/references/{id}`. */
export type ReferenceUpdate = Partial<Pick<Reference, 'quoteFi' | 'quoteEn' | 'author' | 'active'>>;

// ---------- Purchase orders (UC-033, UC-034) ----------

export * from './purchaseOrderTypes';
export * from './importTypes';
