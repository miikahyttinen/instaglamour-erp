import { useTranslation } from 'react-i18next';
import type { EventDisplayStatus, InvoiceStatus } from '../../api/enums';
import { StatusTag } from '../../components/StatusTag';
import { eventStatusLabel, invoiceStatusLabel } from '../../i18n/labels';
import { EVENT_DELETED_TONE, EVENT_STATUS_TONE, INVOICE_STATUS_TONE } from './eventStatusTone';

/** Event status (Upcoming / Played / Cancelled) as a shared `StatusTag`. */
export function EventStatusTag({ status }: { status: EventDisplayStatus }) {
  const { t } = useTranslation();
  return <StatusTag tone={EVENT_STATUS_TONE[status]}>{eventStatusLabel(t, status)}</StatusTag>;
}

/** Invoice status as a colour tag; NONE is a plain dash (accessible text "–"). */
export function InvoiceStatusTag({ status }: { status: InvoiceStatus }) {
  const { t } = useTranslation();
  if (status === 'NONE') return <span className="invoice-status-none">–</span>;
  return (
    <StatusTag tone={INVOICE_STATUS_TONE[status]} className="invoice-status-tag">
      {invoiceStatusLabel(t, status)}
    </StatusTag>
  );
}

/** "Deleted" tag for a soft-deleted event. */
export function EventDeletedTag() {
  const { t } = useTranslation();
  return <StatusTag tone={EVENT_DELETED_TONE}>{t('events.views.deleted')}</StatusTag>;
}
