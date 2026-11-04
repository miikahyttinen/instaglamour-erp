/**
 * Migration 20261104130000_po_vat_soundcheck (TASK-050): non-destructive new columns; existing POs
 * become vat_liable = false and existing lines get base = amount, soundcheck = true, deduction = 0,
 * vat = 0. Runs the real migration files in a scratch schema inside a transaction that is rolled back.
 * Synthetic data only.
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import type { Prisma } from '../src/generated/prisma/client.js';
import { closeTestDb, testDb } from './helpers.js';

const MIGRATIONS = path.resolve(import.meta.dirname, '../prisma/migrations');
const UNDER_TEST = '20261104130000_po_vat_soundcheck';
const BEFORE = readdirSync(MIGRATIONS)
  .filter((m) => /^\d{14}_/.test(m) && m < UNDER_TEST)
  .sort();
const SCHEMA = 'migration_test_task050';

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

async function migrate(): Promise<{ pos: Row[]; lines: Row[] }> {
  let result: { pos: Row[]; lines: Row[] } | undefined;
  await expect(
    testDb().$transaction(
      async (tx) => {
        const x = (sql: string) => tx.$executeRawUnsafe(sql);
        const q = (sql: string) => tx.$queryRawUnsafe<Row[]>(sql);
        await x(`CREATE SCHEMA "${SCHEMA}"`);
        await x(`SET LOCAL search_path TO "${SCHEMA}", public`);
        for (const m of BEFORE) await run(tx, m);

        await x(`INSERT INTO "person" ("id", "name", "updated_at") VALUES ('${id(1)}', 'Partner A', now()), ('${id(2)}', 'Person 1', now())`);
        await x(`INSERT INTO "partner" ("id", "person_id", "email", "updated_at") VALUES ('${id(100)}', '${id(1)}', 'partner.a@example.com', now())`);
        await x(
          `INSERT INTO "event" ("id", "start_date", "status", "lineup_name", "venue", "seller_id", "producer_id", "price_cents", "updated_at")
           VALUES ('${id(300)}', '2026-06-01', 'SOLD', 'Lineup A', 'Venue X', '${id(100)}', '${id(100)}', 100000, now())`,
        );
        await x(
          `INSERT INTO "purchase_order" ("id", "number", "seq", "person_id", "status", "total_cents", "updated_at")
           VALUES ('${id(500)}', 'PERSON-1-0001', 1, '${id(2)}', 'PAID', 50000, now())`,
        );
        await x(
          `INSERT INTO "purchase_order_line" ("id", "purchase_order_id", "cost_line_ref", "event_id", "type", "amount_cents", "position", "updated_at")
           VALUES ('${id(600)}', '${id(500)}', '${id(700)}', '${id(300)}', 'VOC', 30000, 0, now()),
                  ('${id(601)}', '${id(500)}', '${id(701)}', '${id(300)}', 'BASS', 20000, 1, now())`,
        );

        await run(tx, UNDER_TEST);

        result = {
          pos: await q(`SELECT "id"::text, "vat_liable", "total_cents" FROM "purchase_order" ORDER BY "id"`),
          lines: await q(
            `SELECT "id"::text, "amount_cents", "base_cents", "soundcheck", "deduction_cents", "vat_cents"
             FROM "purchase_order_line" ORDER BY "id"`,
          ),
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
  it('backfills existing POs and lines without changing amounts', async () => {
    const r = await migrate();
    expect(r.pos).toEqual([{ id: id(500), vat_liable: false, total_cents: 50000 }]);
    expect(r.lines).toEqual([
      { id: id(600), amount_cents: 30000, base_cents: 30000, soundcheck: true, deduction_cents: 0, vat_cents: 0 },
      { id: id(601), amount_cents: 20000, base_cents: 20000, soundcheck: true, deduction_cents: 0, vat_cents: 0 },
    ]);
  });
});
