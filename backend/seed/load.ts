/**
 * Loads validated seed data in ONE transaction (UC-024): either everything is applied or nothing.
 *
 * Idempotency rules (natural keys):
 * - Reference data is upserted — the seed file wins:
 *   partner (email), person (name), lineup template (name; roles replaced), setting (key).
 * - Business data is only inserted when its natural key is not in the database yet, so data
 *   partners have since edited in the app is never overwritten:
 *   budget category (code if given, else name, case-insensitive; removed rows count too — partners
 *   manage the rows in the app), client (name, case-insensitive, among non-deleted clients),
 *   gig (startDate + venue + lineupName; an existing gig's client is never changed), task (title + owner),
 *   hour entry (partner + date + comment), budget row (category + year).
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { Db } from '../src/db.js';
import { dateFromIso } from '../src/domain/dates.js';
import { defaultCostLines } from '../src/domain/costLines.js';
import { isMusicianRole, SETTING_KEYS } from '../src/domain/enums.js';
import type { Prisma } from '../src/generated/prisma/client.js';
import { clientNameKey, findSeedCategory, validateSeed, type SeedData } from './schema.js';

type Tx = Prisma.TransactionClient;

export const LOCAL_SEED_FILE = 'seed.local.json';
export const EXAMPLE_SEED_FILE = 'seed.example.json';

/** `seed.local.json` (gitignored, real data) wins over the committed `seed.example.json`. */
export function resolveSeedFile(seedDir: string): string {
  const local = path.join(seedDir, LOCAL_SEED_FILE);
  return existsSync(local) ? local : path.join(seedDir, EXAMPLE_SEED_FILE);
}

export interface SeedSummary {
  partners: number;
  people: number;
  lineupTemplates: number;
  settings: number;
  budgetCategories: number;
  budgetCategoriesCreated: number;
  clients: number;
  clientsCreated: number;
  gigsCreated: number;
  tasksCreated: number;
  hoursCreated: number;
  budgetRowsCreated: number;
}

export class SeedValidationError extends Error {
  constructor(readonly errors: string[]) {
    super(`Seed file is invalid:\n  - ${errors.join('\n  - ')}`);
    this.name = 'SeedValidationError';
  }
}

export function readSeedFile(file: string): unknown {
  let text: string;
  try {
    text = readFileSync(file, 'utf8');
  } catch (err) {
    throw new SeedValidationError([`cannot read ${file}: ${(err as Error).message}`]);
  }
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new SeedValidationError([`${path.basename(file)} is not valid JSON: ${(err as Error).message}`]);
  }
}

/** Delete all application data (keeps the schema). Order respects foreign keys. */
export async function emptyDatabase(tx: Tx): Promise<void> {
  await tx.session.deleteMany();
  await tx.gigEvent.deleteMany();
  await tx.attachment.deleteMany();
  await tx.costLine.deleteMany();
  await tx.gigTechnicalSetupLegacy.deleteMany();
  await tx.gig.deleteMany();
  await tx.client.deleteMany();
  await tx.task.deleteMany();
  await tx.hourEntry.deleteMany();
  await tx.budgetYear.deleteMany();
  await tx.budgetCategoryLegacy.deleteMany();
  await tx.budgetCategory.deleteMany();
  await tx.templateRole.deleteMany();
  await tx.lineupTemplate.deleteMany();
  await tx.setting.deleteMany();
  await tx.partner.deleteMany();
  await tx.person.deleteMany();
}

export async function loadSeed(db: Db, input: unknown, options: { reset?: boolean } = {}): Promise<SeedSummary> {
  const result = validateSeed(input);
  if (!result.ok) throw new SeedValidationError(result.errors);
  const data = result.data;

  return db.$transaction(
    async (tx) => {
      if (options.reset) await emptyDatabase(tx);
      return applySeed(tx, data);
    },
    { timeout: 120_000, maxWait: 10_000 },
  );
}

async function upsertPersonByName(tx: Tx, name: string, active: boolean): Promise<string> {
  const existing = await tx.person.findFirst({ where: { name }, orderBy: { createdAt: 'asc' } });
  if (existing) {
    if (existing.active !== active) await tx.person.update({ where: { id: existing.id }, data: { active } });
    return existing.id;
  }
  return (await tx.person.create({ data: { name, active } })).id;
}

/**
 * The database row a seed category stands for: by `code` if given, else by name (case-insensitive,
 * like the app's DUPLICATE rule). Removed rows count too, so a re-run never brings back a row the
 * partners removed; an active row wins over a removed one with the same name.
 */
async function findCategory(tx: Tx, c: SeedData['budgetCategories'][number]): Promise<{ id: string } | null> {
  if (c.code) {
    const byCode = await tx.budgetCategory.findUnique({ where: { code: c.code }, select: { id: true } });
    if (byCode) return byCode;
  }
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT "id"::text FROM "budget_category"
    WHERE lower(btrim("name")) = lower(btrim(${c.name}))
    ORDER BY "active" DESC, "updated_at" DESC
    LIMIT 1`;
  return rows[0] ?? null;
}

async function applySeed(tx: Tx, data: SeedData): Promise<SeedSummary> {
  const summary: SeedSummary = {
    partners: 0,
    people: 0,
    lineupTemplates: 0,
    settings: 0,
    budgetCategories: 0,
    budgetCategoriesCreated: 0,
    clients: 0,
    clientsCreated: 0,
    gigsCreated: 0,
    tasksCreated: 0,
    hoursCreated: 0,
    budgetRowsCreated: 0,
  };

  // Partners (and their Person rows)
  const partnerByEmail = new Map<string, { id: string; personId: string }>();
  const personIdByName = new Map<string, string>();
  for (const p of data.partners) {
    const existing = await tx.partner.findFirst({ where: { email: { equals: p.email, mode: 'insensitive' } } });
    let partner: { id: string; personId: string };
    if (existing) {
      await tx.person.update({ where: { id: existing.personId }, data: { name: p.name, active: true } });
      partner = existing;
    } else {
      const unlinked = await tx.person.findFirst({ where: { name: p.name, partner: null } });
      const personId = unlinked?.id ?? (await tx.person.create({ data: { name: p.name } })).id;
      // Language is a personal preference: only set when the partner is first created.
      partner = await tx.partner.create({ data: { email: p.email, personId, language: p.language } });
    }
    partnerByEmail.set(p.email, partner);
    personIdByName.set(p.name, partner.personId);
    summary.partners++;
  }

  // People
  for (const p of data.people) {
    personIdByName.set(p.name, await upsertPersonByName(tx, p.name, p.active));
    summary.people++;
  }

  // Lineup templates (roles replaced)
  const templateByName = new Map<string, { id: string; roles: SeedData['lineupTemplates'][number]['roles'] }>();
  for (const t of data.lineupTemplates) {
    const template = await tx.lineupTemplate.upsert({ where: { name: t.name }, create: { name: t.name }, update: {} });
    await tx.templateRole.deleteMany({ where: { templateId: template.id } });
    await tx.templateRole.createMany({
      data: t.roles.map((r, position) => ({ templateId: template.id, position, role: r.role, defaultFeeCents: r.defaultFeeCents })),
    });
    templateByName.set(t.name, { id: template.id, roles: t.roles });
    summary.lineupTemplates++;
  }

  // Settings
  for (const [key, valueCents] of Object.entries(data.settings)) {
    await tx.setting.upsert({ where: { key }, create: { key, valueCents }, update: { valueCents } });
    summary.settings++;
  }
  const fees = {
    officeDefaultCents: data.settings[SETTING_KEYS.officeDefault] ?? 0,
    salesDefaultCents: data.settings[SETTING_KEYS.salesDefault] ?? 0,
    productionDefaultCents: data.settings[SETTING_KEYS.productionDefault] ?? 0,
  };

  // Budget categories (insert only: partners manage the rows in the app)
  const categoryIdByEntry = new Map<SeedData['budgetCategories'][number], string>();
  for (const c of data.budgetCategories) {
    let id = (await findCategory(tx, c))?.id;
    if (!id) {
      // Appended after the existing rows, in listed order (sort order = creation order).
      const { _max } = await tx.budgetCategory.aggregate({ _max: { sortOrder: true } });
      const sortOrder = (_max.sortOrder ?? -1) + 1;
      id = (await tx.budgetCategory.create({ data: { code: c.code ?? null, name: c.name, active: c.active, sortOrder } })).id;
      summary.budgetCategoriesCreated++;
    }
    categoryIdByEntry.set(c, id);
    summary.budgetCategories++;
  }

  // Clients (insert only: partners manage them in the app)
  const clientIdByKey = new Map<string, string>();
  for (const c of data.clients) {
    const name = c.name.trim();
    const rows = await tx.$queryRaw<{ id: string }[]>`
      SELECT "id"::text FROM "client" WHERE "deleted_at" IS NULL AND lower(btrim("name")) = lower(btrim(${name})) LIMIT 1`;
    let id = rows[0]?.id;
    if (!id) {
      id = (await tx.client.create({ data: { name, notes: c.notes?.trim() || null } })).id;
      summary.clientsCreated++;
    }
    clientIdByKey.set(clientNameKey(name), id);
    summary.clients++;
  }

  const partnerId = (email: string) => partnerByEmail.get(email)!.id;
  const partnerPersonId = (email: string) => partnerByEmail.get(email)!.personId;

  // Gigs (insert only)
  for (const g of data.gigs) {
    const template = g.lineupTemplate ? templateByName.get(g.lineupTemplate) : undefined;
    const lineupName = g.lineupName ?? g.lineupTemplate!;
    const startDate = dateFromIso(g.startDate);
    const exists = await tx.gig.findFirst({ where: { startDate, venue: g.venue, lineupName } });
    if (exists) continue;

    const lines =
      g.costLines?.map((c) => ({
        type: c.type,
        personId: c.person ? (personIdByName.get(c.person) ?? null) : null,
        description: c.description ?? null,
        budgetedCents: c.budgetedCents,
        joinsLoadIn: isMusicianRole(c.type) ? (c.joinsLoadIn ?? true) : null,
        actualCents: c.actualCents ?? null,
        paidAt: c.actualCents !== undefined ? new Date() : null,
        paidById: c.paidBy ? partnerId(c.paidBy) : null,
      })) ??
      defaultCostLines({
        templateRoles: template?.roles ?? [],
        sellerPersonId: partnerPersonId(g.seller),
        producerPersonId: partnerPersonId(g.producer),
        fees,
      });

    const createdBase = Date.now();
    const gig = await tx.gig.create({
      data: {
        startDate,
        endDate: g.endDate ? dateFromIso(g.endDate) : null,
        status: g.status,
        lineupTemplateId: template?.id ?? null,
        lineupName,
        venue: g.venue,
        technicalSetup: g.technicalSetup ?? null,
        logistics: g.logistics ?? null,
        houseTechnician: g.houseTechnician,
        sellerId: partnerId(g.seller),
        producerId: partnerId(g.producer),
        priceCents: g.priceCents,
        additionalSalesCents: g.additionalSalesCents,
        additionalSalesDescription: g.additionalSalesDescription ?? null,
        notes: g.notes ?? null,
        clientId: g.client ? clientIdByKey.get(clientNameKey(g.client))! : null,
        // Cost lines are shown in creation order: give them strictly increasing timestamps.
        costLines: { createMany: { data: lines.map((l, i) => ({ ...l, createdAt: new Date(createdBase + i)})) } },
      },
    });
    await tx.gigEvent.create({ data: { gigId: gig.id, type: 'CREATED', partnerId: partnerId(g.seller), details: {} } });
    summary.gigsCreated++;
  }

  // Tasks (insert only)
  for (const t of data.tasks) {
    const ownerId = partnerId(t.owner);
    if (await tx.task.findFirst({ where: { title: t.title, ownerId } })) continue;
    await tx.task.create({
      data: {
        title: t.title,
        description: t.description ?? null,
        dueDate: t.dueDate ? dateFromIso(t.dueDate) : null,
        ownerId,
        status: t.status,
        completedAt: t.status === 'DONE' ? new Date() : null,
      },
    });
    summary.tasksCreated++;
  }

  // Hours (insert only)
  for (const h of data.hours) {
    const pid = partnerId(h.partner);
    const date = dateFromIso(h.date);
    if (await tx.hourEntry.findFirst({ where: { partnerId: pid, date, comment: h.comment } })) continue;
    await tx.hourEntry.create({ data: { partnerId: pid, date, comment: h.comment, hours: h.hours } });
    summary.hoursCreated++;
  }

  // Budget rows (insert only)
  for (const b of data.budget) {
    const categoryId = categoryIdByEntry.get(findSeedCategory(data.budgetCategories, b.category)!)!;
    if (await tx.budgetYear.findUnique({ where: { categoryId_year: { categoryId, year: b.year } } })) continue;
    await tx.budgetYear.create({
      data: {
        categoryId,
        year: b.year,
        budgetExpenseCents: b.budgetExpenseCents,
        budgetIncomeCents: b.budgetIncomeCents,
        actualExpenseCents: b.actualExpenseCents,
        actualIncomeCents: b.actualIncomeCents,
      },
    });
    summary.budgetRowsCreated++;
  }

  return summary;
}
