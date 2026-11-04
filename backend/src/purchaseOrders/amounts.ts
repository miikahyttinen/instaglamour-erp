/**
 * Freelancer PO line amounts (api-contract "Freelancer PO: VAT and sound check", 2026-11-04).
 * Pure; the caller supplies the settings (never hard-coded business values).
 */
import type { Db } from '../db.js';
import { DEFAULT_PERFORMER_VAT_RATE_BP, OPTIONAL_NUMBER_SETTING_KEYS, SETTING_KEYS } from '../domain/enums.js';
import type { Prisma } from '../generated/prisma/client.js';

export interface PoAmountSettings {
  /** = setting `fees.load_in_deduction` (the same deduction as the load-in switch). */
  soundcheckDeductionCents: number;
  /** = setting `fees.performer_vat_rate_bp`, default 1350. */
  vatRateBp: number;
}

export interface PoLineAmount {
  baseCents: number;
  deductionCents: number;
  vatCents: number;
  amountCents: number;
}

/**
 * base = budgeted fee; no sound check → minus the deduction (never below 0); VAT-liable → plus
 * round(net × rate). amount = base − deduction + vat (= round(net × (1 + rate)) for integer nets).
 */
export function poLineAmount(
  budgetedCents: number,
  options: { soundcheck: boolean; vatLiable: boolean },
  settings: PoAmountSettings,
): PoLineAmount {
  const baseCents = budgetedCents;
  const deductionCents = options.soundcheck ? 0 : Math.min(baseCents, Math.max(settings.soundcheckDeductionCents, 0));
  const net = baseCents - deductionCents;
  // round_half_up(net × (1 + bp/10000)) − net, in exact integer arithmetic (net, bp ≥ 0).
  const vatCents = options.vatLiable ? Math.floor((net * Math.max(settings.vatRateBp, 0) + 5000) / 10000) : 0;
  return { baseCents, deductionCents, vatCents, amountCents: net + vatCents };
}

/** The current settings (read inside the creating transaction so the amounts match one snapshot). */
export async function loadPoAmountSettings(db: Db | Prisma.TransactionClient): Promise<PoAmountSettings> {
  const rows = await db.setting.findMany({
    where: { key: { in: [SETTING_KEYS.loadInDeduction, OPTIONAL_NUMBER_SETTING_KEYS.performerVatRateBp] } },
  });
  const value = (key: string) => rows.find((r) => r.key === key)?.valueCents ?? null;
  return {
    soundcheckDeductionCents: value(SETTING_KEYS.loadInDeduction) ?? 0,
    vatRateBp: value(OPTIONAL_NUMBER_SETTING_KEYS.performerVatRateBp) ?? DEFAULT_PERFORMER_VAT_RATE_BP,
  };
}
