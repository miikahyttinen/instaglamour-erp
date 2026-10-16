/**
 * Migration 20261016120000_purchase_orders (TASK-023): existing people are backfilled with unique,
 * URL-safe freelancer tokens; nothing else about them changes; the active-line index holds.
 * Runs the real migration files in a scratch schema inside a transaction that is rolled back.
 * Synthetic data only.
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import type { Prisma } from '../src/generated/prisma/client.js';
import { closeTestDb, testDb } from './helpers.js';

const MIGRATIONS = path.resolve(import.meta.dirname, '../prisma/migrations');
const UNDER_TEST = '20261016120000_purchase_orders';
const BEFORE = readdirSync(MIGRATIONS)
  .filter((m) => /^\d{14}_/.test(m) && m < UNDER_TEST)
  .sort();
const SCHEMA = 'migration_test_task023';

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

afterAll(closeTestDb);

describe(`migration ${UNDER_TEST}`, () => {
  it('backfills a unique 43-char base64url token for every person and keeps their data', async () => {
    const results = {
      people: [] as { id: string; name: string; active: boolean; updated_at: string; freelancer_token: string }[],
      newToken: '',
      shortRejected: false,
      secondActiveRejected: false,
      inactiveAllowed: false,
    };

    await expect(
      testDb().$transaction(
        async (tx) => {
          await tx.$executeRawUnsafe(`CREATE SCHEMA "${SCHEMA}"`);
          await tx.$executeRawUnsafe(`SET LOCAL search_path TO "${SCHEMA}", public`);
          for (const m of BEFORE) await run(tx, m);
          for (let i = 1; i <= 20; i++) {
            await tx.$executeRawUnsafe(
              `INSERT INTO "person" ("id", "name", "active", "updated_at") VALUES ('${id(i)}', 'Person ${i}', ${i % 3 !== 0}, '2026-01-01 12:00:00')`,
            );
          }

          await run(tx, UNDER_TEST);

          results.people = await tx.$queryRawUnsafe(
            `SELECT "id"::text, "name", "active", "updated_at"::text, "freelancer_token" FROM "person" ORDER BY "id"`,
          );
          // New rows get a token from the column default
          await tx.$executeRawUnsafe(`INSERT INTO "person" ("id", "name", "updated_at") VALUES ('${id(99)}', 'Person 99', now())`);
          const [row] = await tx.$queryRawUnsafe<{ freelancer_token: string }[]>(
            `SELECT "freelancer_token" FROM "person" WHERE "id" = '${id(99)}'`,
          );
          results.newToken = row!.freelancer_token;

          await tx.$executeRawUnsafe('SAVEPOINT s1');
          try {
            await tx.$executeRawUnsafe(`UPDATE "person" SET "freelancer_token" = 'short' WHERE "id" = '${id(1)}'`);
          } catch {
            results.shortRejected = true;
          }
          await tx.$executeRawUnsafe('ROLLBACK TO SAVEPOINT s1');

          // One active PO line per cost line (partial unique index)
          await tx.$executeRawUnsafe(
            `INSERT INTO "partner" ("id", "person_id", "email", "updated_at") VALUES ('${id(200)}', '${id(1)}', 'partner.a@example.com', now())`,
          );
          await tx.$executeRawUnsafe(
            `INSERT INTO "gig" ("id", "start_date", "lineup_name", "venue", "seller_id", "producer_id", "price_cents", "updated_at")
             VALUES ('${id(300)}', '2026-01-10', 'Template A', 'Venue X', '${id(200)}', '${id(200)}', 100000, now())`,
          );
          await tx.$executeRawUnsafe(
            `INSERT INTO "cost_line" ("id", "gig_id", "type", "person_id", "budgeted_cents", "updated_at")
             VALUES ('${id(400)}', '${id(300)}', 'BASS', '${id(2)}', 10000, now())`,
          );
          for (const [po, active] of [[501, true], [502, true], [503, false]] as const) {
            await tx.$executeRawUnsafe(
              `INSERT INTO "purchase_order" ("id", "number", "seq", "person_id", "total_cents", "updated_at")
               VALUES ('${id(po)}', 'PERSON-2-${po}', nextval('purchase_order_seq'), '${id(2)}', 10000, now())`,
            );
            await tx.$executeRawUnsafe('SAVEPOINT s2');
            try {
              await tx.$executeRawUnsafe(
                `INSERT INTO "purchase_order_line" ("id", "purchase_order_id", "cost_line_id", "cost_line_ref", "gig_id", "type", "amount_cents", "active", "position", "updated_at")
                 VALUES ('${id(po + 100)}', '${id(po)}', '${id(400)}', '${id(400)}', '${id(300)}', 'BASS', 10000, ${active}, 0, now())`,
              );
              if (po === 503) results.inactiveAllowed = true;
            } catch {
              if (po === 502) results.secondActiveRejected = true;
              await tx.$executeRawUnsafe('ROLLBACK TO SAVEPOINT s2');
            }
          }
          throw new Rollback();
        },
        { timeout: 30_000 },
      ),
    ).rejects.toBeInstanceOf(Rollback);

    expect(results.people).toHaveLength(20);
    const tokens = results.people.map((p) => p.freelancer_token);
    for (const t of [...tokens, results.newToken]) expect(t).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(new Set([...tokens, results.newToken]).size).toBe(21);
    // Name, active and updated_at untouched
    results.people.forEach((p, i) => {
      expect(p).toMatchObject({ id: id(i + 1), name: `Person ${i + 1}`, active: (i + 1) % 3 !== 0, updated_at: '2026-01-01 12:00:00' });
    });
    expect(results.shortRejected).toBe(true);
    expect(results.secondActiveRejected).toBe(true);
    expect(results.inactiveAllowed).toBe(true);
  });
});
