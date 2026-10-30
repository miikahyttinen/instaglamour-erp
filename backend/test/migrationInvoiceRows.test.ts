/**
 * Migration 20261031140000_invoice_rows (TASK-046): the event's invoice status + prepayment are
 * converted into invoice rows exactly per api-contract "Invoice rows", then the old columns and the
 * InvoiceStatus enum are dropped:
 *   prepayment > 0 → PAID "Ennakkomaksu" (prepayment); then READY/INVOICED/PAID → READY/SENT/PAID
 *   "Lasku" for the balance (total − prepayment); PREPAYMENT_PAID/NONE → nothing more; amount > 0 only.
 * Runs the real migration files in a scratch schema inside a transaction that is rolled back.
 * Synthetic data only.
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import type { Prisma } from '../src/generated/prisma/client.js';
import { closeTestDb, testDb } from './helpers.js';

const MIGRATIONS = path.resolve(import.meta.dirname, '../prisma/migrations');
const UNDER_TEST = '20261031140000_invoice_rows';
const BEFORE = readdirSync(MIGRATIONS)
  .filter((m) => /^\d{14}_/.test(m) && m < UNDER_TEST)
  .sort();
const SCHEMA = 'migration_test_task046';

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

type OldStatus = 'NONE' | 'READY' | 'PREPAYMENT_PAID' | 'INVOICED' | 'PAID';

/**
 * [event n, status, deleted, price, additional sales, old invoice status, status at, status by partner n, prepayment]
 */
const EVENTS: [number, 'SOLD' | 'CANCELLED', boolean, number, number, OldStatus, string | null, number | null, number][] = [
  [301, 'SOLD', false, 1000, 100, 'NONE', null, null, 0], // nothing
  [302, 'SOLD', false, 1000, 100, 'READY', '2026-06-01 10:00:00.123', 100, 0], // READY 1100
  [303, 'SOLD', false, 1000, 0, 'INVOICED', '2026-06-02 11:00:00', 101, 300], // PAID 300 + SENT 700
  [304, 'SOLD', false, 2000, 0, 'PAID', '2026-06-03 12:00:00', 100, 0], // PAID 2000
  [305, 'SOLD', false, 1000, 0, 'PAID', '2026-06-04 12:00:00', 100, 1000], // PAID 1000 prepayment only (balance 0)
  [306, 'SOLD', false, 1000, 0, 'PREPAYMENT_PAID', '2026-06-05 12:00:00', 101, 200], // PAID 200 only
  [307, 'SOLD', false, 1000, 0, 'NONE', null, null, 150], // PAID 150 only
  [308, 'SOLD', false, 1000, 0, 'READY', '2026-06-06 12:00:00', 100, 1500], // PAID 1500 only (balance < 0)
  [309, 'CANCELLED', true, 500, 0, 'INVOICED', '2026-06-07 12:00:00', 101, 0], // deleted + cancelled: SENT 500
  [310, 'SOLD', false, 800, 0, 'READY', null, null, 0], // seeded status without at/by: READY 800, at = now
  [311, 'SOLD', false, 1000, 0, 'PREPAYMENT_PAID', null, null, 0], // nothing
  [312, 'SOLD', false, 0, 0, 'PAID', null, null, 0], // total 0: nothing
];

interface Result {
  rows: Row[];
  columns: string[];
  rowColumns: string[];
  oldEnumExists: boolean;
  historyTypes: string[];
  history: Row[];
  events: Row[];
  zeroRejected: boolean;
  startedAt: string;
  cascadeLeft: number;
}

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
        for (const [n, status, deleted, price, add, invoiceStatus, at, by, prepayment] of EVENTS) {
          await x(
            `INSERT INTO "event" ("id", "start_date", "status", "lineup_name", "venue", "seller_id", "producer_id", "price_cents",
               "additional_sales_cents", "deleted_at", "invoice_status", "invoice_status_at", "invoice_status_by",
               "prepayment_cents", "updated_at")
             VALUES ('${id(n)}', '2026-06-01', '${status}', 'Lineup A', 'Venue ${n}', '${id(100)}', '${id(100)}', ${price},
               ${add}, ${deleted ? "'2026-07-01 00:00:00'" : 'NULL'}, '${invoiceStatus}', ${at ? `'${at}'` : 'NULL'},
               ${by ? `'${id(by)}'` : 'NULL'}, ${prepayment}, '2026-01-01 12:00:00')`,
          );
        }
        await x(
          `INSERT INTO "event_history" ("id", "event_id", "type", "partner_id", "details", "at", "updated_at")
           VALUES ('${id(801)}', '${id(302)}', 'CREATED', '${id(100)}', '{}', '2026-06-01 10:00:00', now()),
                  ('${id(802)}', '${id(303)}', 'UPDATED', '${id(101)}',
                   '{"changes":[{"field":"invoiceStatus","from":"NONE","to":"INVOICED"}]}', '2026-06-01 11:00:00', now())`,
        );

        const [{ started }] = (await q<{ started: string }>(
          `SELECT date_trunc('milliseconds', now() AT TIME ZONE 'UTC')::text AS "started"`,
        )) as [{ started: string }];

        await run(tx, UNDER_TEST);

        const rows = await q(
          `SELECT "event_id"::text, "description", "amount_cents", "status"::text, "status_at"::text, "status_by"::text,
                  "created_at", "created_by"::text
           FROM "invoice_row" ORDER BY "event_id", "created_at", "id"`,
        );
        const cols = (table: string) =>
          q<{ column_name: string }>(
            `SELECT "column_name" FROM information_schema.columns WHERE "table_schema" = '${SCHEMA}' AND "table_name" = '${table}'`,
          ).then((r) => r.map((c) => c.column_name));
        const columns = await cols('event');
        const rowColumns = await cols('invoice_row');
        const [old] = await q<{ n: bigint }>(
          `SELECT count(*) AS "n" FROM pg_type t JOIN pg_namespace n ON n."oid" = t."typnamespace"
           WHERE t."typname" = 'InvoiceStatus' AND n."nspname" = '${SCHEMA}'`,
        );
        // From the catalog: enum_range() would "use" the values added in this transaction (55P04).
        const historyLabels = await q<{ label: string }>(
          `SELECT e."enumlabel" AS "label" FROM pg_enum e JOIN pg_type t ON t."oid" = e."enumtypid"
           JOIN pg_namespace n ON n."oid" = t."typnamespace"
           WHERE t."typname" = 'EventHistoryType' AND n."nspname" = '${SCHEMA}' ORDER BY e."enumsortorder"`,
        );
        const history = await q(`SELECT "id"::text, "type"::text, "details" FROM "event_history" ORDER BY "id"`);
        const events = await q(
          `SELECT "id"::text, "status"::text, "price_cents", "additional_sales_cents", "deleted_at"::text, "updated_at"::text
           FROM "event" ORDER BY "id"`,
        );

        // amount_cents > 0 is enforced (checked in a savepoint so the transaction survives).
        await x('SAVEPOINT zero');
        let zeroRejected = false;
        try {
          await x(
            `INSERT INTO "invoice_row" ("id", "event_id", "description", "amount_cents", "status_at")
             VALUES ('${id(901)}', '${id(301)}', 'Row', 0, now())`,
          );
        } catch {
          zeroRejected = true;
        }
        await x('ROLLBACK TO SAVEPOINT zero');

        // Hard-deleting an event removes its rows (only the test reset does that; events are soft-deleted).
        await x(`DELETE FROM "event" WHERE "id" = '${id(303)}'`);
        const [left] = await q<{ n: bigint }>(`SELECT count(*) AS "n" FROM "invoice_row" WHERE "event_id" = '${id(303)}'`);

        result = {
          rows,
          columns,
          rowColumns,
          oldEnumExists: Number(old!.n) > 0,
          historyTypes: historyLabels.map((l) => l.label),
          history,
          events,
          zeroRejected,
          startedAt: started,
          cascadeLeft: Number(left!.n),
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
  it('converts invoice status + prepayment into rows, then drops the old columns and enum', async () => {
    const r = await migrate();

    expect(r.rows.map((row) => [row.event_id, row.description, row.amount_cents, row.status])).toEqual([
      [id(302), 'Lasku', 1100, 'READY'],
      [id(303), 'Ennakkomaksu', 300, 'PAID'],
      [id(303), 'Lasku', 700, 'SENT'],
      [id(304), 'Lasku', 2000, 'PAID'],
      [id(305), 'Ennakkomaksu', 1000, 'PAID'],
      [id(306), 'Ennakkomaksu', 200, 'PAID'],
      [id(307), 'Ennakkomaksu', 150, 'PAID'],
      [id(308), 'Ennakkomaksu', 1500, 'PAID'],
      [id(309), 'Lasku', 500, 'SENT'],
      [id(310), 'Lasku', 800, 'READY'],
    ]);

    const byEvent = (n: number) => r.rows.filter((row) => row.event_id === id(n));
    // Balance rows keep the old status's at/by.
    expect(byEvent(302)[0]).toMatchObject({ status_at: '2026-06-01 10:00:00.123', status_by: id(100) });
    expect(byEvent(303)[1]).toMatchObject({ status_at: '2026-06-02 11:00:00', status_by: id(101) });
    expect(byEvent(309)[0]).toMatchObject({ status_at: '2026-06-07 12:00:00', status_by: id(101) });
    // Without an old at: the migration time; the prepayment row: migration time, nobody.
    for (const row of [byEvent(310)[0]!, byEvent(303)[0]!, byEvent(307)[0]!]) {
      expect(row.status_by).toBeNull();
      expect(String(row.status_at) >= r.startedAt).toBe(true);
    }
    // Made by the migration, not a partner; the prepayment row comes first in creation order.
    for (const row of r.rows) expect(row.created_by).toBeNull();
    const [prepay, balance] = byEvent(303);
    expect((balance!.created_at as Date).getTime()).toBeGreaterThan((prepay!.created_at as Date).getTime());

    // Old columns and enum are gone; the new table has its columns.
    for (const c of ['invoice_status', 'invoice_status_at', 'invoice_status_by', 'prepayment_cents']) {
      expect(r.columns).not.toContain(c);
    }
    expect(r.rowColumns.sort()).toEqual(
      ['amount_cents', 'created_at', 'created_by', 'description', 'event_id', 'id', 'status', 'status_at', 'status_by'].sort(),
    );
    expect(r.oldEnumExists).toBe(false);

    // Nothing else changes on events; history keeps its entries and texts; new history types exist.
    for (const [i, e] of r.events.entries()) {
      const [n, status, deleted, price, add] = EVENTS[i]!;
      expect(e).toMatchObject({
        id: id(n),
        status,
        price_cents: price,
        additional_sales_cents: add,
        deleted_at: deleted ? '2026-07-01 00:00:00' : null,
        updated_at: '2026-01-01 12:00:00',
      });
    }
    expect(r.history).toEqual([
      { id: id(801), type: 'CREATED', details: {} },
      { id: id(802), type: 'UPDATED', details: { changes: [{ field: 'invoiceStatus', from: 'NONE', to: 'INVOICED' }] } },
    ]);
    expect(r.historyTypes).toEqual(
      expect.arrayContaining([
        'READY_FOR_INVOICE',
        'READY_FOR_INVOICE_CLEARED',
        'INVOICE_ROW_ADDED',
        'INVOICE_ROW_UPDATED',
        'INVOICE_ROW_REMOVED',
      ]),
    );

    expect(r.zeroRejected).toBe(true);
    expect(r.cascadeLeft).toBe(0);
  });
});
