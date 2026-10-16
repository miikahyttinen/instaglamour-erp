import type { Language } from '../api/enums';

// Locale-aware display helpers. Money arrives as integer cents (EUR, excl. VAT).
// Intl inserts non-breaking spaces (U+00A0 / U+202F) in Finnish output; that is intended,
// so amounts never wrap across lines.

const LOCALES: Record<Language, string> = { fi: 'fi-FI', en: 'en-GB' };
const NBSP = String.fromCharCode(0xa0);

const moneyFormatters = new Map<Language, Intl.NumberFormat>();
function moneyFormatter(lang: Language): Intl.NumberFormat {
  let f = moneyFormatters.get(lang);
  if (!f) {
    f = new Intl.NumberFormat(LOCALES[lang], {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    moneyFormatters.set(lang, f);
  }
  return f;
}

/** FI `1 234,50 €`, EN `€1,234.50`. `null` → `–`. */
export function formatMoney(cents: number | null | undefined, lang: Language): string {
  if (cents === null || cents === undefined || Number.isNaN(cents)) return '–';
  return moneyFormatter(lang).format(cents / 100);
}

/**
 * Parses a user-typed amount (`1234,5`, `1 234.50`, `€1,234.50`) into integer cents.
 * Returns `null` when the text is not a valid non-negative amount with at most 2 decimals.
 */
export function parseMoneyToCents(input: string, lang: Language): number | null {
  let s = input.replace(/[\s€]/g, '');
  if (s === '') return null;
  if (lang === 'fi') {
    s = s.replace(/\./g, '').replace(',', '.');
  } else {
    s = s.replace(/,/g, '');
  }
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const [whole = '0', fraction = ''] = s.split('.');
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
}

/** Formats cents as an input value without currency symbol or grouping: FI `1234,50`, EN `1234.50`. */
export function centsToInput(cents: number, lang: Language): string {
  const text = (cents / 100).toFixed(2);
  return lang === 'fi' ? text.replace('.', ',') : text;
}

function parseIsoDate(iso: string): { y: number; m: number; d: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!match) return null;
  return { y: Number(match[1]), m: Number(match[2]), d: Number(match[3]) };
}

const EN_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Formats a `YYYY-MM-DD` date (no timezone shift): FI `1.5.2026`, EN `1 May 2026`.
 * Timestamps are accepted too and formatted in local time.
 */
export function formatDate(value: string | null | undefined, lang: Language): string {
  if (!value) return '–';
  let parts = parseIsoDate(value);
  if (value.length > 10) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '–';
    parts = { y: date.getFullYear(), m: date.getMonth() + 1, d: date.getDate() };
  }
  if (!parts) return '–';
  return lang === 'fi' ? `${parts.d}.${parts.m}.${parts.y}` : `${parts.d} ${EN_MONTHS[parts.m - 1]} ${parts.y}`;
}

const weekdayFormatters = new Map<Language, Intl.DateTimeFormat>();

/**
 * A `YYYY-MM-DD` date with its weekday (no timezone shift): FI `Perjantai 1.5.2026`,
 * EN `Friday 1 May 2026`. Invalid / empty → `–`.
 */
export function formatDateWithWeekday(value: string | null | undefined, lang: Language): string {
  const parts = value ? parseIsoDate(value) : null;
  if (!parts) return '–';
  const date = new Date(Date.UTC(parts.y, parts.m - 1, parts.d));
  if (Number.isNaN(date.getTime())) return '–';
  let f = weekdayFormatters.get(lang);
  if (!f) {
    f = new Intl.DateTimeFormat(LOCALES[lang], { weekday: 'long', timeZone: 'UTC' });
    weekdayFormatters.set(lang, f);
  }
  const weekday = f.format(date);
  const capitalised = weekday.charAt(0).toLocaleUpperCase(LOCALES[lang]) + weekday.slice(1);
  return `${capitalised} ${formatDate(value, lang)}`;
}

/** Formats a date range: one day → single date; FI `1.5.2026–3.5.2026`. */
export function formatDateRange(start: string, end: string | null, lang: Language): string {
  if (!end || end === start) return formatDate(start, lang);
  return `${formatDate(start, lang)}–${formatDate(end, lang)}`;
}

/** Time of a timestamp: FI `14.05`, EN `14:05` (local time). Invalid / empty → `–`. */
export function formatTime(value: string | null | undefined, lang: Language): string {
  if (!value) return '–';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '–';
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${hh}${lang === 'fi' ? '.' : ':'}${mm}`;
}

/** Timestamp with time: FI `1.5.2026 14.05`, EN `1 May 2026 14:05` (local time). */
export function formatDateTime(value: string | null | undefined, lang: Language): string {
  if (!value) return '–';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '–';
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${formatDate(value, lang)} ${hh}${lang === 'fi' ? '.' : ':'}${mm}`;
}

/** Hours: FI `1,25 h`, EN `1.25 h`; whole numbers without decimals (`8 h`). */
export function formatHours(hours: number | null | undefined, lang: Language): string {
  if (hours === null || hours === undefined || Number.isNaN(hours)) return '–';
  const text = new Intl.NumberFormat(LOCALES[lang], {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(hours);
  return `${text} h`;
}

/** Percent with one decimal: FI `31,8 %`, EN `31.8%`. `null` (total price 0) → `–`. */
export function formatPercent(value: number | null | undefined, lang: Language): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '–';
  const text = new Intl.NumberFormat(LOCALES[lang], {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(value);
  return lang === 'fi' ? `${text}${NBSP}%` : `${text}%`;
}

/** Today's date as `YYYY-MM-DD` in local time. */
export function todayIso(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
