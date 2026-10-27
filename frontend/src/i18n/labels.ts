import type { TFunction } from 'i18next';
import type { ApiError } from '../api/client';
import type {
  CostType,
  FieldCode,
  EventDisplayStatus,
  EventHistoryType,
  Language,
  OfferDisposition,
  OfferEventType,
  OfferHistoryType,
  OfferSource,
  OfferStatus,
  SignInErrorCode,
  TaskStatus,
  TechnicalSetup,
  Logistics,
} from '../api/enums';
import type { EventSummary, Warning } from '../api/types';
import { formatDate } from '../lib/format';

// Helpers that turn contract codes into translated labels. Every code list in api/enums.ts
// has a matching namespace in the translation files.

export const costTypeLabel = (t: TFunction, code: CostType) => t(`costType.${code}`);
export const technicalSetupLabel = (t: TFunction, code: TechnicalSetup) =>
  t(`technicalSetup.${code}`);
export const logisticsLabel = (t: TFunction, code: Logistics) => t(`logistics.${code}`);
export const eventStatusLabel = (t: TFunction, code: EventDisplayStatus) => t(`eventStatus.${code}`);
export const taskStatusLabel = (t: TFunction, code: TaskStatus) => t(`taskStatus.${code}`);
export const eventHistoryTypeLabel = (t: TFunction, code: EventHistoryType) => t(`eventHistoryType.${code}`);
export const offerStatusLabel = (t: TFunction, code: OfferStatus) => t(`offerStatus.${code}`);
export const offerDispositionLabel = (t: TFunction, code: OfferDisposition) =>
  t(`offerDisposition.${code}`);
export const offerSourceLabel = (t: TFunction, code: OfferSource) => t(`offerSource.${code}`);
export const offerEventTypeLabel = (t: TFunction, code: OfferEventType) => t(`offerEventType.${code}`);
export const offerHistoryTypeLabel = (t: TFunction, code: OfferHistoryType) =>
  t(`offerHistoryType.${code}`, { defaultValue: code });
export const fieldErrorLabel = (t: TFunction, code: FieldCode) => t(`fields.${code}`);
export const signInErrorLabel = (t: TFunction, code: SignInErrorCode) =>
  t(`signIn.errors.${code}`);

/** Display status of an event: SOLD with a past date is shown as PLAYED (BR-010). */
export function eventDisplayStatus(event: Pick<EventSummary, 'status' | 'played'>): EventDisplayStatus {
  if (event.status === 'CANCELLED') return 'CANCELLED';
  return event.played ? 'PLAYED' : 'SOLD';
}

/** User-facing text for an API error. Never shows the server's English `message`. */
export function apiErrorMessage(t: TFunction, error: unknown): string {
  const code = (error as Partial<ApiError> | null)?.code;
  const poNumber = (error as Partial<ApiError> | null)?.details?.purchaseOrderNumber;
  if (code === 'COST_LINE_ON_PURCHASE_ORDER' && typeof poNumber === 'string') {
    // BR-118: say which PO locks the line / event.
    return t('purchaseOrders.lockedError', { number: poNumber });
  }
  if (typeof code === 'string' && t(`errors.${code}`, { defaultValue: '' })) {
    return t(`errors.${code}`);
  }
  return t('errors.UNKNOWN');
}

/** Translated field errors from a VALIDATION_ERROR, keyed by field name. */
export function apiFieldErrors(t: TFunction, error: unknown): Record<string, string> {
  const fields = (error as Partial<ApiError> | null)?.fields ?? {};
  const result: Record<string, string> = {};
  for (const [field, code] of Object.entries(fields)) {
    if (code) result[field] = t(`fields.${code}`, { defaultValue: t('fields.INVALID_VALUE') });
  }
  return result;
}

export function warningMessage(t: TFunction, warning: Warning, lang: Language): string {
  if (warning.code === 'PERSON_DOUBLE_BOOKED') {
    return t('warnings.PERSON_DOUBLE_BOOKED', {
      lineupName: warning.otherEventLineupName,
      date: formatDate(warning.otherEventStartDate, lang),
    });
  }
  return t(`warnings.${warning.code}`);
}

