/** Invoice row sums, derived invoiceState (api-contract "Invoicing: one label") and the legacy conversion (api-contract "Invoice rows", TASK-046). */
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
      invoiceState: 'NEEDS_INVOICES',
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

  // [name, total, rows, invoiceState] — precedence: PAID > ROWS_TO_INVOICE > OPEN_INVOICES > NEEDS_INVOICES > NONE
  it.each([
    // total 0
    ['total 0, no rows', 0, [], 'NONE'],
    ['total 0, READY-only (paid 0 → not PAID)', 0, [row('READY', 1000)], 'ROWS_TO_INVOICE'],
    ['total 0, SENT-only (paid 0 → not PAID)', 0, [row('SENT', 1000)], 'OPEN_INVOICES'],
    ['total 0, READY + SENT', 0, [row('READY', 1000), row('SENT', 1000)], 'ROWS_TO_INVOICE'],
    ['total 0, PAID', 0, [row('PAID', 1000)], 'PAID'],
    ['total 0, PAID + READY', 0, [row('PAID', 1000), row('READY', 1000)], 'PAID'],
    // nothing yet
    ['no rows', 100000, [], 'NEEDS_INVOICES'],
    // ROWS_TO_INVOICE beats OPEN_INVOICES and NEEDS_INVOICES
    ['READY-only, less than total', 100000, [row('READY', 50000)], 'ROWS_TO_INVOICE'],
    ['READY-only, whole total', 100000, [row('READY', 100000)], 'ROWS_TO_INVOICE'],
    ['READY + SENT', 100000, [row('READY', 60000), row('SENT', 40000)], 'ROWS_TO_INVOICE'],
    ['PAID part + READY rest', 100000, [row('PAID', 30000), row('READY', 70000)], 'ROWS_TO_INVOICE'],
    ['PAID total − 1 + READY', 100000, [row('PAID', 99999), row('READY', 1)], 'ROWS_TO_INVOICE'],
    // OPEN_INVOICES beats NEEDS_INVOICES
    ['SENT part', 100000, [row('SENT', 40000)], 'OPEN_INVOICES'],
    ['SENT whole', 100000, [row('SENT', 100000)], 'OPEN_INVOICES'],
    ['SENT more than total', 100000, [row('SENT', 120000)], 'OPEN_INVOICES'],
    ['SENT + PAID part', 100000, [row('PAID', 30000), row('SENT', 30000)], 'OPEN_INVOICES'],
    ['SENT + PAID whole', 100000, [row('PAID', 60000), row('SENT', 40000)], 'OPEN_INVOICES'],
    // NEEDS_INVOICES
    ['PAID part', 100000, [row('PAID', 30000)], 'NEEDS_INVOICES'],
    ['PAID total − 1', 100000, [row('PAID', 99999)], 'NEEDS_INVOICES'],
    // PAID beats everything
    ['PAID whole in two rows', 100000, [row('PAID', 60000), row('PAID', 40000)], 'PAID'],
    ['overpaid', 100000, [row('PAID', 120000)], 'PAID'],
    ['PAID whole + extra READY row', 100000, [row('PAID', 100000), row('READY', 1000)], 'PAID'],
    ['overpaid with READY rows', 100000, [row('PAID', 120000), row('READY', 5000), row('READY', 1000)], 'PAID'],
    ['PAID whole, SENT still open', 100000, [row('PAID', 100000), row('SENT', 1000)], 'PAID'],
  ] as const)('%s → %s', (_name, total, rows, state) => {
    expect(invoicing(total, rows).invoiceState).toBe(state);
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
