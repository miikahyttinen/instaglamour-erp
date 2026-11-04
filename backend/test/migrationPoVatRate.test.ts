/**
 * Migration 20261104140000_po_vat_rate: non-destructive new column purchase_order.vat_rate_bp;
 * existing POs with vat_liable = true get the old single rate (setting fees.performer_vat_rate_bp,
 * default 1350 when missing), others 0; vat_liable and amounts are kept. Runs the real migration files
 * in a scratch schema inside a transaction that is rolled back. Synthetic data only.
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import type { Prisma } from '../src/generated/prisma/client.js';
import { closeTestDb, testDb } from './helpers.js';

const MIGRATIONS = path.resolve(import.meta.dirname, '../prisma/migrations');
const UNDER_TEST = '20261104140000_po_vat_rate';
const BEFORE = readdirSync(MIGRATIONS)
  .filter((m) => /^\d{14}_/.test(m) && m < UNDER_TEST)
  .sort();
const SCHEMA = 'migration_test_po_vat_rate';

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

async function migrate(oldRateSetting: number | null): Promise<Row[]> {
  let result: Row[] | undefined;
  await expect(
    testDb().$transaction(
      async (tx) => {
        const x = (sql: string) => tx.$executeRawUnsafe(sql);
        await x(`CREATE SCHEMA "${SCHEMA}"`);
        await x(`SET LOCAL search_path TO "${SCHEMA}", public`);
        for (const m of BEFORE) await run(tx, m);

        if (oldRateSetting !== null) {
          await x(
            `INSERT INTO "setting" ("id", "key", "value_cents", "updated_at")
             VALUES ('${id(900)}', 'fees.performer_vat_rate_bp', ${oldRateSetting}, now())`,
          );
        }
        await x(`INSERT INTO "person" ("id", "name", "updated_at") VALUES ('${id(2)}', 'Person 1', now())`);
        await x(
          `INSERT INTO "purchase_order" ("id", "number", "seq", "person_id", "status", "total_cents", "vat_liable", "updated_at")
           VALUES ('${id(500)}', 'PERSON-1-0001', 1, '${id(2)}', 'PAID', 34050, true, now()),
                  ('${id(501)}', 'PERSON-1-0002', 2, '${id(2)}', 'OPEN', 20000, false, now())`,
        );

        await run(tx, UNDER_TEST);

        result = await tx.$queryRawUnsafe<Row[]>(
          `SELECT "id"::text, "vat_liable", "vat_rate_bp", "total_cents" FROM "purchase_order" ORDER BY "id"`,
        );
        throw new Rollback();
      },
      { timeout: 60_000 },
    ),
  ).rejects.toBeInstanceOf(Rollback);
  return result!;
}

afterAll(closeTestDb);

describe(`migration ${UNDER_TEST}`, () => {
  it('vat_liable = true → 1350 (no old setting), false → 0; nothing else changes', async () => {
    expect(await migrate(null)).toEqual([
      { id: id(500), vat_liable: true, vat_rate_bp: 1350, total_cents: 34050 },
      { id: id(501), vat_liable: false, vat_rate_bp: 0, total_cents: 20000 },
    ]);
  });

  it('uses the old single-rate setting when it was set', async () => {
    expect((await migrate(2400)).map((r) => r.vat_rate_bp)).toEqual([2400, 0]);
  });
});
