import { describe, expect, it } from 'vitest';
import type { HourEntry } from '../../api/types';
import {
  groupByMonth,
  isValidHours,
  parseHours,
  partnerHourRows,
  sumHours,
  validateHourForm,
} from './hoursLogic';

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

describe('partner hour rows (UC-019)', () => {
  const totals = (rows: [string, number][]) => ({
    year: 2030,
    partners: rows.map(([partnerId, total]) => ({ partnerId, months: Array.from({ length: 12 }, () => 0), total })),
    grandTotal: rows.reduce((s, [, h]) => s + h, 0),
  });

  it('sorts by hours (most first), then by name; 0 h partners included', () => {
    const rows = partnerHourRows(
      totals([
        ['c', 0],
        ['b', 5.25],
        ['a', 4.25],
        ['d', 5.25],
      ]),
      [
        { id: 'a', name: 'Partner A' },
        { id: 'b', name: 'Partner B' },
        { id: 'c', name: 'Partner C' },
        { id: 'd', name: 'Partner Ä' },
      ],
      'Unknown',
      'fi-FI',
    );
    expect(rows.map((r) => [r.name, r.total])).toEqual([
      ['Partner B', 5.25],
      ['Partner Ä', 5.25],
      ['Partner A', 4.25],
      ['Partner C', 0],
    ]);
  });

  it('adds reference partners missing from the response (0 h) and names unknown ids', () => {
    const rows = partnerHourRows(totals([['x', 2]]), [{ id: 'a', name: 'Partner A' }], 'Unknown');
    expect(rows).toEqual([
      { partnerId: 'x', name: 'Unknown', total: 2 },
      { partnerId: 'a', name: 'Partner A', total: 0 },
    ]);
  });
});
