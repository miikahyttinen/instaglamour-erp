// Derived invoicing state (api-contract "Invoicing: one label"), as the mock computes it: one case
// per precedence step and edge case.
import { describe, expect, it } from 'vitest';
import type { InvoiceRowStatus } from '../api/enums';
import { invoiceFigures } from './eventStore';

const rows = (...list: [InvoiceRowStatus, number][]) => list.map(([status, amountCents]) => ({ status, amountCents }));

describe('invoiceFigures', () => {
  it.each([
    // [case, total, rows, state]
    ['total 0, no rows', 0, rows(), 'NONE'],
    ['no rows', 100000, rows(), 'NEEDS_INVOICES'],
    ['READY drafts only', 100000, rows(['READY', 100000]), 'ROWS_TO_INVOICE'],
    ['part sent', 100000, rows(['SENT', 40000]), 'OPEN_INVOICES'],
    ['sent + draft (ready wins over open)', 100000, rows(['SENT', 40000], ['READY', 60000]), 'ROWS_TO_INVOICE'],
    ['part paid, nothing open', 100000, rows(['PAID', 40000]), 'NEEDS_INVOICES'],
    ['part paid + draft', 100000, rows(['PAID', 40000], ['READY', 60000]), 'ROWS_TO_INVOICE'],
    ['all sent', 100000, rows(['SENT', 100000]), 'OPEN_INVOICES'],
    ['paid + sent = total', 100000, rows(['PAID', 40000], ['SENT', 60000]), 'OPEN_INVOICES'],
    ['all paid', 100000, rows(['PAID', 40000], ['PAID', 60000]), 'PAID'],
    ['overpaid', 100000, rows(['PAID', 120000]), 'PAID'],
    ['paid covers total, extra draft (paid wins)', 100000, rows(['PAID', 100000], ['READY', 5000]), 'PAID'],
    ['total 0, paid row', 0, rows(['PAID', 5000]), 'PAID'],
    ['total 0, sent row (nothing paid → not PAID)', 0, rows(['SENT', 5000]), 'OPEN_INVOICES'],
    ['total 0, READY draft only', 0, rows(['READY', 5000]), 'ROWS_TO_INVOICE'],
  ] as const)('%s → %s', (_case, total, list, state) => {
    expect(invoiceFigures(list, total).invoiceState).toBe(state);
  });

  it('sums invoiced (SENT + PAID), paid, ready (READY), open (SENT) and balance (total − paid)', () => {
    expect(invoiceFigures(rows(['READY', 1000], ['SENT', 2000], ['PAID', 3000]), 10000)).toEqual({
      invoicedCents: 5000,
      paidCents: 3000,
      readyCents: 1000,
      openCents: 2000,
      balanceCents: 7000,
      invoiceState: 'ROWS_TO_INVOICE',
    });
  });
});
