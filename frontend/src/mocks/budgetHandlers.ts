// Mock handlers for the Budget and Budget rows sections of the contract (UC-020). State: db.budget
// (budgetStore.ts) and db.reference.budgetCategories (active rows). Synthetic data only (BR-090).
import { http, HttpResponse } from 'msw';
import type { FieldCode } from '../api/enums';
import type { BudgetAmounts, BudgetCategory } from '../api/types';
import { BUDGET_AMOUNT_FIELDS, budgetOfYear, budgetRow, setBudgetAmounts } from './budgetStore';
import { db } from './data';
import { currentPartner, errorResponse, unauthenticated, validationError } from './util';

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
const categoryNotFound = () => errorResponse(404, 'NOT_FOUND', 'Budget category not found');

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
    // Unknown or removed rows → 404. Every active row takes all four fields (no actuals-only rows).
    const category = db.reference.budgetCategories.find((c) => c.id === params.categoryId);
    if (!category) return categoryNotFound();
    const amounts = Object.fromEntries(BUDGET_AMOUNT_FIELDS.map((f) => [f, body[f]])) as unknown as BudgetAmounts;
    setMockBudget(year, category.id, amounts);
    return HttpResponse.json(rowFor(year, category.id));
  }),

  http.post('/api/budget/:year/copy-from-previous', ({ params }) => {
    if (!currentPartner()) return unauthenticated();
    const year = parseYear(String(params.year));
    if (year === null) return invalidYear();
    const active = db.reference.budgetCategories;
    const target = active.map((c) => rowFor(year, c.id));
    if (target.some((r) => r.budgetExpenseCents !== 0 || r.budgetIncomeCents !== 0)) {
      return errorResponse(409, 'BUDGET_NOT_EMPTY', 'Year already has budget numbers');
    }
    for (const c of active) {
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

// ---------- Budget rows (UC-020 A2–A4) ----------

const MAX_NAME = 500;
let nextCategoryNo = 1;

function newCategoryId(): string {
  return `00000000-0000-4000-8000-${String(700000000000 + nextCategoryNo++)}`;
}

/** Validates a row name like the backend: trimmed, required, ≤ 500 chars, unique among active rows. */
function checkName(raw: unknown, selfId?: string): { name: string } | { error: FieldCode } {
  const name = typeof raw === 'string' ? raw.trim() : '';
  if (!name) return { error: 'REQUIRED' };
  if (name.length > MAX_NAME) return { error: 'TOO_LONG' };
  const key = name.toLocaleLowerCase();
  const taken = db.reference.budgetCategories.some(
    (c) => c.id !== selfId && c.name.trim().toLocaleLowerCase() === key,
  );
  return taken ? { error: 'DUPLICATE' } : { name };
}

async function readBody(request: Request): Promise<Record<string, unknown>> {
  try {
    return ((await request.json()) as Record<string, unknown> | null) ?? {};
  } catch {
    return {};
  }
}

export const budgetCategoryHandlers = [
  http.post('/api/budget-categories', async ({ request }) => {
    if (!currentPartner()) return unauthenticated();
    const result = checkName((await readBody(request)).name);
    if ('error' in result) return validationError({ name: result.error });
    const category: BudgetCategory = { id: newCategoryId(), name: result.name };
    db.reference.budgetCategories = [...db.reference.budgetCategories, category];
    return HttpResponse.json(category, { status: 201 });
  }),

  http.patch('/api/budget-categories/:id', async ({ params, request }) => {
    if (!currentPartner()) return unauthenticated();
    const existing = db.reference.budgetCategories.find((c) => c.id === params.id);
    if (!existing) return categoryNotFound();
    const result = checkName((await readBody(request)).name, existing.id);
    if ('error' in result) return validationError({ name: result.error });
    const category: BudgetCategory = { id: existing.id, name: result.name };
    db.reference.budgetCategories = db.reference.budgetCategories.map((c) => (c.id === existing.id ? category : c));
    return HttpResponse.json(category);
  }),

  http.delete('/api/budget-categories/:id', ({ params }) => {
    if (!currentPartner()) return unauthenticated();
    if (!db.reference.budgetCategories.some((c) => c.id === params.id)) return categoryNotFound();
    // Soft delete: the row leaves the active list (reference, GET /api/budget, totals, year page);
    // its stored amounts in db.budget are kept.
    db.reference.budgetCategories = db.reference.budgetCategories.filter((c) => c.id !== params.id);
    return new HttpResponse(null, { status: 204 });
  }),
];
