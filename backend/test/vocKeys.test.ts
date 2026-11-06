/**
 * New musician role VOC_KEYS "Vocal & Keys" (TASK-054; api-contract "New musician role "Vocal & Keys"",
 * 2026-11-07): migration 20261107130000_voc_keys_role adds the enum value right after BACKING_VOC;
 * the role behaves like every other musician role. Synthetic data only.
 */
import path from 'node:path';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { COST_TYPES, MUSICIAN_ROLES, PERSON_ROLES } from '../src/domain/enums.js';
import { loadSeed, readSeedFile } from '../seed/load.js';
import { validateSeed } from '../seed/schema.js';
import { closeTestDb, resetDb, testDb } from './helpers.js';
import { call, createEvent, type Json, startSession, type Session } from './eventFixtures.js';

let s: Session;

beforeEach(async () => {
  await resetDb();
  s = await startSession();
});
afterEach(async () => {
  await s.app.close();
});
afterAll(closeTestDb);

type Line = { id: string; type: string; personId: string | null; budgetedCents: number };

describe('VOC_KEYS role', () => {
  it('is placed right after BACKING_VOC in the app lists and in the migrated database enum', async () => {
    for (const list of [PERSON_ROLES, MUSICIAN_ROLES, COST_TYPES] as readonly (readonly string[])[]) {
      expect(list.indexOf('VOC_KEYS')).toBe(list.indexOf('BACKING_VOC') + 1);
    }
    const rows = await testDb().$queryRawUnsafe<{ v: string }[]>(
      `SELECT e.enumlabel AS v FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
       WHERE t.typname = 'CostType' AND t.typnamespace = current_schema()::regnamespace ORDER BY e.enumsortorder`,
    );
    expect(rows.map((r) => r.v)).toEqual([...COST_TYPES]);
  });

  it('is accepted in person roles (stored in MUSICIAN_ROLES order) and by the role filter', async () => {
    const { p1, p2 } = s.world;
    const res = await call(s, 'PATCH', `/api/people/${p1.id}`, { roles: ['KEYS', 'VOC_KEYS', 'VOC', 'BACKING_VOC'] });
    expect(res.statusCode).toBe(200);
    expect(res.json().person.roles).toEqual(['VOC', 'BACKING_VOC', 'VOC_KEYS', 'KEYS']);
    expect((await testDb().person.findUniqueOrThrow({ where: { id: p1.id } })).roles).toEqual([
      'VOC',
      'BACKING_VOC',
      'VOC_KEYS',
      'KEYS',
    ]);
    await call(s, 'PATCH', `/api/people/${p2.id}`, { roles: ['KEYS'] });

    const list = await call(s, 'GET', '/api/people?role=VOC_KEYS');
    expect(list.statusCode).toBe(200);
    expect(list.json<{ name: string }[]>().map((p) => p.name)).toEqual(['Person 1']);

    const bad = await call(s, 'GET', '/api/people?role=voc_keys');
    expect(bad.statusCode).toBe(400);
  });

  it('works as a musician cost line: load-in switch and event count', async () => {
    const { p1 } = s.world;
    const event = await createEvent(s);
    const added = await call(s, 'POST', `/api/events/${event.id}/cost-lines`, {
      type: 'VOC_KEYS',
      personId: p1.id,
      budgetedCents: 30000,
    });
    expect(added.statusCode).toBe(200);
    const line = (added.json().event.costLines as Line[]).find((l) => l.type === 'VOC_KEYS')!;
    expect(line).toMatchObject({ personId: p1.id, budgetedCents: 30000 });

    const off = await call(s, 'PATCH', `/api/cost-lines/${line.id}`, { joinsLoadIn: false });
    expect(off.statusCode).toBe(200);
    expect((off.json().event.costLines as Json[]).find((l) => l.id === line.id)).toMatchObject({
      joinsLoadIn: false,
      loadInDeductionAppliedCents: 10000,
    });

    // A played SOLD event with a VOC_KEYS line counts for the person
    await testDb().event.update({ where: { id: event.id }, data: { startDate: new Date('2020-06-01'), status: 'SOLD' } });
    const people = await call(s, 'GET', '/api/people?active=all');
    expect(people.json<Json[]>().find((p) => p.id === p1.id)).toMatchObject({ eventCount: 1 });
  });

  it('is accepted in seed files (person roles, lineup lines, cost lines)', async () => {
    await resetDb(); // the seed is loaded into an empty database
    type Doc = Record<string, unknown> & {
      people: Record<string, unknown>[];
      lineupTemplates: { name: string; lines: Record<string, unknown>[] }[];
      events: { costLines: Record<string, unknown>[] }[];
    };
    const data = structuredClone(readSeedFile(path.resolve(import.meta.dirname, '../seed/seed.example.json'))) as Doc;
    data.people[0]!.roles = ['VOC_KEYS', 'VOC'];
    data.lineupTemplates[0]!.lines[0]!.type = 'VOC_KEYS';
    data.events[0]!.costLines[0]!.type = 'VOC_KEYS';
    expect(validateSeed(data).ok).toBe(true);
    await loadSeed(testDb(), data);

    const db = testDb();
    expect((await db.person.findFirstOrThrow({ where: { name: data.people[0]!.name as string } })).roles).toEqual([
      'VOC',
      'VOC_KEYS',
    ]);
    const template = await db.lineupTemplate.findFirstOrThrow({
      where: { name: data.lineupTemplates[0]!.name },
      include: { lines: { orderBy: { position: 'asc' } } },
    });
    expect(template.lines[0]!.type).toBe('VOC_KEYS');
    expect(await db.costLine.count({ where: { type: 'VOC_KEYS' } })).toBe(1);
  });
});
