// In-memory mock of the yearly budget (UC-020). Synthetic data only (BR-090).
// This file does not import mocks/data.ts (no import cycle): callers pass in the categories.
import type { BudgetAmounts, BudgetCategory, BudgetResponse, BudgetRow } from '../api/types';

export const BUDGET_AMOUNT_FIELDS = [
  'budgetExpenseCents',
  'budgetIncomeCents',
  'actualExpenseCents',
  'actualIncomeCents',
] as const;

const ZERO: BudgetAmounts = {
  budgetExpenseCents: 0,
  budgetIncomeCents: 0,
  actualExpenseCents: 0,
  actualIncomeCents: 0,
};

/** Stored amounts keyed by `${year}:${categoryId}`. Missing = zeros. */
export type BudgetState = Map<string, BudgetAmounts>;

const key = (year: number, categoryId: string) => `${year}:${categoryId}`;

export function budgetAmounts(state: BudgetState, year: number, categoryId: string): BudgetAmounts | undefined {
  return state.get(key(year, categoryId));
}

export function setBudgetAmounts(
  state: BudgetState,
  year: number,
  categoryId: string,
  amounts: Partial<BudgetAmounts>,
): void {
  state.set(key(year, categoryId), { ...ZERO, ...state.get(key(year, categoryId)), ...amounts });
}

/** Seed: the current year has numbers, other years are empty. */
export function seedBudget(categories: BudgetCategory[]): BudgetState {
  const state: BudgetState = new Map();
  const year = new Date().getFullYear();
  const [a, b, c] = categories;
  if (a) setBudgetAmounts(state, year, a.id, { budgetExpenseCents: 100000, actualExpenseCents: 90000 });
  if (b) setBudgetAmounts(state, year, b.id, { budgetIncomeCents: 200000, actualIncomeCents: 100000 });
  if (c) setBudgetAmounts(state, year, c.id, { actualExpenseCents: 10000 });
  return state;
}

function withVariance<T extends BudgetAmounts>(a: T) {
  return {
    ...a,
    varianceExpenseCents: a.budgetExpenseCents - a.actualExpenseCents,
    varianceIncomeCents: a.budgetIncomeCents - a.actualIncomeCents,
  };
}

export function budgetRow(state: BudgetState, year: number, categoryId: string): BudgetRow {
  return withVariance({ categoryId, year, ...ZERO, ...state.get(key(year, categoryId)) });
}

/** All categories of `year` with totals and variance (BR-060). */
export function budgetOfYear(state: BudgetState, categories: BudgetCategory[], year: number): BudgetResponse {
  const rows = categories.map((c) => budgetRow(state, year, c.id));
  const sums = { ...ZERO };
  for (const row of rows) for (const f of BUDGET_AMOUNT_FIELDS) sums[f] += row[f];
  return { year, rows, totals: withVariance(sums) };
}
