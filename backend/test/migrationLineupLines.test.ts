/**
 * Migration 20261106120000_lineup_lines: template_role becomes lineup_line (rows and order kept),
 * lineup_template gains `active` (true), every lineup gets OFFICE / SALES / PRODUCTION lines after its
 * roles with the amounts of the old fee settings READ FROM THE DATABASE (missing row → 0), and those
 * three setting rows are deleted. Runs the real migration files in a scratch schema inside a
 * transaction that is rolled back. Synthetic data only.
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import type { Prisma } from '../src/generated/prisma/client.js';
import { closeTestDb, testDb } from './helpers.js';

const MIGRATIONS = path.resolve(import.meta.dirname, '../prisma/migrations');
const UNDER_TEST = '20261106120000_lineup_lines';
const BEFORE = readdirSync(MIGRATIONS)
  .filter((m) => /^\d{14}_/.test(m) && m < UNDER_TEST)
  .sort();
const SCHEMA = 'migration_test_lineup_lines';

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

class Rollback extends Error {}

type Row = Record<string, unknown>;

interface Result {
  templates: Row[];
  lines: Row[];
  settings: Row[];
  eventLink: Row[];
}

/** Old settings: key → value_cents (absent key = no row). */
async function migrate(oldSettings: Record<string, number>): Promise<Result> {
  let result: Result | undefined;
  await expect(
    testDb().$transaction(
      async (tx) => {
        const x = (sql: string) => tx.$executeRawUnsafe(sql);
        await x(`CREATE SCHEMA "${SCHEMA}"`);
        await x(`SET LOCAL search_path TO "${SCHEMA}", public`);
        for (const m of BEFORE) await run(tx, m);

        let n = 900;
        for (const [key, value] of Object.entries(oldSettings)) {
          await x(`INSERT INTO "setting" ("id", "key", "value_cents", "updated_at") VALUES ('${id(n++)}', '${key}', ${value}, now())`);
        }
        await x(`INSERT INTO "setting" ("id", "key", "value_cents", "updated_at") VALUES ('${id(n)}', 'fees.load_in_deduction', 1000, now())`);
        await x(
          `INSERT INTO "lineup_template" ("id", "name", "updated_at")
           VALUES ('${id(1)}', 'Template A', now()), ('${id(2)}', 'Template B', now())`,
        );
        // Template A: two roles with a gap in positions; Template B: no roles.
        await x(
          `INSERT INTO "template_role" ("id", "template_id", "position", "role", "default_fee_cents", "updated_at")
           VALUES ('${id(11)}', '${id(1)}', 0, 'VOC', 30000, now()),
                  ('${id(12)}', '${id(1)}', 2, 'BASS', 20000, now())`,
        );
        await x(`INSERT INTO "person" ("id", "name", "updated_at") VALUES ('${id(21)}', 'Partner A', now())`);
        await x(`INSERT INTO "partner" ("id", "person_id", "email", "updated_at") VALUES ('${id(31)}', '${id(21)}', 'partner.a@example.com', now())`);
        await x(
          `INSERT INTO "event" ("id", "start_date", "lineup_template_id", "lineup_name", "venue", "seller_id", "producer_id", "price_cents", "updated_at")
           VALUES ('${id(41)}', '2026-05-01', '${id(1)}', 'Template A', 'Venue X', '${id(31)}', '${id(31)}', 100000, now())`,
        );

        await run(tx, UNDER_TEST);

        result = {
          templates: await tx.$queryRawUnsafe<Row[]>(`SELECT "id"::text, "name", "active" FROM "lineup_template" ORDER BY "name"`),
          lines: await tx.$queryRawUnsafe<Row[]>(
            `SELECT "template_id"::text, "position", "type"::text, "description", "default_cents"
             FROM "lineup_line" ORDER BY "template_id", "position"`,
          ),
          settings: await tx.$queryRawUnsafe<Row[]>(`SELECT "key", "value_cents" FROM "setting" ORDER BY "key"`),
          eventLink: await tx.$queryRawUnsafe<Row[]>(`SELECT "lineup_template_id"::text FROM "event"`),
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
  it('keeps roles, appends OFFICE/SALES/PRODUCTION with the old setting values, deletes those settings', async () => {
    const r = await migrate({ 'fees.office_default': 11000, 'fees.sales_default': 12000, 'fees.production_default': 13000 });
    expect(r.templates).toEqual([
      { id: id(1), name: 'Template A', active: true },
      { id: id(2), name: 'Template B', active: true },
    ]);
    expect(r.lines).toEqual([
      { template_id: id(1), position: 0, type: 'VOC', description: null, default_cents: 30000 },
      { template_id: id(1), position: 2, type: 'BASS', description: null, default_cents: 20000 },
      { template_id: id(1), position: 3, type: 'OFFICE', description: null, default_cents: 11000 },
      { template_id: id(1), position: 4, type: 'SALES', description: null, default_cents: 12000 },
      { template_id: id(1), position: 5, type: 'PRODUCTION', description: null, default_cents: 13000 },
      { template_id: id(2), position: 0, type: 'OFFICE', description: null, default_cents: 11000 },
      { template_id: id(2), position: 1, type: 'SALES', description: null, default_cents: 12000 },
      { template_id: id(2), position: 2, type: 'PRODUCTION', description: null, default_cents: 13000 },
    ]);
    expect(r.settings).toEqual([{ key: 'fees.load_in_deduction', value_cents: 1000 }]);
    expect(r.eventLink).toEqual([{ lineup_template_id: id(1) }]);
  });

  it('a missing old setting row counts as 0', async () => {
    const r = await migrate({ 'fees.sales_default': 12000 });
    expect(r.lines.filter((l) => l.template_id === id(2)).map((l) => [l.type, l.default_cents])).toEqual([
      ['OFFICE', 0],
      ['SALES', 12000],
      ['PRODUCTION', 0],
    ]);
    expect(r.settings.map((s) => s.key)).toEqual(['fees.load_in_deduction']);
  });
});
