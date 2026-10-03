import type { TFunction } from 'i18next';
import type { ApiError } from '../api/client';
import type {
  CostType,
  FieldCode,
  GigDisplayStatus,
  GigEventType,
  Language,
  SignInErrorCode,
  TaskStatus,
  TechnicalSetup,
} from '../api/enums';
import type { BudgetCategory, GigSummary, Warning } from '../api/types';
import { formatDate } from '../lib/format';

// Helpers that turn contract codes into translated labels. Every code list in api/enums.ts
// has a matching namespace in the translation files.

export const costTypeLabel = (t: TFunction, code: CostType) => t(`costType.${code}`);
export const technicalSetupLabel = (t: TFunction, code: TechnicalSetup) =>
  t(`technicalSetup.${code}`);
export const gigStatusLabel = (t: TFunction, code: GigDisplayStatus) => t(`gigStatus.${code}`);
export const taskStatusLabel = (t: TFunction, code: TaskStatus) => t(`taskStatus.${code}`);
export const gigEventTypeLabel = (t: TFunction, code: GigEventType) => t(`gigEventType.${code}`);
export const fieldErrorLabel = (t: TFunction, code: FieldCode) => t(`fields.${code}`);
export const signInErrorLabel = (t: TFunction, code: SignInErrorCode) =>
  t(`signIn.errors.${code}`);

/** Display status of a gig: SOLD with a past date is shown as PLAYED (BR-010). */
export function gigDisplayStatus(gig: Pick<GigSummary, 'status' | 'played'>): GigDisplayStatus {
  if (gig.status === 'CANCELLED') return 'CANCELLED';
  return gig.played ? 'PLAYED' : 'SOLD';
}

/** User-facing text for an API error. Never shows the server's English `message`. */
export function apiErrorMessage(t: TFunction, error: unknown): string {
  const code = (error as Partial<ApiError> | null)?.code;
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
      lineupName: warning.otherGigLineupName,
      date: formatDate(warning.otherGigStartDate, lang),
    });
  }
  return t(`warnings.${warning.code}`);
}

export function budgetCategoryName(category: BudgetCategory, lang: Language): string {
  return lang === 'fi' ? category.nameFi : category.nameEn;
}
