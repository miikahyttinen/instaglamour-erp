/**
 * Fixed lists from docs/domain-model.md ("Fixed lists"). Shared by all backend modules;
 * the database enums in prisma/schema.prisma must contain exactly the same values.
 */
import type {
  CostType,
  EventType,
  Logistics,
  OfferDisposition,
  OfferSource,
  TechnicalSetup,
} from '../generated/prisma/enums.js';

/** People roles that play / work the gig: load-in switch and staffing check apply (BR-023, BR-026). */
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
] as const satisfies readonly CostType[];

export const INTERNAL_ROLES = ['OFFICE', 'SALES', 'PRODUCTION'] as const satisfies readonly CostType[];

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
] as const satisfies readonly CostType[];

export const COST_TYPES = [...MUSICIAN_ROLES, ...INTERNAL_ROLES, ...EXPENSE_CATEGORIES] as const;

/** Single choice (domain-model.md "TechnicalSetup"); a gig may also have none (null). */
export const TECHNICAL_SETUPS = ['HOUSE_TECH', 'SET_A', 'SET_B', 'SET_C'] as const satisfies readonly TechnicalSetup[];

/** Single choice (domain-model.md "Logistics"); a gig may also have none (null). */
export const LOGISTICS = ['OWN_VAN', 'RENTAL_VAN', 'TAXI', 'OTHER'] as const satisfies readonly Logistics[];

export type MusicianRole = (typeof MUSICIAN_ROLES)[number];

const musicianRoleSet: ReadonlySet<string> = new Set(MUSICIAN_ROLES);

export function isMusicianRole(type: string): type is MusicianRole {
  return musicianRoleSet.has(type);
}

/** Cost types whose line needs a free-text description. */
export const DESCRIPTION_REQUIRED_TYPES: ReadonlySet<CostType> = new Set<CostType>(['OTHER', 'OTHER_ROLE']);

/** FUEL lines are estimates only and can never be paid (BR-008). */
export function isPayable(type: CostType): boolean {
  return type !== 'FUEL';
}

/** Seeded setting keys (docs/domain-model.md "Setting"). */
export const SETTING_KEYS = {
  officeDefault: 'fees.office_default',
  salesDefault: 'fees.sales_default',
  productionDefault: 'fees.production_default',
  loadInDeduction: 'fees.load_in_deduction',
} as const;

export const ALL_SETTING_KEYS = Object.values(SETTING_KEYS);

/** Text settings for offers (domain-model.md "Settings (additions)"); optional in the seed. */
export const OFFER_SETTING_KEYS = {
  defaultIncludes: 'offers.default_includes',
  defaultSpotifyUrl: 'offers.default_spotify_url',
  referencesFi: 'offers.references_fi',
  referencesEn: 'offers.references_en',
} as const;

export const ALL_OFFER_SETTING_KEYS = Object.values(OFFER_SETTING_KEYS);

/** Offer fixed lists (domain-model.md "Offer"). */
export const OFFER_SOURCES = ['EMAIL', 'WEBSITE', 'INSTAGRAM', 'OTHER'] as const satisfies readonly OfferSource[];
export const EVENT_TYPES = ['PRIVATE', 'WEDDING', 'CORPORATE'] as const satisfies readonly EventType[];
export const OFFER_DISPOSITIONS = [
  'PENDING',
  'WON',
  'CANCELLED',
  'NO_RESPONSE',
  'LOST_PRICE',
  'LOST_COMPETITOR',
  'LOST_OTHER',
  'NO_CAPACITY',
] as const satisfies readonly OfferDisposition[];

export const LANGUAGES = ['fi', 'en'] as const;
