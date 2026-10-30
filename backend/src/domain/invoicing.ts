/**
 * Invoice rows of an event (api-contract "Invoice rows" + "Invoicing: one label"):
 * derived sums and state, and the conversion of the legacy invoice status + prepayment (TASK-045)
 * into rows. Pure functions.
 */
import type { InvoiceRowStatusCode, InvoiceState } from './enums.js';

export interface InvoicingRow {
  amountCents: number;
  status: InvoiceRowStatusCode;
}

export interface Invoicing {
  /** totalPriceCents − Σ PAID rows; negative when more was paid than the total. */
  balanceCents: number;
  /** Σ SENT + PAID rows (READY rows are drafts, not yet invoiced). */
  invoicedCents: number;
  /** Σ PAID rows. */
  paidCents: number;
  /** Σ SENT rows (sent, not paid). */
  openCents: number;
  /** Σ READY rows (drafts, not yet invoiced). */
  readyCents: number;
  invoiceState: InvoiceState;
}

/**
 * Sums and the derived invoiceState (the next invoicing action), first match wins:
 * 1. PAID — at least one row (any status) and paid ≥ total
 * 2. ROWS_TO_INVOICE — readyCents > 0
 * 3. OPEN_INVOICES — openCents > 0
 * 4. NEEDS_INVOICES — invoiced < total
 * 5. NONE — otherwise (e.g. total 0 and no rows)
 * So an overpaid event with READY rows is PAID; a total-0 event with any row is PAID.
 */
export function invoicing(totalPriceCents: number, rows: readonly InvoicingRow[]): Invoicing {
  let paidCents = 0;
  let openCents = 0;
  let readyCents = 0;
  for (const row of rows) {
    if (row.status === 'READY') readyCents += row.amountCents;
    if (row.status === 'SENT') openCents += row.amountCents;
    if (row.status === 'PAID') paidCents += row.amountCents;
  }
  const invoicedCents = openCents + paidCents;
  const balanceCents = totalPriceCents - paidCents;
  return {
    balanceCents,
    invoicedCents,
    paidCents,
    openCents,
    readyCents,
    invoiceState: invoiceState(totalPriceCents, rows.length > 0, { paidCents, readyCents, openCents, invoicedCents }),
  };
}

function invoiceState(
  totalPriceCents: number,
  hasRows: boolean,
  sums: { paidCents: number; readyCents: number; openCents: number; invoicedCents: number },
): InvoiceState {
  if (hasRows && sums.paidCents >= totalPriceCents) return 'PAID';
  if (sums.readyCents > 0) return 'ROWS_TO_INVOICE';
  if (sums.openCents > 0) return 'OPEN_INVOICES';
  if (sums.invoicedCents < totalPriceCents) return 'NEEDS_INVOICES';
  return 'NONE';
}

/** The invoice status of TASK-045 (no longer stored; still accepted by the seed/import). */
export const LEGACY_INVOICE_STATUSES = ['NONE', 'READY', 'PREPAYMENT_PAID', 'INVOICED', 'PAID'] as const;
export type LegacyInvoiceStatus = (typeof LEGACY_INVOICE_STATUSES)[number];

export const PREPAYMENT_ROW_DESCRIPTION = 'Ennakkomaksu';
export const BALANCE_ROW_DESCRIPTION = 'Lasku';

const BALANCE_ROW_STATUS: Partial<Record<LegacyInvoiceStatus, InvoiceRowStatusCode>> = {
  READY: 'READY',
  INVOICED: 'SENT',
  PAID: 'PAID',
};

/**
 * Legacy status + prepayment → rows, exactly like migration 20261031140000_invoice_rows:
 * prepayment > 0 → PAID "Ennakkomaksu"; then READY/INVOICED/PAID → READY/SENT/PAID "Lasku" for the
 * balance (total − prepayment); PREPAYMENT_PAID/NONE → nothing more. Only rows with amount > 0.
 */
export function legacyInvoiceRows(
  totalPriceCents: number,
  status: LegacyInvoiceStatus,
  prepaymentCents: number,
): { description: string; amountCents: number; status: InvoiceRowStatusCode }[] {
  const rows: { description: string; amountCents: number; status: InvoiceRowStatusCode }[] = [];
  if (prepaymentCents > 0) rows.push({ description: PREPAYMENT_ROW_DESCRIPTION, amountCents: prepaymentCents, status: 'PAID' });
  const balanceStatus = BALANCE_ROW_STATUS[status];
  const balance = totalPriceCents - prepaymentCents;
  if (balanceStatus && balance > 0) rows.push({ description: BALANCE_ROW_DESCRIPTION, amountCents: balance, status: balanceStatus });
  return rows;
}
