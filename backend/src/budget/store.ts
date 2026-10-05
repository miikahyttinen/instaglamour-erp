/**
 * Yearly budget (UC-020; BR-060, BR-063). `loadBudget` is the single source of the year's budget
 * rows and totals: `GET /api/budget` and the year page both use it.
 */
import type { BudgetCategory, BudgetYear, Prisma } from '../generated/prisma/client.js';
import type { Tx } from '../gigs/store.js';

export interface BudgetAmounts {
  budgetExpenseCents: number;
  budgetIncomeCents: number;
  actualExpenseCents: number;
  actualIncomeCents: number;
}

export const ZERO_AMOUNTS: BudgetAmounts = Object.freeze({
  budgetExpenseCents: 0,
  budgetIncomeCents: 0,
  actualExpenseCents: 0,
  actualIncomeCents: 0,
});

export interface BudgetRowDto extends BudgetAmounts {
  categoryId: string;
  year: number;
  varianceExpenseCents: number;
  varianceIncomeCents: number;
}

export interface BudgetTotals extends BudgetAmounts {
  varianceExpenseCents: number;
  varianceIncomeCents: number;
}

export interface BudgetDto {
  year: number;
  rows: BudgetRowDto[];
  totals: BudgetTotals;
}

/** BR-060: variance = budget − actual. */
function withVariance<T extends BudgetAmounts>(a: T): T & { varianceExpenseCents: number; varianceIncomeCents: number } {
  return {
    ...a,
    varianceExpenseCents: a.budgetExpenseCents - a.actualExpenseCents,
    varianceIncomeCents: a.budgetIncomeCents - a.actualIncomeCents,
  };
}

export function amountsOf(row: BudgetYear | null | undefined): BudgetAmounts {
  if (!row) return { ...ZERO_AMOUNTS };
  return {
    budgetExpenseCents: row.budgetExpenseCents,
    budgetIncomeCents: row.budgetIncomeCents,
    actualExpenseCents: row.actualExpenseCents,
    actualIncomeCents: row.actualIncomeCents,
  };
}

export function toBudgetRowDto(categoryId: string, year: number, row: BudgetYear | null | undefined): BudgetRowDto {
  return withVariance({ categoryId, year, ...amountsOf(row) });
}

/** Display order of budget rows: sort order (creation order), ties by creation time then id. */
export const BUDGET_CATEGORY_ORDER = [{ sortOrder: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }] as const satisfies Prisma.BudgetCategoryOrderByWithRelationInput[];

/** Active categories in display order (the budget page and `GET /api/reference`). Removed rows are inactive. */
export function loadActiveBudgetCategories(db: Tx): Promise<BudgetCategory[]> {
  return db.budgetCategory.findMany({ where: { active: true }, orderBy: [...BUDGET_CATEGORY_ORDER] });
}

/** Contract shape of a budget row's name (`GET /api/reference` and `/api/budget-categories`). */
export function toBudgetCategoryDto(c: Pick<BudgetCategory, 'id' | 'name'>): { id: string; name: string } {
  return { id: c.id, name: c.name };
}

/** One row per active category (zeros if nothing is stored) and the totals of those rows. */
export async function loadBudget(db: Tx, year: number): Promise<BudgetDto> {
  const categories = await loadActiveBudgetCategories(db);
  const stored = await db.budgetYear.findMany({ where: { year, categoryId: { in: categories.map((c) => c.id) } } });
  const byCategory = new Map(stored.map((r) => [r.categoryId, r]));
  const rows = categories.map((c) => toBudgetRowDto(c.id, year, byCategory.get(c.id)));
  const sums: BudgetAmounts = { ...ZERO_AMOUNTS };
  for (const row of rows) {
    sums.budgetExpenseCents += row.budgetExpenseCents;
    sums.budgetIncomeCents += row.budgetIncomeCents;
    sums.actualExpenseCents += row.actualExpenseCents;
    sums.actualIncomeCents += row.actualIncomeCents;
  }
  return { year, rows, totals: withVariance(sums) };
}
