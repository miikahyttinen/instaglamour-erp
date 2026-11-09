/** Data import (UC-035, BR-120, BR-121; api-contract "Data import"). Synthetic data only (BR-090). */
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { readSeedFile, SEED_SUMMARY_KEYS, type SeedSummary } from '../seed/load.js';
import { closeTestDb, createPartner, login, resetDb, TEST_DOMAIN, testApp, testDb } from './helpers.js';

const exampleSeedPath = path.resolve(import.meta.dirname, '../seed/seed.example.json');
type Doc = Record<string, unknown> & { partners: Record<string, unknown>[]; references: Record<string, unknown>[] };
const example = () => structuredClone(readSeedFile(exampleSeedPath)) as Doc;

/** Row counts of every table an import writes, to compare database states. */
async function snapshot() {
  const db = testDb();
  return {
    person: await db.person.count(),
    partner: await db.partner.count(),
    template: await db.lineupTemplate.count(),
    lineupLine: await db.lineupLine.count(),
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
    importRun: await db.importRun.count(),
  };
}

let app: FastifyInstance;
let cookie: string;
let me: { id: string };

beforeEach(async () => {
  await resetDb();
  app = await testApp();
  me = await createPartner('Partner A', `partner.a@${TEST_DOMAIN}`);
  cookie = await login(app, `partner.a@${TEST_DOMAIN}`);
});

afterAll(async () => {
  // Leave no import_run rows behind in the shared test database.
  await resetDb();
  await closeTestDb();
});

const post = (body: unknown, query = '', headers: Record<string, string> = {}) =>
  app.inject({
    method: 'POST',
    url: `/api/import${query}`,
    headers: { cookie, 'content-type': 'application/json', ...headers },
    payload: typeof body === 'string' ? body : JSON.stringify(body),
  });

const errorsOf = (res: { json(): unknown }) => (res.json() as { error: { details: { errors: string[] } } }).error.details.errors;

describe('POST /api/import', () => {
  it('requires a session (both endpoints)', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/import', payload: example() });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('UNAUTHENTICATED');
    expect((await app.inject({ method: 'GET', url: '/api/import/runs' })).statusCode).toBe(401);
  });

  it('dry run saves nothing and its counts match the real import', async () => {
    const before = await snapshot();
    const dry = await post(example(), '?dryRun=true&filename=data.json');
    expect(dry.statusCode).toBe(200);
    expect(dry.json().dryRun).toBe(true);
    expect(await snapshot()).toEqual(before);

    const real = await post(example(), '?dryRun=false&filename=data.json');
    expect(real.statusCode).toBe(200);
    expect(real.json()).toEqual({ dryRun: false, summary: dry.json().summary });

    const summary = real.json().summary as SeedSummary;
    expect(Object.keys(summary).sort()).toEqual([...SEED_SUMMARY_KEYS].sort());
    const doc = example();
    // The signed-in partner already exists, so it's skipped; everything else is new.
    expect(summary.partners).toEqual({ created: doc.partners.length - 1, updated: 0, skipped: 1 });
    expect(summary.events).toEqual({ created: (doc.events as unknown[]).length, updated: 0, skipped: 0 });
    expect(summary.references).toEqual({ created: doc.references.length, updated: 0, skipped: 0 });
    expect((await snapshot()).event).toBeGreaterThan(0);
  });

  it('defaults to a real import', async () => {
    const res = await post(example());
    expect(res.statusCode).toBe(200);
    expect(res.json().dryRun).toBe(false);
    expect(await testDb().importRun.count()).toBe(1);
  });

  it('re-importing the same file creates and changes nothing (everything skipped)', async () => {
    await post(example());
    const first = await snapshot();
    const res = await post(example());
    expect(res.statusCode).toBe(200);
    for (const key of SEED_SUMMARY_KEYS) {
      expect(res.json().summary[key], key).toMatchObject({ created: 0, updated: 0 });
    }
    expect(res.json().summary.events.skipped).toBe((example().events as unknown[]).length);
    expect(await snapshot()).toEqual({ ...first, importRun: 2 });
  });

  it('counts updates per the re-run rules (person active, empty lineup lines, settings)', async () => {
    await post(example());
    const doc = example();
    (doc.people as { active?: boolean }[])[0]!.active = false;
    // Lines of a lineup that already has lines are never changed by a re-run (the app owns them)…
    (doc.lineupTemplates as { lines: { defaultCents: number }[] }[])[0]!.lines[0]!.defaultCents += 100;
    // …but a lineup without lines gets them from the file.
    const emptied = await testDb().lineupTemplate.findFirstOrThrow({ where: { name: (doc.lineupTemplates as { name: string }[])[1]!.name } });
    await testDb().lineupLine.deleteMany({ where: { templateId: emptied.id } });
    // A non-parameter setting is updated; a parameter (edited in the app, TASK-057) is never overwritten.
    (doc.settings as Record<string, unknown>)['offers.default_includes'] = 'Changed placeholder';
    (doc.settings as Record<string, unknown>)['fees.load_in_deduction'] = 12300;
    const res = await post(doc, '?dryRun=true');
    expect(res.json().summary).toMatchObject({
      people: { created: 0, updated: 1 },
      lineupTemplates: { created: 0, updated: 1, skipped: 2 },
      settings: { created: 0, updated: 1 },
    });
    await post(doc);
    expect((await testDb().setting.findUniqueOrThrow({ where: { key: 'fees.load_in_deduction' } })).valueCents).toBe(1000);
  });

  it('serializes concurrent imports: the second one finds everything already there', async () => {
    const [a, b] = await Promise.all([post(example()), post(example())]);
    expect([a.statusCode, b.statusCode]).toEqual([200, 200]);
    const eventCount = (example().events as unknown[]).length;
    const created = [a, b].map((r) => (r.json().summary as SeedSummary).events.created).sort();
    expect(created).toEqual([0, eventCount]);
    // Converted offers create their own event (BR-105).
    const converted = (example().offers as { converted?: boolean }[]).filter((o) => o.converted).length;
    expect(await testDb().event.count()).toBe(eventCount + converted);
  });

  it('converted: true is exempt from BR-109 (past event date, no accepted disposition)', async () => {
    const doc = example();
    const offers = doc.offers as Record<string, unknown>[];
    const template = offers.find((o) => o.converted)!;
    const historical: Record<string, unknown> = { ...template, eventName: 'Event Past', eventDate: '2020-03-01' };
    delete historical.disposition;
    offers.push(historical);
    const res = await post(doc);
    expect(res.statusCode).toBe(200);
    const offer = await testDb().offer.findFirstOrThrow({ where: { eventName: 'Event Past' }, include: { event: true } });
    expect(offer.disposition).toBe('WON');
    expect(offer.event).toMatchObject({ startDate: new Date('2020-03-01T00:00:00.000Z'), offerId: offer.id });
  });

  it('accepts files above the global 1 MB body limit (up to 10 MB) and a UTF-8 BOM', async () => {
    const text = '\uFEFF' + JSON.stringify(example()) + ' '.repeat(2 * 1024 * 1024);
    const res = await post(text, '?dryRun=true', { 'content-type': 'application/json; charset=utf-8' });
    expect(res.statusCode).toBe(200);
  });

  it('rejects files over 10 MB with 413 FILE_TOO_LARGE', async () => {
    const text = JSON.stringify(example()) + ' '.repeat(10 * 1024 * 1024);
    const res = await post(text, '?dryRun=true');
    expect(res.statusCode).toBe(413);
    expect(res.json().error.code).toBe('FILE_TOO_LARGE');
  });

  it('rejects a body that is not JSON', async () => {
    for (const body of ['{"partners": [', '', 'not json']) {
      const res = await post(body);
      expect(res.statusCode, JSON.stringify(body)).toBe(400);
      expect(res.json().error.code).toBe('VALIDATION_ERROR');
      expect(errorsOf(res)).toEqual(['not valid JSON']);
    }
  });

  it('lists every problem of an invalid document, path-prefixed, and imports nothing', async () => {
    const before = await snapshot();
    const doc = example();
    doc.partners.push({ name: 'Partner X', email: 'not-an-email' });
    doc.unexpected = true;
    const res = await post(doc);
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
    const errors = errorsOf(res);
    expect(errors.some((e) => e.startsWith(`partners.${doc.partners.length - 1}.email`))).toBe(true);
    expect(errors.join('\n')).toMatch(/unexpected/);
    expect(await snapshot()).toEqual(before);
  });

  it('accepts the legacy top-level `gigs` key and reports it as `events` (TASK-032)', async () => {
    const { events, ...rest } = example();
    const res = await post({ ...rest, gigs: events }, '?filename=old.json');
    expect(res.statusCode).toBe(200);
    expect(res.json().summary.events).toEqual({ created: (events as unknown[]).length, updated: 0, skipped: 0 });
    expect(res.json().summary).not.toHaveProperty('gigs');
    expect((await snapshot()).event).toBeGreaterThanOrEqual((events as unknown[]).length);
  });

  it('accepts removed role codes and converts them (TASK-041)', async () => {
    const doc = example() as Doc & { people: Record<string, unknown>[]; lineupTemplates: Record<string, unknown>[] };
    doc.people[2]!.roles = ['SAX', 'HORN_2', 'TECHNICIAN'];
    // Legacy lineup format: roles (with removed codes) instead of lines.
    doc.lineupTemplates[0] = {
      name: doc.lineupTemplates[0]!.name,
      roles: [
        { role: 'VOC', defaultFeeCents: 10000 },
        { role: 'HORN_1', defaultFeeCents: 10000 },
        { role: 'HORN_2', defaultFeeCents: 10000 },
      ],
    };
    const res = await post(doc, '?filename=old.json');
    expect(res.statusCode).toBe(200);
    const db = testDb();
    expect((await db.person.findFirstOrThrow({ where: { name: doc.people[2]!.name as string } })).roles).toEqual(['MIX', 'SAX']);
    const template = await db.lineupTemplate.findFirstOrThrow({
      where: { name: doc.lineupTemplates[0].name as string },
      include: { lines: { orderBy: { position: 'asc' } } },
    });
    expect(template.lines.map((r) => r.type)).toEqual(['VOC', 'TRUMPET', 'TROMBONE', 'OFFICE', 'SALES', 'PRODUCTION']);
  });

  it('converts PIANO to KEYS and drops OTHER_ROLE from person roles (TASK-052)', async () => {
    const doc = example() as Doc & {
      people: Record<string, unknown>[];
      lineupTemplates: Record<string, unknown>[];
      events: { costLines?: Record<string, unknown>[] }[];
    };
    doc.people[2]!.roles = ['PIANO', 'OTHER_ROLE', 'KEYS', 'VOC'];
    doc.lineupTemplates[0] = {
      name: doc.lineupTemplates[0]!.name,
      lines: [
        { type: 'VOC', defaultCents: 10000 },
        { type: 'PIANO', defaultCents: 10000 },
        { type: 'OTHER_ROLE', description: 'Role 1', defaultCents: 10000 },
      ],
    };
    const event = doc.events.find((e) => (e.costLines ?? []).length > 0)!;
    event.costLines = [{ type: 'PIANO', budgetedCents: 10000 }, ...event.costLines!];
    const res = await post(doc, '?filename=old.json');
    expect(res.statusCode).toBe(200);
    const db = testDb();
    expect((await db.person.findFirstOrThrow({ where: { name: doc.people[2]!.name as string } })).roles).toEqual(['VOC', 'KEYS']);
    const template = await db.lineupTemplate.findFirstOrThrow({
      where: { name: doc.lineupTemplates[0].name as string },
      include: { lines: { orderBy: { position: 'asc' } } },
    });
    expect(template.lines.map((r) => r.type)).toEqual(['VOC', 'KEYS', 'OTHER_ROLE']);
    expect(await db.costLine.count({ where: { type: 'KEYS', personId: null } })).toBeGreaterThanOrEqual(1);
    for (const p of await db.person.findMany()) expect(p.roles).not.toContain('OTHER_ROLE');
  });

  it('rejects a document with both `events` and `gigs` and imports nothing (TASK-032)', async () => {
    const before = await snapshot();
    const res = await post({ ...example(), gigs: [] });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
    expect(errorsOf(res)).toEqual(['gigs: legacy name of events; use only one of "events" and "gigs"']);
    expect(await snapshot()).toEqual(before);
  });

  it('reports cross-reference errors with the same texts as the seed command', async () => {
    const doc = example();
    (doc.tasks as { owner: string }[])[0]!.owner = `nobody@${TEST_DOMAIN}`;
    const res = await post(doc, '?dryRun=true');
    expect(res.statusCode).toBe(400);
    expect(errorsOf(res)).toEqual([`tasks.0.owner: unknown partner nobody@${TEST_DOMAIN}`]);
  });

  it('rejects partner emails outside AUTH_ALLOWED_DOMAIN, together with other errors', async () => {
    const doc = example();
    doc.partners.push({ name: 'Partner Z', email: 'partner.z@other.test' });
    (doc.hours as { hours: number }[])[0]!.hours = 0.3;
    const res = await post(doc);
    expect(res.statusCode).toBe(400);
    const errors = errorsOf(res);
    expect(errors).toContain(
      `partners.${doc.partners.length - 1}.email: partner.z@other.test is not in the allowed sign-in domain ${TEST_DOMAIN}`,
    );
    expect(errors.some((e) => e.startsWith('hours.0.hours'))).toBe(true);
    expect(await testDb().partner.count()).toBe(1);
  });

  it('rejects any reference image path (no server file access)', async () => {
    const doc = example();
    doc.references[1]!.image = 'photos/person1.jpg';
    doc.references[2]!.image = '../../etc/passwd';
    const res = await post(doc, '?dryRun=true');
    expect(res.statusCode).toBe(400);
    expect(errorsOf(res)).toEqual([
      'references.1.image: image paths are not allowed in an import',
      'references.2.image: image paths are not allowed in an import',
    ]);
  });

  it('validates the query', async () => {
    const bad = await post(example(), '?dryRun=yes');
    expect(bad.statusCode).toBe(400);
    expect(bad.json().error.fields).toEqual({ dryRun: 'INVALID_VALUE' });
    const long = await post(example(), `?filename=${'a'.repeat(201)}`);
    expect(long.statusCode).toBe(400);
    expect(long.json().error.fields).toEqual({ filename: 'TOO_LONG' });
    expect(await testDb().importRun.count()).toBe(0);
  });
});

describe('GET /api/import/runs', () => {
  it('lists real imports newest first with partner, time, file name and counts; dry runs are not logged', async () => {
    expect((await app.inject({ method: 'GET', url: '/api/import/runs', headers: { cookie } })).json()).toEqual([]);

    const first = await post(example(), '?filename=first.json');
    await post(example(), '?dryRun=true&filename=dry.json');
    const second = await post(example(), '?filename=%20');

    const res = await app.inject({ method: 'GET', url: '/api/import/runs', headers: { cookie } });
    expect(res.statusCode).toBe(200);
    const runs = res.json<{ id: string; partnerId: string; at: string; filename: string | null; summary: SeedSummary }[]>();
    expect(runs).toHaveLength(2);
    expect(runs.map((r) => r.filename)).toEqual([null, 'first.json']);
    expect(runs[0]).toEqual({
      id: expect.any(String),
      partnerId: me.id,
      at: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
      filename: null,
      summary: second.json().summary,
    });
    expect(runs[1]!.summary).toEqual(first.json().summary);
    expect(runs[0]!.at >= runs[1]!.at).toBe(true);
  });

  it('returns the last 50', async () => {
    const summary = { partners: { created: 0, updated: 0, skipped: 1 } };
    await testDb().importRun.createMany({
      data: Array.from({ length: 55 }, (_, i) => ({ partnerId: me.id, at: new Date(Date.UTC(2026, 0, 1, 0, i)), filename: `f${i}.json`, summary })),
    });
    const runs = (await app.inject({ method: 'GET', url: '/api/import/runs', headers: { cookie } })).json<{ filename: string }[]>();
    expect(runs).toHaveLength(50);
    expect(runs[0]!.filename).toBe('f54.json');
    expect(runs[49]!.filename).toBe('f5.json');
  });
});
