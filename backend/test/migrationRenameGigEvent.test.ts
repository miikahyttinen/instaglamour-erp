/**
 * Migration 20261027120000_rename_gig_event (TASK-032): gig → event is renamed in place. A scratch
 * schema is migrated up to the previous migration, populated through the OLD names, then the
 * migration runs: every row (counts and values), FK, check constraint, index, enum and the history
 * sequence must survive under the new names, and the two stored JSON keys are renamed. Runs the real
 * migration files inside a transaction that is rolled back. Synthetic data only.
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import type { Prisma } from '../src/generated/prisma/client.js';
import { closeTestDb, testDb } from './helpers.js';

const MIGRATIONS = path.resolve(import.meta.dirname, '../prisma/migrations');
const UNDER_TEST = '20261027120000_rename_gig_event';
const BEFORE = readdirSync(MIGRATIONS)
  .filter((m) => /^\d{14}_/.test(m) && m < UNDER_TEST)
  .sort();
const SCHEMA = 'migration_test_task032';

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

/** Tables whose rows must all survive; [old name, new name]. */
const TABLES: [string, string][] = [
  ['gig', 'event'],
  ['gig_event', 'event_history'],
  ['gig_technical_setup_legacy', 'event_technical_setup_legacy'],
  ['cost_line', 'cost_line'],
  ['attachment', 'attachment'],
  ['purchase_order_line', 'purchase_order_line'],
  ['offer_event', 'offer_event'],
  ['import_run', 'import_run'],
];

type Row = Record<string, unknown>;

interface Result {
  before: Record<string, number>;
  after: Record<string, number>;
  events: Row[];
  history: Row[];
  linkColumns: Row[];
  offerEventDetails: unknown[];
  importSummaries: unknown[];
  enums: string[];
  oldObjects: Row[];
  fks: Row[];
  checks: string[];
  indexes: string[];
  seqAfter: bigint;
  seqMaxBefore: bigint;
  cascadeAfterDelete: { cost_line: number; event_history: number; attachment: number };
  negativePriceRejected: boolean;
  restrictKept: boolean;
}

afterAll(closeTestDb);

describe(`migration ${UNDER_TEST}`, () => {
  it('renames gig → event in place and keeps every row, FK, constraint, index and sequence', async () => {
    let result: Result | undefined;

    await expect(
      testDb().$transaction(
        async (tx) => {
          const q = <T = Row>(sql: string) => tx.$queryRawUnsafe<T[]>(sql);
          const x = (sql: string) => tx.$executeRawUnsafe(sql);
          await x(`CREATE SCHEMA "${SCHEMA}"`);
          await x(`SET LOCAL search_path TO "${SCHEMA}", public`);
          for (const m of BEFORE) await run(tx, m);

          // ---- populate through the old names
          await x(`INSERT INTO "person" ("id", "name", "updated_at") VALUES ('${id(1)}', 'Person 1', now()), ('${id(2)}', 'Person 2', now())`);
          await x(`INSERT INTO "partner" ("id", "person_id", "email", "updated_at") VALUES ('${id(100)}', '${id(2)}', 'partner.a@example.com', now())`);
          await x(`INSERT INTO "client" ("id", "name", "updated_at") VALUES ('${id(150)}', 'Client A Oy', now())`);
          await x(
            `INSERT INTO "offer" ("id", "client_id", "event_name", "event_date", "venue", "seller_id", "disposition", "share_token", "share_token_hash", "updated_at")
             VALUES ('${id(160)}', '${id(150)}', 'Event 1', '2026-06-01', 'Venue X', '${id(100)}', 'WON', repeat('t', 43), 'hash-1', now())`,
          );
          const gig = (n: number, startDate: string, extra: { offer?: number; client?: number; deleted?: boolean } = {}) =>
            x(
              `INSERT INTO "gig" ("id", "start_date", "end_date", "status", "lineup_name", "venue", "seller_id", "producer_id", "price_cents", "client_id", "offer_id", "deleted_at", "updated_at")
               VALUES ('${id(n)}', '${startDate}', NULL, 'SOLD', 'Lineup A', 'Venue ${n}', '${id(100)}', '${id(100)}', ${n * 100},
                       ${extra.client ? `'${id(extra.client)}'` : 'NULL'}, ${extra.offer ? `'${id(extra.offer)}'` : 'NULL'}, ${extra.deleted ? 'now()' : 'NULL'}, '2026-01-01 12:00:00')`,
            );
          await gig(201, '2026-06-01', { offer: 160, client: 150 });
          await gig(202, '2026-07-01');
          await gig(203, '2025-03-01', { deleted: true });
          await x(`UPDATE "gig" SET "status" = 'CANCELLED' WHERE "id" = '${id(202)}'`);
          await x(`INSERT INTO "gig_technical_setup_legacy" ("gig_id", "technical_setup") VALUES ('${id(201)}', ARRAY['SET_A', 'SET_B'])`);
          for (const [n, gigN, person] of [[301, 201, 1], [302, 201, null], [303, 202, 1], [304, 203, 1]] as const) {
            await x(
              `INSERT INTO "cost_line" ("id", "gig_id", "type", "person_id", "budgeted_cents", "updated_at")
               VALUES ('${id(n)}', '${id(gigN)}', 'VOC', ${person ? `'${id(person)}'` : 'NULL'}, 10000, now())`,
            );
          }
          await x(
            `INSERT INTO "attachment" ("id", "gig_id", "filename", "content_type", "size_bytes", "storage_key", "uploaded_by", "updated_at")
             VALUES ('${id(401)}', '${id(201)}', 'contract.pdf', 'application/pdf', 10, 'key-401', '${id(100)}', now()),
                    ('${id(402)}', '${id(202)}', 'rider.pdf', 'application/pdf', 20, 'key-402', '${id(100)}', now())`,
          );
          for (const [n, gigN, type] of [[501, 201, 'CREATED'], [502, 201, 'UPDATED'], [503, 202, 'CREATED'], [504, 202, 'CANCELLED']] as const) {
            await x(
              `INSERT INTO "gig_event" ("id", "gig_id", "type", "partner_id", "details", "updated_at")
               VALUES ('${id(n)}', '${id(gigN)}', '${type}', '${id(100)}', '{"n": ${n}}', now())`,
            );
          }
          await x(
            `INSERT INTO "purchase_order" ("id", "number", "seq", "person_id", "total_cents", "updated_at")
             VALUES ('${id(600)}', 'person-1-1', 1, '${id(1)}', 10000, now())`,
          );
          await x(
            `INSERT INTO "purchase_order_line" ("id", "purchase_order_id", "cost_line_id", "cost_line_ref", "gig_id", "type", "amount_cents", "position", "updated_at")
             VALUES ('${id(601)}', '${id(600)}', '${id(303)}', '${id(303)}', '${id(202)}', 'VOC', 10000, 0, now())`,
          );
          await x(
            `INSERT INTO "offer_event" ("id", "offer_id", "type", "partner_id", "details", "updated_at")
             VALUES ('${id(701)}', '${id(160)}', 'CREATED', '${id(100)}', '{}', now()),
                    ('${id(702)}', '${id(160)}', 'CONVERTED', '${id(100)}', '{"gigId": "${id(201)}"}', now()),
                    ('${id(703)}', '${id(160)}', 'UPDATED', '${id(100)}', '{"changes": [{"field": "venue", "from": "A", "to": "B"}]}', now())`,
          );
          const counts = '{"created": 1, "updated": 0, "skipped": 2}';
          await x(
            `INSERT INTO "import_run" ("id", "partner_id", "filename", "summary")
             VALUES ('${id(801)}', '${id(100)}', 'old.json', '{"gigs": ${counts}, "offers": ${counts}}'),
                    ('${id(802)}', '${id(100)}', 'none.json', '{"offers": ${counts}}')`,
          );

          const count = async (table: string) => Number((await q<{ n: bigint }>(`SELECT COUNT(*) AS n FROM "${table}"`))[0]!.n);
          const before: Record<string, number> = {};
          for (const [oldName] of TABLES) before[oldName] = await count(oldName);
          const seqMaxBefore = (await q<{ m: bigint }>(`SELECT MAX("seq") AS m FROM "gig_event"`))[0]!.m;

          // ---- migrate
          await run(tx, UNDER_TEST);

          const after: Record<string, number> = {};
          for (const [oldName, newName] of TABLES) after[oldName] = await count(newName);

          const events = await q(
            `SELECT "id"::text, "start_date"::text, "status"::text, "venue", "price_cents", "client_id"::text, "offer_id"::text,
                    ("deleted_at" IS NOT NULL) AS deleted, "updated_at"::text, pg_typeof("status")::text AS status_type
             FROM "event" ORDER BY "id"`,
          );
          const history = await q(
            `SELECT "id"::text, "event_id"::text, "type"::text, "details", pg_typeof("type")::text AS type_type FROM "event_history" ORDER BY "seq"`,
          );
          const linkColumns = await q(
            `SELECT table_name, column_name FROM information_schema.columns
             WHERE table_schema = '${SCHEMA}' AND (column_name LIKE '%gig%' OR column_name = 'event_id') ORDER BY table_name, column_name`,
          );
          const offerEventDetails = (await q<{ details: unknown }>(`SELECT "details" FROM "offer_event" ORDER BY "id"`)).map((r) => r.details);
          const importSummaries = (await q<{ summary: unknown }>(`SELECT "summary" FROM "import_run" ORDER BY "id"`)).map((r) => r.summary);
          const enums = (
            await q<{ typname: string }>(
              `SELECT t.typname FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
               WHERE n.nspname = '${SCHEMA}' AND t.typtype = 'e' AND (t.typname ILIKE '%gig%' OR t.typname IN ('EventStatus', 'EventHistoryType')) ORDER BY 1`,
            )
          ).map((r) => r.typname);
          const oldObjects = await q(
            `SELECT c.relname, c.relkind::text FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
             WHERE n.nspname = '${SCHEMA}' AND c.relname ILIKE '%gig%'
             UNION ALL
             SELECT con.conname, 'constraint' FROM pg_constraint con JOIN pg_namespace n ON n.oid = con.connamespace
             WHERE n.nspname = '${SCHEMA}' AND con.conname ILIKE '%gig%'`,
          );
          const fks = await q(
            `SELECT con.conname, con.conrelid::regclass::text AS tbl, con.confrelid::regclass::text AS ref, con.confdeltype::text AS on_delete
             FROM pg_constraint con JOIN pg_namespace n ON n.oid = con.connamespace
             WHERE n.nspname = '${SCHEMA}' AND con.contype = 'f' AND (con.confrelid::regclass::text = 'event' OR con.conrelid::regclass::text IN ('event', 'event_history'))
             ORDER BY con.conname`,
          );
          const checks = (
            await q<{ conname: string }>(
              `SELECT con.conname FROM pg_constraint con WHERE con.conrelid = '"${SCHEMA}"."event"'::regclass AND con.contype = 'c' ORDER BY 1`,
            )
          ).map((r) => r.conname);
          const indexes = (
            await q<{ indexname: string }>(
              `SELECT indexname FROM pg_indexes WHERE schemaname = '${SCHEMA}' AND indexname ILIKE '%event%' ORDER BY 1`,
            )
          ).map((r) => r.indexname);

          // The history seq continues after the old values.
          await x(`INSERT INTO "event_history" ("id", "event_id", "type", "partner_id", "updated_at") VALUES ('${id(505)}', '${id(201)}', 'MOVED', '${id(100)}', now())`);
          const seqAfter = (await q<{ seq: bigint }>(`SELECT "seq" FROM "event_history" WHERE "id" = '${id(505)}'`))[0]!.seq;

          // Check constraint still enforced.
          await x('SAVEPOINT neg');
          let negativePriceRejected = false;
          try {
            await x(`UPDATE "event" SET "price_cents" = -1 WHERE "id" = '${id(201)}'`);
          } catch {
            negativePriceRejected = true;
          }
          await x('ROLLBACK TO SAVEPOINT neg');

          // ON DELETE RESTRICT from purchase_order_line still holds.
          await x('SAVEPOINT restrict');
          let restrictKept = false;
          try {
            await x(`DELETE FROM "event" WHERE "id" = '${id(202)}'`);
          } catch {
            restrictKept = true;
          }
          await x('ROLLBACK TO SAVEPOINT restrict');

          // ON DELETE CASCADE still works.
          await x(`DELETE FROM "event" WHERE "id" = '${id(201)}'`);
          const left = async (table: string) =>
            Number((await q<{ n: bigint }>(`SELECT COUNT(*) AS n FROM "${table}" WHERE "event_id" = '${id(201)}'`))[0]!.n);
          const cascadeAfterDelete = {
            cost_line: await left('cost_line'),
            event_history: await left('event_history'),
            attachment: await left('attachment'),
          };

          result = {
            before,
            after,
            events,
            history,
            linkColumns,
            offerEventDetails,
            importSummaries,
            enums,
            oldObjects,
            fks,
            checks,
            indexes,
            seqAfter,
            seqMaxBefore,
            cascadeAfterDelete,
            negativePriceRejected,
            restrictKept,
          };
          throw new Rollback();
        },
        { timeout: 60_000 },
      ),
    ).rejects.toBeInstanceOf(Rollback);

    const r = result!;
    // Row counts intact
    expect(r.after).toEqual(r.before);
    expect(r.before).toEqual({
      gig: 3,
      gig_event: 4,
      gig_technical_setup_legacy: 1,
      cost_line: 4,
      attachment: 2,
      purchase_order_line: 1,
      offer_event: 3,
      import_run: 2,
    });
    // Values intact, enum type renamed
    expect(r.events).toEqual([
      { id: id(201), start_date: '2026-06-01', status: 'SOLD', venue: 'Venue 201', price_cents: 20100, client_id: id(150), offer_id: id(160), deleted: false, updated_at: '2026-01-01 12:00:00', status_type: '"EventStatus"' },
      { id: id(202), start_date: '2026-07-01', status: 'CANCELLED', venue: 'Venue 202', price_cents: 20200, client_id: null, offer_id: null, deleted: false, updated_at: '2026-01-01 12:00:00', status_type: '"EventStatus"' },
      { id: id(203), start_date: '2025-03-01', status: 'SOLD', venue: 'Venue 203', price_cents: 20300, client_id: null, offer_id: null, deleted: true, updated_at: '2026-01-01 12:00:00', status_type: '"EventStatus"' },
    ]);
    expect(r.history).toEqual([
      { id: id(501), event_id: id(201), type: 'CREATED', details: { n: 501 }, type_type: '"EventHistoryType"' },
      { id: id(502), event_id: id(201), type: 'UPDATED', details: { n: 502 }, type_type: '"EventHistoryType"' },
      { id: id(503), event_id: id(202), type: 'CREATED', details: { n: 503 }, type_type: '"EventHistoryType"' },
      { id: id(504), event_id: id(202), type: 'CANCELLED', details: { n: 504 }, type_type: '"EventHistoryType"' },
    ]);
    expect(r.linkColumns).toEqual([
      { table_name: 'attachment', column_name: 'event_id' },
      { table_name: 'cost_line', column_name: 'event_id' },
      { table_name: 'event_history', column_name: 'event_id' },
      { table_name: 'event_technical_setup_legacy', column_name: 'event_id' },
      { table_name: 'purchase_order_line', column_name: 'event_id' },
    ]);
    // Stored JSON keys renamed, values and other rows unchanged
    expect(r.offerEventDetails).toEqual([{}, { eventId: id(201) }, { changes: [{ field: 'venue', from: 'A', to: 'B' }] }]);
    const counts = { created: 1, updated: 0, skipped: 2 };
    expect(r.importSummaries).toEqual([{ events: counts, offers: counts }, { offers: counts }]);
    // Nothing called gig is left
    expect(r.enums).toEqual(['EventHistoryType', 'EventStatus']);
    expect(r.oldObjects).toEqual([]);
    expect(r.fks).toEqual([
      { conname: 'attachment_event_id_fkey', tbl: 'attachment', ref: 'event', on_delete: 'c' },
      { conname: 'cost_line_event_id_fkey', tbl: 'cost_line', ref: 'event', on_delete: 'c' },
      { conname: 'event_client_id_fkey', tbl: 'event', ref: 'client', on_delete: 'r' },
      { conname: 'event_deleted_by_fkey', tbl: 'event', ref: 'partner', on_delete: 'n' },
      { conname: 'event_history_event_id_fkey', tbl: 'event_history', ref: 'event', on_delete: 'c' },
      { conname: 'event_history_partner_id_fkey', tbl: 'event_history', ref: 'partner', on_delete: 'r' },
      { conname: 'event_lineup_template_id_fkey', tbl: 'event', ref: 'lineup_template', on_delete: 'n' },
      { conname: 'event_offer_id_fkey', tbl: 'event', ref: 'offer', on_delete: 'r' },
      { conname: 'event_producer_id_fkey', tbl: 'event', ref: 'partner', on_delete: 'r' },
      { conname: 'event_seller_id_fkey', tbl: 'event', ref: 'partner', on_delete: 'r' },
      { conname: 'event_technical_setup_legacy_event_id_fkey', tbl: 'event_technical_setup_legacy', ref: 'event', on_delete: 'c' },
      { conname: 'purchase_order_line_event_id_fkey', tbl: 'purchase_order_line', ref: 'event', on_delete: 'r' },
    ]);
    expect(r.checks).toEqual(['event_additional_sales_nonneg', 'event_end_after_start', 'event_price_nonneg']);
    expect(r.indexes).toEqual([
      'attachment_event_id_idx',
      'cost_line_event_id_idx',
      'event_client_id_idx',
      'event_history_event_id_at_idx',
      'event_history_pkey',
      'event_offer_id_key',
      'event_pkey',
      'event_start_date_idx',
      'event_technical_setup_legacy_pkey',
      'offer_event_date_idx',
      'offer_event_offer_id_at_idx',
      'offer_event_pkey',
      'purchase_order_event_at_idx',
      'purchase_order_event_pkey',
      'purchase_order_event_purchase_order_id_at_idx',
      'purchase_order_line_event_id_idx',
    ]);
    // Behaviour kept
    expect(r.seqAfter).toBeGreaterThan(r.seqMaxBefore);
    expect(r.negativePriceRejected).toBe(true);
    expect(r.restrictKept).toBe(true);
    expect(r.cascadeAfterDelete).toEqual({ cost_line: 0, event_history: 0, attachment: 0 });
  });
});
