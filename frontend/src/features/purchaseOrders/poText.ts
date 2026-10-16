import type { TFunction } from 'i18next';
import { isApiError } from '../../api/client';
import type { Language } from '../../api/enums';
import type { Partner, PurchaseOrderEvent } from '../../api/types';
import { apiErrorMessage } from '../../i18n/labels';
import { formatDate, formatTime } from '../../lib/format';

// Text helpers of the purchase order screens (UC-034, BR-119).

/** FI `16.10.2026 klo 14.32`, EN `16 Oct 2026 14:32` (local time). */
export function poDateTime(t: TFunction, value: string | null, lang: Language): string {
  if (!value) return '–';
  return t('purchaseOrders.dateTime', { date: formatDate(value, lang), time: formatTime(value, lang) });
}

/** Error text of a PO action: a status that already changed gets its own message. */
export function poErrorMessage(t: TFunction, error: unknown): string {
  if (isApiError(error) && error.code === 'INVALID_STATUS_TRANSITION') return t('purchaseOrders.statusChanged');
  return apiErrorMessage(t, error);
}

/** Event text of the log (BR-119): Luotu freelancerin linkillä / … / Peruttu: <reason>. */
export function poEventText(t: TFunction, event: PurchaseOrderEvent): string {
  if (event.type === 'CANCELLED') return t('purchaseOrders.log.CANCELLED', { reason: event.details.reason });
  return t(`purchaseOrders.log.${event.type}`);
}

/** Who did it: the partner's name, or "Freelancer" (event made through the freelancer link). */
export function poActorName(t: TFunction, partners: Partner[] | undefined, partnerId: string | null): string {
  if (partnerId === null) return t('purchaseOrders.log.freelancer');
  return partners?.find((p) => p.id === partnerId)?.name ?? '–';
}

