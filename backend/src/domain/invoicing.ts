/**
 * Invoice rows of an event (api-contract "Invoice rows" + "Invoicing state: coverage + payment"):
 * derived sums and states, and the conversion of the legacy invoice status + prepayment (TASK-045)
 * into rows. Pure functions.
 */
import type { InvoiceCoverage, InvoiceRowStatusCode, PaymentState } from './enums.js';

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
  invoiceCoverage: InvoiceCoverage;
  paymentState: PaymentState;
}

/**
 * Sums and the two derived states:
 * - invoiceCoverage: NONE (total 0 and no SENT/PAID rows; READY drafts don't count) ·
 *   NEEDS_INVOICES (invoiced < total) · FULLY_INVOICED (invoiced ≥ total).
 * - paymentState: NONE (no SENT/PAID rows) · OPEN_INVOICES (open > 0) · PARTLY_PAID (open 0,
 *   0 < paid < total) · FULLY_PAID (open 0, paid ≥ total). The contract says "paid ≥ total > 0";
 *   the only case outside it — PAID rows on an event whose total is 0 — is also FULLY_PAID
 *   (paid covers the total; every SENT/PAID combination thus has exactly one state).
 */
export function invoicing(totalPriceCents: number, rows: readonly InvoicingRow[]): Invoicing {
  let paidCents = 0;
  let openCents = 0;
  for (const row of rows) {
    if (row.status === 'SENT') openCents += row.amountCents;
    if (row.status === 'PAID') paidCents += row.amountCents;
  }
  const invoicedCents = openCents + paidCents;
  const balanceCents = totalPriceCents - paidCents;

  const hasInvoices = rows.some((r) => r.status === 'SENT' || r.status === 'PAID');

  let invoiceCoverage: InvoiceCoverage;
  if (totalPriceCents === 0 && !hasInvoices) invoiceCoverage = 'NONE';
  else if (invoicedCents < totalPriceCents) invoiceCoverage = 'NEEDS_INVOICES';
  else invoiceCoverage = 'FULLY_INVOICED';

  let paymentState: PaymentState;
  if (!hasInvoices) paymentState = 'NONE';
  else if (openCents > 0) paymentState = 'OPEN_INVOICES';
  else if (paidCents < totalPriceCents) paymentState = 'PARTLY_PAID';
  else paymentState = 'FULLY_PAID';

  return { balanceCents, invoicedCents, paidCents, openCents, invoiceCoverage, paymentState };
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
