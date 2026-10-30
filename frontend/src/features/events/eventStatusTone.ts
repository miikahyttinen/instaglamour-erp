import type { EventDisplayStatus, InvoiceStatus } from '../../api/enums';
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
 * Invoice status tag tones (TASK-172): Ready = light green (ok, tinted), Prepayment paid = blue,
 * Invoiced = amber, Paid = dark green (solid). NONE is a plain dash, no tag.
 */
export const INVOICE_STATUS_TONE: Record<Exclude<InvoiceStatus, 'NONE'>, StatusTone> = {
  READY: 'ok',
  PREPAYMENT_PAID: 'info',
  INVOICED: 'warn',
  PAID: 'ok-strong',
};
