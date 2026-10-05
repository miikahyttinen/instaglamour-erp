import type { Language } from '../api/enums';

// Hours input helpers shared by the hours feature and the inline fields (InlineHours).

/** Parses typed hours (`1,25`, `1.25`, ` 2 `) into a number, or `null` if not a number. */
export function parseHours(input: string): number | null {
  const s = input.trim().replace(',', '.');
  if (!/^\d+(\.\d+)?$|^\.\d+$/.test(s)) return null;
  return Number(s);
}

/** BR-050: 0.25…24 in 0.25 steps. */
export function isValidHours(hours: number): boolean {
  return hours >= 0.25 && hours <= 24 && Number.isInteger(hours * 4);
}

/** Hours as an input value: FI `1,25`, EN `1.25`. */
export function hoursToInput(hours: number, lang: Language): string {
  const text = String(hours);
  return lang === 'fi' ? text.replace('.', ',') : text;
}
