/**
 * Migration 20261031130000_event_invoice_status (TASK-045): events with `ready_for_invoice_at` set get
 * invoice_status READY with the same at/by (deleted and cancelled events too); others get NONE with
 * null at/by; prepayment_cents defaults to 0 with a ≥ 0 check; the two ready columns are dropped;
 * history and the READY_FOR_INVOICE[_CLEARED] history types stay. Nothing else changes.
 * Runs the real migration files in a scratch schema inside a transaction that is rolled back.
 * Synthetic data only.
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import type { Prisma } from '../src/generated/prisma/client.js';
/** The InvoiceStatus values this migration created (the enum is dropped again by TASK-046). */
const INVOICE_STATUSES = ['NONE', 'READY', 'PREPAYMENT_PAID', 'INVOICED', 'PAID'];
import { closeTestDb, testDb } from './helpers.js';

const MIGRATIONS = path.resolve(import.meta.dirname, '../prisma/migrations');
const UNDER_TEST = '20261031130000_event_invoice_status';
const BEFORE = readdirSync(MIGRATIONS)
  .filter((m) => /^\d{14}_/.test(m) && m < UNDER_TEST)
  .sort();
const SCHEMA = 'migration_test_task045';

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
  events: Row[];
  columns: string[];
  history: Row[];
  enumValues: string[];
  historyTypes: string[];
  negativeRejected: boolean;
  removedPartnerSetsNull: unknown;
}

/** [event n, status, deleted, ready at (or null), ready by partner n (or null)] */
const EVENTS: [number, 'SOLD' | 'CANCELLED', boolean, string | null, number | null][] = [
  [201, 'SOLD', false, null, null],
  [202, 'SOLD', false, '2026-06-01 10:00:00.123', 100],
  [203, 'CANCELLED', false, '2026-06-02 11:00:00', 101],
  [204, 'SOLD', true, '2026-06-03 12:00:00', 100],
  [205, 'CANCELLED', false, null, null],
];

async function migrate(): Promise<Result> {
  let result: Result | undefined;
  await expect(
    testDb().$transaction(
      async (tx) => {
        const x = (sql: string) => tx.$executeRawUnsafe(sql);
        const q = <T = Row>(sql: string) => tx.$queryRawUnsafe<T[]>(sql);
        await x(`CREATE SCHEMA "${SCHEMA}"`);
        await x(`SET LOCAL search_path TO "${SCHEMA}", public`);
        for (const m of BEFORE) await run(tx, m);

        for (const [n, partner] of [[9, 100], [10, 101]] as const) {
          await x(`INSERT INTO "person" ("id", "name", "updated_at") VALUES ('${id(n)}', 'Partner ${n}', now())`);
          await x(
            `INSERT INTO "partner" ("id", "person_id", "email", "updated_at") VALUES ('${id(partner)}', '${id(n)}', 'partner.${n}@example.com', now())`,
          );
        }
        for (const [n, status, deleted, readyAt, readyBy] of EVENTS) {
          await x(
            `INSERT INTO "event" ("id", "start_date", "status", "lineup_name", "venue", "seller_id", "producer_id", "price_cents",
               "additional_sales_cents", "deleted_at", "ready_for_invoice_at", "ready_for_invoice_by", "updated_at")
             VALUES ('${id(n)}', '2026-06-01', '${status}', 'Lineup A', 'Venue ${n}', '${id(100)}', '${id(100)}', ${n * 100},
               ${n * 10}, ${deleted ? "'2026-07-01 00:00:00'" : 'NULL'}, ${readyAt ? `'${readyAt}'` : 'NULL'},
               ${readyBy ? `'${id(readyBy)}'` : 'NULL'}, '2026-01-01 12:00:00')`,
          );
        }
        await x(
          `INSERT INTO "event_history" ("id", "event_id", "type", "partner_id", "details", "at", "updated_at")
           VALUES ('${id(801)}', '${id(202)}', 'CREATED', '${id(100)}', '{}', '2026-06-01 10:00:00', now()),
                  ('${id(802)}', '${id(201)}', 'UPDATED', '${id(101)}', '{}', '2026-06-01 11:00:00', now())`,
        );

        await run(tx, UNDER_TEST);

        const events = await q(
          `SELECT "id"::text, "status"::text, "invoice_status"::text, "invoice_status_at"::text, "invoice_status_by"::text,
                  "prepayment_cents", "price_cents", "additional_sales_cents", "deleted_at"::text, "updated_at"::text
           FROM "event" ORDER BY "id"`,
        );
        const columns = (
          await q<{ column_name: string }>(
            `SELECT "column_name" FROM information_schema.columns WHERE "table_schema" = '${SCHEMA}' AND "table_name" = 'event'`,
          )
        ).map((c) => c.column_name);
        const history = await q(`SELECT "id"::text, "type"::text, "partner_id"::text FROM "event_history" ORDER BY "id"`);
        const [labels] = await q<{ values: string[] }>(`SELECT enum_range(NULL::"InvoiceStatus")::text[] AS "values"`);
        // From the catalog: enum_range() would "use" the values added in this transaction (55P04).
        const historyLabels = await q<{ label: string }>(
          `SELECT e."enumlabel" AS "label" FROM pg_enum e JOIN pg_type t ON t."oid" = e."enumtypid"
           JOIN pg_namespace n ON n."oid" = t."typnamespace"
           WHERE t."typname" = 'EventHistoryType' AND n."nspname" = '${SCHEMA}' ORDER BY e."enumsortorder"`,
        );

        // prepayment_cents ≥ 0 is enforced (checked in a savepoint so the transaction survives).
        await x('SAVEPOINT negative');
        let negativeRejected = false;
        try {
          await x(`UPDATE "event" SET "prepayment_cents" = -1 WHERE "id" = '${id(201)}'`);
        } catch {
          negativeRejected = true;
        }
        await x('ROLLBACK TO SAVEPOINT negative');

        // invoice_status_by references partner ON DELETE SET NULL.
        await x(`UPDATE "event" SET "seller_id" = '${id(100)}', "producer_id" = '${id(100)}'`);
        await x(`DELETE FROM "event_history" WHERE "partner_id" = '${id(101)}'`);
        await x(`DELETE FROM "partner" WHERE "id" = '${id(101)}'`);
        const [after] = await q<{ by: string | null }>(`SELECT "invoice_status_by"::text AS "by" FROM "event" WHERE "id" = '${id(203)}'`);

        result = {
          events,
          columns,
          history,
          enumValues: labels!.values,
          historyTypes: historyLabels.map((l) => l.label),
          negativeRejected,
          removedPartnerSetsNull: after!.by,
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
  it('copies the ready flag into READY with the same at/by before dropping the old columns', async () => {
    const r = await migrate();

    expect(r.events.map((e) => [e.id, e.invoice_status, e.invoice_status_at, e.invoice_status_by])).toEqual([
      [id(201), 'NONE', null, null],
      [id(202), 'READY', '2026-06-01 10:00:00.123', id(100)],
      [id(203), 'READY', '2026-06-02 11:00:00', id(101)],
      [id(204), 'READY', '2026-06-03 12:00:00', id(100)], // deleted event too
      [id(205), 'NONE', null, null],
    ]);
    // Nothing else changes; prepayment defaults to 0.
    for (const [i, e] of r.events.entries()) {
      const [n, status, deleted] = EVENTS[i]!;
      expect(e).toMatchObject({
        status,
        prepayment_cents: 0,
        price_cents: n * 100,
        additional_sales_cents: n * 10,
        deleted_at: deleted ? '2026-07-01 00:00:00' : null,
        updated_at: '2026-01-01 12:00:00',
      });
    }

    expect(r.columns).toEqual(expect.arrayContaining(['invoice_status', 'invoice_status_at', 'invoice_status_by', 'prepayment_cents']));
    expect(r.columns).not.toContain('ready_for_invoice_at');
    expect(r.columns).not.toContain('ready_for_invoice_by');

    // History is untouched and the old READY_FOR_INVOICE[_CLEARED] types stay, so their entries keep
    // their texts. (Rows with those types can't be inserted here: Postgres forbids using enum values
    // added earlier in the same transaction.)
    expect(r.history).toEqual([
      { id: id(801), type: 'CREATED', partner_id: id(100) },
      { id: id(802), type: 'UPDATED', partner_id: id(101) },
    ]);
    expect(r.historyTypes).toEqual(expect.arrayContaining(['READY_FOR_INVOICE', 'READY_FOR_INVOICE_CLEARED']));

    expect(r.enumValues).toEqual([...INVOICE_STATUSES]);
    expect(r.negativeRejected).toBe(true);
    expect(r.removedPartnerSetsNull).toBeNull();
  });
});
