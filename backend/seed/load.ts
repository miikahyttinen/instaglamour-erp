/**
 * Loads validated seed data in ONE transaction (UC-024): either everything is applied or nothing.
 *
 * Idempotency rules (natural keys):
 * - Reference data is upserted — the seed file wins:
 *   person (name), setting (key).
 * - Lineups (name, case-insensitive) are created with the file's lines when missing; an existing
 *   lineup's lines are set from the file only when it has no lines yet (lineups are edited in the
 *   app, 2026-11-06). Legacy `roles` are converted to lines by validateSeed.
 * - Partners (email, case-insensitive) are insert-only: created active when missing; an existing
 *   partner and its person are never changed (partner status is managed in the app, UC-032) —
 *   except the person's `roles`, see below.
 * - Person roles (partners and people, TASK-027) are set from the file only when the person has no
 *   roles yet, so app edits are never overwritten; filling them counts as `updated`.
 * - Business data is only inserted when its natural key is not in the database yet, so data
 *   partners have since edited in the app is never overwritten:
 *   budget category (code if given, else name, case-insensitive; removed rows count too — partners
 *   manage the rows in the app), client (name, case-insensitive, among non-deleted clients),
 *   event (startDate + venue + lineupName; an existing event's client is never changed),
 *   offer (client + eventName + eventDate; a `converted` offer also gets its event, BR-105), task (title + owner),
 *   hour entry (partner + date + comment), budget row (category + year),
 *   reference (quoteFi + author; appended after the existing ones, its photo copied to UPLOAD_DIR).
 *
 * The summary counts, per data type, the items created, updated (reference data changed by the file)
 * and skipped (already there). Loads hold an advisory lock, so seed runs and app imports (UC-035)
 * never run at the same time; `dryRun` rolls the whole load back after counting.
 */
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { copyFile, mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import type { Db } from '../src/db.js';
import { dateFromIso } from '../src/domain/dates.js';
import { defaultCostLines, type LineupLineInput } from '../src/domain/costLines.js';
import { findLineupByName, lockLineupNames, replaceLineupLines } from '../src/lineups/store.js';
import { legacyInvoiceRows } from '../src/domain/invoicing.js';
import {
  isMusicianRole,
  LEGACY_FEE_SETTING_KEYS,
  LEGACY_OFFER_SETTING_KEYS,
  normalizeRoles,
  OFFER_SETTING_KEYS,
  type PersonRole,
} from '../src/domain/enums.js';
import { newShareToken } from '../src/offers/shareToken.js';
import { convertOfferInTx } from '../src/offers/store.js';
import type { Prisma } from '../src/generated/prisma/client.js';
import { MAX_REFERENCE_IMAGE_BYTES } from '../src/references/store.js';
import { PARAMETER_KEYS } from '../src/settings/parameters.js';
import { detectImageType, readHead, UploadDir, type ImageContentType } from '../src/fileStore/uploadDir.js';
import { clientNameKey, findSeedCategory, lineupNameKey, referenceKey, validateSeed, type SeedData } from './schema.js';

type Tx = Prisma.TransactionClient;

export const LOCAL_SEED_FILE = 'seed.local.json';
export const EXAMPLE_SEED_FILE = 'seed.example.json';

/** `seed.local.json` (gitignored, real data) wins over the committed `seed.example.json`. */
export function resolveSeedFile(seedDir: string): string {
  const local = path.join(seedDir, LOCAL_SEED_FILE);
  return existsSync(local) ? local : path.join(seedDir, EXAMPLE_SEED_FILE);
}

/** What a load did to one kind of item (api-contract "Data import": ImportSummary). */
export interface SeedCounts {
  /** New items inserted. */
  created: number;
  /** Existing items changed per the re-run rules (person `active`, empty lineup's lines, setting value). */
  updated: number;
  /** Items already in the database and left as they are. */
  skipped: number;
}

export const SEED_SUMMARY_KEYS = [
  'partners',
  'people',
  'lineupTemplates',
  'settings',
  'budgetCategories',
  'clients',
  'events',
  'offers',
  'references',
  'tasks',
  'hours',
  'budget',
] as const;

/** Per entity (the seed file's top-level keys) how many items were created, updated or skipped. */
export type SeedSummary = Record<(typeof SEED_SUMMARY_KEYS)[number], SeedCounts>;

export function emptySeedSummary(): SeedSummary {
  return Object.fromEntries(SEED_SUMMARY_KEYS.map((k) => [k, { created: 0, updated: 0, skipped: 0 }])) as SeedSummary;
}

/**
 * Advisory lock key held for the whole load transaction: seed runs and app imports (UC-035) run one
 * at a time, so two concurrent loads of the same file can't both insert the same natural key.
 */
export const SEED_LOCK_KEY = 20261019035n;

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
/** An event's invoice rows from the file: `invoiceRows`, or the legacy status + prepayment converted (TASK-046). */
function invoiceRowsOf(g: SeedData['events'][number]) {
  if (g.invoiceRows) return g.invoiceRows;
  return legacyInvoiceRows(g.priceCents + g.additionalSalesCents, g.invoiceStatus ?? 'NONE', g.prepaymentCents ?? 0);
}

export async function emptyDatabase(tx: Tx): Promise<void> {
  await tx.session.deleteMany();
  await tx.importRun.deleteMany();
  await tx.purchaseOrderEvent.deleteMany();
  await tx.purchaseOrderLine.deleteMany();
  await tx.purchaseOrder.deleteMany();
  await tx.reference.deleteMany();
  await tx.offerEvent.deleteMany();
  await tx.eventHistory.deleteMany();
  await tx.attachment.deleteMany();
  await tx.invoiceRow.deleteMany();
  await tx.costLine.deleteMany();
  await tx.eventTechnicalSetupLegacy.deleteMany();
  await tx.event.deleteMany();
  await tx.offer.deleteMany();
  await tx.client.deleteMany();
  await tx.task.deleteMany();
  await tx.hourEntry.deleteMany();
  await tx.budgetYear.deleteMany();
  await tx.budgetCategoryLegacy.deleteMany();
  await tx.budgetCategory.deleteMany();
  await tx.lineupLine.deleteMany();
  await tx.lineupTemplate.deleteMany();
  await tx.setting.deleteMany();
  await tx.partner.deleteMany();
  await tx.person.deleteMany();
}

export interface LoadSeedOptions {
  /** Empty all data first. Reference photo files already in UPLOAD_DIR are left on disk. */
  reset?: boolean;
  /** Directory of the seed file: reference `image` paths are relative to it. */
  seedDir?: string;
  /** Where reference photos are copied (UPLOAD_DIR). Required when a reference has an image. */
  uploadDir?: string;
  /** Run the whole load, then roll it back: the summary is exact but nothing is saved. */
  dryRun?: boolean;
  /** Called inside the load transaction after the data is applied (not on a dry run), e.g. to log the import. */
  afterLoad?: (tx: Tx, summary: SeedSummary) => Promise<void>;
}

/** Thrown inside the transaction to roll a dry run back; carries the summary out. */
class DryRunRollback extends Error {
  constructor(readonly summary: SeedSummary) {
    super('dry run');
  }
}

/** A checked reference photo from the seed file, ready to be copied. */
interface SeedImage {
  source: string;
  contentType: ImageContentType;
  sizeBytes: number;
}

/** Check every reference photo (exists, ≤ 10 MB, PNG/JPG/WebP by content) before loading anything. */
async function checkReferenceImages(data: SeedData, options: LoadSeedOptions): Promise<Map<number, SeedImage>> {
  const images = new Map<number, SeedImage>();
  const errors: string[] = [];
  for (const [i, r] of data.references.entries()) {
    if (r.image === undefined) continue;
    const at = `references.${i}.image`;
    if (!options.seedDir || !options.uploadDir) {
      errors.push(`${at}: photos need the seed file's directory and UPLOAD_DIR (load the file with the seed command)`);
      continue;
    }
    const source = path.resolve(options.seedDir, r.image);
    let sizeBytes: number;
    try {
      const info = await stat(source);
      if (!info.isFile()) throw new Error('not a file');
      sizeBytes = info.size;
    } catch {
      errors.push(`${at}: file not found: ${r.image} (paths are relative to the seed file)`);
      continue;
    }
    if (sizeBytes > MAX_REFERENCE_IMAGE_BYTES) {
      errors.push(`${at}: ${r.image} is larger than 10 MB`);
      continue;
    }
    const contentType = detectImageType(await readHead(source));
    if (!contentType) {
      errors.push(`${at}: ${r.image} is not a PNG, JPG or WebP image`);
      continue;
    }
    images.set(i, { source, contentType, sizeBytes });
  }
  if (errors.length > 0) throw new SeedValidationError(errors);
  return images;
}

export async function loadSeed(db: Db, input: unknown, options: LoadSeedOptions = {}): Promise<SeedSummary> {
  const result = validateSeed(input);
  if (!result.ok) throw new SeedValidationError(result.errors);
  const data = result.data;
  const images = await checkReferenceImages(data, options);
  const uploads = options.uploadDir ? new UploadDir(options.uploadDir) : null;
  /** Photos copied during this run; removed again if the transaction fails (nothing is loaded). */
  const copied: string[] = [];
  const copyImage = async (image: SeedImage): Promise<string> => {
    await mkdir(uploads!.root, { recursive: true });
    const key = randomUUID();
    copied.push(key);
    await copyFile(image.source, uploads!.pathOf(key));
    return key;
  };

  try {
    return await db.$transaction(
      async (tx) => {
        // Released automatically at commit / rollback.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(${SEED_LOCK_KEY})`;
        if (options.reset) await emptyDatabase(tx);
        const summary = await applySeed(tx, data, images, copyImage);
        if (options.dryRun) throw new DryRunRollback(summary);
        await options.afterLoad?.(tx, summary);
        return summary;
      },
      { timeout: 120_000, maxWait: 10_000 },
    );
  } catch (err) {
    for (const key of copied) await uploads!.remove(key);
    if (err instanceof DryRunRollback) return err.summary;
    throw err;
  }
}

/**
 * TASK-027: the file's roles for a person, but only when the person has none yet (app edits are never
 * overwritten). Null = nothing to fill.
 */
function rolesToFill(current: readonly string[], fromFile: readonly string[] | undefined): PersonRole[] | null {
  if (!fromFile || fromFile.length === 0 || current.length > 0) return null;
  return normalizeRoles(fromFile);
}

async function upsertPersonByName(
  tx: Tx,
  name: string,
  active: boolean,
  roles: readonly PersonRole[] | undefined,
  counts: SeedCounts,
): Promise<string> {
  const existing = await tx.person.findFirst({ where: { name }, orderBy: { createdAt: 'asc' } });
  if (existing) {
    const data: { active?: boolean; roles?: PersonRole[] } = {};
    if (existing.active !== active) data.active = active;
    const fill = rolesToFill(existing.roles, roles);
    if (fill) data.roles = fill;
    if (Object.keys(data).length > 0) {
      await tx.person.update({ where: { id: existing.id }, data });
      counts.updated++;
    } else {
      counts.skipped++;
    }
    return existing.id;
  }
  counts.created++;
  return (await tx.person.create({ data: { name, active, roles: normalizeRoles(roles ?? []) } })).id;
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

async function applySeed(
  tx: Tx,
  data: SeedData,
  images: ReadonlyMap<number, SeedImage>,
  copyImage: (image: SeedImage) => Promise<string>,
): Promise<SeedSummary> {
  const summary = emptySeedSummary();

  // Partners (and their Person rows)
  const partnerByEmail = new Map<string, { id: string; personId: string }>();
  const personIdByName = new Map<string, string>();
  for (const p of data.partners) {
    const existing = await tx.partner.findFirst({ where: { email: { equals: p.email, mode: 'insensitive' } } });
    let partner: { id: string; personId: string };
    if (existing) {
      // Insert-only (UC-032): partners are managed in the app. An existing partner and its person are
      // never changed — in particular a partner removed in the app is never re-activated by a re-run.
      // The one exception (TASK-027): the person's roles are filled from the file when still empty.
      partner = existing;
      const person = await tx.person.findUniqueOrThrow({ where: { id: existing.personId }, select: { roles: true } });
      const fill = rolesToFill(person.roles, p.roles);
      if (fill) {
        await tx.person.update({ where: { id: existing.personId }, data: { roles: fill } });
        summary.partners.updated++;
      } else {
        summary.partners.skipped++;
      }
    } else {
      const unlinked = await tx.person.findFirst({ where: { name: p.name, partner: null } });
      let personId: string;
      if (unlinked) {
        personId = unlinked.id;
        const fill = rolesToFill(unlinked.roles, p.roles);
        if (fill) await tx.person.update({ where: { id: personId }, data: { roles: fill } });
      } else {
        personId = (await tx.person.create({ data: { name: p.name, roles: normalizeRoles(p.roles ?? []) } })).id;
      }
      // New partners are active. Language is a personal preference: only set when the partner is created.
      partner = await tx.partner.create({
        data: { email: p.email, personId, language: p.language, phone: p.phone ?? null, active: true },
      });
      summary.partners.created++;
    }
    partnerByEmail.set(p.email, partner);
    personIdByName.set(p.name, partner.personId);
  }

  // People
  for (const p of data.people) {
    personIdByName.set(p.name, await upsertPersonByName(tx, p.name, p.active, p.roles, summary.people));
  }

  // Lineups (created when missing; lines set only on a lineup without lines — the app owns them)
  await lockLineupNames(tx);
  const lineupByKey = new Map<string, { id: string; lines: LineupLineInput[] }>();
  for (const t of data.lineupTemplates) {
    const found = await findLineupByName(tx, t.name);
    const existing = found
      ? await tx.lineupTemplate.findUniqueOrThrow({ where: { id: found.id }, include: { lines: { orderBy: { position: 'asc' } } } })
      : null;
    const lineup = existing ?? (await tx.lineupTemplate.create({ data: { name: t.name.trim() } }));
    let lines: LineupLineInput[];
    if (existing && existing.lines.length > 0) {
      lines = existing.lines.map((l) => ({ type: l.type, description: l.description, defaultCents: l.defaultCents }));
      summary.lineupTemplates.skipped++;
    } else if (existing && t.lines.length === 0) {
      lines = [];
      summary.lineupTemplates.skipped++;
    } else {
      await replaceLineupLines(tx, lineup.id, t.lines);
      lines = t.lines;
      summary.lineupTemplates[existing ? 'updated' : 'created']++;
    }
    lineupByKey.set(lineupNameKey(t.name), { id: lineup.id, lines });
  }

  // Settings
  for (const [key, value] of Object.entries(data.settings)) {
    // Former reference texts (replaced by `references`) and default Spotify link (now a constant):
    // accepted in older files, not stored.
    if ((LEGACY_OFFER_SETTING_KEYS as readonly string[]).includes(key)) continue;
    // Former default fee settings (removed 2026-11-06): used only to convert legacy lineup roles.
    if ((Object.values(LEGACY_FEE_SETTING_KEYS) as string[]).includes(key)) continue;
    const values = typeof value === 'number' ? { valueCents: value, valueText: null } : { valueCents: null, valueText: value };
    const existing = await tx.setting.findUnique({ where: { key } });
    if (!existing) {
      await tx.setting.create({ data: { key, ...values } });
      summary.settings.created++;
    } else if (PARAMETER_KEYS.has(key)) {
      // Parameters are edited in the app (Settings → Parameters, TASK-057): never overwritten.
      summary.settings.skipped++;
    } else if (existing.valueCents !== values.valueCents || existing.valueText !== values.valueText) {
      await tx.setting.update({ where: { key }, data: values });
      summary.settings.updated++;
    } else {
      summary.settings.skipped++;
    }
  }
  // Offer defaults from the database (just upserted from the file if it has them).
  const textSetting = async (key: string) => {
    const text = (await tx.setting.findUnique({ where: { key } }))?.valueText;
    return text && text.trim() !== '' ? text : null;
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
      summary.budgetCategories.created++;
    } else {
      summary.budgetCategories.skipped++;
    }
    categoryIdByEntry.set(c, id);
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
      summary.clients.created++;
    } else {
      summary.clients.skipped++;
    }
    clientIdByKey.set(clientNameKey(name), id);
  }

  const partnerId = (email: string) => partnerByEmail.get(email)!.id;
  const partnerPersonId = (email: string) => partnerByEmail.get(email)!.personId;

  // Events (insert only)
  for (const g of data.events) {
    const template = g.lineupTemplate ? lineupByKey.get(lineupNameKey(g.lineupTemplate)) : undefined;
    const lineupName = g.lineupName ?? g.lineupTemplate!;
    const startDate = dateFromIso(g.startDate);
    const exists = await tx.event.findFirst({ where: { startDate, venue: g.venue, lineupName } });
    if (exists) {
      summary.events.skipped++;
      continue;
    }

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
        lineupLines: template?.lines ?? null,
        sellerPersonId: partnerPersonId(g.seller),
        producerPersonId: partnerPersonId(g.producer),
      });

    const createdBase = Date.now();
    const event = await tx.event.create({
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
        // From the file, not a change made in the app: created/status by stay null. Rows keep file order.
        invoiceRows: {
          createMany: {
            data: invoiceRowsOf(g).map((r, i) => ({
              ...r,
              createdAt: new Date(createdBase + i),
              statusAt: new Date(createdBase + i),
            })),
          },
        },
        // Cost lines are shown in creation order: give them strictly increasing timestamps.
        costLines: { createMany: { data: lines.map((l, i) => ({ ...l, createdAt: new Date(createdBase + i)})) } },
      },
    });
    await tx.eventHistory.create({ data: { eventId: event.id, type: 'CREATED', partnerId: partnerId(g.seller), details: {} } });
    summary.events.created++;
  }

  // Offers (insert only; natural key client + eventName + eventDate, deleted offers count too)
  const defaultIncludes = await textSetting(OFFER_SETTING_KEYS.defaultIncludes);
  for (const o of data.offers) {
    const clientId = clientIdByKey.get(clientNameKey(o.client))!;
    const eventDate = dateFromIso(o.eventDate);
    if (await tx.offer.findFirst({ where: { clientId, eventName: o.eventName, eventDate } })) {
      summary.offers.skipped++;
      continue;
    }
    const sellerId = partnerId(o.seller);
    const token = newShareToken();
    // Original creation time from the file (TASK-028), else now; the creation event gets the same time.
    const createdAt = o.createdAt ? new Date(o.createdAt) : new Date();
    const offer = await tx.offer.create({
      data: {
        clientId,
        eventName: o.eventName,
        eventDate,
        venue: o.venue,
        city: o.city ?? null,
        lineup: o.lineup,
        includesText: o.includesText ?? defaultIncludes,
        showReferences: o.showReferences,
        priceCents: o.priceCents ?? null,
        sellerId,
        source: o.source ?? null,
        eventType: o.eventType ?? null,
        disposition: o.disposition ?? 'PENDING',
        shareToken: token.token,
        shareTokenHash: token.hash,
        createdAt,
        updatedAt: createdAt,
      },
    });
    await tx.offerEvent.create({
      data: { offerId: offer.id, type: 'CREATED', partnerId: sellerId, details: {}, at: createdAt, createdAt, updatedAt: createdAt },
    });
    if (o.converted) await convertOfferInTx(tx, { offerId: offer.id, partnerId: sellerId, historical: true });
    summary.offers.created++;
  }

  // Tasks (insert only)
  for (const t of data.tasks) {
    const ownerId = partnerId(t.owner);
    if (await tx.task.findFirst({ where: { title: t.title, ownerId } })) {
      summary.tasks.skipped++;
      continue;
    }
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
    summary.tasks.created++;
  }

  // Hours (insert only)
  for (const h of data.hours) {
    const pid = partnerId(h.partner);
    const date = dateFromIso(h.date);
    if (await tx.hourEntry.findFirst({ where: { partnerId: pid, date, comment: h.comment } })) {
      summary.hours.skipped++;
      continue;
    }
    await tx.hourEntry.create({ data: { partnerId: pid, date, comment: h.comment, hours: h.hours } });
    summary.hours.created++;
  }

  // Budget rows (insert only)
  for (const b of data.budget) {
    const categoryId = categoryIdByEntry.get(findSeedCategory(data.budgetCategories, b.category)!)!;
    if (await tx.budgetYear.findUnique({ where: { categoryId_year: { categoryId, year: b.year } } })) {
      summary.budget.skipped++;
      continue;
    }
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
    summary.budget.created++;
  }

  // References (insert only: partners manage them in the app). Appended in listed order.
  const existingReferences = await tx.reference.findMany({ select: { quoteFi: true, author: true } });
  const referenceKeys = new Set(existingReferences.map(referenceKey));
  for (const [i, r] of data.references.entries()) {
    if (referenceKeys.has(referenceKey(r))) {
      summary.references.skipped++;
      continue;
    }
    const { _max } = await tx.reference.aggregate({ _max: { sortOrder: true } });
    const image = images.get(i);
    const photo = image
      ? { imageStorageKey: await copyImage(image), imageContentType: image.contentType, imageSizeBytes: image.sizeBytes, imageUploadedAt: new Date() }
      : {};
    await tx.reference.create({
      data: {
        quoteFi: r.quoteFi,
        quoteEn: r.quoteEn ?? null,
        author: r.author,
        active: r.active,
        sortOrder: (_max.sortOrder ?? -1) + 1,
        ...photo,
      },
    });
    referenceKeys.add(referenceKey(r));
    summary.references.created++;
  }

  return summary;
}
