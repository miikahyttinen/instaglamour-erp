// Derived invoicing state (api-contract "Invoicing state: coverage + payment"), as the mock
// computes it: one case per definition and edge case.
import { describe, expect, it } from 'vitest';
import type { InvoiceRowStatus } from '../api/enums';
import { invoiceFigures } from './eventStore';

const rows = (...list: [InvoiceRowStatus, number][]) => list.map(([status, amountCents]) => ({ status, amountCents }));

describe('invoiceFigures', () => {
  it.each([
    // [case, total, rows, coverage, payment]
    ['total 0, no rows', 0, rows(), 'NONE', 'NONE'],
    ['total 0, READY drafts only', 0, rows(['READY', 5000]), 'NONE', 'NONE'],
    ['no rows', 100000, rows(), 'NEEDS_INVOICES', 'NONE'],
    ['READY drafts only (not invoiced)', 100000, rows(['READY', 100000]), 'NEEDS_INVOICES', 'NONE'],
    ['part sent', 100000, rows(['SENT', 40000]), 'NEEDS_INVOICES', 'OPEN_INVOICES'],
    ['part paid, nothing open', 100000, rows(['PAID', 40000]), 'NEEDS_INVOICES', 'PARTLY_PAID'],
    ['part paid + draft', 100000, rows(['PAID', 40000], ['READY', 60000]), 'NEEDS_INVOICES', 'PARTLY_PAID'],
    ['all sent', 100000, rows(['SENT', 100000]), 'FULLY_INVOICED', 'OPEN_INVOICES'],
    ['paid + sent = total (open wins)', 100000, rows(['PAID', 40000], ['SENT', 60000]), 'FULLY_INVOICED', 'OPEN_INVOICES'],
    ['all paid', 100000, rows(['PAID', 40000], ['PAID', 60000]), 'FULLY_INVOICED', 'FULLY_PAID'],
    ['overpaid', 100000, rows(['PAID', 120000]), 'FULLY_INVOICED', 'FULLY_PAID'],
    ['total 0, paid row', 0, rows(['PAID', 5000]), 'FULLY_INVOICED', 'FULLY_PAID'],
    ['total 0, sent row', 0, rows(['SENT', 5000]), 'FULLY_INVOICED', 'OPEN_INVOICES'],
  ] as const)('%s → %s / %s', (_case, total, list, coverage, payment) => {
    expect(invoiceFigures(list, total)).toMatchObject({ invoiceCoverage: coverage, paymentState: payment });
  });

  it('sums invoiced (SENT + PAID), paid, open (SENT) and balance (total − paid)', () => {
    expect(invoiceFigures(rows(['READY', 1000], ['SENT', 2000], ['PAID', 3000]), 10000)).toEqual({
      invoicedCents: 5000,
      paidCents: 3000,
      openCents: 2000,
      balanceCents: 7000,
      invoiceCoverage: 'NEEDS_INVOICES',
      paymentState: 'OPEN_INVOICES',
    });
  });
});
