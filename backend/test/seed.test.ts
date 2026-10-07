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
    client: await db.client.count(),
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

describe('validateSeed: budget categories (TASK-012)', () => {
  type Cat = { code?: string; name?: string; active?: boolean; nameFi?: string; nameEn?: string; budgeted?: boolean };
  const withCategories = (categories: Cat[], budget: unknown[] = []) => ({ ...example(), budgetCategories: categories, budget });
  const errorsOf = (data: unknown) => {
    const result = validateSeed(data);
    return result.ok ? '' : result.errors.join('\n');
  };

  it('rejects the old nameFi / nameEn / budgeted format with a conversion hint', () => {
    const errors = errorsOf(withCategories([{ code: 'CAT_F', nameFi: 'Kategoria F', nameEn: 'Category F', budgeted: false }]));
    expect(errors).toMatch(/budgetCategories\.0: nameFi, nameEn and budgeted are no longer supported: give one "name"/);
    expect(errors).toMatch(/seed\/README\.md/);
    expect(errors).toMatch(/budgetCategories\.0\.name/); // name is required
  });

  it('rejects duplicate names (case-insensitive) and codes', () => {
    const errors = errorsOf(
      withCategories([{ name: 'Category A' }, { name: ' category a', active: false }, { code: 'CAT_B', name: 'Category B' }, { code: 'CAT_B', name: 'Category C' }]),
    );
    expect(errors).toMatch(/budgetCategories: duplicate name "category a"/);
    expect(errors).toMatch(/budgetCategories: duplicate code CAT_B/);
  });

  it('budget rows refer to a category by name (case-insensitive) or code; unknown and duplicate rows are errors', () => {
    const cats = [{ name: 'Category A' }, { code: 'CAT_B', name: 'Category B' }];
    expect(errorsOf(withCategories(cats, [{ year: 2026, category: 'category a' }, { year: 2026, category: 'CAT_B' }]))).toBe('');
    const errors = errorsOf(
      withCategories(cats, [
        { year: 2026, category: 'Category Z' },
        { year: 2026, category: 'CAT_B' },
        { year: 2026, category: 'Category B' },
      ]),
    );
    expect(errors).toMatch(/budget\.0\.category: unknown category "Category Z"/);
    expect(errors).toMatch(/budget: duplicate row category b\/2026/);
  });

  it('every row takes budget and actual amounts (no actuals-only rows)', () => {
    expect(errorsOf(withCategories([{ name: 'Category A' }], [{ year: 2026, category: 'Category A', budgetExpenseCents: 10000, actualExpenseCents: 1000 }]))).toBe('');
  });
});

describe('loadSeed: budget categories (TASK-012)', () => {
  const rows = () => testDb().budgetCategory.findMany({ orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] });

  it('loads the example rows in listed order, active, without codes and without a fuel row', async () => {
    await loadSeed(testDb(), example());
    const all = await rows();
    expect(all.map((c) => c.name)).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'].map((l) => `Category ${l}`));
    expect(all.every((c) => c.active && c.code === null)).toBe(true);
    expect(all.map((c) => c.sortOrder)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    const a = all[0]!;
    expect(await testDb().budgetYear.findMany({ where: { categoryId: a.id }, orderBy: { year: 'asc' }, select: { year: true, budgetExpenseCents: true } })).toEqual([
      { year: 2025, budgetExpenseCents: 1200000 },
      { year: 2026, budgetExpenseCents: 1200000 },
    ]);
  });

  it('is insert-only: a re-run never brings back, renames or reorders rows the partners changed', async () => {
    const data = { ...example(), budgetCategories: [{ code: 'CAT_A', name: 'Category A' }, { name: 'Category B' }, { name: 'Category C' }], budget: [] };
    await loadSeed(testDb(), data);
    const [a, b, c] = await rows();
    // In the app: rename the coded row, remove one, add one
    await testDb().budgetCategory.update({ where: { id: a!.id }, data: { name: 'Category A2' } });
    await testDb().budgetCategory.update({ where: { id: b!.id }, data: { active: false } });
    await testDb().budgetCategory.create({ data: { name: 'Category D', sortOrder: 3 } });

    const summary = await loadSeed(testDb(), data);
    expect(summary).toMatchObject({ budgetCategories: 3, budgetCategoriesCreated: 0 });
    const after = await rows();
    expect(after.map((r) => [r.name, r.active])).toEqual([
      ['Category A2', true], // matched by code
      ['Category B', false], // matched by name, stays removed
      ['Category C', true],
      ['Category D', true],
    ]);
    expect(after[2]!.id).toBe(c!.id);
  });

  it('matches names case-insensitively; new rows go after existing ones; active: false is kept', async () => {
    await testDb().budgetCategory.create({ data: { name: 'Category A', sortOrder: 5 } });
    const summary = await loadSeed(testDb(), {
      ...example(),
      budgetCategories: [{ name: 'CATEGORY A' }, { name: 'Category B', active: false }, { code: 'CAT_C', name: 'Category C' }],
      budget: [{ year: 2026, category: 'CAT_C', actualExpenseCents: 10000 }, { year: 2026, category: 'category a', budgetIncomeCents: 1000 }],
    });
    expect(summary).toMatchObject({ budgetCategoriesCreated: 2, budgetRowsCreated: 2 });
    const all = await rows();
    expect(all.map((r) => [r.name, r.code, r.active, r.sortOrder])).toEqual([
      ['Category A', null, true, 5],
      ['Category B', null, false, 6],
      ['Category C', 'CAT_C', true, 7],
    ]);
    expect(await testDb().budgetYear.findFirstOrThrow({ where: { categoryId: all[2]!.id } })).toMatchObject({ actualExpenseCents: 10000 });
    expect(await testDb().budgetYear.findFirstOrThrow({ where: { categoryId: all[0]!.id } })).toMatchObject({ budgetIncomeCents: 1000 });
  });
});

describe('validateSeed: clients (TASK-015)', () => {
  it('clients and gig client are optional (older seed files still validate)', () => {
    const old = example();
    delete old.clients;
    for (const g of old.gigs) delete g.client;
    const result = validateSeed(old);
    expect(result.ok ? [] : result.errors).toEqual([]);
  });

  it('rejects duplicate client names (case-insensitive), unknown gig clients and unknown keys', () => {
    const data = example();
    data.clients = [{ name: 'Client A Oy' }, { name: ' client a oy' }, { name: 'Client B ry', phone: '1' }];
    data.gigs[0]!.client = 'Client Q Oy';
    const result = validateSeed(data);
    expect(result.ok).toBe(false);
    const errors = result.ok ? [] : result.errors;
    expect(errors.some((e) => e.startsWith('clients.2'))).toBe(true);
    // Structural errors stop before cross-reference checks; fix them and check again.
    data.clients = [{ name: 'Client A Oy' }, { name: ' client a oy' }];
    const second = validateSeed(data);
    const errors2 = second.ok ? [] : second.errors;
    expect(errors2).toContain('clients: duplicate name "client a oy" (names are compared case-insensitively)');
    expect(errors2).toContain('gigs.0.client: unknown client "Client Q Oy" (list it in clients)');
  });
});

describe('loadSeed: clients (TASK-015)', () => {
  it('loads the example clients and links most example gigs to them', async () => {
    const summary = await loadSeed(testDb(), example());
    expect(summary).toMatchObject({ clients: 5, clientsCreated: 5 });
    const clients = await testDb().client.findMany({ orderBy: { name: 'asc' }, include: { _count: { select: { gigs: true } } } });
    expect(clients.map((c) => c.name)).toEqual(['Client A Oy', 'Client B ry', 'Client C Ltd', 'Client D Oy', 'Client E Oy']);
    expect(clients[0]).toMatchObject({ notes: 'Synthetic demo client.', deletedAt: null });
    const linked = await testDb().gig.count({ where: { clientId: { not: null } } });
    expect(linked).toBeGreaterThan((await testDb().gig.count()) / 2);
    const gig = await testDb().gig.findFirstOrThrow({ where: { venue: 'Venue V' }, include: { client: true } });
    expect(gig.client?.name).toBe('Client D Oy');
  });

  it('is insert-only: a re-run never changes notes, revives deleted clients or relinks gigs', async () => {
    await loadSeed(testDb(), example());
    const db = testDb();
    const a = await db.client.findFirstOrThrow({ where: { name: 'Client A Oy' } });
    await db.client.update({ where: { id: a.id }, data: { notes: 'Edited in the app' } });
    const e = await db.client.findFirstOrThrow({ where: { name: 'Client E Oy' } });
    await db.client.update({ where: { id: e.id }, data: { deletedAt: new Date() } });
    await db.gig.updateMany({ where: { venue: 'Venue V' }, data: { clientId: null } });

    const changed = example();
    (changed.clients as { name: string; notes?: string }[])[0]!.notes = 'Changed in the file';
    const summary = await loadSeed(db, changed);

    expect((await db.client.findUniqueOrThrow({ where: { id: a.id } })).notes).toBe('Edited in the app');
    expect((await db.gig.findFirstOrThrow({ where: { venue: 'Venue V' } })).clientId).toBeNull();
    // A deleted client's name is free again, so the seed creates a new active client for it.
    expect(summary).toMatchObject({ clients: 5, clientsCreated: 1 });
    expect(await db.client.count({ where: { name: 'Client E Oy', deletedAt: null } })).toBe(1);
  });

  it('matches existing clients case-insensitively', async () => {
    const existing = await testDb().client.create({ data: { name: 'CLIENT A OY' } });
    const summary = await loadSeed(testDb(), example());
    expect(summary.clientsCreated).toBe(4);
    const gig = await testDb().gig.findFirstOrThrow({ where: { startDate: new Date('2026-02-14') } });
    expect(gig.clientId).toBe(existing.id);
  });

  it('a seed without clients loads gigs without a client', async () => {
    const old = example();
    delete old.clients;
    for (const g of old.gigs) delete g.client;
    await loadSeed(testDb(), old);
    expect(await testDb().client.count()).toBe(0);
    expect(await testDb().gig.count({ where: { clientId: { not: null } } })).toBe(0);
  });

  it('--reset also removes clients', async () => {
    await loadSeed(testDb(), example());
    await testDb().client.create({ data: { name: 'Client Extra Oy' } });
    await loadSeed(testDb(), example(), { reset: true });
    expect(await testDb().client.count()).toBe(5);
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
