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
  TaskStatus,
  TechnicalSetup,
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
}

export interface Person {
  id: Id;
  name: string;
  active: boolean;
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
  technicalSetup: TechnicalSetup[];
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

export interface BudgetCategory {
  id: Id;
  code: string;
  nameFi: string;
  nameEn: string;
  budgeted: boolean;
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
  technicalSetup?: TechnicalSetup[];
  sellerId: Id;
  producerId: Id;
  priceCents: Cents;
  additionalSalesCents?: Cents;
  additionalSalesDescription?: string | null;
  notes?: string | null;
}

export interface GigUpdate {
  lineupName?: string;
  venue?: string;
  technicalSetup?: TechnicalSetup[];
  sellerId?: Id;
  producerId?: Id;
  priceCents?: Cents;
  additionalSalesCents?: Cents;
  additionalSalesDescription?: string | null;
  notes?: string | null;
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
