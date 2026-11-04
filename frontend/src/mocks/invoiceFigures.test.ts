// Derived invoicing figures and state (api-contract "Invoicing v3"), as the mock computes them: one
// case per precedence step and edge case.
import { describe, expect, it } from 'vitest';
import type { InvoiceRowStatus } from '../api/enums';
import { invoiceFigures } from './eventStore';

const rows = (...list: [InvoiceRowStatus, number][]) => list.map(([status, amountCents]) => ({ status, amountCents }));

describe('invoiceFigures', () => {
  it.each([
    // [case, total, rows, state] — a played gig
    ['total 0, no rows', 0, rows(), 'NONE'],
    ['no rows', 100000, rows(), 'PARTLY_INVOICED'],
    ['not sent only', 100000, rows(['NOT_SENT', 100000]), 'OPEN_INVOICES'],
    ['part sent', 100000, rows(['SENT', 40000]), 'PARTLY_INVOICED'],
    ['sent + not sent (open wins)', 100000, rows(['SENT', 40000], ['NOT_SENT', 60000]), 'OPEN_INVOICES'],
    ['all sent', 100000, rows(['SENT', 40000], ['SENT', 60000]), 'FULLY_INVOICED'],
    ['over-sent', 100000, rows(['SENT', 120000]), 'FULLY_INVOICED'],
    ['sent covers total, extra not sent (open wins)', 100000, rows(['SENT', 100000], ['NOT_SENT', 5000]), 'OPEN_INVOICES'],
    ['total 0, sent row', 0, rows(['SENT', 5000]), 'NONE'],
    ['total 0, not sent row', 0, rows(['NOT_SENT', 5000]), 'OPEN_INVOICES'],
  ] as const)('played: %s → %s', (_case, total, list, state) => {
    expect(invoiceFigures(list, total, true).invoiceState).toBe(state);
  });

  // Upcoming / cancelled gigs (not played) never get PARTLY_INVOICED; the other steps are unchanged.
  it.each([
    ['no rows', 100000, rows(), 'NONE'],
    ['part sent', 100000, rows(['SENT', 40000]), 'NONE'],
    ['total 0, no rows', 0, rows(), 'NONE'],
    ['not sent', 100000, rows(['NOT_SENT', 100000]), 'OPEN_INVOICES'],
    ['all sent', 100000, rows(['SENT', 100000]), 'FULLY_INVOICED'],
  ] as const)('not played: %s → %s', (_case, total, list, state) => {
    expect(invoiceFigures(list, total, false).invoiceState).toBe(state);
  });

  // Cancelled gigs (contract details): with rows and sent < total → PARTLY_INVOICED; no rows → NONE.
  it.each([
    ['no rows', 100000, rows(), 'NONE'],
    ['part sent', 100000, rows(['SENT', 40000]), 'PARTLY_INVOICED'],
    ['all sent', 100000, rows(['SENT', 100000]), 'FULLY_INVOICED'],
    ['not sent', 100000, rows(['NOT_SENT', 100000]), 'OPEN_INVOICES'],
    ['total 0, sent row', 0, rows(['SENT', 5000]), 'NONE'],
  ] as const)('cancelled: %s → %s', (_case, total, list, state) => {
    expect(invoiceFigures(list, total, false, true).invoiceState).toBe(state);
  });

  it('sums sent, not sent, uninvoiced (max(total − both, 0)) and balance (total − sent)', () => {
    expect(invoiceFigures(rows(['NOT_SENT', 1000], ['SENT', 2000], ['SENT', 3000]), 10000, true)).toEqual({
      sentCents: 5000,
      notSentCents: 1000,
      uninvoicedCents: 4000,
      balanceCents: 5000,
      invoiceState: 'OPEN_INVOICES',
    });
    expect(invoiceFigures(rows(['SENT', 12000]), 10000, true)).toMatchObject({
      uninvoicedCents: 0,
      balanceCents: -2000,
    });
  });
});
