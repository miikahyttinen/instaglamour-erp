import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { EXAMPLE_SEED_FILE, LOCAL_SEED_FILE, loadSeed, readSeedFile, resolveSeedFile, SeedValidationError } from '../seed/load.js';
import { validateSeed } from '../seed/schema.js';
import { closeTestDb, resetDb, testDb } from './helpers.js';

const exampleSeedPath = path.resolve(import.meta.dirname, '../seed/seed.example.json');
const example = () => structuredClone(readSeedFile(exampleSeedPath)) as Record<string, unknown> & { gigs: Record<string, unknown>[] };

/** Row counts of every table, to compare database states. */
async function snapshot() {
  const db = testDb();
  return {
    person: await db.person.count(),
    partner: await db.partner.count(),
    template: await db.lineupTemplate.count(),
    templateRole: await db.templateRole.count(),
    setting: await db.setting.count(),
    category: await db.budgetCategory.count(),
    gig: await db.gig.count(),
    costLine: await db.costLine.count(),
    gigEvent: await db.gigEvent.count(),
    task: await db.task.count(),
    hour: await db.hourEntry.count(),
    budget: await db.budgetYear.count(),
  };
}

beforeEach(resetDb);
afterAll(closeTestDb);

describe('validateSeed', () => {
  it('accepts the committed example seed', () => {
    const result = validateSeed(example());
    expect(result.ok ? [] : result.errors).toEqual([]);
  });

  it('reports structural errors with their path', () => {
    const data = example();
    (data.partners as unknown[]).push({ name: 'Partner X', email: 'not-an-email' });
    data.unexpected = true;
    const result = validateSeed(data);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.startsWith('partners.5.email'))).toBe(true);
      expect(result.errors.join('\n')).toMatch(/unexpected/);
    }
  });

  it('reports every broken cross reference and rule', () => {
    const data = example();
    data.settings = { 'fees.office_default': 10000 };
    data.gigs.push({
      startDate: '2026-05-02',
      endDate: '2026-05-01',
      lineupTemplate: 'Template Z',
      venue: 'Venue X',
      seller: 'unknown@example.com',
      producer: 'partner.a@example.com',
      priceCents: 10000,
      costLines: [
        { type: 'FUEL', budgetedCents: 1000, actualCents: 1000, paidBy: 'partner.a@example.com' },
        { type: 'OTHER', budgetedCents: 1000 },
        { type: 'OFFICE', budgetedCents: 1000, joinsLoadIn: true },
        { type: 'BASS', person: 'Person 99', budgetedCents: 1000 },
      ],
    });
    const result = validateSeed(data);
    expect(result.ok).toBe(false);
    const errors = result.ok ? '' : result.errors.join('\n');
    expect(errors).toMatch(/settings: missing fees\.sales_default/);
    expect(errors).toMatch(/endDate: before startDate/);
    expect(errors).toMatch(/unknown template "Template Z"/);
    expect(errors).toMatch(/seller: unknown partner/);
    expect(errors).toMatch(/FUEL lines are never paid/);
    expect(errors).toMatch(/description: required for OTHER/);
    expect(errors).toMatch(/joinsLoadIn: only allowed for musician roles/);
    expect(errors).toMatch(/unknown person "Person 99"/);
  });

  it('rejects hours outside 0.25 steps and negative money', () => {
    const data = example();
    (data.hours as unknown[]).push({ partner: 'partner.a@example.com', date: '2026-01-01', comment: 'x', hours: 1.1 });
    data.gigs[0]!.priceCents = -1;
    const result = validateSeed(data);
    expect(result.ok ? [] : result.errors.join('\n')).toMatch(/hours\.\d+\.hours/);
    expect(result.ok ? [] : result.errors.join('\n')).toMatch(/gigs\.0\.priceCents/);
  });
});

describe('validateSeed: technical setup / logistics (TASK-010)', () => {
  it('rejects the old multi-select list with a conversion hint', () => {
    const data = example();
    data.gigs[0]!.technicalSetup = ['HOUSE_TECH', 'VAN'];
    const result = validateSeed(data);
    expect(result.ok).toBe(false);
    const errors = result.ok ? '' : result.errors.join('\n');
    expect(errors).toMatch(/gigs\.0\.technicalSetup: technicalSetup is a single value now/);
    expect(errors).toMatch(/seed\/README\.md/);
  });

  it.each([
    [{ technicalSetup: 'OWN_PA' }, /gigs\.0\.technicalSetup: must be one of HOUSE_TECH, SET_A, SET_B, SET_C/],
    [{ logistics: 'VAN' }, /gigs\.0\.logistics: must be one of OWN_VAN, RENTAL_VAN, TAXI, OTHER/],
    [{ logistics: ['OWN_VAN'] }, /gigs\.0\.logistics: logistics is a single value now/],
    [{ houseTechnician: 'yes' }, /gigs\.0\.houseTechnician/],
  ])('rejects %j', (fields, message) => {
    const data = example();
    Object.assign(data.gigs[0]!, fields);
    const result = validateSeed(data);
    expect(result.ok ? '' : result.errors.join('\n')).toMatch(message);
  });
});

describe('loadSeed', () => {
  it('loads technicalSetup, logistics and houseTechnician (defaults null / null / false)', async () => {
    await loadSeed(testDb(), example());
    const pick = { technicalSetup: true, logistics: true, houseTechnician: true } as const;
    const byVenue = async (venue: string) => testDb().gig.findFirstOrThrow({ where: { venue }, select: pick });
    expect(await byVenue('Venue W')).toEqual({ technicalSetup: 'HOUSE_TECH', logistics: 'TAXI', houseTechnician: true });
    expect(await byVenue('Venue Y')).toEqual({ technicalSetup: null, logistics: 'OWN_VAN', houseTechnician: false });
    expect(await byVenue('Venue Z')).toEqual({ technicalSetup: null, logistics: null, houseTechnician: false });
  });

  it('loads the example seed with BR-020/BR-021 lines for gigs without explicit cost lines', async () => {
    await loadSeed(testDb(), example());
    const gig = await testDb().gig.findFirstOrThrow({
      where: { venue: 'Venue V' },
      include: { costLines: { orderBy: { createdAt: 'asc' } }, events: true, seller: true, producer: true },
    });
    expect(gig.lineupName).toBe('Template C');
    const types = gig.costLines.map((c) => c.type);
    expect(types.slice(-3)).toEqual(['OFFICE', 'SALES', 'PRODUCTION']);
    expect(types).toHaveLength(13);
    expect(gig.costLines[0]).toMatchObject({ type: 'VOC', personId: null, joinsLoadIn: true, budgetedCents: 30000 });
    expect(gig.costLines.find((c) => c.type === 'SALES')?.personId).toBe(gig.seller.personId);
    expect(gig.costLines.find((c) => c.type === 'PRODUCTION')?.personId).toBe(gig.producer.personId);
    expect(gig.costLines.find((c) => c.type === 'OFFICE')).toMatchObject({ joinsLoadIn: null, budgetedCents: 10000 });
    expect(gig.events.map((e) => e.type)).toEqual(['CREATED']);
  });

  it('is idempotent: running twice gives the same data', async () => {
    await loadSeed(testDb(), example());
    const first = await snapshot();
    const summary = await loadSeed(testDb(), example());
    expect(await snapshot()).toEqual(first);
    expect(summary).toMatchObject({ gigsCreated: 0, tasksCreated: 0, hoursCreated: 0, budgetRowsCreated: 0 });
    expect(first.partner).toBe(5);
    expect(first.person).toBe(15);
  });

  it('does not overwrite data edited in the app, but updates reference data', async () => {
    await loadSeed(testDb(), example());
    const db = testDb();
    await db.partner.update({ where: { email: 'partner.a@example.com' }, data: { language: 'en' } });
    await db.gig.updateMany({ where: { venue: 'Venue V' }, data: { priceCents: 10000 } });

    const changed = example();
    changed.settings = { ...(changed.settings as object), 'fees.load_in_deduction': 2000 };
    await loadSeed(db, changed);

    expect((await db.partner.findUniqueOrThrow({ where: { email: 'partner.a@example.com' } })).language).toBe('en');
    expect((await db.gig.findFirstOrThrow({ where: { venue: 'Venue V' } })).priceCents).toBe(10000);
    expect((await db.setting.findUniqueOrThrow({ where: { key: 'fees.load_in_deduction' } })).valueCents).toBe(2000);
  });

  it('an invalid file changes nothing', async () => {
    await loadSeed(testDb(), example());
    const before = await snapshot();
    const invalid = example();
    (invalid.people as unknown[]).push({ name: '' });
    await expect(loadSeed(testDb(), invalid)).rejects.toBeInstanceOf(SeedValidationError);
    expect(await snapshot()).toEqual(before);
  });

  it('a failure while writing rolls the whole seed back', async () => {
    const data = example();
    // Passes validation but overflows the INTEGER column, after partners/people were already written.
    data.gigs[0]!.priceCents = 2 ** 31;
    await expect(loadSeed(testDb(), data)).rejects.toThrow();
    expect(await snapshot()).toMatchObject({ person: 0, partner: 0, gig: 0, setting: 0 });
  });

  it('--reset empties the database first', async () => {
    await loadSeed(testDb(), example());
    await testDb().person.create({ data: { name: 'Person Extra' } });
    await loadSeed(testDb(), example(), { reset: true });
    expect(await testDb().person.count()).toBe(15);
    expect(await testDb().person.findFirst({ where: { name: 'Person Extra' } })).toBeNull();
  });

  it('readSeedFile reports invalid JSON as a validation error', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'seed-'));
    try {
      const file = path.join(dir, 'bad.json');
      writeFileSync(file, '{ nope');
      expect(() => readSeedFile(file)).toThrow(SeedValidationError);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('resolveSeedFile', () => {
  it('prefers seed.local.json over seed.example.json', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'seed-'));
    try {
      writeFileSync(path.join(dir, EXAMPLE_SEED_FILE), '{}');
      expect(resolveSeedFile(dir)).toBe(path.join(dir, EXAMPLE_SEED_FILE));
      writeFileSync(path.join(dir, LOCAL_SEED_FILE), '{}');
      expect(resolveSeedFile(dir)).toBe(path.join(dir, LOCAL_SEED_FILE));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
