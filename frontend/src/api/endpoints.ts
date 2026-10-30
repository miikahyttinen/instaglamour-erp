// Typed functions for every endpoint in docs/api-contract.md.
import { apiRequest, buildUrl } from './client';
import type { MusicianRole } from './enums';
import type {
  Attachment,
  BudgetCategory,
  BudgetCategoryInput,
  BudgetResponse,
  BudgetRow,
  BudgetRowUpdate,
  Client,
  ClientCreate,
  ClientDetailResponse,
  ClientListItem,
  ClientUpdate,
  CostLineCreate,
  CostLinePayRequest,
  CostLineUpdate,
  DevLoginRequest,
  EventCreate,
  InvoiceRowCreate,
  InvoiceRowUpdate,
  EventDetail,
  EventHistoryEntry,
  EventListQuery,
  EventListResponse,
  EventMoveRequest,
  EventUpdate,
  EventUpdateResponse,
  EventWithWarnings,
  HourEntry,
  HourEntryCreate,
  HourEntryUpdate,
  HoursTotals,
  Id,
  OfferConvertResponse,
  OfferCreate,
  OfferDetail,
  OfferEvent,
  OfferListQuery,
  OfferListResponse,
  OfferStats,
  OfferUpdate,
  Reference,
  ReferenceCreate,
  ReferenceUpdate,
  Partner,
  PeopleActiveFilter,
  PeoplePartnerFilter,
  PersonPartnerUpdate,
  Person,
  PersonCostLinesResponse,
  PersonCreate,
  PersonUpdate,
  PersonWithWarnings,
  PublicOffer,
  PurchaseOrder,
  PurchaseOrderEvent,
  PurchaseOrderListQuery,
  PurchaseOrderListResponse,
  ReasonRequest,
  ReferenceData,
  Task,
  TaskCreate,
  TaskListQuery,
  TaskUpdate,
  UpdateMeRequest,
  YearPage,
} from './types';
import type {
  FreelancerLink,
  FreelancerView,
  PoEligibleLine,
  PublicPurchaseOrder,
  PublicPurchaseOrderCreate,
  PurchaseOrderCreate,
} from './purchaseOrderTypes';
import type { ImportOptions, ImportResponse, ImportRun } from './importTypes';
import { IMPORT_FILENAME_MAX } from './importTypes';

// ---------- Auth & me ----------

/** Full-page navigation target for Google sign-in (not a fetch). */
export const GOOGLE_SIGN_IN_URL = buildUrl('/auth/google/start');

export const authApi = {
  devLogin: (body: DevLoginRequest) =>
    apiRequest<Partner>('/auth/dev-login', { method: 'POST', body }),
  logout: () => apiRequest<void>('/auth/logout', { method: 'POST' }),
};

export const meApi = {
  get: () => apiRequest<Partner>('/me'),
  update: (body: UpdateMeRequest) => apiRequest<Partner>('/me', { method: 'PATCH', body }),
};

// ---------- Public offer (UC-030) ----------

/** The only data call of the public offer page. Works without a session. */
export const publicOffersApi = {
  get: (token: string, signal?: AbortSignal) =>
    apiRequest<PublicOffer>(`/public/offers/${encodeURIComponent(token)}`, { signal }),
};

// ---------- Public freelancer page (UC-033) ----------

/** The only calls of the freelancer page `/f/:token`. Work without a session. */
export const publicFreelancersApi = {
  get: (token: string, signal?: AbortSignal) =>
    apiRequest<FreelancerView>(`/public/freelancers/${encodeURIComponent(token)}`, { signal }),
  createPurchaseOrder: (token: string, body: PublicPurchaseOrderCreate) =>
    apiRequest<PublicPurchaseOrder>(`/public/freelancers/${encodeURIComponent(token)}/purchase-orders`, {
      method: 'POST',
      body,
    }),
};

// ---------- Reference & year ----------

export const referenceApi = {
  get: () => apiRequest<ReferenceData>('/reference'),
};

export const yearsApi = {
  get: (year: number) => apiRequest<YearPage>(`/years/${year}`),
};

// ---------- Events ----------

export const eventsApi = {
  list: (query: EventListQuery) =>
    apiRequest<EventListResponse>('/events', {
      query: {
        ...query,
        notFullyStaffed: query.notFullyStaffed ? true : undefined,
        deleted: query.deleted ? true : undefined,
      },
    }),
  create: (body: EventCreate) => apiRequest<EventDetail>('/events', { method: 'POST', body }),
  get: (id: Id) => apiRequest<EventDetail>(`/events/${id}`),
  update: (id: Id, body: EventUpdate) =>
    apiRequest<EventUpdateResponse>(`/events/${id}`, { method: 'PATCH', body }),
  move: (id: Id, body: EventMoveRequest) =>
    apiRequest<EventWithWarnings>(`/events/${id}/move`, { method: 'POST', body }),
  cancel: (id: Id, body: ReasonRequest) =>
    apiRequest<EventDetail>(`/events/${id}/cancel`, { method: 'POST', body }),
  uncancel: (id: Id, body: ReasonRequest) =>
    apiRequest<EventDetail>(`/events/${id}/uncancel`, { method: 'POST', body }),
  delete: (id: Id, body: ReasonRequest) =>
    apiRequest<void>(`/events/${id}/delete`, { method: 'POST', body }),
  restore: (id: Id) => apiRequest<EventDetail>(`/events/${id}/restore`, { method: 'POST' }),
  history: (id: Id) => apiRequest<EventHistoryEntry[]>(`/events/${id}/history`),
};

// ---------- Cost lines ----------

export const costLinesApi = {
  create: (eventId: Id, body: CostLineCreate) =>
    apiRequest<EventWithWarnings>(`/events/${eventId}/cost-lines`, { method: 'POST', body }),
  update: (id: Id, body: CostLineUpdate) =>
    apiRequest<EventWithWarnings>(`/cost-lines/${id}`, { method: 'PATCH', body }),
  remove: (id: Id) => apiRequest<EventWithWarnings>(`/cost-lines/${id}`, { method: 'DELETE' }),
  pay: (id: Id, body: CostLinePayRequest = {}) =>
    apiRequest<EventWithWarnings>(`/cost-lines/${id}/pay`, { method: 'POST', body }),
  unpay: (id: Id) => apiRequest<EventWithWarnings>(`/cost-lines/${id}/unpay`, { method: 'POST' }),
};

// ---------- Invoice rows ----------

/** Invoice rows of a gig (api-contract "Invoice rows"); every call returns the whole gig. */
export const invoiceRowsApi = {
  create: (eventId: Id, body: InvoiceRowCreate) =>
    apiRequest<EventDetail>(`/events/${eventId}/invoice-rows`, { method: 'POST', body }),
  update: (id: Id, body: InvoiceRowUpdate) =>
    apiRequest<EventDetail>(`/invoice-rows/${id}`, { method: 'PATCH', body }),
  remove: (id: Id) => apiRequest<EventDetail>(`/invoice-rows/${id}`, { method: 'DELETE' }),
};

// ---------- Attachments ----------

export const attachmentsApi = {
  upload: (eventId: Id, file: File) => {
    const form = new FormData();
    form.append('file', file);
    return apiRequest<Attachment>(`/events/${eventId}/attachments`, { method: 'POST', body: form });
  },
  downloadUrl: (id: Id) => buildUrl(`/attachments/${id}/download`),
  remove: (id: Id) => apiRequest<void>(`/attachments/${id}`, { method: 'DELETE' }),
};

// ---------- People ----------

export const peopleApi = {
  list: (active: PeopleActiveFilter = 'true', partner?: PeoplePartnerFilter, role?: MusicianRole) =>
    apiRequest<Person[]>('/people', { query: { active, partner, role } }),
  create: (body: PersonCreate) =>
    apiRequest<PersonWithWarnings>('/people', { method: 'POST', body }),
  update: (id: Id, body: PersonUpdate) =>
    apiRequest<PersonWithWarnings>(`/people/${id}`, { method: 'PATCH', body }),
  /** Without `year`: all years, newest event first (contract "Year is no longer global"). */
  costLines: (id: Id, year?: number) =>
    apiRequest<PersonCostLinesResponse>(`/people/${id}/cost-lines`, { query: { year } }),
  /** Makes / keeps the person an active partner with this Google email (UC-032). */
  setPartner: (id: Id, body: PersonPartnerUpdate) =>
    apiRequest<Person>(`/people/${id}/partner`, { method: 'PUT', body }),
  /** Removes partner status: sign-in stops and sessions are revoked (BR-111). */
  removePartner: (id: Id) => apiRequest<Person>(`/people/${id}/partner`, { method: 'DELETE' }),
  /** The person's public freelancer link `/f/<token>` (UC-034 A4). */
  freelancerLink: (id: Id) => apiRequest<FreelancerLink>(`/people/${id}/freelancer-link`),
  /** New token; the old link stops working (404). */
  regenerateFreelancerLink: (id: Id) =>
    apiRequest<FreelancerLink>(`/people/${id}/freelancer-link/regenerate`, { method: 'POST' }),
  /** Fees a partner can put on a PO by hand; `eventId` limits to one event. */
  poEligibleLines: (id: Id, eventId?: Id) =>
    apiRequest<PoEligibleLine[]>(`/people/${id}/po-eligible-lines`, { query: { eventId } }),
};

// ---------- Clients ----------

export const clientsApi = {
  list: (q?: string) => apiRequest<ClientListItem[]>('/clients', { query: { q: q || undefined } }),
  create: (body: ClientCreate) => apiRequest<Client>('/clients', { method: 'POST', body }),
  get: (id: Id) => apiRequest<ClientDetailResponse>(`/clients/${id}`),
  update: (id: Id, body: ClientUpdate) =>
    apiRequest<Client>(`/clients/${id}`, { method: 'PATCH', body }),
  remove: (id: Id) => apiRequest<void>(`/clients/${id}`, { method: 'DELETE' }),
};

// ---------- Offers (UC-028, UC-029, UC-031) ----------

export const offersApi = {
  list: (query: OfferListQuery) =>
    apiRequest<OfferListResponse>('/offers', {
      query: { ...query, q: query.q || undefined, deleted: query.deleted ? true : undefined },
    }),
  create: (body: OfferCreate) => apiRequest<OfferDetail>('/offers', { method: 'POST', body }),
  get: (id: Id) => apiRequest<OfferDetail>(`/offers/${id}`),
  update: (id: Id, body: OfferUpdate) =>
    apiRequest<OfferDetail>(`/offers/${id}`, { method: 'PATCH', body }),
  regenerateLink: (id: Id) =>
    apiRequest<OfferDetail>(`/offers/${id}/regenerate-link`, { method: 'POST' }),
  /** BR-105 prefilled values for the convert form (UC-031). */
  eventDraft: (id: Id) => apiRequest<EventCreate>(`/offers/${id}/event-draft`),
  /** With `body`: the event is created from the (edited) form; without: BR-105 defaults. */
  convert: (id: Id, body?: EventCreate) =>
    apiRequest<OfferConvertResponse>(`/offers/${id}/convert`, { method: 'POST', body }),
  delete: (id: Id) => apiRequest<void>(`/offers/${id}/delete`, { method: 'POST' }),
  restore: (id: Id) => apiRequest<OfferDetail>(`/offers/${id}/restore`, { method: 'POST' }),
  history: (id: Id) => apiRequest<OfferEvent[]>(`/offers/${id}/history`),
  /** BR-122: KPI cards (all offers; year series around `year`, default = current Helsinki year). */
  stats: (year?: number) => apiRequest<OfferStats>('/offers/stats', { query: { year } }),
};

// ---------- Tasks ----------

export const tasksApi = {
  list: (query: TaskListQuery = {}) => apiRequest<Task[]>('/tasks', { query: { ...query } }),
  create: (body: TaskCreate) => apiRequest<Task>('/tasks', { method: 'POST', body }),
  update: (id: Id, body: TaskUpdate) =>
    apiRequest<Task>(`/tasks/${id}`, { method: 'PATCH', body }),
  remove: (id: Id) => apiRequest<void>(`/tasks/${id}`, { method: 'DELETE' }),
};

// ---------- Hours ----------

export const hoursApi = {
  list: (year: number, partnerId?: Id) =>
    apiRequest<HourEntry[]>('/hours', { query: { year, partnerId } }),
  create: (body: HourEntryCreate) => apiRequest<HourEntry>('/hours', { method: 'POST', body }),
  update: (id: Id, body: HourEntryUpdate) =>
    apiRequest<HourEntry>(`/hours/${id}`, { method: 'PATCH', body }),
  remove: (id: Id) => apiRequest<void>(`/hours/${id}`, { method: 'DELETE' }),
  totals: (year: number) => apiRequest<HoursTotals>('/hours/totals', { query: { year } }),
};

// ---------- Budget ----------

export const budgetApi = {
  get: (year: number) => apiRequest<BudgetResponse>('/budget', { query: { year } }),
  putRow: (year: number, categoryId: Id, body: BudgetRowUpdate) =>
    apiRequest<BudgetRow>(`/budget/${year}/${categoryId}`, { method: 'PUT', body }),
  copyFromPrevious: (year: number) =>
    apiRequest<BudgetResponse>(`/budget/${year}/copy-from-previous`, { method: 'POST' }),
};

export const budgetCategoriesApi = {
  create: (body: BudgetCategoryInput) =>
    apiRequest<BudgetCategory>('/budget-categories', { method: 'POST', body }),
  rename: (id: Id, body: BudgetCategoryInput) =>
    apiRequest<BudgetCategory>(`/budget-categories/${id}`, { method: 'PATCH', body }),
  remove: (id: Id) => apiRequest<void>(`/budget-categories/${id}`, { method: 'DELETE' }),
};

// ---------- References (BR-108) ----------

export const referencesApi = {
  list: () => apiRequest<Reference[]>('/references'),
  create: (body: ReferenceCreate) => apiRequest<Reference>('/references', { method: 'POST', body }),
  update: (id: Id, body: ReferenceUpdate) =>
    apiRequest<Reference>(`/references/${id}`, { method: 'PATCH', body }),
  /** All ids in the new order. */
  reorder: (ids: Id[]) =>
    apiRequest<Reference[]>('/references/reorder', { method: 'POST', body: { ids } }),
  uploadImage: (id: Id, file: File) => {
    const form = new FormData();
    form.append('file', file);
    return apiRequest<Reference>(`/references/${id}/image`, { method: 'PUT', body: form });
  },
  removeImage: (id: Id) => apiRequest<Reference>(`/references/${id}/image`, { method: 'DELETE' }),
  /** Session-scoped image URL (internal page) with `?v=<imageVersion>`, so a replaced photo is never cached. */
  imageUrl: (id: Id, imageVersion: string | null) =>
    buildUrl(`/references/${id}/image`, { v: imageVersion }),
  remove: (id: Id) => apiRequest<void>(`/references/${id}`, { method: 'DELETE' }),
};

// ---------- Purchase orders (UC-034) ----------

export const purchaseOrdersApi = {
  /** Without `year`, all years; with `q`, the server ignores `year` and searches all years (BR-119). */
  list: (query: PurchaseOrderListQuery) =>
    apiRequest<PurchaseOrderListResponse>('/purchase-orders', {
      query: { year: query.q ? undefined : query.year, q: query.q || undefined, status: query.status },
    }),
  get: (id: Id) => apiRequest<PurchaseOrder>(`/purchase-orders/${id}`),
  /** By hand (partner): 201; 409 COST_LINE_NOT_ELIGIBLE with `details.costLineIds`. */
  create: (body: PurchaseOrderCreate) =>
    apiRequest<PurchaseOrder>('/purchase-orders', { method: 'POST', body }),
  pay: (id: Id) => apiRequest<PurchaseOrder>(`/purchase-orders/${id}/pay`, { method: 'POST' }),
  unpay: (id: Id) => apiRequest<PurchaseOrder>(`/purchase-orders/${id}/unpay`, { method: 'POST' }),
  cancel: (id: Id, body: ReasonRequest) =>
    apiRequest<PurchaseOrder>(`/purchase-orders/${id}/cancel`, { method: 'POST', body }),
  history: (id: Id) => apiRequest<PurchaseOrderEvent[]>(`/purchase-orders/${id}/history`),
  /** Recent events of every PO, newest first (`limit` 1…200, default 50). */
  events: (limit?: number) =>
    apiRequest<PurchaseOrderEvent[]>('/purchase-orders/events', { query: { limit } }),
};

// ---------- Data import (UC-035) ----------

export const importApi = {
  /** `document` = the parsed seed JSON, sent as the body. `dryRun` checks and rolls back. */
  run: (document: unknown, options: ImportOptions) =>
    apiRequest<ImportResponse>('/import', {
      method: 'POST',
      body: document,
      query: { dryRun: options.dryRun, filename: options.filename?.slice(0, IMPORT_FILENAME_MAX) },
    }),
  /** Real imports, newest first (last 50). */
  runs: () => apiRequest<ImportRun[]>('/import/runs'),
};
