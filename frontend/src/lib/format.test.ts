import { describe, expect, it } from 'vitest';
import {
  centsToInput,
  formatDate,
  formatDateRange,
  formatHours,
  formatMoney,
  formatPercent,
  parseMoneyToCents,
  todayIso,
} from './format';

/** Normalise Intl's non-breaking spaces so assertions read naturally. */
const plain = (s: string) => s.replace(/\s/g, ' ');

describe('formatMoney', () => {
  it('formats Finnish amounts as "1 234,50 €"', () => {
    expect(plain(formatMoney(123450, 'fi'))).toBe('1 234,50 €');
    expect(plain(formatMoney(0, 'fi'))).toBe('0,00 €');
    expect(plain(formatMoney(5, 'fi'))).toBe('0,05 €');
    expect(plain(formatMoney(100000000, 'fi'))).toBe('1 000 000,00 €');
  });

  it('formats English amounts as "€1,234.50"', () => {
    expect(formatMoney(123450, 'en')).toBe('€1,234.50');
    expect(formatMoney(0, 'en')).toBe('€0.00');
    expect(formatMoney(5, 'en')).toBe('€0.05');
    expect(formatMoney(100000000, 'en')).toBe('€1,000,000.00');
  });

  it('keeps the amount on one line (non-breaking spaces in FI)', () => {
    expect(formatMoney(123450, 'fi')).not.toContain(' ');
  });

  it('shows a dash for missing values', () => {
    expect(formatMoney(null, 'fi')).toBe('–');
    expect(formatMoney(undefined, 'en')).toBe('–');
  });
});

describe('parseMoneyToCents', () => {
  it('parses Finnish input', () => {
    expect(parseMoneyToCents('1 234,50', 'fi')).toBe(123450);
    expect(parseMoneyToCents('1234,5', 'fi')).toBe(123450);
    expect(parseMoneyToCents('100', 'fi')).toBe(10000);
    expect(parseMoneyToCents('1 000,00 €', 'fi')).toBe(100000);
  });

  it('parses English input', () => {
    expect(parseMoneyToCents('1,234.50', 'en')).toBe(123450);
    expect(parseMoneyToCents('€1000', 'en')).toBe(100000);
    expect(parseMoneyToCents('0.05', 'en')).toBe(5);
  });

  it('rejects invalid, negative or too precise input', () => {
    expect(parseMoneyToCents('', 'fi')).toBeNull();
    expect(parseMoneyToCents('abc', 'en')).toBeNull();
    expect(parseMoneyToCents('-10', 'en')).toBeNull();
    expect(parseMoneyToCents('1,234', 'fi')).toBeNull();
  });

  it('round-trips with centsToInput', () => {
    expect(centsToInput(123450, 'fi')).toBe('1234,50');
    expect(centsToInput(123450, 'en')).toBe('1234.50');
    expect(parseMoneyToCents(centsToInput(9900, 'fi'), 'fi')).toBe(9900);
  });
});

describe('formatDate', () => {
  it('formats Finnish dates as d.M.yyyy', () => {
    expect(formatDate('2026-05-01', 'fi')).toBe('1.5.2026');
    expect(formatDate('2026-12-31', 'fi')).toBe('31.12.2026');
  });

  it('formats English dates as d MMM yyyy', () => {
    expect(formatDate('2026-05-01', 'en')).toBe('1 May 2026');
    expect(formatDate('2026-12-31', 'en')).toBe('31 Dec 2026');
  });

  it('does not shift date-only values by timezone', () => {
    expect(formatDate('2026-01-01', 'fi')).toBe('1.1.2026');
  });

  it('shows a dash for missing or invalid values', () => {
    expect(formatDate(null, 'fi')).toBe('–');
    expect(formatDate('not a date', 'en')).toBe('–');
  });

  it('formats ranges', () => {
    expect(formatDateRange('2026-05-01', null, 'fi')).toBe('1.5.2026');
    expect(formatDateRange('2026-05-01', '2026-05-03', 'fi')).toBe('1.5.2026–3.5.2026');
    expect(formatDateRange('2026-05-01', '2026-05-03', 'en')).toBe('1 May 2026–3 May 2026');
  });
});

describe('formatHours', () => {
  it('formats hours per language', () => {
    expect(formatHours(1.25, 'fi')).toBe('1,25 h');
    expect(formatHours(1.25, 'en')).toBe('1.25 h');
    expect(formatHours(8, 'fi')).toBe('8 h');
    expect(formatHours(0.5, 'en')).toBe('0.5 h');
  });
});

describe('formatPercent', () => {
  it('formats percent per language', () => {
    expect(plain(formatPercent(31.8, 'fi'))).toBe('31,8 %');
    expect(formatPercent(31.8, 'en')).toBe('31.8%');
    expect(formatPercent(100, 'en')).toBe('100.0%');
    expect(formatPercent(null, 'fi')).toBe('–');
  });
});

describe('todayIso', () => {
  it('uses local date parts', () => {
    expect(todayIso(new Date(2026, 0, 5, 23, 30))).toBe('2026-01-05');
  });
});
