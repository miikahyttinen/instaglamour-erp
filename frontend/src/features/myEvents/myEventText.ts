import type { TFunction } from 'i18next';
import type { Language } from '../../api/enums';
import type { MyEvent, MyOffer, MyOffersResponse, MyRole } from '../../api/types';
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

/** One row: an accepted offer without a done contract, or an open offer to follow up. */
export interface MyOfferRow {
  kind: 'contractMissing' | 'followUp';
  offer: MyOffer;
}

/** contractMissing rows first, then followUp rows (each list keeps the API's date order). */
export function myOfferRows(data: MyOffersResponse): MyOfferRow[] {
  return [
    ...data.contractMissing.map((offer) => ({ kind: 'contractMissing' as const, offer })),
    ...data.followUp.map((offer) => ({ kind: 'followUp' as const, offer })),
  ];
}

/** Contract missing: the gig if the offer is converted, else the offer. Follow-up: the offer. */
export function myOfferHref(row: MyOfferRow): string {
  return row.kind === 'contractMissing' && row.offer.eventId
    ? `/gigs/${row.offer.eventId}`
    : `/offers/${row.offer.offerId}`;
}
