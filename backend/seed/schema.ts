/**
 * Seed file format (UC-024). Documented in seed/README.md.
 * `validateSeed` returns every problem found (structure + cross references) so the developer
 * can fix the file in one go; nothing is loaded unless the whole file is valid.
 */
import { z } from 'zod';
import { isIsoDate } from '../src/domain/dates.js';
import {
  ALL_LEGACY_FEE_SETTING_KEYS,
  ALL_OFFER_SETTING_KEYS,
  ALL_OPTIONAL_NUMBER_SETTING_KEYS,
  ALL_SETTING_KEYS,
  COST_TYPES,
  DESCRIPTION_REQUIRED_TYPES,
  EVENT_TYPES,
  INVOICE_ROW_STATUSES,
  convertLegacyRole,
  isLegacyRole,
  isMusicianRole,
  LANGUAGES,
  LEGACY_FEE_SETTING_KEYS,
  LEGACY_OFFER_SETTING_KEYS,
  PERFORMER_VAT_RATES_SETTING_KEY,
  parsePerformerVatRates,
  LOGISTICS,
  PERSON_ROLES,
  OFFER_DISPOSITIONS,
  OFFER_SOURCES,
  TECHNICAL_SETUPS,
} from '../src/domain/enums.js';
import type { LineupLineInput } from '../src/domain/costLines.js';
import { MAX_LINEUP_LINES } from '../src/lineups/store.js';
import { convertInvoiceRowStatus, LEGACY_INVOICE_ROW_STATUSES, LEGACY_INVOICE_STATUSES } from '../src/domain/invoicing.js';

const cents = z.number().int().nonnegative();
const name = z.string().trim().min(1).max(500);
const isoDate = z.string().refine(isIsoDate, 'must be a date in YYYY-MM-DD form');
const email = z.string().trim().toLowerCase().email();
const year = z.number().int().min(2000).max(2100);

/** Error for a single-choice field; arrays get a hint about the pre-TASK-010 multi-select format. */
const singleChoice = (field: string, values: readonly string[]) => (issue: { input?: unknown }) =>
  Array.isArray(issue.input)
    ? `${field} is a single value now (one of ${values.join(', ')}), not a list; ` +
      'see seed/README.md (HOUSE_TECHNICIAN → houseTechnician: true, VAN → logistics: "OWN_VAN", OWN_PA → omit)'
    : `must be one of ${values.join(', ')}`;

/**
 * Roles a person can play (TASK-027): person-role codes (musician roles except OTHER_ROLE, which is
 * dropped before validation), no duplicates. Filled only when empty.
 */
const personRoles = z
  .array(z.enum(PERSON_ROLES))
  .refine((roles) => new Set(roles).size === roles.length, 'must not contain the same role twice')
  .optional();

/** A lineup line (2026-11-06): any cost type with its default amount, in display order. */
const lineupLine = z.strictObject({
  type: z.enum(COST_TYPES),
  description: z.string().trim().max(500).optional(),
  defaultCents: cents,
});

/** The pre-2026-11-06 lineup format: musician roles only (converted to `lines`, see validateSeed). */
const legacyTemplateRole = z.strictObject({ role: z.enum(COST_TYPES), defaultFeeCents: cents });

/** Lineup names compare case-insensitively and trimmed (like the app's DUPLICATE rule). */
export const lineupNameKey = (n: string) => n.trim().toLowerCase();

const costLine = z.strictObject({
  type: z.enum(COST_TYPES),
  person: name.optional(),
  description: z.string().max(500).optional(),
  budgetedCents: cents,
  joinsLoadIn: z.boolean().optional(),
  actualCents: cents.optional(),
  paidBy: email.optional(),
});

/**
 * An invoice row (TASK-046); status defaults to NOT_SENT like the API. The pre-v3 statuses READY / PAID
 * are still accepted and converted (READY → NOT_SENT, PAID → SENT; TASK-049).
 */
const invoiceRow = z.strictObject({
  description: name,
  amountCents: z.number().int().positive(),
  status: z
    .enum([...INVOICE_ROW_STATUSES, ...LEGACY_INVOICE_ROW_STATUSES])
    .default('NOT_SENT')
    .transform(convertInvoiceRowStatus),
});

const event = z.strictObject({
  startDate: isoDate,
  endDate: isoDate.optional(),
  status: z.enum(['SOLD', 'CANCELLED']).default('SOLD'),
  lineupTemplate: name.optional(),
  lineupName: name.optional(),
  venue: name,
  // Single values since TASK-010; the old multi-select array is rejected with a hint.
  technicalSetup: z.enum(TECHNICAL_SETUPS, { error: singleChoice('technicalSetup', TECHNICAL_SETUPS) }).optional(),
  logistics: z.enum(LOGISTICS, { error: singleChoice('logistics', LOGISTICS) }).optional(),
  houseTechnician: z.boolean().default(false),
  // TASK-058: default false — also for past gigs (the migration rule for existing gigs does not apply to seed/import).
  contractDone: z.boolean().default(false),
  seller: email,
  producer: email,
  priceCents: cents,
  additionalSalesCents: cents.default(0),
  additionalSalesDescription: z.string().max(500).optional(),
  notes: z.string().max(5000).optional(),
  client: name.optional(),
  // TASK-046: optional invoice rows.
  invoiceRows: z.array(invoiceRow).max(1000).optional(),
  // TASK-045 legacy (no longer stored): converted into invoice rows like the TASK-046 migration.
  invoiceStatus: z.enum(LEGACY_INVOICE_STATUSES).optional(),
  prepaymentCents: cents.optional(),
  costLines: z.array(costLine).optional(),
});

/**
 * A past moment with a time-zone offset (TASK-028), e.g. `2026-10-14T17:09:01.341414+00:00` or
 * `…Z`; any fraction of a second. Future times are rejected.
 */
const pastDateTime = z
  .string()
  .pipe(z.iso.datetime({ offset: true, error: 'must be an ISO 8601 date-time with an offset, e.g. 2026-10-14T17:09:01+00:00' }))
  // NaN (already reported by the format check) compares false, so it gets no second error.
  .refine((v) => !(Date.parse(v) > Date.now()), 'must not be in the future');

const offer = z.strictObject({
  client: name,
  eventName: name,
  eventDate: isoDate,
  venue: name,
  city: name.optional(),
  lineup: z.array(name).max(100).default([]),
  includesText: z.string().max(5000).optional(),
  /** Obsolete (TASK-022: one fixed Spotify link in code). Accepted so older files still load; ignored. */
  spotifyUrl: z.unknown().optional(),
  showReferences: z.boolean().default(false),
  priceCents: cents.optional(),
  seller: email,
  source: z.enum(OFFER_SOURCES).optional(),
  eventType: z.enum(EVENT_TYPES).optional(),
  disposition: z.enum(OFFER_DISPOSITIONS).optional(),
  converted: z.boolean().default(false),
  // TASK-058: default false.
  followUpDone: z.boolean().default(false),
  /** When the offer was made (TASK-028); used only when the offer is inserted. Default: now. */
  createdAt: pastDateTime.optional(),
});

/** A reference / testimonial (BR-108). `image` is a file path relative to the seed file. */
const reference = z.strictObject({
  quoteFi: z.string().trim().min(1).max(5000),
  quoteEn: z.string().trim().min(1).max(5000).optional(),
  author: z.string().trim().min(1).max(200),
  active: z.boolean().default(true),
  image: z.string().trim().min(1).max(1000).optional(),
});

/** References compare by FI quote + author (trimmed) for idempotent re-runs. */
export const referenceKey = (r: { quoteFi: string; author: string }) => `${r.quoteFi.trim()}\u0000${r.author.trim()}`;

/** Keys of the pre-TASK-012 budget category format; rejected with a conversion hint. */
const LEGACY_CATEGORY_KEYS = ['nameFi', 'nameEn', 'budgeted'];
export const LEGACY_CATEGORY_HINT =
  'nameFi, nameEn and budgeted are no longer supported: give one "name" (use the old nameFi) and leave out ' +
  'actuals-only rows (budgeted: false, e.g. FUEL) or mark them "active": false; see seed/README.md';

const budgetCategory = z.strictObject(
  {
    code: z.string().regex(/^[A-Z][A-Z0-9_]*$/, 'must be UPPER_SNAKE_CASE').optional(),
    name,
    active: z.boolean().default(true),
  },
  {
    error: (issue) =>
      issue.code === 'unrecognized_keys' && issue.keys.some((k) => LEGACY_CATEGORY_KEYS.includes(k)) ? LEGACY_CATEGORY_HINT : undefined,
  },
);

/** Budget category names compare case-insensitively (like the app's DUPLICATE rule). */
export const categoryNameKey = (n: string) => n.trim().toLowerCase();

/** Client names compare case-insensitively and trimmed (like the app's DUPLICATE rule, BR-100). */
export const clientNameKey = (n: string) => n.trim().toLowerCase();

/**
 * The seed entry a budget row's `category` refers to: by `code` if an entry has that code, else by
 * name (case-insensitive).
 */
export function findSeedCategory<C extends { code?: string | undefined; name: string }>(categories: C[], ref: string): C | undefined {
  return categories.find((c) => c.code === ref) ?? categories.find((c) => categoryNameKey(c.name) === categoryNameKey(ref));
}

export const seedSchema = z.strictObject({
  partners: z
    .array(
      z.strictObject({
        name,
        email,
        language: z.enum(LANGUAGES).default('fi'),
        phone: z.string().trim().min(1).max(50).optional(),
        roles: personRoles,
      }),
    )
    .min(1),
  people: z.array(z.strictObject({ name, active: z.boolean().default(true), roles: personRoles })).default([]),
  lineupTemplates: z
    .array(
      z.strictObject({
        name,
        lines: z.array(lineupLine).max(MAX_LINEUP_LINES).optional(),
        // Legacy (before 2026-11-06): converted to `lines` like migration 20261106120000_lineup_lines.
        roles: z.array(legacyTemplateRole).min(1).optional(),
      }),
    )
    .default([]),
  // Fee settings are cents; offer settings (offers.*) are texts.
  settings: z.record(z.string(), z.union([cents, z.string().max(5000)])),
  budgetCategories: z.array(budgetCategory).default([]),
  clients: z.array(z.strictObject({ name, notes: z.string().max(5000).optional() })).default([]),
  events: z.array(event).default([]),
  offers: z.array(offer).default([]),
  references: z.array(reference).default([]),
  tasks: z
    .array(
      z.strictObject({
        title: name,
        description: z.string().max(5000).optional(),
        dueDate: isoDate.optional(),
        owner: email,
        status: z.enum(['OPEN', 'DONE']).default('OPEN'),
      }),
    )
    .default([]),
  hours: z
    .array(
      z.strictObject({
        partner: email,
        date: isoDate,
        comment: name,
        hours: z
          .number()
          .min(0.25)
          .max(24)
          .refine((h) => Number.isInteger(h * 4), 'must be in 0.25 steps'),
      }),
    )
    .default([]),
  budget: z
    .array(
      z.strictObject({
        year,
        category: z.string().min(1),
        budgetExpenseCents: cents.default(0),
        budgetIncomeCents: cents.default(0),
        actualExpenseCents: cents.default(0),
        actualIncomeCents: cents.default(0),
      }),
    )
    .default([]),
});

type ParsedSeed = z.output<typeof seedSchema>;

/** A lineup of the file with legacy `roles` already converted to `lines`. */
export interface SeedLineup {
  name: string;
  lines: LineupLineInput[];
}

export type SeedData = Omit<ParsedSeed, 'lineupTemplates'> & { lineupTemplates: SeedLineup[] };

/**
 * Lineup lines of a file entry: `lines` as given, or the legacy `roles` converted like the migration
 * 20261106120000_lineup_lines: the roles in order, then OFFICE, SALES and PRODUCTION with the file's
 * old `fees.*_default` settings (0 when the file doesn't have them).
 */
function lineupLinesOf(t: ParsedSeed['lineupTemplates'][number], settings: ParsedSeed['settings']): LineupLineInput[] {
  if (t.lines) return t.lines.map((l) => ({ type: l.type, description: l.description || null, defaultCents: l.defaultCents }));
  if (!t.roles) return [];
  const fee = (key: string) => {
    const v = settings[key];
    return typeof v === 'number' ? v : 0;
  };
  return [
    ...t.roles.map((r) => ({ type: r.role, description: null, defaultCents: r.defaultFeeCents })),
    { type: 'OFFICE', description: null, defaultCents: fee(LEGACY_FEE_SETTING_KEYS.officeDefault) },
    { type: 'SALES', description: null, defaultCents: fee(LEGACY_FEE_SETTING_KEYS.salesDefault) },
    { type: 'PRODUCTION', description: null, defaultCents: fee(LEGACY_FEE_SETTING_KEYS.productionDefault) },
  ];
}

export type ValidationResult = { ok: true; data: SeedData } | { ok: false; errors: string[] };

function duplicates(values: string[]): string[] {
  const seen = new Set<string>();
  const dup = new Set<string>();
  for (const v of values) (seen.has(v) ? dup : seen).add(v);
  return [...dup];
}

/**
 * Legacy alias (TASK-032, Gig → Event): files written before the rename have a top-level `gigs`
 * list. It is read as `events`; having both is an error. Other inputs pass through unchanged.
 */
export const LEGACY_EVENTS_KEY = 'gigs';

function normalizeLegacyKeys(input: unknown): { input: unknown; errors: string[] } {
  if (typeof input !== 'object' || input === null || Array.isArray(input) || !Object.hasOwn(input, LEGACY_EVENTS_KEY)) {
    return { input, errors: [] };
  }
  const { [LEGACY_EVENTS_KEY]: legacy, ...rest } = input as Record<string, unknown>;
  if (Object.hasOwn(rest, 'events')) {
    return { input, errors: [`${LEGACY_EVENTS_KEY}: legacy name of events; use only one of "events" and "${LEGACY_EVENTS_KEY}"`] };
  }
  return { input: { ...rest, events: legacy }, errors: [] };
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const records = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? v.filter(isRecord) : []);

/**
 * Removed roles: HORN_1, HORN_2 and TECHNICIAN (TASK-041) and PIANO (TASK-052) in person roles,
 * lineup roles/lines and cost line types are converted before validation, the same way the
 * migrations 20261030120000_remove_legacy_roles and 20261107120000_piano_keys_person_roles converted
 * stored data (`convertLegacyRole`). HORN_2 is decided by the person's roles in the file (cost lines:
 * the line's person; no person or no roles → TROMBONE). OTHER_ROLE is silently dropped from person
 * roles (it is a cost line type only, 2026-11-07). A person's converted roles are de-duplicated
 * (e.g. PIANO + KEYS → KEYS) unless the file's list already repeats a code, which stays an error.
 * Returns a converted copy; anything that isn't in the expected shape is left for the schema to report.
 */
function convertLegacyRoles(input: unknown): unknown {
  if (!isRecord(input)) return input;
  const rolesByName = new Map<string, unknown[]>();
  for (const p of [...records(input.partners), ...records(input.people)]) {
    if (typeof p.name === 'string' && Array.isArray(p.roles) && !rolesByName.has(p.name.trim())) {
      rolesByName.set(p.name.trim(), p.roles);
    }
  }
  const convertPerson = (p: unknown): unknown => {
    if (!isRecord(p) || !Array.isArray(p.roles) || !p.roles.some((r) => isLegacyRole(r) || r === 'OTHER_ROLE')) return p;
    const roles: unknown[] = p.roles.filter((r) => r !== 'OTHER_ROLE');
    const converted = roles.map((r) => (isLegacyRole(r) ? convertLegacyRole(r, roles) : r));
    const hadDuplicates = new Set(roles).size !== roles.length;
    return { ...p, roles: hadDuplicates ? converted : [...new Set(converted)] };
  };
  const convertTemplate = (t: unknown): unknown => {
    if (!isRecord(t)) return t;
    const out: Record<string, unknown> = { ...t };
    if (Array.isArray(t.roles)) {
      out.roles = t.roles.map((r: unknown) => (isRecord(r) && isLegacyRole(r.role) ? { ...r, role: convertLegacyRole(r.role) } : r));
    }
    if (Array.isArray(t.lines)) {
      out.lines = t.lines.map((l: unknown) => (isRecord(l) && isLegacyRole(l.type) ? { ...l, type: convertLegacyRole(l.type) } : l));
    }
    return out;
  };
  const convertLine = (c: unknown): unknown => {
    if (!isRecord(c) || !isLegacyRole(c.type)) return c;
    const personRoles = typeof c.person === 'string' ? (rolesByName.get(c.person.trim()) ?? []) : [];
    return { ...c, type: convertLegacyRole(c.type, personRoles) };
  };
  const convertEvent = (e: unknown): unknown =>
    isRecord(e) && Array.isArray(e.costLines) ? { ...e, costLines: e.costLines.map(convertLine) } : e;

  const out: Record<string, unknown> = { ...input };
  if (Array.isArray(input.partners)) out.partners = input.partners.map(convertPerson);
  if (Array.isArray(input.people)) out.people = input.people.map(convertPerson);
  if (Array.isArray(input.lineupTemplates)) out.lineupTemplates = input.lineupTemplates.map(convertTemplate);
  if (Array.isArray(input.events)) out.events = input.events.map(convertEvent);
  return out;
}

export function validateSeed(rawInput: unknown): ValidationResult {
  const normalized = normalizeLegacyKeys(rawInput);
  if (normalized.errors.length > 0) return { ok: false, errors: normalized.errors };
  const parsed = seedSchema.safeParse(convertLegacyRoles(normalized.input));
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map((i) => `${i.path.map(String).join('.') || '(root)'}: ${i.message}`),
    };
  }
  const parsedData = parsed.data;
  const errors: string[] = [];

  parsedData.lineupTemplates.forEach((t, i) => {
    if (t.lines && t.roles) errors.push(`lineupTemplates.${i}: use either lines or the legacy roles, not both`);
    t.lines?.forEach((l, j) => {
      if (DESCRIPTION_REQUIRED_TYPES.has(l.type) && !l.description)
        errors.push(`lineupTemplates.${i}.lines.${j}.description: required for ${l.type}`);
    });
  });
  const data: SeedData = {
    ...parsedData,
    lineupTemplates: parsedData.lineupTemplates.map((t) => ({ name: t.name, lines: lineupLinesOf(t, parsedData.settings) })),
  };

  const partnerEmails = new Set(data.partners.map((p) => p.email));
  const personNames = new Set([...data.partners.map((p) => p.name), ...data.people.map((p) => p.name)]);
  const templates = new Set(data.lineupTemplates.map((t) => lineupNameKey(t.name)));

  for (const d of duplicates(data.partners.map((p) => p.email))) errors.push(`partners: duplicate email ${d}`);
  for (const d of duplicates([...data.partners.map((p) => p.name), ...data.people.map((p) => p.name)]))
    errors.push(`people: duplicate name "${d}" (partners are people too; don't list them again in people)`);
  for (const d of duplicates(data.lineupTemplates.map((t) => lineupNameKey(t.name))))
    errors.push(`lineupTemplates: duplicate name "${d}" (names are compared case-insensitively)`);
  for (const d of duplicates(data.budgetCategories.flatMap((c) => (c.code ? [c.code] : []))))
    errors.push(`budgetCategories: duplicate code ${d}`);
  for (const d of duplicates(data.budgetCategories.map((c) => categoryNameKey(c.name))))
    errors.push(`budgetCategories: duplicate name "${d}" (names are compared case-insensitively)`);

  for (const d of duplicates(data.clients.map((c) => clientNameKey(c.name))))
    errors.push(`clients: duplicate name "${d}" (names are compared case-insensitively)`);
  const clientKeys = new Set(data.clients.map((c) => clientNameKey(c.name)));

  for (const key of ALL_SETTING_KEYS) if (!(key in data.settings)) errors.push(`settings: missing ${key}`);
  for (const [key, value] of Object.entries(data.settings)) {
    if (ALL_SETTING_KEYS.includes(key as (typeof ALL_SETTING_KEYS)[number])) {
      if (typeof value !== 'number') errors.push(`settings.${key}: must be an amount in cents`);
    } else if (ALL_LEGACY_FEE_SETTING_KEYS.includes(key as (typeof ALL_LEGACY_FEE_SETTING_KEYS)[number])) {
      // Removed 2026-11-06 (lineups define all fees): only used to convert legacy lineup roles; not stored.
      if (typeof value !== 'number') errors.push(`settings.${key}: must be an amount in cents`);
    } else if (ALL_OPTIONAL_NUMBER_SETTING_KEYS.includes(key as (typeof ALL_OPTIONAL_NUMBER_SETTING_KEYS)[number])) {
      if (typeof value !== 'number') errors.push(`settings.${key}: must be a whole number`);
    } else if (key === PERFORMER_VAT_RATES_SETTING_KEY) {
      if (typeof value !== 'string' || parsePerformerVatRates(value) === null)
        errors.push(`settings.${key}: must be a text of comma-separated whole numbers 1…10000 (basis points), e.g. "1350,2550"`);
    } else if (ALL_OFFER_SETTING_KEYS.includes(key as (typeof ALL_OFFER_SETTING_KEYS)[number])) {
      if (typeof value !== 'string') errors.push(`settings.${key}: must be a text`);
    } else if (LEGACY_OFFER_SETTING_KEYS.includes(key as (typeof LEGACY_OFFER_SETTING_KEYS)[number])) {
      // Replaced by `references` (TASK-018); accepted so older files still load, but ignored.
    } else {
      errors.push(`settings: unknown key ${key}`);
    }
  }

  data.events.forEach((g, i) => {
    const at = `events.${i}`;
    if (g.endDate && g.endDate < g.startDate) errors.push(`${at}.endDate: before startDate`);
    if (!partnerEmails.has(g.seller)) errors.push(`${at}.seller: unknown partner ${g.seller}`);
    if (!partnerEmails.has(g.producer)) errors.push(`${at}.producer: unknown partner ${g.producer}`);
    if (g.lineupTemplate && !templates.has(lineupNameKey(g.lineupTemplate)))
      errors.push(`${at}.lineupTemplate: unknown template "${g.lineupTemplate}"`);
    if (!g.lineupTemplate && !g.lineupName) errors.push(`${at}: lineupTemplate or lineupName is required`);
    if (g.client && !clientKeys.has(clientNameKey(g.client)))
      errors.push(`${at}.client: unknown client "${g.client}" (list it in clients)`);
    if (g.invoiceRows && (g.invoiceStatus !== undefined || g.prepaymentCents !== undefined))
      errors.push(`${at}.invoiceRows: use either invoiceRows or the legacy invoiceStatus/prepaymentCents, not both`);
    g.costLines?.forEach((c, j) => {
      const lat = `${at}.costLines.${j}`;
      if (c.person && !personNames.has(c.person)) errors.push(`${lat}.person: unknown person "${c.person}"`);
      if (DESCRIPTION_REQUIRED_TYPES.has(c.type) && !c.description?.trim())
        errors.push(`${lat}.description: required for ${c.type}`);
      if (c.joinsLoadIn !== undefined && !isMusicianRole(c.type))
        errors.push(`${lat}.joinsLoadIn: only allowed for musician roles`);
      if (c.type === 'FUEL' && c.actualCents !== undefined) errors.push(`${lat}.actualCents: FUEL lines are never paid`);
      if ((c.actualCents === undefined) !== (c.paidBy === undefined))
        errors.push(`${lat}: actualCents and paidBy go together (a paid line needs both)`);
      if (c.paidBy && !partnerEmails.has(c.paidBy)) errors.push(`${lat}.paidBy: unknown partner ${c.paidBy}`);
    });
  });

  data.offers.forEach((o, i) => {
    const at = `offers.${i}`;
    if (!clientKeys.has(clientNameKey(o.client))) errors.push(`${at}.client: unknown client "${o.client}" (list it in clients)`);
    if (!partnerEmails.has(o.seller)) errors.push(`${at}.seller: unknown partner ${o.seller}`);
    if (o.converted && o.disposition !== undefined && o.disposition !== 'WON')
      errors.push(`${at}.disposition: a converted offer is WON (omit disposition or use WON)`);
  });
  for (const d of duplicates(data.offers.map((o) => `${clientNameKey(o.client)}/${o.eventName}/${o.eventDate}`)))
    errors.push(`offers: duplicate offer ${d} (client + eventName + eventDate)`);

  for (const d of duplicates(data.references.map(referenceKey)))
    errors.push(`references: duplicate reference "${d.split('\u0000')[1]}" with the same quoteFi (quoteFi + author)`);

  data.tasks.forEach((t, i) => {
    if (!partnerEmails.has(t.owner)) errors.push(`tasks.${i}.owner: unknown partner ${t.owner}`);
  });
  data.hours.forEach((h, i) => {
    if (!partnerEmails.has(h.partner)) errors.push(`hours.${i}.partner: unknown partner ${h.partner}`);
  });
  data.budget.forEach((b, i) => {
    if (!findSeedCategory(data.budgetCategories, b.category))
      errors.push(`budget.${i}.category: unknown category "${b.category}" (use a budgetCategories name or code)`);
  });
  const categoryKey = (ref: string) => {
    const c = findSeedCategory(data.budgetCategories, ref);
    return c ? categoryNameKey(c.name) : ref;
  };
  for (const d of duplicates(data.budget.map((b) => `${categoryKey(b.category)}/${b.year}`)))
    errors.push(`budget: duplicate row ${d}`);

  return errors.length > 0 ? { ok: false, errors } : { ok: true, data };
}
