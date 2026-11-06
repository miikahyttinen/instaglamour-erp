/**
 * Invoice rows of an event (api-contract "Invoice rows" + "Invoicing v3", TASK-049): derived sums and
 * state, when the automatic final invoice is due, and the conversion of legacy seed/import values
 * (TASK-045 invoice status + prepayment, TASK-046 READY/PAID row statuses). Pure functions.
 */
import { BUSINESS_TIME_ZONE } from './dates.js';
import type { InvoiceRowStatusCode, InvoiceState } from './enums.js';

export interface InvoicingRow {
  amountCents: number;
  status: InvoiceRowStatusCode;
}

export interface Invoicing {
  /** Σ SENT rows. */
  sentCents: number;
  /** Σ NOT_SENT rows. */
  notSentCents: number;
  /** max(total − sent − notSent, 0): the part of the total no row covers yet. */
  uninvoicedCents: number;
  /** total − sent ("Laskuttamatta / Not invoiced yet"); negative when more was sent than the total. */
  balanceCents: number;
  invoiceState: InvoiceState;
}

/**
 * Sums and the derived invoiceState, first match wins:
 * 1. OPEN_INVOICES — any NOT_SENT row
 * 2. FULLY_INVOICED — sent ≥ total and total > 0
 * 3. NONE — no invoice rows at all (also a played event, e.g. during the 48 h before the automatic
 *    Loppulasku: no label before the first invoice, owner decision 2026-11-07), upcoming (not
 *    played yet), or total 0
 * 4. PARTLY_INVOICED — at least one invoice row (here: only SENT rows), sent < total, and the event
 *    is played (BR-010: SOLD, start date before today in Helsinki) or cancelled.
 * Anything else (e.g. a total-0 event with only SENT rows) → NONE. The `?invoiceState=` filter uses
 * this same derivation.
 */
export function invoicing(
  totalPriceCents: number,
  rows: readonly InvoicingRow[],
  event: { played: boolean; cancelled: boolean },
): Invoicing {
  let sentCents = 0;
  let notSentCents = 0;
  for (const row of rows) {
    if (row.status === 'SENT') sentCents += row.amountCents;
    else notSentCents += row.amountCents;
  }
  return {
    sentCents,
    notSentCents,
    uninvoicedCents: Math.max(totalPriceCents - sentCents - notSentCents, 0),
    balanceCents: totalPriceCents - sentCents,
    invoiceState: invoiceState(totalPriceCents, rows.length, sentCents, notSentCents, event),
  };
}

function invoiceState(
  totalPriceCents: number,
  rowCount: number,
  sentCents: number,
  notSentCents: number,
  event: { played: boolean; cancelled: boolean },
): InvoiceState {
  // Amounts are > 0 (DB check), so notSentCents > 0 ⇔ some NOT_SENT row.
  if (notSentCents > 0) return 'OPEN_INVOICES';
  if (totalPriceCents > 0 && sentCents >= totalPriceCents) return 'FULLY_INVOICED';
  if (rowCount > 0 && sentCents < totalPriceCents && (event.played || event.cancelled)) return 'PARTLY_INVOICED';
  return 'NONE';
}

// ------------------------------------------------------------------ automatic final invoice

export const FINAL_INVOICE_DESCRIPTION = 'Loppulasku';
/** Hours after the end of the event's last day (Europe/Helsinki) before the final invoice is created. */
export const FINAL_INVOICE_DELAY_HOURS = 48;

const DAY_MS = 24 * 60 * 60 * 1000;

/** UTC offset (ms) of the business time zone at `instant`. */
function zoneOffsetMs(instant: number): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: BUSINESS_TIME_ZONE,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(instant));
  const get = (type: string) => Number(parts.find((p) => p.type === type)!.value);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return asUtc - Math.floor(instant / 1000) * 1000;
}

/** Midnight at the start of `dateIso` (YYYY-MM-DD) in the business time zone, as an instant. */
export function businessMidnight(dateIso: string): Date {
  const utcMidnight = Date.parse(`${dateIso}T00:00:00.000Z`);
  let instant = utcMidnight - zoneOffsetMs(utcMidnight);
  // Re-check with the offset at the result (only differs right at a DST change).
  instant = utcMidnight - zoneOffsetMs(instant);
  return new Date(instant);
}

/**
 * When the final invoice of an event ending on `endDateIso` (end date, else start date) is due:
 * the end of that day in Helsinki (= midnight starting the next day) + 48 hours.
 * E.g. an event on 2026-06-10 → due 2026-06-13 00:00 Helsinki time.
 */
export function finalInvoiceDueAt(endDateIso: string): Date {
  const nextDay = new Date(Date.parse(`${endDateIso}T00:00:00.000Z`) + DAY_MS).toISOString().slice(0, 10);
  return new Date(businessMidnight(nextDay).getTime() + FINAL_INVOICE_DELAY_HOURS * 60 * 60 * 1000);
}

// ------------------------------------------------------------------ legacy seed/import values

/** Row statuses before Invoicing v3 (TASK-046); still accepted by the seed/import and converted. */
export const LEGACY_INVOICE_ROW_STATUSES = ['READY', 'PAID'] as const;
export type LegacyInvoiceRowStatus = (typeof LEGACY_INVOICE_ROW_STATUSES)[number];

/** READY → NOT_SENT, PAID → SENT (like migration 20261104120000_invoicing_v3); v3 values unchanged. */
export function convertInvoiceRowStatus(status: InvoiceRowStatusCode | LegacyInvoiceRowStatus): InvoiceRowStatusCode {
  if (status === 'READY') return 'NOT_SENT';
  if (status === 'PAID') return 'SENT';
  return status;
}

/** The invoice status of TASK-045 (no longer stored; still accepted by the seed/import). */
export const LEGACY_INVOICE_STATUSES = ['NONE', 'READY', 'PREPAYMENT_PAID', 'INVOICED', 'PAID'] as const;
export type LegacyInvoiceStatus = (typeof LEGACY_INVOICE_STATUSES)[number];

export const PREPAYMENT_ROW_DESCRIPTION = 'Ennakkomaksu';
export const BALANCE_ROW_DESCRIPTION = 'Lasku';

const BALANCE_ROW_STATUS: Partial<Record<LegacyInvoiceStatus, InvoiceRowStatusCode>> = {
  READY: 'NOT_SENT',
  INVOICED: 'SENT',
  PAID: 'SENT',
};

/**
 * Legacy status + prepayment → rows, like migration 20261031140000_invoice_rows followed by
 * 20261104120000_invoicing_v3: prepayment > 0 → SENT "Ennakkomaksu"; then READY → NOT_SENT and
 * INVOICED/PAID → SENT "Lasku" for the balance (total − prepayment); PREPAYMENT_PAID/NONE → nothing
 * more. Only rows with amount > 0.
 */
export function legacyInvoiceRows(
  totalPriceCents: number,
  status: LegacyInvoiceStatus,
  prepaymentCents: number,
): { description: string; amountCents: number; status: InvoiceRowStatusCode }[] {
  const rows: { description: string; amountCents: number; status: InvoiceRowStatusCode }[] = [];
  if (prepaymentCents > 0) rows.push({ description: PREPAYMENT_ROW_DESCRIPTION, amountCents: prepaymentCents, status: 'SENT' });
  const balanceStatus = BALANCE_ROW_STATUS[status];
  const balance = totalPriceCents - prepaymentCents;
  if (balanceStatus && balance > 0) rows.push({ description: BALANCE_ROW_DESCRIPTION, amountCents: balance, status: balanceStatus });
  return rows;
}
