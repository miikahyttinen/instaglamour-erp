// Fixed code lists from docs/domain-model.md and docs/api-contract.md.
// Each list is the single source for its union type, and the i18n test checks that every
// code has an FI and EN label.

export const LANGUAGES = ['fi', 'en'] as const;
export type Language = (typeof LANGUAGES)[number];

export const MUSICIAN_ROLES = [
  'VOC',
  'BACKING_VOC',
  'BASS',
  'GUITAR',
  'DRUMS',
  'KEYS',
  'PIANO',
  'MIX',
  'HORN_1',
  'HORN_2',
  'SAX',
  'TRUMPET',
  'TROMBONE',
  'VIOLIN',
  'DJ',
  'TECHNICIAN',
  'OTHER_ROLE',
] as const;
export type MusicianRole = (typeof MUSICIAN_ROLES)[number];

export const INTERNAL_ROLES = ['OFFICE', 'SALES', 'PRODUCTION'] as const;
export type InternalRole = (typeof INTERNAL_ROLES)[number];

export const EXPENSE_CATEGORIES = [
  'FUEL',
  'VEHICLE',
  'TRAVEL',
  'PARKING',
  'ACCOMMODATION',
  'FOOD',
  'EQUIPMENT_RENTAL',
  'ARRANGEMENT',
  'LEAD_FEE',
  'OTHER',
] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export const COST_TYPES = [...MUSICIAN_ROLES, ...INTERNAL_ROLES, ...EXPENSE_CATEGORIES] as const;
export type CostType = MusicianRole | InternalRole | ExpenseCategory;

/** One choice per gig: house tech or one of the own PA sets A–C. */
export const TECHNICAL_SETUPS = ['HOUSE_TECH', 'SET_A', 'SET_B', 'SET_C'] as const;
export type TechnicalSetup = (typeof TECHNICAL_SETUPS)[number];

export const LOGISTICS = ['OWN_VAN', 'RENTAL_VAN', 'TAXI', 'OTHER'] as const;
export type Logistics = (typeof LOGISTICS)[number];

export const GIG_STATUSES = ['SOLD', 'CANCELLED'] as const;
export type GigStatus = (typeof GIG_STATUSES)[number];

/** Display status: a SOLD gig with a past date is shown as "played" (BR-010). */
export const GIG_DISPLAY_STATUSES = ['SOLD', 'PLAYED', 'CANCELLED'] as const;
export type GigDisplayStatus = (typeof GIG_DISPLAY_STATUSES)[number];

export const TASK_STATUSES = ['OPEN', 'DONE'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const GIG_EVENT_TYPES = [
  'CREATED',
  'UPDATED',
  'MOVED',
  'CANCELLED',
  'UNCANCELLED',
  'DELETED',
  'RESTORED',
  'COST_ADDED',
  'COST_UPDATED',
  'COST_REMOVED',
  'COST_PAID',
  'COST_UNPAID',
  'ATTACHMENT_ADDED',
  'ATTACHMENT_REMOVED',
] as const;
export type GigEventType = (typeof GIG_EVENT_TYPES)[number];

export const ERROR_CODES = [
  'VALIDATION_ERROR',
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'NOT_FOUND',
  'INVALID_STATUS_TRANSITION',
  'GIG_DELETED',
  'COST_NOT_PAYABLE',
  'BUDGET_NOT_EMPTY',
  'CLIENT_IN_USE',
  'ALREADY_CONVERTED',
  'OFFER_NOT_CONVERTIBLE',
  'CANNOT_REMOVE_SELF',
  'LAST_PARTNER',
  'COST_LINE_ON_PURCHASE_ORDER',
  'COST_LINE_NOT_ELIGIBLE',
  'PERSON_IS_PARTNER',
  'FILE_TOO_LARGE',
  'UNSUPPORTED_FILE_TYPE',
  'RATE_LIMITED',
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

export const FIELD_CODES = [
  'REQUIRED',
  'INVALID_DATE',
  'END_BEFORE_START',
  'NEGATIVE_AMOUNT',
  'INVALID_VALUE',
  'DESCRIPTION_REQUIRED',
  'INVALID_HOURS',
  'DUPLICATE',
  'TOO_LONG',
  'UNKNOWN_REFERENCE',
  'NOT_EDITABLE',
] as const;
export type FieldCode = (typeof FIELD_CODES)[number];

export const WARNING_CODES = ['PERSON_DOUBLE_BOOKED', 'DUPLICATE_NAME'] as const;
export type WarningCode = (typeof WARNING_CODES)[number];

/** Offer status, derived on the server from the disposition (BR-102). */
export const OFFER_STATUSES = ['OPEN', 'ACCEPTED', 'REJECTED'] as const;
export type OfferStatus = (typeof OFFER_STATUSES)[number];

/** `status` filter of `GET /api/offers`: OPEN includes expired; EXPIRED = open and past. */
export const OFFER_STATUS_FILTERS = ['OPEN', 'EXPIRED', 'ACCEPTED', 'REJECTED'] as const;
export type OfferStatusFilter = (typeof OFFER_STATUS_FILTERS)[number];

export const OFFER_DISPOSITIONS = [
  'PENDING',
  'WON',
  'CANCELLED',
  'NO_RESPONSE',
  'LOST_PRICE',
  'LOST_COMPETITOR',
  'LOST_OTHER',
  'NO_CAPACITY',
] as const;
export type OfferDisposition = (typeof OFFER_DISPOSITIONS)[number];

/** Where the offer request came from (domain model: Offer.source). */
export const OFFER_SOURCES = ['EMAIL', 'WEBSITE', 'INSTAGRAM', 'OTHER'] as const;
export type OfferSource = (typeof OFFER_SOURCES)[number];

/** Kind of event the offer is for (domain model: Offer.event_type). */
export const OFFER_EVENT_TYPES = ['PRIVATE', 'WEDDING', 'CORPORATE'] as const;
export type OfferEventType = (typeof OFFER_EVENT_TYPES)[number];

/** Offer history event types (domain model: OfferEvent, BR-103). */
export const OFFER_HISTORY_TYPES = [
  'CREATED',
  'UPDATED',
  'DISPOSITION_CHANGED',
  'CONVERTED',
  'LINK_REGENERATED',
  'DELETED',
  'RESTORED',
] as const;
export type OfferHistoryType = (typeof OFFER_HISTORY_TYPES)[number];

/** `?error=` codes on /login after the Google callback. */
export const SIGN_IN_ERROR_CODES = ['WRONG_DOMAIN', 'NOT_A_PARTNER', 'SIGN_IN_FAILED'] as const;
export type SignInErrorCode = (typeof SIGN_IN_ERROR_CODES)[number];

export function isMusicianRole(type: CostType): type is MusicianRole {
  return (MUSICIAN_ROLES as readonly string[]).includes(type);
}

export function isSignInErrorCode(value: string | null): value is SignInErrorCode {
  return value !== null && (SIGN_IN_ERROR_CODES as readonly string[]).includes(value);
}

export {
  PURCHASE_ORDER_EVENT_TYPES,
  PURCHASE_ORDER_STATUSES,
  type PurchaseOrderEventType,
  type PurchaseOrderStatus,
} from './purchaseOrderTypes';
