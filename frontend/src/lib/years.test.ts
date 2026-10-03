import { describe, expect, it } from 'vitest';
import { yearOptions } from './years';

describe('yearOptions', () => {
  it('covers 5 years back and 3 ahead of the current year', () => {
    expect(yearOptions(2026, 2026)).toEqual([2021, 2022, 2023, 2024, 2025, 2026, 2027, 2028, 2029]);
  });

  it('always includes a selected year far from the current one', () => {
    const options = yearOptions(2040, 2026);
    expect(options[0]).toBe(2021);
    expect(options.at(-1)).toBe(2043);
    expect(options).toContain(2040);
  });
});
