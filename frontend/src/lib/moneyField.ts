import type { FieldCode, Language } from '../api/enums';
import { parseMoneyToCents } from './format';

/** Parses a money text field. Empty → `null` (or REQUIRED when required). */
export function parseMoneyField(
  text: string,
  lang: Language,
  required: boolean,
): { cents: number | null; error?: FieldCode } {
  const trimmed = text.trim();
  if (trimmed === '') return required ? { cents: null, error: 'REQUIRED' } : { cents: null };
  if (trimmed.startsWith('-')) return { cents: null, error: 'NEGATIVE_AMOUNT' };
  const cents = parseMoneyToCents(trimmed, lang);
  return cents === null ? { cents: null, error: 'INVALID_VALUE' } : { cents };
}
