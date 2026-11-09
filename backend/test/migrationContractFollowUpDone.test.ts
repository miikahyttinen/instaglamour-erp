/**
 * Migration 20261109130000_contract_follow_up_done (TASK-058): new columns event.contract_done
 * (existing gigs with start date before today, Europe/Helsinki → true; today or later → false;
 * deleted and cancelled gigs follow the same rule) and offer.follow_up_done (all false). Runs the
 * real migration files in a scratch schema inside a transaction that is rolled back. Synthetic data only.
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import type { Prisma } from '../src/generated/prisma/client.js';
import { closeTestDb, testDb } from './helpers.js';

const MIGRATIONS = path.resolve(import.meta.dirname, '../prisma/migrations');
const UNDER_TEST = '20261109130000_contract_follow_up_done';
const BEFORE = readdirSync(MIGRATIONS)
  .filter((m) => /^\d{14}_/.test(m) && m < UNDER_TEST)
  .sort();
const SCHEMA = 'migration_test_contract_follow_up_done';

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

/** Helsinki "today" as SQL, offset by `days`. */
const helsinkiDay = (days: number) => `((now() AT TIME ZONE 'Europe/Helsinki')::date + ${days})`;

async function migrate(): Promise<{ events: Row[]; offers: Row[] }> {
  let result: { events: Row[]; offers: Row[] } | undefined;
  await expect(
    testDb().$transaction(
      async (tx) => {
        const x = (sql: string) => tx.$executeRawUnsafe(sql);
        await x(`CREATE SCHEMA "${SCHEMA}"`);
        await x(`SET LOCAL search_path TO "${SCHEMA}", public`);
        for (const m of BEFORE) await run(tx, m);

        await x(`INSERT INTO "person" ("id", "name", "updated_at") VALUES ('${id(1)}', 'Person 1', now())`);
        await x(
          `INSERT INTO "partner" ("id", "person_id", "email", "updated_at") VALUES ('${id(100)}', '${id(1)}', 'partner.a@example.com', now())`,
        );
        const events: [number, number, string, boolean][] = [
          [201, -400, 'SOLD', false], // long ago
          [202, -1, 'SOLD', false], // yesterday
          [203, 0, 'SOLD', false], // today → stays false
          [204, 30, 'SOLD', false], // upcoming
          [205, -10, 'CANCELLED', false],
          [206, -10, 'SOLD', true], // deleted
          [207, 10, 'CANCELLED', true],
        ];
        for (const [n, days, status, deleted] of events) {
          await x(
            `INSERT INTO "event" ("id", "start_date", "status", "lineup_name", "venue", "seller_id", "producer_id", "price_cents",
               "deleted_at", "updated_at")
             VALUES ('${id(n)}', ${helsinkiDay(days)}, '${status}', 'Lineup A', 'Venue ${n}', '${id(100)}', '${id(100)}', 10000,
               ${deleted ? 'now()' : 'NULL'}, now())`,
          );
        }
        await x(`INSERT INTO "client" ("id", "name", "updated_at") VALUES ('${id(300)}', 'Client A', now())`);
        for (const [n, disposition] of [
          [401, 'PENDING'],
          [402, 'WON'],
        ] as const) {
          await x(
            `INSERT INTO "offer" ("id", "client_id", "event_name", "event_date", "venue", "seller_id", "disposition",
               "share_token", "share_token_hash", "updated_at")
             VALUES ('${id(n)}', '${id(300)}', 'Event ${n}', ${helsinkiDay(-5)}, 'Venue X', '${id(100)}', '${disposition}',
               '${'t'.repeat(40)}-${n}', 'hash-${n}', now())`,
          );
        }

        await run(tx, UNDER_TEST);

        result = {
          events: await tx.$queryRawUnsafe<Row[]>(`SELECT "id"::text, "contract_done", "status" FROM "event" ORDER BY "id"`),
          offers: await tx.$queryRawUnsafe<Row[]>(`SELECT "id"::text, "follow_up_done" FROM "offer" ORDER BY "id"`),
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
  it('past gigs (any status, deleted too) → contract_done true; today and later → false; offers → false', async () => {
    const { events, offers } = await migrate();
    expect(events.map((e) => [e.id, e.contract_done])).toEqual([
      [id(201), true],
      [id(202), true],
      [id(203), false],
      [id(204), false],
      [id(205), true],
      [id(206), true],
      [id(207), false],
    ]);
    // Nothing else changes.
    expect(events.map((e) => e.status)).toEqual(['SOLD', 'SOLD', 'SOLD', 'SOLD', 'CANCELLED', 'SOLD', 'CANCELLED']);
    expect(offers).toEqual([
      { id: id(401), follow_up_done: false },
      { id: id(402), follow_up_done: false },
    ]);
  });
});
