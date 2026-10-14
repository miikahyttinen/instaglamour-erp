/**
 * Loads validated seed data in ONE transaction (UC-024): either everything is applied or nothing.
 *
 * Idempotency rules (natural keys):
 * - Reference data is upserted — the seed file wins:
 *   person (name), lineup template (name; roles replaced), setting (key).
 * - Partners (email, case-insensitive) are insert-only: created active when missing; an existing
 *   partner and its person are never changed (partner status is managed in the app, UC-032).
 * - Business data is only inserted when its natural key is not in the database yet, so data
 *   partners have since edited in the app is never overwritten:
 *   budget category (code if given, else name, case-insensitive; removed rows count too — partners
 *   manage the rows in the app), client (name, case-insensitive, among non-deleted clients),
 *   gig (startDate + venue + lineupName; an existing gig's client is never changed),
 *   offer (client + eventName + eventDate; a `converted` offer also gets its gig, BR-105), task (title + owner),
 *   hour entry (partner + date + comment), budget row (category + year),
 *   reference (quoteFi + author; appended after the existing ones, its photo copied to UPLOAD_DIR).
 */
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { copyFile, mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import type { Db } from '../src/db.js';
import { dateFromIso } from '../src/domain/dates.js';
import { defaultCostLines } from '../src/domain/costLines.js';
import { isMusicianRole, LEGACY_OFFER_SETTING_KEYS, OFFER_SETTING_KEYS, SETTING_KEYS } from '../src/domain/enums.js';
import { newShareToken } from '../src/offers/shareToken.js';
import { convertOfferInTx } from '../src/offers/store.js';
import type { Prisma } from '../src/generated/prisma/client.js';
import { MAX_REFERENCE_IMAGE_BYTES } from '../src/references/store.js';
import { detectImageType, readHead, UploadDir, type ImageContentType } from '../src/fileStore/uploadDir.js';
import { clientNameKey, findSeedCategory, referenceKey, validateSeed, type SeedData } from './schema.js';

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
  offersCreated: number;
  tasksCreated: number;
  hoursCreated: number;
  budgetRowsCreated: number;
  referencesCreated: number;
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
  await tx.reference.deleteMany();
  await tx.offerEvent.deleteMany();
  await tx.gigEvent.deleteMany();
  await tx.attachment.deleteMany();
  await tx.costLine.deleteMany();
  await tx.gigTechnicalSetupLegacy.deleteMany();
  await tx.gig.deleteMany();
  await tx.offer.deleteMany();
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

export interface LoadSeedOptions {
  /** Empty all data first. Reference photo files already in UPLOAD_DIR are left on disk. */
  reset?: boolean;
  /** Directory of the seed file: reference `image` paths are relative to it. */
  seedDir?: string;
  /** Where reference photos are copied (UPLOAD_DIR). Required when a reference has an image. */
  uploadDir?: string;
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
        if (options.reset) await emptyDatabase(tx);
        return applySeed(tx, data, images, copyImage);
      },
      { timeout: 120_000, maxWait: 10_000 },
    );
  } catch (err) {
    for (const key of copied) await uploads!.remove(key);
    throw err;
  }
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

async function applySeed(
  tx: Tx,
  data: SeedData,
  images: ReadonlyMap<number, SeedImage>,
  copyImage: (image: SeedImage) => Promise<string>,
): Promise<SeedSummary> {
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
    offersCreated: 0,
    tasksCreated: 0,
    hoursCreated: 0,
    budgetRowsCreated: 0,
    referencesCreated: 0,
  };

  // Partners (and their Person rows)
  const partnerByEmail = new Map<string, { id: string; personId: string }>();
  const personIdByName = new Map<string, string>();
  for (const p of data.partners) {
    const existing = await tx.partner.findFirst({ where: { email: { equals: p.email, mode: 'insensitive' } } });
    let partner: { id: string; personId: string };
    if (existing) {
      // Insert-only (UC-032): partners are managed in the app. An existing partner and its person are
      // never changed — in particular a partner removed in the app is never re-activated by a re-run.
      partner = existing;
    } else {
      const unlinked = await tx.person.findFirst({ where: { name: p.name, partner: null } });
      const personId = unlinked?.id ?? (await tx.person.create({ data: { name: p.name } })).id;
      // New partners are active. Language is a personal preference: only set when the partner is created.
      partner = await tx.partner.create({
        data: { email: p.email, personId, language: p.language, phone: p.phone ?? null, active: true },
      });
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
  for (const [key, value] of Object.entries(data.settings)) {
    // Former reference texts (replaced by `references`): accepted in older files, not stored.
    if ((LEGACY_OFFER_SETTING_KEYS as readonly string[]).includes(key)) continue;
    const values = typeof value === 'number' ? { valueCents: value, valueText: null } : { valueCents: null, valueText: value };
    await tx.setting.upsert({ where: { key }, create: { key, ...values }, update: values });
    summary.settings++;
  }
  const centsSetting = (key: string) => {
    const v = data.settings[key];
    return typeof v === 'number' ? v : 0;
  };
  const fees = {
    officeDefaultCents: centsSetting(SETTING_KEYS.officeDefault),
    salesDefaultCents: centsSetting(SETTING_KEYS.salesDefault),
    productionDefaultCents: centsSetting(SETTING_KEYS.productionDefault),
  };
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

  // Offers (insert only; natural key client + eventName + eventDate, deleted offers count too)
  const defaultIncludes = await textSetting(OFFER_SETTING_KEYS.defaultIncludes);
  const defaultSpotifyUrl = await textSetting(OFFER_SETTING_KEYS.defaultSpotifyUrl);
  for (const o of data.offers) {
    const clientId = clientIdByKey.get(clientNameKey(o.client))!;
    const eventDate = dateFromIso(o.eventDate);
    if (await tx.offer.findFirst({ where: { clientId, eventName: o.eventName, eventDate } })) continue;
    const sellerId = partnerId(o.seller);
    const token = newShareToken();
    const offer = await tx.offer.create({
      data: {
        clientId,
        eventName: o.eventName,
        eventDate,
        venue: o.venue,
        city: o.city ?? null,
        lineup: o.lineup,
        includesText: o.includesText ?? defaultIncludes,
        spotifyUrl: o.spotifyUrl ?? defaultSpotifyUrl,
        showReferences: o.showReferences,
        priceCents: o.priceCents ?? null,
        sellerId,
        source: o.source ?? null,
        eventType: o.eventType ?? null,
        disposition: o.disposition ?? 'PENDING',
        shareToken: token.token,
        shareTokenHash: token.hash,
      },
    });
    await tx.offerEvent.create({ data: { offerId: offer.id, type: 'CREATED', partnerId: sellerId, details: {} } });
    if (o.converted) await convertOfferInTx(tx, { offerId: offer.id, partnerId: sellerId, fees });
    summary.offersCreated++;
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

  // References (insert only: partners manage them in the app). Appended in listed order.
  const existingReferences = await tx.reference.findMany({ select: { quoteFi: true, author: true } });
  const referenceKeys = new Set(existingReferences.map(referenceKey));
  for (const [i, r] of data.references.entries()) {
    if (referenceKeys.has(referenceKey(r))) continue;
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
    summary.referencesCreated++;
  }

  return summary;
}
