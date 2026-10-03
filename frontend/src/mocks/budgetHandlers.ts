// Mock handlers for the Budget section of the contract (UC-020). Synthetic data only (BR-090).
import { http, HttpResponse } from 'msw';
import type { FieldCode } from '../api/enums';
import type { BudgetAmounts, BudgetResponse, BudgetRow } from '../api/types';
import { db } from './data';
import { currentPartner, errorResponse, unauthenticated, validationError } from './util';

const AMOUNT_FIELDS = [
  'budgetExpenseCents',
  'budgetIncomeCents',
  'actualExpenseCents',
  'actualIncomeCents',
] as const;
const BUDGET_FIELDS = ['budgetExpenseCents', 'budgetIncomeCents'] as const;

const ZERO: BudgetAmounts = {
  budgetExpenseCents: 0,
  budgetIncomeCents: 0,
  actualExpenseCents: 0,
  actualIncomeCents: 0,
};

/** Stored amounts keyed by `${year}:${categoryId}`. Missing = zeros. */
export const budgetStore = new Map<string, BudgetAmounts>();

const key = (year: number, categoryId: string) => `${year}:${categoryId}`;

export function setMockBudget(year: number, categoryId: string, amounts: Partial<BudgetAmounts>): void {
  budgetStore.set(key(year, categoryId), { ...ZERO, ...budgetStore.get(key(year, categoryId)), ...amounts });
}

/** Resets the budget store to its seed: the current year has numbers, the next year is empty. */
export function resetMockBudget(): void {
  budgetStore.clear();
  const year = new Date().getFullYear();
  const [a, b, c] = db.reference.budgetCategories;
  if (a) setMockBudget(year, a.id, { budgetExpenseCents: 100000, actualExpenseCents: 90000 });
  if (b) setMockBudget(year, b.id, { budgetIncomeCents: 200000, actualIncomeCents: 100000 });
  if (c) setMockBudget(year, c.id, { actualExpenseCents: 10000 });
}
resetMockBudget();

function withVariance<T extends BudgetAmounts>(a: T) {
  return {
    ...a,
    varianceExpenseCents: a.budgetExpenseCents - a.actualExpenseCents,
    varianceIncomeCents: a.budgetIncomeCents - a.actualIncomeCents,
  };
}

function rowFor(year: number, categoryId: string): BudgetRow {
  return withVariance({ categoryId, year, ...ZERO, ...budgetStore.get(key(year, categoryId)) });
}

function budgetFor(year: number): BudgetResponse {
  const rows = db.reference.budgetCategories.map((c) => rowFor(year, c.id));
  const sums = { ...ZERO };
  for (const row of rows) for (const f of AMOUNT_FIELDS) sums[f] += row[f];
  return { year, rows, totals: withVariance(sums) };
}

function parseYear(value: string | null): number | null {
  return value && /^\d{4}$/.test(value) ? Number(value) : null;
}

const invalidYear = () => validationError({ year: 'INVALID_VALUE' });

export const budgetHandlers = [
  http.get('/api/budget', ({ request }) => {
    if (!currentPartner()) return unauthenticated();
    const year = parseYear(new URL(request.url).searchParams.get('year'));
    if (year === null) return invalidYear();
    return HttpResponse.json(budgetFor(year));
  }),

  http.put('/api/budget/:year/:categoryId', async ({ params, request }) => {
    if (!currentPartner()) return unauthenticated();
    const year = parseYear(String(params.year));
    if (year === null) return invalidYear();
    const body = (await request.json()) as Record<string, unknown>;
    const fields: Record<string, FieldCode> = {};
    for (const f of AMOUNT_FIELDS) {
      const v = body[f];
      if (v === undefined || v === null) fields[f] = 'REQUIRED';
      else if (typeof v !== 'number' || !Number.isInteger(v)) fields[f] = 'INVALID_VALUE';
      else if (v < 0) fields[f] = 'NEGATIVE_AMOUNT';
    }
    if (Object.keys(fields).length > 0) return validationError(fields);
    const category = db.reference.budgetCategories.find((c) => c.id === params.categoryId);
    if (!category) return errorResponse(404, 'NOT_FOUND', 'Budget category not found');
    if (!category.budgeted) {
      for (const f of BUDGET_FIELDS) if (body[f] !== 0) fields[f] = 'INVALID_VALUE';
      if (Object.keys(fields).length > 0) return validationError(fields);
    }
    const amounts = Object.fromEntries(AMOUNT_FIELDS.map((f) => [f, body[f]])) as unknown as BudgetAmounts;
    setMockBudget(year, category.id, amounts);
    return HttpResponse.json(rowFor(year, category.id));
  }),

  http.post('/api/budget/:year/copy-from-previous', ({ params }) => {
    if (!currentPartner()) return unauthenticated();
    const year = parseYear(String(params.year));
    if (year === null) return invalidYear();
    const budgeted = db.reference.budgetCategories.filter((c) => c.budgeted);
    const target = budgeted.map((c) => rowFor(year, c.id));
    if (target.some((r) => r.budgetExpenseCents !== 0 || r.budgetIncomeCents !== 0)) {
      return errorResponse(409, 'BUDGET_NOT_EMPTY', 'Year already has budget numbers');
    }
    for (const c of budgeted) {
      const prev = rowFor(year - 1, c.id);
      if (prev.budgetExpenseCents === 0 && prev.budgetIncomeCents === 0) continue;
      setMockBudget(year, c.id, {
        budgetExpenseCents: prev.budgetExpenseCents,
        budgetIncomeCents: prev.budgetIncomeCents,
      });
    }
    return HttpResponse.json(budgetFor(year));
  }),
];
