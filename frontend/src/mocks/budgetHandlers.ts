// Mock handlers for the Budget section of the contract (UC-020). State: db.budget
// (budgetStore.ts). Synthetic data only (BR-090).
import { http, HttpResponse } from 'msw';
import type { FieldCode } from '../api/enums';
import type { BudgetAmounts } from '../api/types';
import { BUDGET_AMOUNT_FIELDS, budgetOfYear, budgetRow, setBudgetAmounts } from './budgetStore';
import { db } from './data';
import { currentPartner, errorResponse, unauthenticated, validationError } from './util';

const BUDGET_FIELDS = ['budgetExpenseCents', 'budgetIncomeCents'] as const;

const rowFor = (year: number, categoryId: string) => budgetRow(db.budget, year, categoryId);
const budgetFor = (year: number) => budgetOfYear(db.budget, db.reference.budgetCategories, year);

/** Sets stored amounts of one category (tests). */
export function setMockBudget(year: number, categoryId: string, amounts: Partial<BudgetAmounts>): void {
  setBudgetAmounts(db.budget, year, categoryId, amounts);
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
    for (const f of BUDGET_AMOUNT_FIELDS) {
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
    const amounts = Object.fromEntries(BUDGET_AMOUNT_FIELDS.map((f) => [f, body[f]])) as unknown as BudgetAmounts;
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
