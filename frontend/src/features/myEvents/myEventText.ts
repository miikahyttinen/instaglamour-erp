import type { TFunction } from 'i18next';
import type { Language } from '../../api/enums';
import type { MyEvent, MyRole } from '../../api/types';
import { costTypeLabel } from '../../i18n/labels';
import { formatDate, formatDateWithWeekday } from '../../lib/format';

/** Weekday + start date; a multi-day gig adds its end date ("Perjantai 1.5.2026–3.5.2026"). */
export function myEventDate(event: Pick<MyEvent, 'startDate' | 'endDate'>, lang: Language): string {
  const start = formatDateWithWeekday(event.startDate, lang);
  return event.endDate && event.endDate !== event.startDate ? `${start}–${formatDate(event.endDate, lang)}` : start;
}

/** "Tuottaja" for PRODUCER; the cost type label for a musician role (a custom role: its description). */
export function myRoleLabel(t: TFunction, role: MyRole): string {
  if (role.kind === 'PRODUCER') return t('myEvents.producer');
  if (role.type === 'OTHER_ROLE' && role.description?.trim()) return role.description.trim();
  return costTypeLabel(t, role.type);
}
