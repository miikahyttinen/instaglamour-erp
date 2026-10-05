/**
 * Data mapping of migration 20261005120000_technical_setup_single_logistics (TASK-010).
 * Runs the real migration files in a scratch schema inside a transaction that is rolled back,
 * so the test database itself is never touched. Synthetic data only.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import type { Prisma } from '../src/generated/prisma/client.js';
import { closeTestDb, testDb } from './helpers.js';

const MIGRATIONS = path.resolve(import.meta.dirname, '../prisma/migrations');
const BEFORE = ['20261003122542_init', '20261003140000_gig_event_seq'];
const UNDER_TEST = '20261005120000_technical_setup_single_logistics';
const SCHEMA = 'migration_test_task010';

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

type Expected = { technicalSetup: string | null; houseTechnician: boolean; logistics: string | null };

/** Old array (SQL literal) → expected new values. */
const CASES: [string, Expected][] = [
  ["ARRAY[]::\"TechnicalSetup\"[]", { technicalSetup: null, houseTechnician: false, logistics: null }],
  ['NULL', { technicalSetup: null, houseTechnician: false, logistics: null }],
  ["ARRAY['OWN_PA']::\"TechnicalSetup\"[]", { technicalSetup: null, houseTechnician: false, logistics: null }],
  ["ARRAY['HOUSE_TECH']::\"TechnicalSetup\"[]", { technicalSetup: 'HOUSE_TECH', houseTechnician: false, logistics: null }],
  ["ARRAY['HOUSE_TECH','HOUSE_TECHNICIAN']::\"TechnicalSetup\"[]", { technicalSetup: 'HOUSE_TECH', houseTechnician: true, logistics: null }],
  ["ARRAY['OWN_PA','VAN']::\"TechnicalSetup\"[]", { technicalSetup: null, houseTechnician: false, logistics: 'OWN_VAN' }],
  ["ARRAY['HOUSE_TECH','SET_C','SET_B']::\"TechnicalSetup\"[]", { technicalSetup: 'SET_B', houseTechnician: false, logistics: null }],
  ["ARRAY['SET_C','SET_A','HOUSE_TECHNICIAN','VAN']::\"TechnicalSetup\"[]", { technicalSetup: 'SET_A', houseTechnician: true, logistics: 'OWN_VAN' }],
  ["ARRAY['HOUSE_TECHNICIAN']::\"TechnicalSetup\"[]", { technicalSetup: null, houseTechnician: true, logistics: null }],
  ["ARRAY['SET_C','OWN_PA']::\"TechnicalSetup\"[]", { technicalSetup: 'SET_C', houseTechnician: false, logistics: null }],
  ["ARRAY['VAN']::\"TechnicalSetup\"[]", { technicalSetup: null, houseTechnician: false, logistics: 'OWN_VAN' }],
];

class Rollback extends Error {}

afterAll(closeTestDb);

describe(`migration ${UNDER_TEST}`, () => {
  it('maps the old technical_setup array and keeps the original values', async () => {
    const results: {
      gigs: { id: string; technical_setup: string | null; house_technician: boolean; logistics: string | null; updated_at: string }[];
      legacy: { gig_id: string; technical_setup: string }[];
      enumValues: string[];
    } = { gigs: [], legacy: [], enumValues: [] };

    await expect(
      testDb().$transaction(
        async (tx) => {
          await tx.$executeRawUnsafe(`CREATE SCHEMA "${SCHEMA}"`);
          await tx.$executeRawUnsafe(`SET LOCAL search_path TO "${SCHEMA}"`);
          for (const m of BEFORE) await run(tx, m);

          await tx.$executeRawUnsafe(`INSERT INTO "person" ("id", "name", "updated_at") VALUES ('${id(900)}', 'Partner A', now())`);
          await tx.$executeRawUnsafe(
            `INSERT INTO "partner" ("id", "person_id", "email", "updated_at") VALUES ('${id(901)}', '${id(900)}', 'partner.a@example.com', now())`,
          );
          for (const [i, [array]] of CASES.entries()) {
            await tx.$executeRawUnsafe(
              `INSERT INTO "gig" ("id", "start_date", "lineup_name", "venue", "technical_setup", "seller_id", "producer_id", "price_cents", "updated_at")
               VALUES ('${id(i + 1)}', '2026-05-01', 'Template A', 'Venue X', ${array}, '${id(901)}', '${id(901)}', 100000, '2026-01-01 12:00:00')`,
            );
          }

          await run(tx, UNDER_TEST);

          results.gigs = await tx.$queryRawUnsafe(
            `SELECT "id"::text, "technical_setup"::text, "house_technician", "logistics"::text, "updated_at"::text FROM "gig" ORDER BY "id"`,
          );
          results.legacy = await tx.$queryRawUnsafe(
            `SELECT "gig_id"::text, array_to_string("technical_setup", ',') AS "technical_setup" FROM "gig_technical_setup_legacy" ORDER BY "gig_id"`,
          );
          const enumRows: { v: string }[] = await tx.$queryRawUnsafe(
            `SELECT unnest(enum_range(NULL::"TechnicalSetup"))::text AS v`,
          );
          results.enumValues = enumRows.map((r) => r.v);
          throw new Rollback();
        },
        { timeout: 30_000 },
      ),
    ).rejects.toBeInstanceOf(Rollback);

    expect(results.gigs.map((g) => ({ technicalSetup: g.technical_setup, houseTechnician: g.house_technician, logistics: g.logistics }))).toEqual(
      CASES.map(([, expected]) => expected),
    );
    // A format change, not an edit.
    for (const g of results.gigs) expect(g.updated_at).toBe('2026-01-01 12:00:00');

    // Every non-empty original array is kept as it was.
    expect(results.legacy).toEqual([
      { gig_id: id(3), technical_setup: 'OWN_PA' },
      { gig_id: id(4), technical_setup: 'HOUSE_TECH' },
      { gig_id: id(5), technical_setup: 'HOUSE_TECH,HOUSE_TECHNICIAN' },
      { gig_id: id(6), technical_setup: 'OWN_PA,VAN' },
      { gig_id: id(7), technical_setup: 'HOUSE_TECH,SET_C,SET_B' },
      { gig_id: id(8), technical_setup: 'SET_C,SET_A,HOUSE_TECHNICIAN,VAN' },
      { gig_id: id(9), technical_setup: 'HOUSE_TECHNICIAN' },
      { gig_id: id(10), technical_setup: 'SET_C,OWN_PA' },
      { gig_id: id(11), technical_setup: 'VAN' },
    ]);

    expect(results.enumValues).toEqual(['HOUSE_TECH', 'SET_A', 'SET_B', 'SET_C']);
  });

  it('left no scratch schema behind', async () => {
    const rows: { n: number }[] = await testDb().$queryRawUnsafe(
      `SELECT count(*)::int AS n FROM information_schema.schemata WHERE schema_name = '${SCHEMA}'`,
    );
    expect(rows[0]!.n).toBe(0);
  });
});
