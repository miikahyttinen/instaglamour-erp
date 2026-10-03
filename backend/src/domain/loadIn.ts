/** Load-in switch (BR-026). Pure: the caller supplies the current deduction setting. */

export interface LoadInState {
  budgetedCents: number;
  joinsLoadIn: boolean;
  loadInDeductionAppliedCents: number | null;
}

/**
 * Switch a musician line's load-in flag.
 * - off: deduct `min(budgeted, deduction)` and remember the amount actually deducted;
 * - on: add the remembered amount back (independent of the current setting) and forget it;
 * - same value as now: no change.
 */
export function switchLoadIn(state: LoadInState, joinsLoadIn: boolean, deductionCents: number): LoadInState {
  if (state.joinsLoadIn === joinsLoadIn) return state;
  if (!joinsLoadIn) {
    const deducted = Math.min(state.budgetedCents, Math.max(deductionCents, 0));
    return { budgetedCents: state.budgetedCents - deducted, joinsLoadIn: false, loadInDeductionAppliedCents: deducted };
  }
  return {
    budgetedCents: state.budgetedCents + (state.loadInDeductionAppliedCents ?? 0),
    joinsLoadIn: true,
    loadInDeductionAppliedCents: null,
  };
}
