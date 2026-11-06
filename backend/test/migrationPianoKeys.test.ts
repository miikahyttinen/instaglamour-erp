/**
 * Migration 20261107120000_piano_keys_person_roles (TASK-052): PIANO → KEYS in cost lines, purchase
 * order lines, lineup lines and person roles; OTHER_ROLE removed from person roles (de-duplicated,
 * MUSICIAN_ROLES order); then CostType is recreated without PIANO. History JSON keeps the old code.
 * Runs the real migration files in a scratch schema inside a transaction that is rolled back.
 * Synthetic data only.
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import type { Prisma } from '../src/generated/prisma/client.js';
import { COST_TYPES } from '../src/domain/enums.js';
import { closeTestDb, testDb } from './helpers.js';

const MIGRATIONS = path.resolve(import.meta.dirname, '../prisma/migrations');
const UNDER_TEST = '20261107120000_piano_keys_person_roles';
const BEFORE = readdirSync(MIGRATIONS)
  .filter((m) => /^\d{14}_/.test(m) && m < UNDER_TEST)
  .sort();
const SCHEMA = 'migration_test_task052';

/** Split a migration file into statements (the files have no functions or strings containing ';'). */
function statements(migration: string): string[] {
  const sql = readFileSync(path.join(MIGRATIONS, migration, 'migration.sql'), 'utf8');
  return sql
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('--'))
    .join('\n')
    .split(/;\s*(?:\n|$)/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

async function run(tx: Prisma.TransactionClient, migration: string): Promise<void> {
  for (const statement of statements(migration)) await tx.$executeRawUnsafe(statement);
}

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const sqlRoles = (roles: string[]) => `ARRAY[${roles.map((r) => `'${r}'`).join(', ')}]::"CostType"[]`;

class Rollback extends Error {}

type Row = Record<string, unknown>;

interface Result {
  people: Row[];
  costLines: Row[];
  poLines: Row[];
  lineupLines: Row[];
  history: Row[];
  enumValues: string[];
  newPersonRoles: string[];
  oldCodeRejected: boolean;
}

/** [person n, roles before, roles after] */
const PEOPLE: [number, string[], string[]][] = [
  [1, ['PIANO', 'KEYS'], ['KEYS']],
  [2, ['KEYS', 'PIANO'], ['KEYS']],
  [3, ['PIANO'], ['KEYS']],
  [4, ['OTHER_ROLE'], []],
  [5, ['DJ', 'OTHER_ROLE', 'PIANO', 'VOC'], ['VOC', 'KEYS', 'DJ']],
  [6, ['DJ', 'BASS'], ['DJ', 'BASS']], // untouched, even though not in app order
  [7, [], []],
];

/** [line n, type before, person n | null, type after] */
const COST_LINES: [number, string, number | null, string][] = [
  [301, 'PIANO', 3, 'KEYS'],
  [302, 'PIANO', null, 'KEYS'],
  [303, 'KEYS', 1, 'KEYS'],
  [304, 'OTHER_ROLE', 4, 'OTHER_ROLE'],
  [305, 'FUEL', null, 'FUEL'],
  [306, 'PIANO', 1, 'KEYS'], // on a deleted event: converted too
];

async function migrate(): Promise<Result> {
  let result: Result | undefined;
  await expect(
    testDb().$transaction(
      async (tx) => {
        const x = (sql: string) => tx.$executeRawUnsafe(sql);
        await x(`CREATE SCHEMA "${SCHEMA}"`);
        await x(`SET LOCAL search_path TO "${SCHEMA}", public`);
        for (const m of BEFORE) await run(tx, m);

        for (const [n, roles] of PEOPLE) {
          await x(
            `INSERT INTO "person" ("id", "name", "active", "roles", "updated_at") VALUES ('${id(n)}', 'Person ${n}', true, ${sqlRoles(roles)}, '2026-01-01 12:00:00')`,
          );
        }
        await x(`INSERT INTO "person" ("id", "name", "updated_at") VALUES ('${id(9)}', 'Partner A', now())`);
        await x(`INSERT INTO "partner" ("id", "person_id", "email", "updated_at") VALUES ('${id(100)}', '${id(9)}', 'partner.a@example.com', now())`);
        for (const [n, deleted] of [[201, false], [202, true]] as const) {
          await x(
            `INSERT INTO "event" ("id", "start_date", "status", "lineup_name", "venue", "seller_id", "producer_id", "price_cents", "deleted_at", "updated_at")
             VALUES ('${id(n)}', '2026-06-01', 'SOLD', 'Lineup A', 'Venue X', '${id(100)}', '${id(100)}', 100000, ${deleted ? 'now()' : 'NULL'}, now())`,
          );
        }
        for (const [n, type, person] of COST_LINES) {
          await x(
            `INSERT INTO "cost_line" ("id", "event_id", "type", "person_id", "description", "budgeted_cents", "updated_at")
             VALUES ('${id(n)}', '${id(n === 306 ? 202 : 201)}', '${type}', ${person === null ? 'NULL' : `'${id(person)}'`},
                     ${type === 'OTHER_ROLE' ? "'Role 1'" : 'NULL'}, ${n * 10}, '2026-01-01 12:00:00')`,
          );
        }
        await x(
          `INSERT INTO "purchase_order" ("id", "number", "seq", "person_id", "total_cents", "updated_at")
           VALUES ('${id(600)}', 'po-600', 600, '${id(3)}', 30000, now())`,
        );
        for (const [n, type, position] of [
          [601, 'PIANO', 0],
          [602, 'OTHER_ROLE', 1],
          [603, 'VOC', 2],
        ] as const) {
          await x(
            `INSERT INTO "purchase_order_line" ("id", "purchase_order_id", "cost_line_id", "cost_line_ref", "event_id", "type", "amount_cents", "base_cents", "position", "updated_at")
             VALUES ('${id(n)}', '${id(600)}', NULL, '${id(n)}', '${id(201)}', '${type}', 10000, 10000, ${position}, '2026-01-01 12:00:00')`,
          );
        }
        await x(`INSERT INTO "lineup_template" ("id", "name", "updated_at") VALUES ('${id(700)}', 'Lineup A', now())`);
        for (const [position, type] of ['VOC', 'PIANO', 'KEYS', 'OTHER_ROLE', 'OFFICE'].entries()) {
          await x(
            `INSERT INTO "lineup_line" ("id", "template_id", "position", "type", "default_cents", "description", "updated_at")
             VALUES ('${id(710 + position)}', '${id(700)}', ${position}, '${type}', ${1000 + position},
                     ${type === 'OTHER_ROLE' ? "'Role 1'" : 'NULL'}, '2026-01-01 12:00:00')`,
          );
        }
        await x(
          `INSERT INTO "event_history" ("id", "event_id", "type", "partner_id", "details", "updated_at")
           VALUES ('${id(801)}', '${id(201)}', 'UPDATED', '${id(100)}', '{"costLine": {"type": "PIANO"}}', now())`,
        );

        await run(tx, UNDER_TEST);

        const q = <T = Row>(sql: string) => tx.$queryRawUnsafe<T[]>(sql);
        const people = await q(
          `SELECT "name", "roles"::text[] AS "roles", "updated_at"::text FROM "person" WHERE "id" <> '${id(9)}' ORDER BY "id"`,
        );
        const costLines = await q(
          `SELECT "id"::text, "type"::text, "person_id"::text, "budgeted_cents", "updated_at"::text FROM "cost_line" ORDER BY "id"`,
        );
        const poLines = await q(`SELECT "id"::text, "type"::text, "position", "updated_at"::text FROM "purchase_order_line" ORDER BY "id"`);
        const lineupLines = await q(
          `SELECT "position", "type"::text, "default_cents", "description", "updated_at"::text FROM "lineup_line" ORDER BY "position"`,
        );
        const history = await q(`SELECT "details" FROM "event_history"`);
        const [labels] = await q<{ values: string[] }>(`SELECT enum_range(NULL::"CostType")::text[] AS "values"`);
        await x(`INSERT INTO "person" ("id", "name", "updated_at") VALUES ('${id(10)}', 'Person 10', now())`);
        const [fresh] = await q<{ roles: string[] }>(`SELECT "roles"::text[] AS "roles" FROM "person" WHERE "id" = '${id(10)}'`);
        // PIANO no longer exists (checked in a savepoint so the transaction survives).
        await x('SAVEPOINT old_code');
        let oldCodeRejected = false;
        try {
          await x(`UPDATE "cost_line" SET "type" = 'PIANO' WHERE "id" = '${id(303)}'`);
        } catch {
          oldCodeRejected = true;
        }
        await x('ROLLBACK TO SAVEPOINT old_code');

        result = {
          people,
          costLines,
          poLines,
          lineupLines,
          history,
          enumValues: labels!.values,
          newPersonRoles: fresh!.roles,
          oldCodeRejected,
        };
        throw new Rollback();
      },
      { timeout: 60_000 },
    ),
  ).rejects.toBeInstanceOf(Rollback);
  return result!;
}

afterAll(closeTestDb);

describe(`migration ${UNDER_TEST}`, () => {
  it('converts PIANO to KEYS everywhere, drops OTHER_ROLE from person roles and recreates CostType', async () => {
    const r = await migrate();

    // Person roles: PIANO → KEYS (also with both PIANO and KEYS), OTHER_ROLE dropped, de-duplicated,
    // MUSICIAN_ROLES order; untouched rows keep their order; updated_at not touched
    expect(r.people.map((p) => [p.name, p.roles])).toEqual(PEOPLE.map(([n, , after]) => [`Person ${n}`, after]));
    for (const p of r.people) expect(p.updated_at).toBe('2026-01-01 12:00:00');

    // Cost lines: PIANO → KEYS; OTHER_ROLE lines stay; person, amounts, updated_at kept
    expect(r.costLines.map((c) => [c.id, c.type])).toEqual(COST_LINES.map(([n, , , after]) => [id(n), after]));
    for (const [i, c] of r.costLines.entries()) {
      const [n, , person] = COST_LINES[i]!;
      expect(c).toMatchObject({ person_id: person === null ? null : id(person), budgeted_cents: n * 10, updated_at: '2026-01-01 12:00:00' });
    }

    // Purchase order lines (snapshots): PIANO → KEYS
    expect(r.poLines.map((l) => [l.id, l.type, l.position])).toEqual([
      [id(601), 'KEYS', 0],
      [id(602), 'OTHER_ROLE', 1],
      [id(603), 'VOC', 2],
    ]);

    // Lineup lines: PIANO → KEYS; positions, amounts, descriptions and duplicates kept
    expect(r.lineupLines.map((l) => [l.position, l.type, l.default_cents, l.description])).toEqual([
      [0, 'VOC', 1000, null],
      [1, 'KEYS', 1001, null],
      [2, 'KEYS', 1002, null],
      [3, 'OTHER_ROLE', 1003, 'Role 1'],
      [4, 'OFFICE', 1004, null],
    ]);
    for (const l of r.lineupLines) expect(l.updated_at).toBe('2026-01-01 12:00:00');

    // History keeps the old code
    expect(r.history).toEqual([{ details: { costLine: { type: 'PIANO' } } }]);

    // The enum equals the app's list, the default still works, PIANO is rejected
    expect(r.enumValues).toEqual([...COST_TYPES]);
    expect(r.enumValues).not.toContain('PIANO');
    expect(r.enumValues).toContain('OTHER_ROLE');
    expect(r.newPersonRoles).toEqual([]);
    expect(r.oldCodeRejected).toBe(true);
  });
});
