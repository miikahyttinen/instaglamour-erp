/**
 * Freelancer PO line amounts (api-contract "Freelancer PO: VAT and sound check" and
 * "Freelancer PO: VAT rate choice", 2026-11-04).
 * Pure; the caller supplies the settings and the chosen rate (never hard-coded business values).
 */
import type { Db } from '../db.js';
import {
  DEFAULT_PERFORMER_VAT_RATES_BP,
  OPTIONAL_NUMBER_SETTING_KEYS,
  PERFORMER_VAT_RATES_SETTING_KEY,
  SETTING_KEYS,
  parsePerformerVatRates,
} from '../domain/enums.js';
import type { Prisma } from '../generated/prisma/client.js';

export interface PoAmountSettings {
  /** = setting `fees.load_in_deduction` (the same deduction as the load-in switch). */
  soundcheckDeductionCents: number;
  /** The VAT rates a freelancer can choose (basis points, > 0); "no VAT" (0) is always allowed too. */
  vatRatesBp: number[];
}

export interface PoLineAmount {
  baseCents: number;
  deductionCents: number;
  vatCents: number;
  amountCents: number;
}

/**
 * base = budgeted fee; no sound check → minus the deduction (never below 0); VAT rate > 0 → plus
 * round_half_up(net × rate). amount = base − deduction + vat (= round(net × (1 + rate)) for integer nets).
 */
export function poLineAmount(
  budgetedCents: number,
  options: { soundcheck: boolean; vatRateBp: number },
  settings: Pick<PoAmountSettings, 'soundcheckDeductionCents'>,
): PoLineAmount {
  const baseCents = budgetedCents;
  const deductionCents = options.soundcheck ? 0 : Math.min(baseCents, Math.max(settings.soundcheckDeductionCents, 0));
  const net = baseCents - deductionCents;
  // round_half_up(net × (1 + bp/10000)) − net, in exact integer arithmetic (net, bp ≥ 0).
  const vatCents = Math.floor((net * Math.max(options.vatRateBp, 0) + 5000) / 10000);
  return { baseCents, deductionCents, vatCents, amountCents: net + vatCents };
}

type SettingRow = { key: string; valueCents: number | null; valueText: string | null };

/**
 * The selectable VAT rates from the settings rows:
 * 1. `fees.performer_vat_rates_bp` (comma-separated text) when present and valid;
 * 2. else the default list with its first rate replaced by the former single-rate setting
 *    `fees.performer_vat_rate_bp`, if that row exists (duplicates and non-positive values dropped);
 * 3. else the default list.
 */
export function resolveVatRates(rows: readonly SettingRow[]): number[] {
  const list = rows.find((r) => r.key === PERFORMER_VAT_RATES_SETTING_KEY);
  const parsed = list?.valueText != null ? parsePerformerVatRates(list.valueText) : null;
  if (parsed) return parsed;
  const legacy = rows.find((r) => r.key === OPTIONAL_NUMBER_SETTING_KEYS.performerVatRateBp)?.valueCents;
  const rates = [...DEFAULT_PERFORMER_VAT_RATES_BP];
  if (legacy != null) rates[0] = legacy;
  return [...new Set(rates)].filter((r) => r > 0);
}

/** The current settings (read inside the creating transaction so the amounts match one snapshot). */
export async function loadPoAmountSettings(db: Db | Prisma.TransactionClient): Promise<PoAmountSettings> {
  const rows = await db.setting.findMany({
    where: {
      key: {
        in: [SETTING_KEYS.loadInDeduction, OPTIONAL_NUMBER_SETTING_KEYS.performerVatRateBp, PERFORMER_VAT_RATES_SETTING_KEY],
      },
    },
  });
  return {
    soundcheckDeductionCents: rows.find((r) => r.key === SETTING_KEYS.loadInDeduction)?.valueCents ?? 0,
    vatRatesBp: resolveVatRates(rows),
  };
}
