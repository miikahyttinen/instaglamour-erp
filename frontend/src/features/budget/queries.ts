import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { invalidateYearData, rootKeys } from '../../api/cache';
import { budgetApi, budgetCategoriesApi } from '../../api/endpoints';
import type { BudgetCategory, BudgetResponse, BudgetRow, BudgetRowUpdate, Id, ReferenceData } from '../../api/types';
import { referenceKey } from '../../reference/useReference';

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

// ---------- Budget rows (UC-020 A2–A4) ----------

/**
 * After a row is added, renamed or removed: patch the reference cache right away (so the page
 * shows the right rows and names without a gap), then refetch reference, budget and year data.
 */
function useAfterRowChange() {
  const queryClient = useQueryClient();
  return (update: (categories: BudgetCategory[]) => BudgetCategory[]) => {
    queryClient.setQueryData<ReferenceData>(referenceKey, (old) =>
      old ? { ...old, budgetCategories: update(old.budgetCategories) } : old,
    );
    return Promise.all([
      queryClient.invalidateQueries({ queryKey: referenceKey }),
      invalidateYearData(queryClient, 'budget'),
    ]).then(() => undefined);
  };
}

export function useCreateBudgetRow() {
  const after = useAfterRowChange();
  return useMutation({
    mutationFn: (name: string) => budgetCategoriesApi.create({ name }),
    onSuccess: (created) => {
      void after((list) => [...list.filter((c) => c.id !== created.id), created]);
    },
  });
}

export function useRenameBudgetRow() {
  const after = useAfterRowChange();
  return useMutation({
    mutationFn: ({ id, name }: { id: Id; name: string }) => budgetCategoriesApi.rename(id, { name }),
    onSuccess: (renamed) => {
      void after((list) => list.map((c) => (c.id === renamed.id ? renamed : c)));
    },
  });
}

export function useRemoveBudgetRow() {
  const after = useAfterRowChange();
  return useMutation({
    mutationFn: (id: Id) => budgetCategoriesApi.remove(id),
    onSuccess: (_, id) => {
      void after((list) => list.filter((c) => c.id !== id));
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
