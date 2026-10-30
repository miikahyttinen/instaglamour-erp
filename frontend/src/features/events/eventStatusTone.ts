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
 * Invoice row status tones (TASK-173): Ready = light green (ok, tinted), Sent = amber (warn),
 * Paid = dark green (solid `ok-strong`).
 */
export const INVOICE_ROW_STATUS_TONE: Record<InvoiceRowStatus, StatusTone> = {
  READY: 'ok',
  SENT: 'warn',
  PAID: 'ok-strong',
};

/**
 * Derived gig invoicing state tones (TASK-173): Ready = light green, Invoiced = amber,
 * Partly paid = blue, Paid = dark green. NONE is a plain dash, no tag.
 */
export const INVOICE_STATE_TONE: Record<Exclude<InvoiceState, 'NONE'>, StatusTone> = {
  READY: 'ok',
  SENT: 'warn',
  PARTLY_PAID: 'info',
  PAID: 'ok-strong',
};
