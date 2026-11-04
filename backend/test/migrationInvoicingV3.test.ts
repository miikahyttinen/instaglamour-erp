/**
 * Migration 20261104120000_invoicing_v3 (TASK-049): invoice row statuses READY → NOT_SENT and
 * SENT / PAID → SENT (no rows deleted, everything else kept), event.final_invoice_created_at added
 * (null), event_history.partner_id nullable. Runs the real migration files on a populated scratch
 * schema inside a transaction that is rolled back. Synthetic data only.
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import type { Prisma } from '../src/generated/prisma/client.js';
import { closeTestDb, testDb } from './helpers.js';

const MIGRATIONS = path.resolve(import.meta.dirname, '../prisma/migrations');
const UNDER_TEST = '20261104120000_invoicing_v3';
const BEFORE = readdirSync(MIGRATIONS)
  .filter((m) => /^\d{14}_/.test(m) && m < UNDER_TEST)
  .sort();
const SCHEMA = 'migration_test_task049';

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

/** [row n, event n, old status, amount, status at, status by partner n | null, created by partner n | null] */
const ROWS: [number, number, 'READY' | 'SENT' | 'PAID', number, string, number | null, number | null][] = [
  [401, 301, 'READY', 1000, '2026-06-01 10:00:00.123', 100, 100],
  [402, 301, 'SENT', 2000, '2026-06-02 10:00:00', 101, 100],
  [403, 301, 'PAID', 3000, '2026-06-03 10:00:00', 100, null],
  [404, 302, 'PAID', 500, '2026-06-04 10:00:00', null, null], // deleted + cancelled event
  [405, 303, 'READY', 700, '2026-06-05 10:00:00', null, 101],
];
const EXPECTED_STATUS = { READY: 'NOT_SENT', SENT: 'SENT', PAID: 'SENT' } as const;

interface Result {
  rows: Row[];
  events: Row[];
  history: Row[];
  enumValues: string[];
  defaultStatus: string;
  partnerNullable: boolean;
  nullPartnerInserted: number;
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
        for (const [n, status, deleted] of [[301, 'SOLD', false], [302, 'CANCELLED', true], [303, 'SOLD', false]] as const) {
          await x(
            `INSERT INTO "event" ("id", "start_date", "status", "lineup_name", "venue", "seller_id", "producer_id", "price_cents",
               "deleted_at", "updated_at")
             VALUES ('${id(n)}', '2026-06-01', '${status}', 'Lineup A', 'Venue ${n}', '${id(100)}', '${id(100)}', 10000,
               ${deleted ? "'2026-07-01 00:00:00'" : 'NULL'}, '2026-01-01 12:00:00')`,
          );
        }
        for (const [n, eventN, status, amount, at, by, createdBy] of ROWS) {
          await x(
            `INSERT INTO "invoice_row" ("id", "event_id", "description", "amount_cents", "status", "status_at", "status_by",
               "created_at", "created_by")
             VALUES ('${id(n)}', '${id(eventN)}', 'Row ${n}', ${amount}, '${status}', '${at}', ${by ? `'${id(by)}'` : 'NULL'},
               '2026-05-01 00:00:00', ${createdBy ? `'${id(createdBy)}'` : 'NULL'})`,
          );
        }
        await x(
          `INSERT INTO "event_history" ("id", "event_id", "type", "partner_id", "details", "at", "updated_at")
           VALUES ('${id(801)}', '${id(301)}', 'UPDATED', '${id(100)}',
                   '{"invoiceRowId":"${id(403)}","description":"Row 403","amountCents":3000,"status":"PAID"}', '2026-06-01 10:00:00', now())`,
        );

        await run(tx, UNDER_TEST);

        const rows = await q(
          `SELECT "id"::text, "event_id"::text, "description", "amount_cents", "status"::text, "status_at"::text,
                  "status_by"::text, "created_at"::text, "created_by"::text
           FROM "invoice_row" ORDER BY "id"`,
        );
        const events = await q(
          `SELECT "id"::text, "status"::text, "deleted_at"::text, "updated_at"::text, "final_invoice_created_at" FROM "event" ORDER BY "id"`,
        );
        const history = await q(`SELECT "id"::text, "type"::text, "partner_id"::text, "details" FROM "event_history" ORDER BY "id"`);
        const enumValues = (
          await q<{ v: string }>(
            `SELECT e.enumlabel AS "v" FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
             JOIN pg_namespace n ON n.oid = t.typnamespace
             WHERE t.typname = 'InvoiceRowStatus' AND n.nspname = '${SCHEMA}' ORDER BY e.enumsortorder`,
          )
        ).map((r) => r.v);
        await x(
          `INSERT INTO "invoice_row" ("id", "event_id", "description", "amount_cents", "status_at")
           VALUES ('${id(499)}', '${id(301)}', 'Default', 1, now())`,
        );
        const [{ status: defaultStatus }] = (await q<{ status: string }>(
          `SELECT "status"::text AS "status" FROM "invoice_row" WHERE "id" = '${id(499)}'`,
        )) as [{ status: string }];
        const [{ nullable }] = (await q<{ nullable: string }>(
          `SELECT is_nullable AS "nullable" FROM information_schema.columns
           WHERE table_schema = '${SCHEMA}' AND table_name = 'event_history' AND column_name = 'partner_id'`,
        )) as [{ nullable: string }];
        const nullPartnerInserted = await x(
          `INSERT INTO "event_history" ("id", "event_id", "type", "partner_id", "details", "updated_at")
           VALUES ('${id(802)}', '${id(301)}', 'UPDATED', NULL, '{"auto":true}', now())`,
        );

        result = {
          rows,
          events,
          history,
          enumValues,
          defaultStatus,
          partnerNullable: nullable === 'YES',
          nullPartnerInserted,
        };
        throw new Rollback();
      },
      { timeout: 60_000 },
    ),
  ).rejects.toBeInstanceOf(Rollback);
  return result!;
}

afterAll(closeTestDb);

describe('migration 20261104120000_invoicing_v3', () => {
  it('converts row statuses without losing rows or data; adds final_invoice_created_at; history partner nullable', async () => {
    const r = await migrate();

    expect(r.rows).toEqual(
      ROWS.map(([n, eventN, status, amount, at, by, createdBy]) => ({
        id: id(n),
        event_id: id(eventN),
        description: `Row ${n}`,
        amount_cents: amount,
        status: EXPECTED_STATUS[status],
        status_at: at,
        status_by: by ? id(by) : null,
        created_at: '2026-05-01 00:00:00',
        created_by: createdBy ? id(createdBy) : null,
      })),
    );
    expect(r.enumValues).toEqual(['NOT_SENT', 'SENT']);
    expect(r.defaultStatus).toBe('NOT_SENT');

    // Events unchanged (incl. updated_at); the new column is null everywhere.
    expect(r.events).toEqual([
      { id: id(301), status: 'SOLD', deleted_at: null, updated_at: '2026-01-01 12:00:00', final_invoice_created_at: null },
      { id: id(302), status: 'CANCELLED', deleted_at: '2026-07-01 00:00:00', updated_at: '2026-01-01 12:00:00', final_invoice_created_at: null },
      { id: id(303), status: 'SOLD', deleted_at: null, updated_at: '2026-01-01 12:00:00', final_invoice_created_at: null },
    ]);

    // Old history keeps its texts (PAID stays in the details). (Enum values added earlier in this one
    // transaction can't be used here, so the fixture entry is UPDATED; the details are what matters.)
    expect(r.history).toEqual([
      {
        id: id(801),
        type: 'UPDATED',
        partner_id: id(100),
        details: { invoiceRowId: id(403), description: 'Row 403', amountCents: 3000, status: 'PAID' },
      },
    ]);
    expect(r.partnerNullable).toBe(true);
    expect(r.nullPartnerInserted).toBe(1);
  });
});
