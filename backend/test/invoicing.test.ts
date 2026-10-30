/** Invoice row sums, derived invoiceCoverage + paymentState and the legacy conversion (api-contract "Invoice rows", TASK-046). */
import { describe, expect, it } from 'vitest';
import { invoicing, legacyInvoiceRows, type InvoicingRow } from '../src/domain/invoicing.js';

const row = (status: InvoicingRow['status'], amountCents: number): InvoicingRow => ({ status, amountCents });

describe('invoicing()', () => {
  it('no rows: nothing invoiced/paid/open, balance = total', () => {
    expect(invoicing(100000, [])).toEqual({
      balanceCents: 100000,
      invoicedCents: 0,
      paidCents: 0,
      openCents: 0,
      readyCents: 0,
      invoiceCoverage: 'NEEDS_INVOICES',
      paymentState: 'NONE',
    });
  });

  it('sums: invoiced = SENT + PAID, paid = PAID, open = SENT, ready = READY, balance = total − paid', () => {
    const rows = [row('READY', 10000), row('READY', 2500), row('SENT', 20000), row('SENT', 5000), row('PAID', 30000), row('PAID', 1000)];
    expect(invoicing(100000, rows)).toMatchObject({
      invoicedCents: 56000,
      paidCents: 31000,
      openCents: 25000,
      readyCents: 12500,
      balanceCents: 69000,
    });
  });

  // [name, total, rows, invoiceCoverage, paymentState]
  it.each([
    // total 0
    ['total 0, no rows', 0, [], 'NONE', 'NONE'],
    ['total 0, READY-only (drafts)', 0, [row('READY', 1000)], 'NONE', 'NONE'],
    ['total 0, several READY drafts', 0, [row('READY', 1000), row('READY', 2000)], 'NONE', 'NONE'],
    ['total 0, READY + SENT', 0, [row('READY', 1000), row('SENT', 1000)], 'FULLY_INVOICED', 'OPEN_INVOICES'],
    ['total 0, SENT', 0, [row('SENT', 1000)], 'FULLY_INVOICED', 'OPEN_INVOICES'],
    ['total 0, PAID (paid ≥ total)', 0, [row('PAID', 1000)], 'FULLY_INVOICED', 'FULLY_PAID'],
    // no invoices yet
    ['no rows', 100000, [], 'NEEDS_INVOICES', 'NONE'],
    ['READY-only, less than total', 100000, [row('READY', 50000)], 'NEEDS_INVOICES', 'NONE'],
    ['READY-only, whole total', 100000, [row('READY', 100000)], 'NEEDS_INVOICES', 'NONE'],
    // open invoices
    ['SENT part', 100000, [row('SENT', 40000)], 'NEEDS_INVOICES', 'OPEN_INVOICES'],
    ['SENT whole', 100000, [row('SENT', 100000)], 'FULLY_INVOICED', 'OPEN_INVOICES'],
    ['SENT more than total', 100000, [row('SENT', 120000)], 'FULLY_INVOICED', 'OPEN_INVOICES'],
    ['SENT + PAID part', 100000, [row('PAID', 30000), row('SENT', 30000)], 'NEEDS_INVOICES', 'OPEN_INVOICES'],
    ['SENT + PAID whole', 100000, [row('PAID', 60000), row('SENT', 40000)], 'FULLY_INVOICED', 'OPEN_INVOICES'],
    ['PAID covers total, SENT still open', 100000, [row('PAID', 100000), row('SENT', 1000)], 'FULLY_INVOICED', 'OPEN_INVOICES'],
    ['SENT + READY', 100000, [row('READY', 60000), row('SENT', 40000)], 'NEEDS_INVOICES', 'OPEN_INVOICES'],
    // partly paid
    ['PAID part', 100000, [row('PAID', 30000)], 'NEEDS_INVOICES', 'PARTLY_PAID'],
    ['PAID part + READY rest', 100000, [row('PAID', 30000), row('READY', 70000)], 'NEEDS_INVOICES', 'PARTLY_PAID'],
    ['PAID total − 1', 100000, [row('PAID', 99999)], 'NEEDS_INVOICES', 'PARTLY_PAID'],
    // fully paid
    ['PAID whole in two rows', 100000, [row('PAID', 60000), row('PAID', 40000)], 'FULLY_INVOICED', 'FULLY_PAID'],
    ['overpaid', 100000, [row('PAID', 120000)], 'FULLY_INVOICED', 'FULLY_PAID'],
    ['PAID whole + extra READY draft', 100000, [row('PAID', 100000), row('READY', 1000)], 'FULLY_INVOICED', 'FULLY_PAID'],
  ] as const)('%s → %s / %s', (_name, total, rows, coverage, payment) => {
    const result = invoicing(total, rows);
    expect(result.invoiceCoverage).toBe(coverage);
    expect(result.paymentState).toBe(payment);
  });

  it('overpaid: balance is negative', () => {
    expect(invoicing(100000, [row('PAID', 120000)])).toMatchObject({ balanceCents: -20000, paidCents: 120000, openCents: 0 });
  });
});

describe('legacyInvoiceRows()', () => {
  const paid = (amountCents: number) => ({ description: 'Ennakkomaksu', amountCents, status: 'PAID' });
  const balance = (amountCents: number, status: string) => ({ description: 'Lasku', amountCents, status });

  it.each([
    ['NONE', 0, []],
    ['NONE', 30000, [paid(30000)]],
    ['PREPAYMENT_PAID', 30000, [paid(30000)]],
    ['PREPAYMENT_PAID', 0, []],
    ['READY', 0, [balance(100000, 'READY')]],
    ['READY', 30000, [paid(30000), balance(70000, 'READY')]],
    ['INVOICED', 30000, [paid(30000), balance(70000, 'SENT')]],
    ['PAID', 0, [balance(100000, 'PAID')]],
    ['PAID', 100000, [paid(100000)]], // balance 0: no row
    ['INVOICED', 150000, [paid(150000)]], // negative balance: no row
  ] as const)('%s with prepayment %i', (status, prepayment, expected) => {
    expect(legacyInvoiceRows(100000, status, prepayment)).toEqual(expected);
  });

  it('a total of 0 gives no balance row', () => {
    expect(legacyInvoiceRows(0, 'PAID', 0)).toEqual([]);
  });
});
