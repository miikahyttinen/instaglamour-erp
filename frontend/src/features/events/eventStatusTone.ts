import type { EventDisplayStatus, InvoiceRowStatus, InvoiceState } from '../../api/enums';
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
 * Invoice row status tones (owner change 2026-10-31): Ready = blue (info), Sent = amber (warn),
 * Paid = dark green (solid `ok-strong`).
 */
export const INVOICE_ROW_STATUS_TONE: Record<InvoiceRowStatus, StatusTone> = {
  READY: 'info',
  SENT: 'warn',
  PAID: 'ok-strong',
};

/**
 * Gig invoicing state tones (api-contract "Invoicing: one label"): Paid = dark green (solid
 * `ok-strong`), Rows to be invoiced = blue (info), Open invoices = amber (warn), Needs invoices =
 * gray (muted, owner 2026-10-31). NONE is a plain dash, no tag.
 */
export const INVOICE_STATE_TONE: Record<Exclude<InvoiceState, 'NONE'>, StatusTone> = {
  PAID: 'ok-strong',
  ROWS_TO_INVOICE: 'info',
  OPEN_INVOICES: 'warn',
  NEEDS_INVOICES: 'muted',
};
