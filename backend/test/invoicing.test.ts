/**
 * Invoice row sums and the derived invoiceState (api-contract "Invoicing v3", TASK-049), the final
 * invoice due time, and the legacy conversions (TASK-045 status + prepayment, TASK-046 row statuses).
 */
import { describe, expect, it } from 'vitest';
import {
  businessMidnight,
  convertInvoiceRowStatus,
  finalInvoiceDueAt,
  invoicing,
  legacyInvoiceRows,
  type InvoicingRow,
} from '../src/domain/invoicing.js';

const row = (status: InvoicingRow['status'], amountCents: number): InvoicingRow => ({ status, amountCents });
const PLAYED = { played: true, cancelled: false };
const UPCOMING = { played: false, cancelled: false };
const CANCELLED = { played: false, cancelled: true };

describe('invoicing()', () => {
  it('no rows: nothing sent, everything uninvoiced, balance = total; played without rows → NONE', () => {
    expect(invoicing(100000, [], PLAYED)).toEqual({
      sentCents: 0,
      notSentCents: 0,
      uninvoicedCents: 100000,
      balanceCents: 100000,
      invoiceState: 'NONE',
    });
  });

  it('sums: sent = Σ SENT, notSent = Σ NOT_SENT, uninvoiced = total − both, balance = total − sent', () => {
    const rows = [row('NOT_SENT', 10000), row('NOT_SENT', 2500), row('SENT', 20000), row('SENT', 5000)];
    expect(invoicing(100000, rows, PLAYED)).toEqual({
      sentCents: 25000,
      notSentCents: 12500,
      uninvoicedCents: 62500,
      balanceCents: 75000,
      invoiceState: 'OPEN_INVOICES',
    });
  });

  it('rows above the total: uninvoiced 0 (never negative), balance negative', () => {
    expect(invoicing(100000, [row('SENT', 90000), row('NOT_SENT', 30000)], PLAYED)).toMatchObject({
      uninvoicedCents: 0,
      balanceCents: 10000,
    });
    expect(invoicing(100000, [row('SENT', 120000)], PLAYED)).toMatchObject({ uninvoicedCents: 0, balanceCents: -20000 });
  });

  // [name, total, rows, event, invoiceState]. Precedence: OPEN_INVOICES > FULLY_INVOICED > NONE > PARTLY_INVOICED.
  it.each([
    // 1. OPEN_INVOICES: any NOT_SENT row, whatever else
    ['played, NOT_SENT part', 100000, [row('NOT_SENT', 50000)], PLAYED, 'OPEN_INVOICES'],
    ['played, SENT whole + NOT_SENT extra', 100000, [row('SENT', 100000), row('NOT_SENT', 1000)], PLAYED, 'OPEN_INVOICES'],
    ['upcoming, NOT_SENT', 100000, [row('NOT_SENT', 30000)], UPCOMING, 'OPEN_INVOICES'],
    ['cancelled, NOT_SENT', 100000, [row('NOT_SENT', 30000)], CANCELLED, 'OPEN_INVOICES'],
    ['total 0, NOT_SENT', 0, [row('NOT_SENT', 1000)], PLAYED, 'OPEN_INVOICES'],
    // 2. FULLY_INVOICED: sent ≥ total > 0
    ['played, SENT whole in two rows', 100000, [row('SENT', 60000), row('SENT', 40000)], PLAYED, 'FULLY_INVOICED'],
    ['played, SENT more than total', 100000, [row('SENT', 120000)], PLAYED, 'FULLY_INVOICED'],
    ['upcoming, prepaid in full', 100000, [row('SENT', 100000)], UPCOMING, 'FULLY_INVOICED'],
    ['cancelled, fee sent in full', 100000, [row('SENT', 100000)], CANCELLED, 'FULLY_INVOICED'],
    // 3. NONE
    ['upcoming, no rows', 100000, [], UPCOMING, 'NONE'],
    ['upcoming, SENT part', 100000, [row('SENT', 30000)], UPCOMING, 'NONE'],
    ['cancelled, no rows', 100000, [], CANCELLED, 'NONE'],
    ['cancelled, total 0, no rows', 0, [], CANCELLED, 'NONE'],
    ['played, total 0, no rows', 0, [], PLAYED, 'NONE'],
    ['played, total 0, SENT rows (nothing matches)', 0, [row('SENT', 1000)], PLAYED, 'NONE'],
    ['played, no rows (no label before the first invoice)', 100000, [], PLAYED, 'NONE'],
    // 4. PARTLY_INVOICED: ≥ 1 row, played (or cancelled) and sent < total
    ['played, one SENT row below the total', 100000, [row('SENT', 1000)], PLAYED, 'PARTLY_INVOICED'],
    ['played, SENT part', 100000, [row('SENT', 40000)], PLAYED, 'PARTLY_INVOICED'],
    ['played, SENT total − 1', 100000, [row('SENT', 99999)], PLAYED, 'PARTLY_INVOICED'],
    ['cancelled with rows, SENT part', 100000, [row('SENT', 30000)], CANCELLED, 'PARTLY_INVOICED'],
  ] as const)('%s → %s', (_name, total, rows, event, state) => {
    expect(invoicing(total, rows, event).invoiceState).toBe(state);
  });

  it('played / cancelled do not change the sums', () => {
    const rows = [row('NOT_SENT', 1000), row('SENT', 2000)];
    const strip = (e: typeof PLAYED) => {
      const { invoiceState: _s, ...sums } = invoicing(100000, rows, e);
      return sums;
    };
    expect(strip(UPCOMING)).toEqual(strip(PLAYED));
    expect(strip(CANCELLED)).toEqual(strip(PLAYED));
  });
});

describe('finalInvoiceDueAt()', () => {
  it('Helsinki midnight in summer (UTC+3) and winter (UTC+2)', () => {
    expect(businessMidnight('2026-06-10').toISOString()).toBe('2026-06-09T21:00:00.000Z');
    expect(businessMidnight('2026-01-10').toISOString()).toBe('2026-01-09T22:00:00.000Z');
  });

  it('= end of the last day in Helsinki + 48 h', () => {
    // 10 June ends at 11 June 00:00 (UTC+3) → due 13 June 00:00 Helsinki.
    expect(finalInvoiceDueAt('2026-06-10').toISOString()).toBe('2026-06-12T21:00:00.000Z');
    expect(finalInvoiceDueAt('2026-01-10').toISOString()).toBe('2026-01-12T22:00:00.000Z');
  });

  it('across the DST change it is 48 real hours', () => {
    // 2026-10-24 ends at 25 Oct 00:00 EEST (24 Oct 21:00 UTC); clocks go back on 25 Oct.
    expect(finalInvoiceDueAt('2026-10-24').toISOString()).toBe('2026-10-26T21:00:00.000Z');
    // Spring: 2026-03-28 ends at 29 Mar 00:00 EET (28 Mar 22:00 UTC); clocks go forward on 29 Mar.
    expect(finalInvoiceDueAt('2026-03-28').toISOString()).toBe('2026-03-30T22:00:00.000Z');
  });

  it('handles month and year ends', () => {
    expect(finalInvoiceDueAt('2026-12-31').toISOString()).toBe('2027-01-02T22:00:00.000Z');
  });
});

describe('convertInvoiceRowStatus()', () => {
  it.each([
    ['READY', 'NOT_SENT'],
    ['PAID', 'SENT'],
    ['NOT_SENT', 'NOT_SENT'],
    ['SENT', 'SENT'],
  ] as const)('%s → %s', (from, to) => {
    expect(convertInvoiceRowStatus(from)).toBe(to);
  });
});

describe('legacyInvoiceRows()', () => {
  const prepaid = (amountCents: number) => ({ description: 'Ennakkomaksu', amountCents, status: 'SENT' });
  const balance = (amountCents: number, status: string) => ({ description: 'Lasku', amountCents, status });

  it.each([
    ['NONE', 0, []],
    ['NONE', 30000, [prepaid(30000)]],
    ['PREPAYMENT_PAID', 30000, [prepaid(30000)]],
    ['PREPAYMENT_PAID', 0, []],
    ['READY', 0, [balance(100000, 'NOT_SENT')]],
    ['READY', 30000, [prepaid(30000), balance(70000, 'NOT_SENT')]],
    ['INVOICED', 30000, [prepaid(30000), balance(70000, 'SENT')]],
    ['PAID', 0, [balance(100000, 'SENT')]],
    ['PAID', 100000, [prepaid(100000)]], // balance 0: no row
    ['INVOICED', 150000, [prepaid(150000)]], // negative balance: no row
  ] as const)('%s with prepayment %i', (status, prepayment, expected) => {
    expect(legacyInvoiceRows(100000, status, prepayment)).toEqual(expected);
  });

  it('a total of 0 gives no balance row', () => {
    expect(legacyInvoiceRows(0, 'PAID', 0)).toEqual([]);
  });
});
