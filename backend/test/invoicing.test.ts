/** Invoice row sums, derived invoiceState and the legacy conversion (api-contract "Invoice rows", TASK-046). */
import { describe, expect, it } from 'vitest';
import { invoicing, legacyInvoiceRows, type InvoicingRow } from '../src/domain/invoicing.js';

const row = (status: InvoicingRow['status'], amountCents: number): InvoicingRow => ({ status, amountCents });

describe('invoicing()', () => {
  it('no rows: NONE, nothing invoiced or paid, balance = total', () => {
    expect(invoicing(100000, [])).toEqual({ balanceCents: 100000, invoicedCents: 0, paidCents: 0, invoiceState: 'NONE' });
  });

  it('sums: invoiced = SENT + PAID, paid = PAID, balance = total − paid', () => {
    const rows = [row('READY', 10000), row('SENT', 20000), row('PAID', 30000), row('PAID', 1000)];
    expect(invoicing(100000, rows)).toMatchObject({ invoicedCents: 51000, paidCents: 31000, balanceCents: 69000 });
  });

  it.each([
    ['READY only', [row('READY', 10000)], 'READY'],
    ['READY + PAID', [row('PAID', 10000), row('READY', 10000)], 'READY'],
    ['SENT wins over READY', [row('READY', 10000), row('SENT', 10000)], 'SENT'],
    ['SENT + PAID', [row('PAID', 10000), row('SENT', 10000)], 'SENT'],
    ['only PAID, balance > 0', [row('PAID', 99999)], 'PARTLY_PAID'],
    ['only PAID, balance 0', [row('PAID', 60000), row('PAID', 40000)], 'PAID'],
    ['only PAID, overpaid', [row('PAID', 120000)], 'PAID'],
    // Open rows win over the balance (see invoicing.ts).
    ['fully paid but a READY row is open', [row('PAID', 100000), row('READY', 1000)], 'READY'],
    ['fully paid but a SENT row is open', [row('PAID', 100000), row('SENT', 1000)], 'SENT'],
  ] as const)('%s → %s', (_name, rows, state) => {
    expect(invoicing(100000, rows).invoiceState).toBe(state);
  });

  it('balance may be negative; a total of 0 with a paid row is PAID', () => {
    expect(invoicing(100000, [row('PAID', 120000)]).balanceCents).toBe(-20000);
    expect(invoicing(0, [row('PAID', 1000)]).invoiceState).toBe('PAID');
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
