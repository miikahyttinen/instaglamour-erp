import { useTranslation } from 'react-i18next';
import type { EventDisplayStatus } from '../../api/enums';
import { StatusTag } from '../../components/StatusTag';
import { eventStatusLabel } from '../../i18n/labels';
import { EVENT_DELETED_TONE, EVENT_STATUS_TONE } from './eventStatusTone';

/** Event status (Sold / Played / Cancelled) as a shared `StatusTag`. */
export function EventStatusTag({ status }: { status: EventDisplayStatus }) {
  const { t } = useTranslation();
  return <StatusTag tone={EVENT_STATUS_TONE[status]}>{eventStatusLabel(t, status)}</StatusTag>;
}

/** "Deleted" tag for a soft-deleted event. */
export function EventDeletedTag() {
  const { t } = useTranslation();
  return <StatusTag tone={EVENT_DELETED_TONE}>{t('events.views.deleted')}</StatusTag>;
}
