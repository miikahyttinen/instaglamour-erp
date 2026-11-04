// Amount of one freelancer PO line (docs/api-contract.md "Freelancer PO: VAT and sound check",
// "Freelancer PO: VAT rate choice", "Freelancer PO: sound check already set on the gig").
// Used for the live preview on the freelancer page and by the mock backend, so both follow the
// same rule. Values (deduction, VAT rate) always come from settings, never hard-coded.

export interface PoAmountSettings {
  /** Deducted when the person was not at the sound check (= the load-in deduction setting). */
  soundcheckDeductionCents: number;
}

export interface PoLineAmounts {
  /** Fee excl. VAT (the budgeted fee). */
  baseCents: number;
  /** Actually deducted for a missed sound check (never more than the fee). */
  deductionCents: number;
  vatCents: number;
  /** Final amount = base − deduction + VAT. */
  amountCents: number;
}

/**
 * `base` = fee; sound check missed → minus the deduction (not below 0); chosen VAT rate (basis
 * points, 0 = no VAT) → net × (1 + rate) rounded to whole cents (half away from zero).
 */
export function poLineAmounts(
  feeCents: number,
  soundcheck: boolean,
  vatRateBp: number,
  settings: PoAmountSettings,
): PoLineAmounts {
  const deductionCents = soundcheck ? 0 : Math.min(Math.max(settings.soundcheckDeductionCents, 0), Math.max(feeCents, 0));
  const net = feeCents - deductionCents;
  const amountCents = vatRateBp > 0 ? Math.round((net * (10000 + vatRateBp)) / 10000) : net;
  return { baseCents: feeCents, deductionCents, vatCents: amountCents - net, amountCents };
}

/** The sound check state of the cost line on the gig (FreelancerLine / CostLine fields). */
export interface GigLoadIn {
  joinsLoadIn: boolean | null;
  loadInDeductionAppliedCents: number | null;
}

/**
 * True when the gig already says "no sound check" (`joinsLoadIn = false`): the deduction is
 * already in the budgeted fee (BR-026), so the PO switch is off and locked.
 */
export function soundcheckLockedOff(line: GigLoadIn): boolean {
  return line.joinsLoadIn === false;
}

/**
 * Amounts of a PO line for a cost line with its gig-level load-in state. Locked lines
 * (`joinsLoadIn = false`): the requested sound check is ignored, `base` = budgeted + the deduction
 * already applied on the gig, the deduction is shown once and never taken again (net = budgeted).
 * Other lines: `poLineAmounts` as before.
 */
export function poLineAmountsFor(
  line: GigLoadIn,
  budgetedCents: number,
  soundcheck: boolean,
  vatRateBp: number,
  settings: PoAmountSettings,
): PoLineAmounts & { soundcheck: boolean } {
  if (!soundcheckLockedOff(line)) {
    return { soundcheck, ...poLineAmounts(budgetedCents, soundcheck, vatRateBp, settings) };
  }
  const applied = Math.max(line.loadInDeductionAppliedCents ?? 0, 0);
  const net = budgetedCents;
  const amountCents = vatRateBp > 0 ? Math.round((net * (10000 + vatRateBp)) / 10000) : net;
  return { soundcheck: false, baseCents: net + applied, deductionCents: applied, vatCents: amountCents - net, amountCents };
}

/** "13,5 %" / "13.5 %" from basis points. */
export function formatVatRate(bp: number, lang: 'fi' | 'en'): string {
  const value = (bp / 100).toLocaleString(lang === 'fi' ? 'fi-FI' : 'en-GB', { maximumFractionDigits: 2 });
  return `${value} %`;
}

