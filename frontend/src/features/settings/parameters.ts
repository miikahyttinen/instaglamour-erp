import type { TFunction, i18n as I18n } from 'i18next';
import type { FieldCode } from '../../api/enums';

/** MONEY parameters: cents, 0…100 000 000 (contract "Settings: Parameters tab"). */
export const PARAMETER_MONEY_MAX = 100_000_000;

/** Label + help text from i18n by parameter key; an unknown key shows the key, no help. */
export function parameterTexts(t: TFunction, i18n: I18n, key: string): { label: string; help?: string } {
  const base = `settings.parameters.items.${key}`;
  const label = i18n.exists(`${base}.label`) ? t(`${base}.label`) : key;
  const help = i18n.exists(`${base}.help`) ? t(`${base}.help`) : undefined;
  return { label, help };
}

/** Client-side check of a MONEY value (negative / unparsable are caught by the money field). */
export function validateMoneyParameter(value: number | null): FieldCode | null {
  if (value === null) return 'REQUIRED';
  if (value > PARAMETER_MONEY_MAX) return 'INVALID_VALUE';
  return null;
}
