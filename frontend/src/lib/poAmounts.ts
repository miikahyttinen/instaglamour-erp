// Amount of one freelancer PO line (docs/api-contract.md "Freelancer PO: VAT and sound check").
// Used for the live preview on the freelancer page and by the mock backend, so both follow the
// same rule. Values (deduction, VAT rate) always come from settings, never hard-coded.

export interface PoAmountSettings {
  /** Deducted when the person was not at the sound check (= the load-in deduction setting). */
  soundcheckDeductionCents: number;
  /** VAT rate in basis points (1350 = 13.5 %). */
  vatRateBp: number;
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
 * `base` = fee; sound check missed → minus the deduction (not below 0); VAT-liable → net × (1 +
 * rate) rounded to whole cents (half away from zero).
 */
export function poLineAmounts(
  feeCents: number,
  soundcheck: boolean,
  vatLiable: boolean,
  settings: PoAmountSettings,
): PoLineAmounts {
  const deductionCents = soundcheck ? 0 : Math.min(Math.max(settings.soundcheckDeductionCents, 0), Math.max(feeCents, 0));
  const net = feeCents - deductionCents;
  const amountCents = vatLiable ? Math.round((net * (10000 + settings.vatRateBp)) / 10000) : net;
  return { baseCents: feeCents, deductionCents, vatCents: amountCents - net, amountCents };
}

/** "13,5 %" / "13.5 %" from basis points. */
export function formatVatRate(bp: number, lang: 'fi' | 'en'): string {
  const value = (bp / 100).toLocaleString(lang === 'fi' ? 'fi-FI' : 'en-GB', { maximumFractionDigits: 2 });
  return `${value} %`;
}
