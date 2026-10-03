import { describe, expect, it } from 'vitest';
import type { HourEntry } from '../../api/types';
import { groupByMonth, isValidHours, parseHours, sumHours, validateHourForm } from './hoursLogic';

const entry = (id: string, date: string, hours: number): HourEntry => ({
  id,
  partnerId: 'p',
  date,
  comment: 'Planning',
  hours,
});

describe('hours input', () => {
  it('parses comma and dot decimals', () => {
    expect(parseHours('1,25')).toBe(1.25);
    expect(parseHours(' 2.5 ')).toBe(2.5);
    expect(parseHours('8')).toBe(8);
    expect(parseHours('abc')).toBeNull();
    expect(parseHours('-1')).toBeNull();
  });

  it('accepts 0.25…24 in 0.25 steps only (BR-050)', () => {
    for (const ok of [0.25, 0.5, 0.75, 1, 7.25, 24]) expect(isValidHours(ok)).toBe(true);
    for (const bad of [0, 0.1, 1.3, 24.25, 25]) expect(isValidHours(bad)).toBe(false);
  });

  it('validates the form with API field codes', () => {
    expect(validateHourForm({ date: '', comment: ' ', hours: '' }).fields).toEqual({
      date: 'REQUIRED',
      comment: 'REQUIRED',
      hours: 'REQUIRED',
    });
    expect(validateHourForm({ date: '2030-01-02', comment: 'x', hours: '1,3' }).fields).toEqual({
      hours: 'INVALID_HOURS',
    });
    expect(validateHourForm({ date: '2030-01-02', comment: ' Admin ', hours: '1,75' }).body).toEqual({
      date: '2030-01-02',
      comment: 'Admin',
      hours: 1.75,
    });
  });
});

describe('grouping', () => {
  it('groups by month, newest month first, with month totals', () => {
    const groups = groupByMonth([
      entry('3', '2030-03-05', 1),
      entry('2', '2030-01-20', 2.5),
      entry('1', '2030-01-02', 0.25),
    ]);
    expect(groups.map((g) => [g.month, g.total, g.entries.length])).toEqual([
      [3, 1, 1],
      [1, 2.75, 2],
    ]);
    expect(sumHours(groups.flatMap((g) => g.entries))).toBe(3.75);
  });
});
