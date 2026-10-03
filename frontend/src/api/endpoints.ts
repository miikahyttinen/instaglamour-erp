// Typed functions for every endpoint in docs/api-contract.md.
import { apiRequest, buildUrl } from './client';
import type {
  Attachment,
  BudgetResponse,
  BudgetRow,
  BudgetRowUpdate,
  CostLineCreate,
  CostLinePayRequest,
  CostLineUpdate,
  DevLoginRequest,
  GigCreate,
  GigDetail,
  GigEvent,
  GigListQuery,
  GigListResponse,
  GigMoveRequest,
  GigUpdate,
  GigUpdateResponse,
  GigWithWarnings,
  HourEntry,
  HourEntryCreate,
  HourEntryUpdate,
  HoursTotals,
  Id,
  Partner,
  PeopleActiveFilter,
  Person,
  PersonCostLinesResponse,
  PersonCreate,
  PersonUpdate,
  PersonWithWarnings,
  ReasonRequest,
  ReferenceData,
  Task,
  TaskCreate,
  TaskListQuery,
  TaskUpdate,
  UpdateMeRequest,
  YearPage,
} from './types';

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

// ---------- Reference & year ----------

export const referenceApi = {
  get: () => apiRequest<ReferenceData>('/reference'),
};

export const yearsApi = {
  get: (year: number) => apiRequest<YearPage>(`/years/${year}`),
};

// ---------- Gigs ----------

export const gigsApi = {
  list: (query: GigListQuery) =>
    apiRequest<GigListResponse>('/gigs', {
      query: {
        ...query,
        notFullyStaffed: query.notFullyStaffed ? true : undefined,
        deleted: query.deleted ? true : undefined,
      },
    }),
  create: (body: GigCreate) => apiRequest<GigDetail>('/gigs', { method: 'POST', body }),
  get: (id: Id) => apiRequest<GigDetail>(`/gigs/${id}`),
  update: (id: Id, body: GigUpdate) =>
    apiRequest<GigUpdateResponse>(`/gigs/${id}`, { method: 'PATCH', body }),
  move: (id: Id, body: GigMoveRequest) =>
    apiRequest<GigWithWarnings>(`/gigs/${id}/move`, { method: 'POST', body }),
  cancel: (id: Id, body: ReasonRequest) =>
    apiRequest<GigDetail>(`/gigs/${id}/cancel`, { method: 'POST', body }),
  uncancel: (id: Id, body: ReasonRequest) =>
    apiRequest<GigDetail>(`/gigs/${id}/uncancel`, { method: 'POST', body }),
  delete: (id: Id, body: ReasonRequest) =>
    apiRequest<void>(`/gigs/${id}/delete`, { method: 'POST', body }),
  restore: (id: Id) => apiRequest<GigDetail>(`/gigs/${id}/restore`, { method: 'POST' }),
  history: (id: Id) => apiRequest<GigEvent[]>(`/gigs/${id}/history`),
};

// ---------- Cost lines ----------

export const costLinesApi = {
  create: (gigId: Id, body: CostLineCreate) =>
    apiRequest<GigWithWarnings>(`/gigs/${gigId}/cost-lines`, { method: 'POST', body }),
  update: (id: Id, body: CostLineUpdate) =>
    apiRequest<GigWithWarnings>(`/cost-lines/${id}`, { method: 'PATCH', body }),
  remove: (id: Id) => apiRequest<GigWithWarnings>(`/cost-lines/${id}`, { method: 'DELETE' }),
  pay: (id: Id, body: CostLinePayRequest = {}) =>
    apiRequest<GigWithWarnings>(`/cost-lines/${id}/pay`, { method: 'POST', body }),
  unpay: (id: Id) => apiRequest<GigWithWarnings>(`/cost-lines/${id}/unpay`, { method: 'POST' }),
};

// ---------- Attachments ----------

export const attachmentsApi = {
  upload: (gigId: Id, file: File) => {
    const form = new FormData();
    form.append('file', file);
    return apiRequest<Attachment>(`/gigs/${gigId}/attachments`, { method: 'POST', body: form });
  },
  downloadUrl: (id: Id) => buildUrl(`/attachments/${id}/download`),
  remove: (id: Id) => apiRequest<void>(`/attachments/${id}`, { method: 'DELETE' }),
};

// ---------- People ----------

export const peopleApi = {
  list: (active: PeopleActiveFilter = 'true') =>
    apiRequest<Person[]>('/people', { query: { active } }),
  create: (body: PersonCreate) =>
    apiRequest<PersonWithWarnings>('/people', { method: 'POST', body }),
  update: (id: Id, body: PersonUpdate) =>
    apiRequest<PersonWithWarnings>(`/people/${id}`, { method: 'PATCH', body }),
  costLines: (id: Id, year: number) =>
    apiRequest<PersonCostLinesResponse>(`/people/${id}/cost-lines`, { query: { year } }),
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
