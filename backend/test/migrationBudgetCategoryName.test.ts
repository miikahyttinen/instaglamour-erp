/**
 * Data mapping of migration 20261005200000_budget_category_name (TASK-012).
 * Runs the real migration files in a scratch schema inside a transaction that is rolled back,
 * so the test database itself is never touched. Synthetic data only.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import type { Prisma } from '../src/generated/prisma/client.js';
import { closeTestDb, testDb } from './helpers.js';

const MIGRATIONS = path.resolve(import.meta.dirname, '../prisma/migrations');
const BEFORE = ['20261003122542_init', '20261003140000_gig_event_seq', '20261005120000_technical_setup_single_logistics'];
const UNDER_TEST = '20261005200000_budget_category_name';
const SCHEMA = 'migration_test_task012';

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

type Before = { code: string; nameFi: string; nameEn: string; budgeted: boolean; active: boolean; sortOrder: number };
type After = { code: string; name: string; active: boolean };

/** Existing row (old columns) → expected row after the migration. */
const CASES: [Before, After][] = [
  // Ordinary row: name from name_fi, still active
  [{ code: 'CAT_A', nameFi: 'Kategoria A', nameEn: 'Category A', budgeted: true, active: true, sortOrder: 0 }, { code: 'CAT_A', name: 'Kategoria A', active: true }],
  // The fuel row is removed by its code (even if it was marked budgeted)
  [{ code: 'FUEL', nameFi: 'Kategoria F', nameEn: 'Category F', budgeted: true, active: true, sortOrder: 1 }, { code: 'FUEL', name: 'Kategoria F', active: false }],
  // Any actuals-only (budgeted = false) row is removed
  [{ code: 'CAT_ACT', nameFi: 'Kategoria G', nameEn: 'Category G', budgeted: false, active: true, sortOrder: 2 }, { code: 'CAT_ACT', name: 'Kategoria G', active: false }],
  // Already inactive stays inactive
  [{ code: 'CAT_OLD', nameFi: 'Kategoria H', nameEn: 'Category H', budgeted: true, active: false, sortOrder: 3 }, { code: 'CAT_OLD', name: 'Kategoria H', active: false }],
  // Whitespace is trimmed
  [{ code: 'CAT_B', nameFi: '  Kategoria B ', nameEn: 'Category B', budgeted: true, active: true, sortOrder: 4 }, { code: 'CAT_B', name: 'Kategoria B', active: true }],
  // Clashes (case-insensitive) with an earlier active row → " (CODE)" appended
  [{ code: 'CAT_A2', nameFi: 'kategoria a', nameEn: 'Category A2', budgeted: true, active: true, sortOrder: 5 }, { code: 'CAT_A2', name: 'kategoria a (CAT_A2)', active: true }],
  // Same name as a row that became inactive: no clash, unchanged
  [{ code: 'CAT_F2', nameFi: 'Kategoria F', nameEn: 'Category F2', budgeted: true, active: true, sortOrder: 6 }, { code: 'CAT_F2', name: 'Kategoria F', active: true }],
];

class Rollback extends Error {}

afterAll(closeTestDb);

describe(`migration ${UNDER_TEST}`, () => {
  it('maps name_fi to name, deactivates FUEL and actuals-only rows, keeps every value', async () => {
    const results: {
      categories: { id: string; code: string | null; name: string; active: boolean; sort_order: number; updated_at: string }[];
      legacy: { category_id: string; code: string; name_fi: string; name_en: string; budgeted: boolean; active: boolean }[];
      years: { category_id: string; year: number; budget_expense_cents: number; actual_expense_cents: number }[];
      columns: string[];
      codeNullable: string;
      insertedWithoutCode: number;
      duplicateRejected: boolean;
    } = { categories: [], legacy: [], years: [], columns: [], codeNullable: '', insertedWithoutCode: 0, duplicateRejected: false };

    await expect(
      testDb().$transaction(
        async (tx) => {
          await tx.$executeRawUnsafe(`CREATE SCHEMA "${SCHEMA}"`);
          await tx.$executeRawUnsafe(`SET LOCAL search_path TO "${SCHEMA}"`);
          for (const m of BEFORE) await run(tx, m);

          for (const [i, [c]] of CASES.entries()) {
            await tx.$executeRawUnsafe(
              `INSERT INTO "budget_category" ("id", "code", "name_fi", "name_en", "budgeted", "active", "sort_order", "updated_at")
               VALUES ('${id(i + 1)}', '${c.code}', '${c.nameFi}', '${c.nameEn}', ${c.budgeted}, ${c.active}, ${c.sortOrder}, '2026-01-01 12:00:00')`,
            );
          }
          // Year values of the fuel row and an ordinary row
          await tx.$executeRawUnsafe(
            `INSERT INTO "budget_year" ("id", "category_id", "year", "budget_expense_cents", "actual_expense_cents", "updated_at") VALUES
             ('${id(101)}', '${id(2)}', 2026, 0, 80000, now()),
             ('${id(102)}', '${id(1)}', 2026, 100000, 90000, now())`,
          );

          await run(tx, UNDER_TEST);

          results.categories = await tx.$queryRawUnsafe(
            `SELECT "id"::text, "code", "name", "active", "sort_order", "updated_at"::text FROM "budget_category" ORDER BY "id"`,
          );
          results.legacy = await tx.$queryRawUnsafe(
            `SELECT "category_id"::text, "code", "name_fi", "name_en", "budgeted", "active" FROM "budget_category_legacy" ORDER BY "category_id"`,
          );
          results.years = await tx.$queryRawUnsafe(
            `SELECT "category_id"::text, "year", "budget_expense_cents", "actual_expense_cents" FROM "budget_year" ORDER BY "id"`,
          );
          const cols: { column_name: string; is_nullable: string }[] = await tx.$queryRawUnsafe(
            `SELECT "column_name", "is_nullable" FROM information_schema.columns WHERE table_schema = '${SCHEMA}' AND table_name = 'budget_category' ORDER BY "column_name"`,
          );
          results.columns = cols.map((c) => c.column_name);
          results.codeNullable = cols.find((c) => c.column_name === 'code')!.is_nullable;

          // A row added in the app has no code
          results.insertedWithoutCode = await tx.$executeRawUnsafe(
            `INSERT INTO "budget_category" ("id", "name", "sort_order", "updated_at") VALUES ('${id(50)}', 'Kategoria Z', 7, now())`,
          );
          // The active-name index exists (savepoint so the failure doesn't abort the transaction)
          await tx.$executeRawUnsafe('SAVEPOINT dup');
          try {
            await tx.$executeRawUnsafe(`INSERT INTO "budget_category" ("id", "name", "updated_at") VALUES ('${id(51)}', ' KATEGORIA Z ', now())`);
          } catch {
            results.duplicateRejected = true;
          }
          await tx.$executeRawUnsafe('ROLLBACK TO SAVEPOINT dup');
          throw new Rollback();
        },
        { timeout: 30_000 },
      ),
    ).rejects.toBeInstanceOf(Rollback);

    expect(results.categories.map((c) => ({ code: c.code, name: c.name, active: c.active }))).toEqual(CASES.map(([, after]) => after));
    // Order and timestamps untouched (a format change, not an edit)
    expect(results.categories.map((c) => c.sort_order)).toEqual(CASES.map(([before]) => before.sortOrder));
    for (const c of results.categories) expect(c.updated_at).toBe('2026-01-01 12:00:00');

    // Every original value is kept
    expect(results.legacy).toEqual(
      CASES.map(([before], i) => ({
        category_id: id(i + 1),
        code: before.code,
        name_fi: before.nameFi,
        name_en: before.nameEn,
        budgeted: before.budgeted,
        active: before.active,
      })),
    );
    // Year values untouched, including the removed fuel row's
    expect(results.years).toEqual([
      { category_id: id(2), year: 2026, budget_expense_cents: 0, actual_expense_cents: 80000 },
      { category_id: id(1), year: 2026, budget_expense_cents: 100000, actual_expense_cents: 90000 },
    ]);

    expect(results.columns).toEqual(['active', 'code', 'created_at', 'id', 'name', 'sort_order', 'updated_at']);
    expect(results.codeNullable).toBe('YES');
    expect(results.insertedWithoutCode).toBe(1);
    expect(results.duplicateRejected).toBe(true);
  });

  it('left no scratch schema behind', async () => {
    const rows: { n: number }[] = await testDb().$queryRawUnsafe(
      `SELECT count(*)::int AS n FROM information_schema.schemata WHERE schema_name = '${SCHEMA}'`,
    );
    expect(rows[0]!.n).toBe(0);
  });
});
