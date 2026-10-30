import { Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { EventDisplayStatus } from '../../api/enums';
import { StatusTag } from '../../components/StatusTag';
import { eventStatusLabel } from '../../i18n/labels';
import { EVENT_DELETED_TONE, EVENT_STATUS_TONE } from './eventStatusTone';

/** Event status (Upcoming / Played / Cancelled) as a shared `StatusTag`. */
export function EventStatusTag({ status }: { status: EventDisplayStatus }) {
  const { t } = useTranslation();
  return <StatusTag tone={EVENT_STATUS_TONE[status]}>{eventStatusLabel(t, status)}</StatusTag>;
}

/**
 * "Valmis laskutukseen" in the Keikat list: a small green box with a check; the accessible text is
 * "Kyllä" / "Yes" (the column header names the meaning).
 */
export function ReadyForInvoiceMark() {
  const { t } = useTranslation();
  return (
    <StatusTag tone="ok" className="ready-for-invoice-mark" title={t('event.readyForInvoice.label')}>
      <Check aria-hidden="true" />
      <span className="visually-hidden">{t('events.staffingFilter.yes')}</span>
    </StatusTag>
  );
}

/** "Deleted" tag for a soft-deleted event. */
export function EventDeletedTag() {
  const { t } = useTranslation();
  return <StatusTag tone={EVENT_DELETED_TONE}>{t('events.views.deleted')}</StatusTag>;
}
