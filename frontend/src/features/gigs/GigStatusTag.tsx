import { useTranslation } from 'react-i18next';
import type { GigDisplayStatus } from '../../api/enums';
import { StatusTag } from '../../components/StatusTag';
import { gigStatusLabel } from '../../i18n/labels';
import { GIG_DELETED_TONE, GIG_STATUS_TONE } from './gigStatusTone';

/** Gig status (Sold / Played / Cancelled) as a shared `StatusTag`. */
export function GigStatusTag({ status }: { status: GigDisplayStatus }) {
  const { t } = useTranslation();
  return <StatusTag tone={GIG_STATUS_TONE[status]}>{gigStatusLabel(t, status)}</StatusTag>;
}

/** "Deleted" tag for a soft-deleted gig. */
export function GigDeletedTag() {
  const { t } = useTranslation();
  return <StatusTag tone={GIG_DELETED_TONE}>{t('gigs.views.deleted')}</StatusTag>;
}
