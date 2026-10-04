/**
 * Status colour of a variance (budget − actual, BR-060). Expense: positive = under budget (ok),
 * negative = over budget (danger). Income: the other way round. Zero has no colour.
 */
export function varianceTone(kind: 'expense' | 'income', cents: number): 'ok' | 'danger' | undefined {
  if (cents === 0) return undefined;
  const good = kind === 'expense' ? cents > 0 : cents < 0;
  return good ? 'ok' : 'danger';
}

/** Colour class for a variance figure (see budget.css); empty for zero. */
export function varianceClass(kind: 'expense' | 'income', cents: number): string {
  const tone = varianceTone(kind, cents);
  return tone ? `budget-variance-${tone}` : '';
}
