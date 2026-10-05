/**
 * Seed file format (UC-024). Documented in seed/README.md.
 * `validateSeed` returns every problem found (structure + cross references) so the developer
 * can fix the file in one go; nothing is loaded unless the whole file is valid.
 */
import { z } from 'zod';
import { isIsoDate } from '../src/domain/dates.js';
import { ALL_SETTING_KEYS, COST_TYPES, DESCRIPTION_REQUIRED_TYPES, isMusicianRole, LANGUAGES, LOGISTICS, TECHNICAL_SETUPS } from '../src/domain/enums.js';

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

const costLine = z.strictObject({
  type: z.enum(COST_TYPES),
  person: name.optional(),
  description: z.string().max(500).optional(),
  budgetedCents: cents,
  joinsLoadIn: z.boolean().optional(),
  actualCents: cents.optional(),
  paidBy: email.optional(),
});

const gig = z.strictObject({
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
  seller: email,
  producer: email,
  priceCents: cents,
  additionalSalesCents: cents.default(0),
  additionalSalesDescription: z.string().max(500).optional(),
  notes: z.string().max(5000).optional(),
  costLines: z.array(costLine).optional(),
});

export const seedSchema = z.strictObject({
  partners: z
    .array(z.strictObject({ name, email, language: z.enum(LANGUAGES).default('fi') }))
    .min(1),
  people: z.array(z.strictObject({ name, active: z.boolean().default(true) })).default([]),
  lineupTemplates: z
    .array(
      z.strictObject({
        name,
        roles: z.array(z.strictObject({ role: z.enum(COST_TYPES), defaultFeeCents: cents })).min(1),
      }),
    )
    .default([]),
  settings: z.record(z.string(), cents),
  budgetCategories: z
    .array(
      z.strictObject({
        code: z.string().regex(/^[A-Z][A-Z0-9_]*$/, 'must be UPPER_SNAKE_CASE'),
        nameFi: name,
        nameEn: name,
        budgeted: z.boolean().default(true),
        active: z.boolean().default(true),
      }),
    )
    .default([]),
  gigs: z.array(gig).default([]),
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

export type SeedData = z.output<typeof seedSchema>;

export type ValidationResult = { ok: true; data: SeedData } | { ok: false; errors: string[] };

function duplicates(values: string[]): string[] {
  const seen = new Set<string>();
  const dup = new Set<string>();
  for (const v of values) (seen.has(v) ? dup : seen).add(v);
  return [...dup];
}

export function validateSeed(input: unknown): ValidationResult {
  const parsed = seedSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map((i) => `${i.path.map(String).join('.') || '(root)'}: ${i.message}`),
    };
  }
  const data = parsed.data;
  const errors: string[] = [];

  const partnerEmails = new Set(data.partners.map((p) => p.email));
  const personNames = new Set([...data.partners.map((p) => p.name), ...data.people.map((p) => p.name)]);
  const templates = new Map(data.lineupTemplates.map((t) => [t.name, t]));
  const categoryCodes = new Set(data.budgetCategories.map((c) => c.code));

  for (const d of duplicates(data.partners.map((p) => p.email))) errors.push(`partners: duplicate email ${d}`);
  for (const d of duplicates([...data.partners.map((p) => p.name), ...data.people.map((p) => p.name)]))
    errors.push(`people: duplicate name "${d}" (partners are people too; don't list them again in people)`);
  for (const d of duplicates(data.lineupTemplates.map((t) => t.name))) errors.push(`lineupTemplates: duplicate name "${d}"`);
  for (const d of duplicates(data.budgetCategories.map((c) => c.code))) errors.push(`budgetCategories: duplicate code ${d}`);

  for (const key of ALL_SETTING_KEYS) if (!(key in data.settings)) errors.push(`settings: missing ${key}`);
  for (const key of Object.keys(data.settings))
    if (!ALL_SETTING_KEYS.includes(key as (typeof ALL_SETTING_KEYS)[number])) errors.push(`settings: unknown key ${key}`);

  data.gigs.forEach((g, i) => {
    const at = `gigs.${i}`;
    if (g.endDate && g.endDate < g.startDate) errors.push(`${at}.endDate: before startDate`);
    if (!partnerEmails.has(g.seller)) errors.push(`${at}.seller: unknown partner ${g.seller}`);
    if (!partnerEmails.has(g.producer)) errors.push(`${at}.producer: unknown partner ${g.producer}`);
    if (g.lineupTemplate && !templates.has(g.lineupTemplate))
      errors.push(`${at}.lineupTemplate: unknown template "${g.lineupTemplate}"`);
    if (!g.lineupTemplate && !g.lineupName) errors.push(`${at}: lineupTemplate or lineupName is required`);
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

  data.tasks.forEach((t, i) => {
    if (!partnerEmails.has(t.owner)) errors.push(`tasks.${i}.owner: unknown partner ${t.owner}`);
  });
  data.hours.forEach((h, i) => {
    if (!partnerEmails.has(h.partner)) errors.push(`hours.${i}.partner: unknown partner ${h.partner}`);
  });
  data.budget.forEach((b, i) => {
    const category = data.budgetCategories.find((c) => c.code === b.category);
    if (!categoryCodes.has(b.category)) errors.push(`budget.${i}.category: unknown category ${b.category}`);
    else if (category && !category.budgeted && (b.budgetExpenseCents !== 0 || b.budgetIncomeCents !== 0))
      errors.push(`budget.${i}: category ${b.category} is actuals-only; budget amounts must be 0`);
  });
  for (const d of duplicates(data.budget.map((b) => `${b.category}/${b.year}`)))
    errors.push(`budget: duplicate row ${d}`);

  return errors.length > 0 ? { ok: false, errors } : { ok: true, data };
}
