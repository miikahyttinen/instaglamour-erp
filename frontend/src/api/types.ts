// TypeScript types for every shared object, request and response in docs/api-contract.md.
// Money fields ending in `Cents` are integer cents. Dates are `YYYY-MM-DD`; timestamps ISO 8601 UTC.

import type {
  CostType,
  ErrorCode,
  FieldCode,
  GigEventType,
  GigStatus,
  InternalRole,
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
  };
}

export interface PersonDoubleBookedWarning {
  code: 'PERSON_DOUBLE_BOOKED';
  personId: Id;
  otherGigId: Id;
  otherGigStartDate: IsoDate;
  otherGigLineupName: string;
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
}

export interface GigSummary {
  id: Id;
  startDate: IsoDate;
  endDate: IsoDate | null;
  year: number;
  status: GigStatus;
  played: boolean;
  lineupTemplateId: Id | null;
  lineupName: string;
  venue: string;
  technicalSetup: TechnicalSetup | null;
  logistics: Logistics | null;
  houseTechnician: boolean;
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
  /** Client of the gig (UC-027), or null. `clientName` is the client's current name. */
  clientId: Id | null;
  clientName: string | null;
  /** Offer the gig was converted from (UC-031), or null. */
  offerId: Id | null;
  deletedAt: IsoTimestamp | null;
  createdAt: IsoTimestamp;
  updatedAt: IsoTimestamp;
}

export interface CostLine {
  id: Id;
  gigId: Id;
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
}

export interface Attachment {
  id: Id;
  gigId: Id;
  filename: string;
  contentType: string;
  sizeBytes: number;
  /** Partner id */
  uploadedBy: Id;
  uploadedAt: IsoTimestamp;
}

export interface GigDetail extends GigSummary {
  costLines: CostLine[];
  attachments: Attachment[];
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

interface GigEventBase<T extends GigEventType, D> {
  id: Id;
  gigId: Id;
  type: T;
  partnerId: Id;
  at: IsoTimestamp;
  reason: string | null;
  details: D;
}

type EmptyDetails = Record<string, never>;

export type GigEvent =
  | GigEventBase<'CREATED', EmptyDetails>
  | GigEventBase<'UPDATED', { changes: FieldChange[]; movedCostLineIds: Id[] }>
  | GigEventBase<'MOVED', { from: DateRange; to: DateRange }>
  | GigEventBase<'CANCELLED' | 'UNCANCELLED' | 'DELETED' | 'RESTORED', EmptyDetails>
  | GigEventBase<
      'COST_ADDED' | 'COST_REMOVED',
      { costLineId: Id; type: CostType; personId: Id | null; budgetedCents: Cents }
    >
  | GigEventBase<'COST_UPDATED', { costLineId: Id; type: CostType; changes: FieldChange[] }>
  | GigEventBase<'COST_PAID', { costLineId: Id; type: CostType; actualCents: Cents }>
  | GigEventBase<'COST_UNPAID', { costLineId: Id; type: CostType; previousActualCents: Cents }>
  | GigEventBase<'ATTACHMENT_ADDED' | 'ATTACHMENT_REMOVED', { attachmentId: Id; filename: string }>;

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
  spotifyUrl: string | null;
  /** Active references in sort order; `null` when the offer does not show references. */
  references: PublicOfferReference[] | null;
  seller: PublicOfferSeller;
}

// ---------- Reference data ----------

export interface TemplateRole {
  role: CostType;
  defaultFeeCents: Cents;
}

export interface LineupTemplate {
  id: Id;
  name: string;
  roles: TemplateRole[];
}

export interface Settings {
  officeDefaultCents: Cents;
  salesDefaultCents: Cents;
  productionDefaultCents: Cents;
  loadInDeductionCents: Cents;
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
  lineupTemplates: LineupTemplate[];
  settings: Settings;
  costTypes: {
    musicianRoles: MusicianRole[];
    internalRoles: InternalRole[];
    expenseCategories: ExpenseCategory[];
  };
  technicalSetups: TechnicalSetup[];
  logistics: Logistics[];
  budgetCategories: BudgetCategory[];
}

// ---------- Year page ----------

export interface YearGigTotals {
  gigCount: number;
  cancelledCount: number;
  soldGigsSumCents: Cents;
  budgetedCostsCents: Cents;
  actualCostsCents: Cents;
  marginBudgetCents: Cents;
  marginActualCents: Cents;
}

export interface YearPage {
  year: number;
  gigs: YearGigTotals;
  hours: { partners: { partnerId: Id; total: number }[]; grandTotal: number };
  budget: BudgetAmounts;
  yearResultCents: Cents;
  upcomingGigs: GigSummary[];
}

// ---------- Gigs ----------

export interface GigListQuery {
  year: number;
  status?: 'SOLD' | 'CANCELLED' | 'ALL';
  when?: 'all' | 'upcoming' | 'past';
  sellerId?: Id;
  producerId?: Id;
  notFullyStaffed?: boolean;
  q?: string;
  deleted?: boolean;
}

export interface GigListResponse {
  gigs: GigSummary[];
  yearSummary: YearGigTotals;
}

export interface GigCreate {
  startDate: IsoDate;
  endDate?: IsoDate | null;
  lineupTemplateId?: Id | null;
  lineupName?: string | null;
  venue: string;
  technicalSetup?: TechnicalSetup | null;
  logistics?: Logistics | null;
  houseTechnician?: boolean;
  sellerId: Id;
  producerId: Id;
  priceCents: Cents;
  additionalSalesCents?: Cents;
  additionalSalesDescription?: string | null;
  notes?: string | null;
  /** Optional client; unknown id → UNKNOWN_REFERENCE. */
  clientId?: Id | null;
}

export interface GigUpdate {
  lineupName?: string;
  venue?: string;
  technicalSetup?: TechnicalSetup | null;
  logistics?: Logistics | null;
  houseTechnician?: boolean;
  sellerId?: Id;
  producerId?: Id;
  priceCents?: Cents;
  additionalSalesCents?: Cents;
  additionalSalesDescription?: string | null;
  notes?: string | null;
  /** null clears the client. */
  clientId?: Id | null;
}

export interface GigUpdateResponse {
  gig: GigDetail;
  movedCostLineIds: Id[];
}

export interface GigMoveRequest {
  startDate: IsoDate;
  endDate?: IsoDate | null;
  reason?: string;
}

export interface GigWithWarnings {
  gig: GigDetail;
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
}

export interface PersonWithWarnings {
  person: Person;
  warnings: Warning[];
}

export interface PersonCostLine {
  costLine: CostLine;
  gigId: Id;
  gigStartDate: IsoDate;
  gigLineupName: string;
  gigVenue: string;
  gigStatus: GigStatus;
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
  gigCount: number;
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

/** `GET /api/clients/{id}`: linked gigs and offers of all years, newest first. */
export interface ClientDetailResponse {
  client: Client;
  gigs: GigSummary[];
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
  gigId: Id | null;
  createdAt: IsoTimestamp;
  updatedAt: IsoTimestamp;
  deletedAt: IsoTimestamp | null;
}

/** `GET /api/offers/{id}`: the summary plus the customer-facing content and the public link. */
export interface OfferDetail extends OfferSummary {
  /** One item per line, shown to the customer. */
  lineup: string[];
  includesText: string | null;
  spotifyUrl: string | null;
  showReferences: boolean;
  /** `/o/<token>`; the UI makes it absolute with the current origin. */
  sharePath: string;
  /** Exactly what `GET /api/public/offers/{token}` returns for this offer. */
  preview: PublicOffer;
}

export interface OfferListQuery {
  year: number;
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
  /** Omitted → default link from settings; `null` / `""` → none. Must be http(s). */
  spotifyUrl?: string | null;
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
}

export interface OfferConvertResponse {
  offer: OfferDetail;
  gig: GigDetail;
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
  /** CONVERTED: the created gig. */
  gigId?: Id;
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
