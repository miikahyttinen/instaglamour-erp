/**
 * Invoice rows of an event (api-contract "Invoice rows", TASK-046): derived sums and state, and the
 * conversion of the legacy invoice status + prepayment (TASK-045) into rows. Pure functions.
 */
import type { InvoiceRowStatusCode, InvoiceState } from './enums.js';

export interface InvoicingRow {
  amountCents: number;
  status: InvoiceRowStatusCode;
}

export interface Invoicing {
  /** totalPriceCents − Σ PAID rows; negative when more was paid than the total. */
  balanceCents: number;
  /** Σ SENT + PAID rows. */
  invoicedCents: number;
  /** Σ PAID rows. */
  paidCents: number;
  invoiceState: InvoiceState;
}

/**
 * Sums and state. Open rows win over the balance: an event with a READY or SENT row is READY / SENT
 * even when the paid rows already cover the total (the contract's PAID rule "rows exist and
 * balance ≤ 0" is applied only once no row is open, like PARTLY_PAID).
 */
export function invoicing(totalPriceCents: number, rows: readonly InvoicingRow[]): Invoicing {
  let invoicedCents = 0;
  let paidCents = 0;
  let ready = false;
  let sent = false;
  for (const row of rows) {
    if (row.status === 'READY') ready = true;
    if (row.status === 'SENT') sent = true;
    if (row.status !== 'READY') invoicedCents += row.amountCents;
    if (row.status === 'PAID') paidCents += row.amountCents;
  }
  const balanceCents = totalPriceCents - paidCents;
  let invoiceState: InvoiceState;
  if (rows.length === 0) invoiceState = 'NONE';
  else if (sent) invoiceState = 'SENT';
  else if (ready) invoiceState = 'READY';
  else invoiceState = balanceCents > 0 ? 'PARTLY_PAID' : 'PAID';
  return { balanceCents, invoicedCents, paidCents, invoiceState };
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
