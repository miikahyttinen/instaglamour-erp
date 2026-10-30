import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EXAMPLE_SEED_FILE, LOCAL_SEED_FILE, loadSeed, readSeedFile, resolveSeedFile, SeedValidationError } from '../seed/load.js';
import { validateSeed } from '../seed/schema.js';
import { closeTestDb, resetDb, testApp, testDb } from './helpers.js';

const exampleSeedPath = path.resolve(import.meta.dirname, '../seed/seed.example.json');
const example = () => structuredClone(readSeedFile(exampleSeedPath)) as Record<string, unknown> & { events: Record<string, unknown>[] };

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
    event: await db.event.count(),
    costLine: await db.costLine.count(),
    eventHistory: await db.eventHistory.count(),
    offer: await db.offer.count(),
    offerEvent: await db.offerEvent.count(),
    task: await db.task.count(),
    hour: await db.hourEntry.count(),
    budget: await db.budgetYear.count(),
    reference: await db.reference.count(),
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
    data.events.push({
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
    data.events[0]!.priceCents = -1;
    const result = validateSeed(data);
    expect(result.ok ? [] : result.errors.join('\n')).toMatch(/hours\.\d+\.hours/);
    expect(result.ok ? [] : result.errors.join('\n')).toMatch(/events\.0\.priceCents/);
  });
});

describe('validateSeed: technical setup / logistics (TASK-010)', () => {
  it('rejects the old multi-select list with a conversion hint', () => {
    const data = example();
    data.events[0]!.technicalSetup = ['HOUSE_TECH', 'VAN'];
    const result = validateSeed(data);
    expect(result.ok).toBe(false);
    const errors = result.ok ? '' : result.errors.join('\n');
    expect(errors).toMatch(/events\.0\.technicalSetup: technicalSetup is a single value now/);
    expect(errors).toMatch(/seed\/README\.md/);
  });

  it.each([
    [{ technicalSetup: 'OWN_PA' }, /events\.0\.technicalSetup: must be one of HOUSE_TECH, SET_A, SET_B, SET_C/],
    [{ logistics: 'VAN' }, /events\.0\.logistics: must be one of OWN_VAN, RENTAL_VAN, TAXI, OTHER/],
    [{ logistics: ['OWN_VAN'] }, /events\.0\.logistics: logistics is a single value now/],
    [{ houseTechnician: 'yes' }, /events\.0\.houseTechnician/],
  ])('rejects %j', (fields, message) => {
    const data = example();
    Object.assign(data.events[0]!, fields);
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
    expect(summary.budgetCategories).toEqual({ created: 0, updated: 0, skipped: 3 });
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
    expect(summary).toMatchObject({ budgetCategories: { created: 2, skipped: 1 }, budget: { created: 2 } });
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
  it('clients and event client are optional (older seed files still validate)', () => {
    const old = example();
    delete old.clients;
    delete old.offers; // older seed files have no offers either (offers need a client)
    for (const g of old.events) delete g.client;
    const result = validateSeed(old);
    expect(result.ok ? [] : result.errors).toEqual([]);
  });

  it('rejects duplicate client names (case-insensitive), unknown event clients and unknown keys', () => {
    const data = example();
    data.clients = [{ name: 'Client A Oy' }, { name: ' client a oy' }, { name: 'Client B ry', phone: '1' }];
    data.events[0]!.client = 'Client Q Oy';
    const result = validateSeed(data);
    expect(result.ok).toBe(false);
    const errors = result.ok ? [] : result.errors;
    expect(errors.some((e) => e.startsWith('clients.2'))).toBe(true);
    // Structural errors stop before cross-reference checks; fix them and check again.
    data.clients = [{ name: 'Client A Oy' }, { name: ' client a oy' }];
    const second = validateSeed(data);
    const errors2 = second.ok ? [] : second.errors;
    expect(errors2).toContain('clients: duplicate name "client a oy" (names are compared case-insensitively)');
    expect(errors2).toContain('events.0.client: unknown client "Client Q Oy" (list it in clients)');
  });
});

describe('loadSeed: clients (TASK-015)', () => {
  it('loads the example clients and links most example events to them', async () => {
    const summary = await loadSeed(testDb(), example());
    expect(summary.clients).toEqual({ created: 5, updated: 0, skipped: 0 });
    const clients = await testDb().client.findMany({ orderBy: { name: 'asc' }, include: { _count: { select: { events: true } } } });
    expect(clients.map((c) => c.name)).toEqual(['Client A Oy', 'Client B ry', 'Client C Ltd', 'Client D Oy', 'Client E Oy']);
    expect(clients[0]).toMatchObject({ notes: 'Synthetic demo client.', deletedAt: null });
    const linked = await testDb().event.count({ where: { clientId: { not: null } } });
    expect(linked).toBeGreaterThan((await testDb().event.count()) / 2);
    const event = await testDb().event.findFirstOrThrow({ where: { venue: 'Venue V' }, include: { client: true } });
    expect(event.client?.name).toBe('Client D Oy');
  });

  it('is insert-only: a re-run never changes notes, revives deleted clients or relinks events', async () => {
    await loadSeed(testDb(), example());
    const db = testDb();
    const a = await db.client.findFirstOrThrow({ where: { name: 'Client A Oy' } });
    await db.client.update({ where: { id: a.id }, data: { notes: 'Edited in the app' } });
    const e = await db.client.findFirstOrThrow({ where: { name: 'Client E Oy' } });
    await db.client.update({ where: { id: e.id }, data: { deletedAt: new Date() } });
    await db.event.updateMany({ where: { venue: 'Venue V' }, data: { clientId: null } });

    const changed = example();
    (changed.clients as { name: string; notes?: string }[])[0]!.notes = 'Changed in the file';
    const summary = await loadSeed(db, changed);

    expect((await db.client.findUniqueOrThrow({ where: { id: a.id } })).notes).toBe('Edited in the app');
    expect((await db.event.findFirstOrThrow({ where: { venue: 'Venue V' } })).clientId).toBeNull();
    // A deleted client's name is free again, so the seed creates a new active client for it.
    expect(summary.clients).toEqual({ created: 1, updated: 0, skipped: 4 });
    expect(await db.client.count({ where: { name: 'Client E Oy', deletedAt: null } })).toBe(1);
  });

  it('matches existing clients case-insensitively', async () => {
    const existing = await testDb().client.create({ data: { name: 'CLIENT A OY' } });
    const summary = await loadSeed(testDb(), example());
    expect(summary.clients).toEqual({ created: 4, updated: 0, skipped: 1 });
    const event = await testDb().event.findFirstOrThrow({ where: { startDate: new Date('2026-02-14') } });
    expect(event.clientId).toBe(existing.id);
  });

  it('a seed without clients loads events without a client', async () => {
    const old = example();
    delete old.clients;
    delete old.offers; // older seed files have no offers either (offers need a client)
    for (const g of old.events) delete g.client;
    await loadSeed(testDb(), old);
    expect(await testDb().client.count()).toBe(0);
    expect(await testDb().event.count({ where: { clientId: { not: null } } })).toBe(0);
  });

  it('--reset also removes clients', async () => {
    await loadSeed(testDb(), example());
    await testDb().client.create({ data: { name: 'Client Extra Oy' } });
    await loadSeed(testDb(), example(), { reset: true });
    expect(await testDb().client.count()).toBe(5);
  });
});

/** The example file as written before TASK-032: top-level `gigs` instead of `events`. */
function legacyExample() {
  const { events, ...rest } = example();
  return { ...rest, gigs: events };
}

describe('seed key `gigs` is a legacy alias of `events` (TASK-032)', () => {
  it('validates a file with only `gigs` exactly like the same file with `events`', () => {
    const legacy = validateSeed(legacyExample());
    const current = validateSeed(example());
    expect(legacy.ok).toBe(true);
    expect(current.ok).toBe(true);
    if (legacy.ok && current.ok) expect(legacy.data).toEqual(current.data);
  });

  it('reports errors in a legacy list under events.N', () => {
    const data = legacyExample();
    data.gigs[0]!.seller = 'nobody@example.com';
    const result = validateSeed(data);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors).toContain('events.0.seller: unknown partner nobody@example.com');
  });

  it('rejects a file with both `events` and `gigs` (even an empty list)', () => {
    for (const gigs of [[], example().events]) {
      const result = validateSeed({ ...example(), gigs });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errors).toEqual(['gigs: legacy name of events; use only one of "events" and "gigs"']);
    }
  });

  it('loads a legacy file into the same events and counts them as `events`', async () => {
    const summary = await loadSeed(testDb(), legacyExample());
    expect(summary.events).toEqual({ created: example().events.length, updated: 0, skipped: 0 });
    expect(summary).not.toHaveProperty('gigs');
    const legacyState = await snapshot();
    // Same data: re-running the current file finds every event already there
    const again = await loadSeed(testDb(), example());
    expect(again.events).toEqual({ created: 0, updated: 0, skipped: example().events.length });
    // ... and loading the current file into an empty database gives the same rows.
    await resetDb();
    await loadSeed(testDb(), example());
    expect(await snapshot()).toEqual(legacyState);
  });

  it('loadSeed rejects both keys and loads nothing', async () => {
    await expect(loadSeed(testDb(), { ...example(), gigs: [] })).rejects.toBeInstanceOf(SeedValidationError);
    expect(await testDb().event.count()).toBe(0);
  });
});

describe('loadSeed', () => {
  it('loads technicalSetup, logistics and houseTechnician (defaults null / null / false)', async () => {
    await loadSeed(testDb(), example());
    const pick = { technicalSetup: true, logistics: true, houseTechnician: true } as const;
    const byVenue = async (venue: string) => testDb().event.findFirstOrThrow({ where: { venue }, select: pick });
    expect(await byVenue('Venue W')).toEqual({ technicalSetup: 'HOUSE_TECH', logistics: 'TAXI', houseTechnician: true });
    expect(await byVenue('Venue Y')).toEqual({ technicalSetup: null, logistics: 'OWN_VAN', houseTechnician: false });
    expect(await byVenue('Venue Z')).toEqual({ technicalSetup: null, logistics: null, houseTechnician: false });
  });

  it('loads the example seed with BR-020/BR-021 lines for events without explicit cost lines', async () => {
    await loadSeed(testDb(), example());
    const event = await testDb().event.findFirstOrThrow({
      where: { venue: 'Venue V' },
      include: { costLines: { orderBy: { createdAt: 'asc' } }, history: true, seller: true, producer: true },
    });
    expect(event.lineupName).toBe('Template C');
    const types = event.costLines.map((c) => c.type);
    expect(types.slice(-3)).toEqual(['OFFICE', 'SALES', 'PRODUCTION']);
    expect(types).toHaveLength(12); // 9 template roles + 3 internal
    expect(event.costLines[0]).toMatchObject({ type: 'VOC', personId: null, joinsLoadIn: true, budgetedCents: 30000 });
    expect(event.costLines.find((c) => c.type === 'SALES')?.personId).toBe(event.seller.personId);
    expect(event.costLines.find((c) => c.type === 'PRODUCTION')?.personId).toBe(event.producer.personId);
    expect(event.costLines.find((c) => c.type === 'OFFICE')).toMatchObject({ joinsLoadIn: null, budgetedCents: 10000 });
    expect(event.history.map((e) => e.type)).toEqual(['CREATED']);
  });

  it('is idempotent: running twice gives the same data', async () => {
    await loadSeed(testDb(), example());
    const first = await snapshot();
    const summary = await loadSeed(testDb(), example());
    expect(await snapshot()).toEqual(first);
    for (const counts of Object.values(summary)) expect(counts).toMatchObject({ created: 0, updated: 0 });
    expect(first.partner).toBe(5);
    expect(first.person).toBe(15);
  });

  it('does not overwrite data edited in the app, but updates reference data', async () => {
    await loadSeed(testDb(), example());
    const db = testDb();
    await db.partner.update({ where: { email: 'partner.a@example.com' }, data: { language: 'en' } });
    await db.event.updateMany({ where: { venue: 'Venue V' }, data: { priceCents: 10000 } });

    const changed = example();
    changed.settings = { ...(changed.settings as object), 'fees.load_in_deduction': 2000 };
    await loadSeed(db, changed);

    expect((await db.partner.findUniqueOrThrow({ where: { email: 'partner.a@example.com' } })).language).toBe('en');
    expect((await db.event.findFirstOrThrow({ where: { venue: 'Venue V' } })).priceCents).toBe(10000);
    expect((await db.setting.findUniqueOrThrow({ where: { key: 'fees.load_in_deduction' } })).valueCents).toBe(2000);
  });

  it('partners are insert-only: created active; a re-run never re-activates or changes one (UC-032)', async () => {
    await loadSeed(testDb(), example());
    const db = testDb();
    expect(await db.partner.count({ where: { active: false } })).toBe(0);
    const removedAt = new Date('2026-10-14T12:00:00.000Z');
    await db.partner.update({ where: { email: 'partner.b@example.com' }, data: { active: false, revokedAt: removedAt } });
    const before = await db.partner.findUniqueOrThrow({ where: { email: 'partner.b@example.com' }, include: { person: true } });
    await db.person.update({ where: { id: before.personId }, data: { name: 'Partner B renamed' } });

    await loadSeed(db, example());
    const after = await db.partner.findUniqueOrThrow({ where: { email: 'partner.b@example.com' }, include: { person: true } });
    expect(after).toMatchObject({ active: false, revokedAt: removedAt, email: before.email, phone: before.phone });
    expect(after.updatedAt).toEqual(before.updatedAt);
    expect(after.person.name).toBe('Partner B renamed');

    // Sign-in still refused.
    const app = await testApp();
    try {
      const res = await app.inject({ method: 'POST', url: '/api/auth/dev-login', payload: { email: 'partner.b@example.com' } });
      expect(res.statusCode).toBe(403);
    } finally {
      await app.close();
    }
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
    data.events[0]!.priceCents = 2 ** 31;
    await expect(loadSeed(testDb(), data)).rejects.toThrow();
    expect(await snapshot()).toMatchObject({ person: 0, partner: 0, event: 0, setting: 0 });
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

describe('validateSeed: offers (TASK-016)', () => {
  type Offers = Record<string, unknown>[];

  it('offers, partner phones and offer settings are optional (older seed files still validate)', () => {
    const old = example();
    delete old.offers;
    for (const p of old.partners as Record<string, unknown>[]) delete p.phone;
    const settings = old.settings as Record<string, unknown>;
    for (const key of Object.keys(settings)) if (key.startsWith('offers.')) delete settings[key];
    const result = validateSeed(old);
    expect(result.ok ? [] : result.errors).toEqual([]);
  });

  it('checks offer references, converted disposition, duplicates and setting types', () => {
    const data = example();
    const offers = data.offers as Offers;
    offers[0]!.client = 'Client Q Oy';
    offers[1]!.seller = 'nobody@example.com';
    offers[2]!.disposition = 'LOST_PRICE'; // offers[2] is converted
    offers.push({ ...offers[3]! });
    data.settings = { ...(data.settings as object), 'offers.default_includes': 5, 'fees.office_default': 'x', 'offers.unknown': 'x' };
    const result = validateSeed(data);
    const errors = result.ok ? [] : result.errors;
    expect(errors).toEqual(
      expect.arrayContaining([
        'offers.0.client: unknown client "Client Q Oy" (list it in clients)',
        'offers.1.seller: unknown partner nobody@example.com',
        'offers.2.disposition: a converted offer is WON (omit disposition or use WON)',
        'offers: duplicate offer client d oy/Event 4/2026-08-15 (client + eventName + eventDate)',
        'settings.offers.default_includes: must be a text',
        'settings.fees.office_default: must be an amount in cents',
        'settings: unknown key offers.unknown',
      ]),
    );
  });

  it('rejects bad offer values structurally', () => {
    const data = example();
    const offers = data.offers as Offers;
    offers[0]!.disposition = 'MAYBE';
    offers[1]!.priceCents = -1;
    offers[2]!.unknownKey = 1;
    const result = validateSeed(data);
    const errors = result.ok ? [] : result.errors;
    expect(errors.some((e) => e.startsWith('offers.0.disposition'))).toBe(true);
    expect(errors.some((e) => e.startsWith('offers.1.priceCents'))).toBe(true);
    expect(errors.some((e) => e.startsWith('offers.2'))).toBe(true);
  });

  it('older seed files with Spotify links load: the setting and per-offer spotifyUrl are accepted and ignored (TASK-022)', async () => {
    const old = example();
    old.settings = { ...(old.settings as object), 'offers.default_spotify_url': 'https://example.com/default' };
    const offers = old.offers as Offers;
    offers[0]!.spotifyUrl = 'https://example.com/own';
    offers[1]!.spotifyUrl = 'not even a url';
    const result = validateSeed(old);
    expect(result.ok ? [] : result.errors).toEqual([]);
    await loadSeed(testDb(), old);
    expect(await testDb().setting.count({ where: { key: 'offers.default_spotify_url' } })).toBe(0);
    expect(await testDb().offer.count({ where: { spotifyUrl: { not: null } } })).toBe(0);
  });
});

describe('loadSeed: offers (TASK-016)', () => {
  it('loads synthetic offers across dispositions, one converted per BR-105', async () => {
    const summary = await loadSeed(testDb(), example());
    const db = testDb();
    const offers = await db.offer.findMany({ include: { event: true, client: true } });
    expect(summary.offers.created).toBe(offers.length);
    expect(offers.length).toBeGreaterThanOrEqual(8);
    expect(new Set(offers.map((o) => o.disposition)).size).toBeGreaterThanOrEqual(6);
    for (const o of offers) {
      expect(Buffer.from(o.shareToken, 'base64url')).toHaveLength(32);
      expect(o.priceCents === null || o.priceCents === 1000 || o.priceCents % 10000 === 0).toBe(true);
    }
    expect(new Set(offers.map((o) => o.shareToken)).size).toBe(offers.length);

    const converted = offers.filter((o) => o.event !== null);
    expect(converted).toHaveLength(1);
    const c = converted[0]!;
    expect(c.disposition).toBe('WON');
    expect(c.event).toMatchObject({
      startDate: c.eventDate,
      venue: c.city ? `${c.venue}, ${c.city}` : c.venue,
      lineupName: c.eventName,
      clientId: c.clientId,
      priceCents: c.priceCents ?? 0,
      sellerId: c.sellerId,
      producerId: c.sellerId,
      lineupTemplateId: null,
    });
    const events = await db.offerEvent.findMany({ where: { offerId: c.id }, orderBy: { seq: 'asc' } });
    expect(events.map((e) => e.type)).toEqual(['CREATED', 'DISPOSITION_CHANGED', 'CONVERTED']);

    // Defaults from the (placeholder) settings; partner phones; text settings keep line breaks.
    const includes = await db.setting.findUniqueOrThrow({ where: { key: 'offers.default_includes' } });
    expect(includes).toMatchObject({ valueCents: null });
    expect(includes.valueText).toContain('\n');
    expect(offers.every((o) => o.includesText === includes.valueText)).toBe(true);
    expect((await db.partner.findUniqueOrThrow({ where: { email: 'partner.a@example.com' } })).phone).toMatch(/^\+358 40 000 000\d$/);
  });

  it('is insert-only: a re-run creates no offers or events and never changes app edits', async () => {
    await loadSeed(testDb(), example());
    const db = testDb();
    const first = await snapshot();
    const any = await db.offer.findFirstOrThrow({ where: { event: null } });
    await db.offer.update({ where: { id: any.id }, data: { disposition: 'LOST_OTHER', venue: 'Venue Edited' } });
    const summary = await loadSeed(db, example());
    expect(summary.offers.created).toBe(0);
    expect(await snapshot()).toEqual(first);
    expect(await db.offer.findUniqueOrThrow({ where: { id: any.id } })).toMatchObject({ disposition: 'LOST_OTHER', venue: 'Venue Edited' });
  });

  it('--reset also removes offers and their events', async () => {
    await loadSeed(testDb(), example());
    const first = await snapshot();
    await loadSeed(testDb(), example(), { reset: true });
    expect(await snapshot()).toEqual(first);
  });
});

describe('seed: references (TASK-018)', () => {
  const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('synthetic')]);
  const refs = () => testDb().reference.findMany({ orderBy: { sortOrder: 'asc' } });
  /** Plays the seed file's directory; photos are written here. */
  let dir: string;
  let uploadDir: string;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'instaglamour-test-seed-refs-'));
    uploadDir = path.join(dir, 'uploads');
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  const writeFiles = (contents: Record<string, Buffer>) => {
    for (const [name, content] of Object.entries(contents)) writeFileSync(path.join(dir, name), content);
  };
  const uploaded = () => (existsSync(uploadDir) ? readdirSync(uploadDir) : []);

  it('the example seed loads 3 synthetic references without photos, in order, idempotently', async () => {
    const summary = await loadSeed(testDb(), example());
    expect(summary.references.created).toBe(3);
    const all = await refs();
    expect(all.map((r) => [r.author, r.active, r.sortOrder, r.imageStorageKey])).toEqual([
      ['— Person 1, Client A Oy', true, 0, null],
      ['— Person 2, Client B Oy', true, 1, null],
      ['— Person 3', false, 2, null],
    ]);
    expect(all[1]!.quoteEn).toBeNull();
    expect(all[1]!.quoteFi).toContain('\n');

    // Re-run: nothing new, edits made in the app are kept.
    await testDb().reference.update({ where: { id: all[0]!.id }, data: { active: false } });
    expect((await loadSeed(testDb(), example())).references).toEqual({ created: 0, updated: 0, skipped: 3 });
    expect((await refs())[0]!.active).toBe(false);
  });

  it('new references go after existing ones; matched by quoteFi + author', async () => {
    await testDb().reference.create({ data: { quoteFi: 'App quote', author: '— Person 9', sortOrder: 4 } });
    const data = {
      ...example(),
      references: [
        { quoteFi: 'App quote', author: '— Person 9' },
        { quoteFi: 'New', author: '— Person 8' },
      ],
    };
    expect((await loadSeed(testDb(), data)).references.created).toBe(1);
    expect((await refs()).map((r) => [r.quoteFi, r.sortOrder])).toEqual([
      ['App quote', 4],
      ['New', 5],
    ]);
  });

  it('older seed files load: no references section; old reference text settings accepted but not stored', async () => {
    const old = example();
    delete old.references;
    old.settings = { ...(old.settings as object), 'offers.references_fi': 'Vanha teksti', 'offers.references_en': 'Old text' };
    expect(validateSeed(old).ok).toBe(true);
    const summary = await loadSeed(testDb(), old);
    expect(summary.references.created).toBe(0);
    expect(await testDb().setting.count({ where: { key: { startsWith: 'offers.references' } } })).toBe(0);
  });

  it('copies photos (path relative to the seed file) into UPLOAD_DIR with the sniffed type', async () => {
    writeFiles({ 'a.png': PNG });
    const data = {
      ...example(),
      references: [
        { quoteFi: 'Q1', author: 'A1', image: 'a.png' },
        { quoteFi: 'Q2', author: 'A2' },
      ],
    };
    await loadSeed(testDb(), data, { seedDir: dir, uploadDir });
    const [withImage, without] = await refs();
    expect(withImage).toMatchObject({ imageContentType: 'image/png', imageSizeBytes: PNG.length, imageUploadedAt: expect.any(Date) });
    expect(uploaded()).toEqual([withImage!.imageStorageKey]);
    expect(readFileSync(path.join(uploadDir, withImage!.imageStorageKey!))).toEqual(PNG);
    expect(without!.imageStorageKey).toBeNull();
    // A re-run copies nothing.
    await loadSeed(testDb(), data, { seedDir: dir, uploadDir });
    expect(uploaded()).toHaveLength(1);
  });

  it('checks every photo before loading anything', async () => {
    writeFiles({ 'doc.pdf': Buffer.from('%PDF-1.4 synthetic'), 'big.png': Buffer.concat([PNG, Buffer.alloc(10 * 1024 * 1024)]) });
    const data = {
      ...example(),
      references: [
        { quoteFi: 'Q1', author: 'A1', image: 'missing.png' },
        { quoteFi: 'Q2', author: 'A2', image: 'doc.pdf' },
        { quoteFi: 'Q3', author: 'A3', image: 'big.png' },
      ],
    };
    const err = await loadSeed(testDb(), data, { seedDir: dir, uploadDir }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SeedValidationError);
    expect((err as SeedValidationError).errors).toEqual([
      'references.0.image: file not found: missing.png (paths are relative to the seed file)',
      'references.1.image: doc.pdf is not a PNG, JPG or WebP image',
      'references.2.image: big.png is larger than 10 MB',
    ]);
    expect(await snapshot()).toMatchObject({ partner: 0, reference: 0 });
    expect(uploaded()).toEqual([]);

    // Without the seed file's location photos can't be resolved.
    writeFiles({ 'a.png': PNG });
    const noDir = await loadSeed(testDb(), { ...example(), references: [{ quoteFi: 'Q', author: 'A', image: 'a.png' }] }).catch(
      (e: unknown) => e,
    );
    expect((noDir as SeedValidationError).errors[0]).toMatch(/^references\.0\.image: photos need/);
  });

  it('removes copied photos again when the load fails (nothing is loaded)', async () => {
    writeFiles({ 'a.png': PNG });
    const data = { ...example(), references: [{ quoteFi: 'Q1', author: 'A1', image: 'a.png' }] };
    // A database whose transaction fails after the whole seed was applied.
    const db = testDb();
    const failing = new Proxy(db, {
      get(target, prop, receiver) {
        if (prop !== '$transaction') return Reflect.get(target, prop, receiver) as unknown;
        return (fn: (tx: unknown) => Promise<unknown>, options: unknown) =>
          db.$transaction(async (tx) => {
            await fn(tx);
            throw new Error('synthetic failure after applying the seed');
          }, options as { timeout: number });
      },
    });
    await expect(loadSeed(failing, data, { seedDir: dir, uploadDir })).rejects.toThrow('synthetic failure');
    expect(uploaded()).toEqual([]);
    expect(await snapshot()).toMatchObject({ partner: 0, reference: 0 });
  });

  it('validates reference entries and rejects duplicates (quoteFi + author, trimmed)', () => {
    const bad = validateSeed({
      ...example(),
      references: [
        { quoteFi: '', author: 'A' },
        { quoteFi: 'Q', author: 'x'.repeat(201) },
        { quoteFi: 'Q', author: 'A', extra: 1 },
      ],
    });
    const errors = bad.ok ? [] : bad.errors;
    expect(errors.some((e) => e.startsWith('references.0.quoteFi'))).toBe(true);
    expect(errors.some((e) => e.startsWith('references.1.author'))).toBe(true);
    expect(errors.some((e) => e.startsWith('references.2'))).toBe(true);

    const dup = validateSeed({
      ...example(),
      references: [
        { quoteFi: 'Dup', author: 'A' },
        { quoteFi: ' Dup ', author: 'A ' },
      ],
    });
    expect(dup.ok ? [] : dup.errors).toEqual(['references: duplicate reference "A" with the same quoteFi (quoteFi + author)']);
  });

  it('--reset removes references', async () => {
    await loadSeed(testDb(), example());
    await testDb().reference.create({ data: { quoteFi: 'Extra', author: 'X', sortOrder: 9 } });
    await loadSeed(testDb(), example(), { reset: true });
    expect(await testDb().reference.count()).toBe(3);
  });
});
