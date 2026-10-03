import { useTranslation } from 'react-i18next';
import type { GigDisplayStatus } from '../api/enums';
import { gigStatusLabel } from '../i18n/labels';

export function StatusBadge({ status }: { status: GigDisplayStatus }) {
  const { t } = useTranslation();
  return <span className={`badge badge-${status.toLowerCase()}`}>{gigStatusLabel(t, status)}</span>;
}
