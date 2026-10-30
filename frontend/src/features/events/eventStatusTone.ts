import type { EventDisplayStatus, InvoiceCoverage, InvoiceRowStatus, PaymentState } from '../../api/enums';
import type { StatusTone } from '../../components/StatusTag';

/** Status tag tones (owner decision 2026-10-31): Upcoming = info (blue), Played = ok (green), Cancelled = danger (red). */
export const EVENT_STATUS_TONE: Record<EventDisplayStatus, StatusTone> = {
  SOLD: 'info',
  PLAYED: 'ok',
  CANCELLED: 'danger',
};

/** Tone of the "Deleted" tag on a deleted event. */
export const EVENT_DELETED_TONE: StatusTone = 'danger';

/**
 * Invoice row status tones (TASK-173): Ready = light green (ok, tinted), Sent = amber (warn),
 * Paid = dark green (solid `ok-strong`).
 */
export const INVOICE_ROW_STATUS_TONE: Record<InvoiceRowStatus, StatusTone> = {
  READY: 'ok',
  SENT: 'warn',
  PAID: 'ok-strong',
};

/**
 * Invoicing coverage tones (api-contract "Invoicing state: coverage + payment"): Needs invoices =
 * amber (warn), Fully invoiced = light green (ok). NONE is a plain dash, no tag.
 */
export const INVOICE_COVERAGE_TONE: Record<Exclude<InvoiceCoverage, 'NONE'>, StatusTone> = {
  NEEDS_INVOICES: 'warn',
  FULLY_INVOICED: 'ok',
};

/**
 * Payment state tones (same contract section): Open invoices = blue (info), Partly paid = purple,
 * Fully paid = dark green (solid `ok-strong`). NONE is a plain dash, no tag.
 */
export const PAYMENT_STATE_TONE: Record<Exclude<PaymentState, 'NONE'>, StatusTone> = {
  OPEN_INVOICES: 'info',
  PARTLY_PAID: 'purple',
  FULLY_PAID: 'ok-strong',
};
