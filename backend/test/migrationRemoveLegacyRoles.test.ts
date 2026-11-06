/**
 * Migration 20261030120000_remove_legacy_roles (TASK-041): HORN_1 → TRUMPET, TECHNICIAN → MIX,
 * HORN_2 → SAX (person has SAX but not TROMBONE) else TROMBONE, in cost lines, purchase order lines,
 * template roles and person roles (de-duplicated, MUSICIAN_ROLES order); then the CostType enum is
 * recreated without the removed values. Nothing else changes; history JSON keeps the old codes.
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
const UNDER_TEST = '20261030120000_remove_legacy_roles';
const BEFORE = readdirSync(MIGRATIONS)
  .filter((m) => /^\d{14}_/.test(m) && m < UNDER_TEST)
  .sort();
const SCHEMA = 'migration_test_task041';

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
  templateRoles: Row[];
  history: Row[];
  enumValues: string[];
  newPersonRoles: string[];
  oldCodeRejected: boolean;
}

const PEOPLE: [number, string[]][] = [
  [1, ['SAX']],
  [2, ['TROMBONE']],
  [3, ['SAX', 'TROMBONE']],
  [4, []],
  [5, ['TECHNICIAN', 'HORN_1', 'VOC', 'TRUMPET', 'HORN_2', 'SAX', 'MIX']],
  [6, ['HORN_2', 'TROMBONE', 'GUITAR']],
  [7, ['HORN_2']],
  [8, ['DJ', 'BASS']], // untouched, even though not in app order
];

/** [line n, type, person n | null] — expected type after the migration. */
const COST_LINES: [number, string, number | null, string][] = [
  [301, 'HORN_2', 1, 'SAX'],
  [302, 'HORN_2', 2, 'TROMBONE'],
  [303, 'HORN_2', 3, 'TROMBONE'],
  [304, 'HORN_2', 4, 'TROMBONE'],
  [305, 'HORN_2', null, 'TROMBONE'],
  [306, 'HORN_2', 5, 'SAX'],
  [307, 'HORN_2', 7, 'TROMBONE'],
  [308, 'HORN_1', 2, 'TRUMPET'],
  [309, 'HORN_1', null, 'TRUMPET'],
  [310, 'TECHNICIAN', 1, 'MIX'],
  [311, 'TECHNICIAN', null, 'MIX'],
  [312, 'VOC', 1, 'VOC'],
  [313, 'FUEL', null, 'FUEL'],
  [314, 'HORN_2', 1, 'SAX'], // on a deleted event: converted too
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
            `INSERT INTO "cost_line" ("id", "event_id", "type", "person_id", "budgeted_cents", "updated_at")
             VALUES ('${id(n)}', '${id(n === 314 ? 202 : 201)}', '${type}', ${person === null ? 'NULL' : `'${id(person)}'`}, ${n * 10}, '2026-01-01 12:00:00')`,
          );
        }
        for (const [n, person] of [[600, 1], [610, 2]] as const) {
          await x(
            `INSERT INTO "purchase_order" ("id", "number", "seq", "person_id", "total_cents", "updated_at")
             VALUES ('${id(n)}', 'po-${n}', ${n}, '${id(person)}', 10000, now())`,
          );
        }
        for (const [n, po, type, position] of [
          [601, 600, 'HORN_2', 0],
          [602, 600, 'TECHNICIAN', 1],
          [611, 610, 'HORN_2', 0],
          [612, 610, 'HORN_1', 1],
          [613, 610, 'VOC', 2],
        ] as const) {
          await x(
            `INSERT INTO "purchase_order_line" ("id", "purchase_order_id", "cost_line_id", "cost_line_ref", "event_id", "type", "amount_cents", "position", "updated_at")
             VALUES ('${id(n)}', '${id(po)}', NULL, '${id(n)}', '${id(201)}', '${type}', 10000, ${position}, '2026-01-01 12:00:00')`,
          );
        }
        await x(`INSERT INTO "lineup_template" ("id", "name", "updated_at") VALUES ('${id(700)}', 'Template A', now())`);
        for (const [position, role] of ['VOC', 'HORN_1', 'HORN_2', 'TECHNICIAN', 'MIX'].entries()) {
          await x(
            `INSERT INTO "template_role" ("id", "template_id", "position", "role", "default_fee_cents", "updated_at")
             VALUES ('${id(710 + position)}', '${id(700)}', ${position}, '${role}', ${1000 + position}, '2026-01-01 12:00:00')`,
          );
        }
        await x(
          `INSERT INTO "event_history" ("id", "event_id", "type", "partner_id", "details", "updated_at")
           VALUES ('${id(801)}', '${id(201)}', 'UPDATED', '${id(100)}', '{"costLine": {"type": "HORN_1", "from": "TECHNICIAN"}}', now())`,
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
        const templateRoles = await q(
          `SELECT "position", "role"::text, "default_fee_cents", "updated_at"::text FROM "template_role" ORDER BY "position"`,
        );
        const history = await q(`SELECT "details" FROM "event_history"`);
        const [labels] = await q<{ values: string[] }>(`SELECT enum_range(NULL::"CostType")::text[] AS "values"`);
        await x(`INSERT INTO "person" ("id", "name", "updated_at") VALUES ('${id(10)}', 'Person 10', now())`);
        const [fresh] = await q<{ roles: string[] }>(`SELECT "roles"::text[] AS "roles" FROM "person" WHERE "id" = '${id(10)}'`);
        // The removed codes no longer exist (checked in a savepoint so the transaction survives).
        await x('SAVEPOINT old_code');
        let oldCodeRejected = false;
        try {
          await x(`UPDATE "cost_line" SET "type" = 'HORN_1' WHERE "id" = '${id(312)}'`);
        } catch {
          oldCodeRejected = true;
        }
        await x('ROLLBACK TO SAVEPOINT old_code');

        result = {
          people,
          costLines,
          poLines,
          templateRoles,
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
  it('converts every stored role and recreates CostType without the removed codes', async () => {
    const r = await migrate();

    // Person roles: converted (HORN_2 by the person's own roles), de-duplicated, MUSICIAN_ROLES order
    expect(r.people.map((p) => [p.name, p.roles])).toEqual([
      ['Person 1', ['SAX']],
      ['Person 2', ['TROMBONE']],
      ['Person 3', ['SAX', 'TROMBONE']],
      ['Person 4', []],
      ['Person 5', ['VOC', 'MIX', 'SAX', 'TRUMPET']],
      ['Person 6', ['GUITAR', 'TROMBONE']],
      ['Person 7', ['TROMBONE']],
      ['Person 8', ['DJ', 'BASS']],
    ]);
    for (const p of r.people) expect(p.updated_at).toBe('2026-01-01 12:00:00');

    // Cost lines: HORN_2 by the line's person (roles before the migration)
    expect(r.costLines.map((c) => [c.id, c.type])).toEqual(COST_LINES.map(([n, , , expected]) => [id(n), expected]));
    for (const [i, c] of r.costLines.entries()) {
      const [n, , person] = COST_LINES[i]!;
      expect(c).toMatchObject({ person_id: person === null ? null : id(person), budgeted_cents: n * 10, updated_at: '2026-01-01 12:00:00' });
    }

    // Purchase order lines: HORN_2 by the PO's person
    expect(r.poLines.map((l) => [l.id, l.type, l.position])).toEqual([
      [id(601), 'SAX', 0],
      [id(602), 'MIX', 1],
      [id(611), 'TROMBONE', 0],
      [id(612), 'TRUMPET', 1],
      [id(613), 'VOC', 2],
    ]);

    // Template roles: no person → HORN_2 = TROMBONE; positions, fees and duplicates kept
    expect(r.templateRoles.map((t) => [t.position, t.role, t.default_fee_cents])).toEqual([
      [0, 'VOC', 1000],
      [1, 'TRUMPET', 1001],
      [2, 'TROMBONE', 1002],
      [3, 'MIX', 1003],
      [4, 'MIX', 1004],
    ]);

    // History keeps the old codes
    expect(r.history).toEqual([{ details: { costLine: { type: 'HORN_1', from: 'TECHNICIAN' } } }]);

    // The enum equals the app's list of that time (PIANO was removed later, TASK-052), the default
    // still works, old codes are rejected
    // and VOC_KEYS was added later, TASK-054
    expect(r.enumValues).toEqual(
      COST_TYPES.filter((t) => t !== 'VOC_KEYS').flatMap((t) => (t === 'KEYS' ? ['KEYS', 'PIANO'] : [t])),
    );
    expect(r.enumValues).not.toContain('HORN_1');
    expect(r.newPersonRoles).toEqual([]);
    expect(r.oldCodeRejected).toBe(true);
  });
});
