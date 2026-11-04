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

/** Invoice row status tones (api-contract "Invoicing v3"): Not sent = yellow, Sent = green (ok). */
export const INVOICE_ROW_STATUS_TONE: Record<InvoiceRowStatus, StatusTone> = {
  NOT_SENT: 'yellow',
  SENT: 'ok',
};

/**
 * Gig invoicing state tones (api-contract "Invoicing v3"): Open invoices = yellow, Fully invoiced =
 * dark green (solid `ok-strong`), Partly invoiced = blue (info). NONE is a plain dash, no tag.
 */
export const INVOICE_STATE_TONE: Record<Exclude<InvoiceState, 'NONE'>, StatusTone> = {
  OPEN_INVOICES: 'yellow',
  FULLY_INVOICED: 'ok-strong',
  PARTLY_INVOICED: 'info',
};
