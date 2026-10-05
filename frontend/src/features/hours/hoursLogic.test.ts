import { describe, expect, it } from 'vitest';
import type { HourEntry } from '../../api/types';
import {
  DEFAULT_HOUR_SORT,
  isValidHours,
  nextHourSort,
  parseHours,
  sortHourRows,
  sumHours,
  toHourRows,
  validateHourForm,
} from './hoursLogic';

const entry = (id: string, date: string, hours: number, comment = 'Planning', partnerId = 'p'): HourEntry => ({
  id,
  partnerId,
  date,
  comment,
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

describe('hours table rows (UC-018, UC-019)', () => {
  // API order: newest first (date, then creation).
  const a = toHourRows(
    [
      entry('a3', '2030-03-05', 1, 'Rehearsal', 'a'),
      entry('a2', '2030-01-20', 2.5, 'admin', 'a'),
      entry('a1', '2030-01-20', 0.25, 'Planning', 'a'),
    ],
    'Partner A',
  );
  const b = toHourRows([entry('b1', '2030-01-20', 4, 'Sound check', 'b')], 'Partner B');
  const ids = (rows: { entry: HourEntry }[]) => rows.map((r) => r.entry.id);

  it('ranks creation by reversed API order and sums hours', () => {
    expect(a.map((r) => [r.entry.id, r.created])).toEqual([
      ['a3', 3],
      ['a2', 2],
      ['a1', 1],
    ]);
    expect(sumHours([...a, ...b].map((r) => r.entry))).toBe(7.75);
  });

  it('defaults to date ascending; ties by partner, then creation', () => {
    expect(DEFAULT_HOUR_SORT).toEqual({ key: 'date', dir: 'asc' });
    expect(ids(sortHourRows([...b, ...a], DEFAULT_HOUR_SORT))).toEqual(['a1', 'a2', 'b1', 'a3']);
  });

  it('sorts by date descending, partner, comment (case-insensitive) and hours', () => {
    const rows = [...a, ...b];
    expect(ids(sortHourRows(rows, { key: 'date', dir: 'desc' }))).toEqual(['a3', 'a1', 'a2', 'b1']);
    expect(ids(sortHourRows(rows, { key: 'partner', dir: 'desc' }))).toEqual(['b1', 'a1', 'a2', 'a3']);
    expect(ids(sortHourRows(rows, { key: 'comment', dir: 'asc' }))).toEqual(['a2', 'a1', 'a3', 'b1']);
    expect(ids(sortHourRows(rows, { key: 'hours', dir: 'asc' }))).toEqual(['a1', 'a3', 'a2', 'b1']);
    expect(ids(sortHourRows(rows, { key: 'hours', dir: 'desc' }))).toEqual(['b1', 'a2', 'a3', 'a1']);
  });

  it('clicking the sorted column flips it; another column starts ascending', () => {
    expect(nextHourSort({ key: 'date', dir: 'asc' }, 'date')).toEqual({ key: 'date', dir: 'desc' });
    expect(nextHourSort({ key: 'date', dir: 'desc' }, 'date')).toEqual({ key: 'date', dir: 'asc' });
    expect(nextHourSort({ key: 'date', dir: 'desc' }, 'hours')).toEqual({ key: 'hours', dir: 'asc' });
  });
});
