import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { invalidateYearData, rootKeys } from '../../api/cache';
import { budgetApi } from '../../api/endpoints';
import type { BudgetResponse, BudgetRow, BudgetRowUpdate, Id } from '../../api/types';

export const budgetKey = (year: number) => [...rootKeys.budget, year] as const;

export function useBudget(year: number) {
  return useQuery({ queryKey: budgetKey(year), queryFn: () => budgetApi.get(year) });
}

export const AMOUNT_FIELDS = [
  'budgetExpenseCents',
  'budgetIncomeCents',
  'actualExpenseCents',
  'actualIncomeCents',
] as const;
export type AmountField = (typeof AMOUNT_FIELDS)[number];
export const BUDGET_FIELDS: readonly AmountField[] = ['budgetExpenseCents', 'budgetIncomeCents'];

export const FIELD_LABEL_KEYS = {
  budgetExpenseCents: 'budget.budgetExpense',
  budgetIncomeCents: 'budget.budgetIncome',
  actualExpenseCents: 'budget.actualExpense',
  actualIncomeCents: 'budget.actualIncome',
} as const satisfies Record<AmountField, string>;

/** Replaces one row and recomputes the totals (variance = budget − actual, BR-060). */
export function withRow(data: BudgetResponse, row: BudgetRow): BudgetResponse {
  const rows = data.rows.map((r) => (r.categoryId === row.categoryId ? row : r));
  const sums = { budgetExpenseCents: 0, budgetIncomeCents: 0, actualExpenseCents: 0, actualIncomeCents: 0 };
  for (const r of rows) for (const f of AMOUNT_FIELDS) sums[f] += r[f];
  return {
    ...data,
    rows,
    totals: {
      ...sums,
      varianceExpenseCents: sums.budgetExpenseCents - sums.actualExpenseCents,
      varianceIncomeCents: sums.budgetIncomeCents - sums.actualIncomeCents,
    },
  };
}

export function useSaveBudgetRow(year: number, categoryId: Id) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: BudgetRowUpdate) => budgetApi.putRow(year, categoryId, body),
    onSuccess: (row) => {
      queryClient.setQueryData<BudgetResponse>(budgetKey(year), (old) => (old ? withRow(old, row) : old));
      // The year page shows budget totals and uses actuals in the year result (BR-063).
      void invalidateYearData(queryClient, 'budget');
    },
  });
}

export function useCopyBudget(year: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => budgetApi.copyFromPrevious(year),
    onSuccess: (data) => {
      queryClient.setQueryData(budgetKey(year), data);
      void invalidateYearData(queryClient, 'budget');
    },
  });
}
