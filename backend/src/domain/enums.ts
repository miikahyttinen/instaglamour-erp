/**
 * Fixed lists from docs/domain-model.md ("Fixed lists"). Shared by all backend modules;
 * the database enums in prisma/schema.prisma must contain exactly the same values.
 */
import type {
  CostType,
  EventType,
  InvoiceRowStatus,
  Logistics,
  OfferDisposition,
  OfferSource,
  TechnicalSetup,
} from '../generated/prisma/enums.js';

/** People roles that play / work the event: load-in switch and staffing check apply (BR-023, BR-026). */
export const MUSICIAN_ROLES = [
  'VOC',
  'BACKING_VOC',
  'BASS',
  'GUITAR',
  'DRUMS',
  'KEYS',
  'PIANO',
  'MIX',
  'SAX',
  'TRUMPET',
  'TROMBONE',
  'VIOLIN',
  'DJ',
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

/** Single choice (domain-model.md "TechnicalSetup"); an event may also have none (null). */
export const TECHNICAL_SETUPS = ['HOUSE_TECH', 'SET_A', 'SET_B', 'SET_C'] as const satisfies readonly TechnicalSetup[];

/** Status of one invoice row, set by hand (api-contract "Invoicing v3"); payments are not tracked. */
export const INVOICE_ROW_STATUSES = ['NOT_SENT', 'SENT'] as const satisfies readonly InvoiceRowStatus[];
export type InvoiceRowStatusCode = (typeof INVOICE_ROW_STATUSES)[number];

/** Derived invoicing state of an event (api-contract "Invoicing v3"); not stored. */
export const INVOICE_STATES = ['OPEN_INVOICES', 'FULLY_INVOICED', 'PARTLY_INVOICED', 'NONE'] as const;
export type InvoiceState = (typeof INVOICE_STATES)[number];

/** Single choice (domain-model.md "Logistics"); an event may also have none (null). */
export const LOGISTICS = ['OWN_VAN', 'RENTAL_VAN', 'TAXI', 'OTHER'] as const satisfies readonly Logistics[];

export type MusicianRole = (typeof MUSICIAN_ROLES)[number];

const musicianRoleSet: ReadonlySet<string> = new Set(MUSICIAN_ROLES);

export function isMusicianRole(type: string): type is MusicianRole {
  return musicianRoleSet.has(type);
}

/** Person roles as the contract shows them: musician roles only, unique, in MUSICIAN_ROLES order. */
export function normalizeRoles(roles: readonly string[]): MusicianRole[] {
  const set = new Set(roles);
  return MUSICIAN_ROLES.filter((r) => set.has(r));
}

/**
 * Musician roles removed on 2026-10-30 (TASK-041). The API rejects them (400 INVALID_VALUE); seed
 * and import files may still contain them and are converted like the migration
 * 20261030120000_remove_legacy_roles did with the stored data.
 */
export const LEGACY_ROLES = ['HORN_1', 'HORN_2', 'TECHNICIAN'] as const;
export type LegacyRole = (typeof LEGACY_ROLES)[number];

const legacyRoleSet: ReadonlySet<string> = new Set(LEGACY_ROLES);

export function isLegacyRole(code: unknown): code is LegacyRole {
  return typeof code === 'string' && legacyRoleSet.has(code);
}

/**
 * The current code for a removed role: HORN_1 → TRUMPET, TECHNICIAN → MIX, HORN_2 → SAX when the
 * person's roles contain SAX but not TROMBONE, otherwise TROMBONE (also when there is no person).
 */
export function convertLegacyRole(code: LegacyRole, personRoles: readonly unknown[] = []): MusicianRole {
  switch (code) {
    case 'HORN_1':
      return 'TRUMPET';
    case 'TECHNICIAN':
      return 'MIX';
    case 'HORN_2':
      return personRoles.includes('SAX') && !personRoles.includes('TROMBONE') ? 'SAX' : 'TROMBONE';
  }
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

/**
 * Optional numeric settings (integers ≥ 0): the code has a default when the row is missing.
 * `fees.performer_vat_rate_bp` = the former single VAT rate in basis points (TASK-050; 1350 = 13.5 %),
 * still accepted: used as the first rate when `fees.performer_vat_rates_bp` is missing.
 */
export const OPTIONAL_NUMBER_SETTING_KEYS = {
  performerVatRateBp: 'fees.performer_vat_rate_bp',
} as const;

export const ALL_OPTIONAL_NUMBER_SETTING_KEYS = Object.values(OPTIONAL_NUMBER_SETTING_KEYS);

/**
 * Former single VAT rate (TASK-050). Replaced by `fees.performer_vat_rates_bp`; if only this row
 * exists, its value is used as the first rate.
 */
export const DEFAULT_PERFORMER_VAT_RATE_BP = 1350;

/**
 * `fees.performer_vat_rates_bp` = the VAT rates a freelancer can choose on a PO, comma-separated
 * basis points stored as text (api-contract "Freelancer PO: VAT rate choice", 2026-11-04).
 * "No VAT" (0) is always allowed in addition to these.
 */
export const PERFORMER_VAT_RATES_SETTING_KEY = 'fees.performer_vat_rates_bp';

/** Default of `fees.performer_vat_rates_bp` when neither VAT setting row exists. */
export const DEFAULT_PERFORMER_VAT_RATES_BP: readonly number[] = [1350, 2550];

/** Highest accepted rate (100 %) in basis points. */
export const MAX_PERFORMER_VAT_RATE_BP = 10000;

/**
 * Parse a `fees.performer_vat_rates_bp` value: comma-separated whole numbers 1…10000, unique, at least
 * one. Returns null when the text is not valid.
 */
export function parsePerformerVatRates(text: string): number[] | null {
  const parts = text.split(',').map((p) => p.trim());
  if (parts.length === 0 || parts.some((p) => !/^\d{1,5}$/.test(p))) return null;
  const rates = parts.map(Number);
  if (rates.some((r) => r < 1 || r > MAX_PERFORMER_VAT_RATE_BP)) return null;
  if (new Set(rates).size !== rates.length) return null;
  return rates;
}

/** Text settings for offers (domain-model.md "Settings (additions)"); optional in the seed. */
export const OFFER_SETTING_KEYS = {
  defaultIncludes: 'offers.default_includes',
} as const;

export const ALL_OFFER_SETTING_KEYS = Object.values(OFFER_SETTING_KEYS);

/**
 * Former offer settings: the reference texts (replaced by the Reference table, TASK-018, BR-108) and
 * the default Spotify link (replaced by the fixed SPOTIFY_URL in offers/constants.ts, TASK-022).
 * Older seed files may still contain them: they are accepted and ignored. Existing rows are left in
 * the database unused.
 */
export const LEGACY_OFFER_SETTING_KEYS = ['offers.references_fi', 'offers.references_en', 'offers.default_spotify_url'] as const;

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
