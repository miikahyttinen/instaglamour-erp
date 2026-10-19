/**
 * Migration 20261019140000_person_roles (TASK-027): every person's `roles` is backfilled with the
 * distinct musician-role types of their cost lines on non-deleted gigs (any status, any year), in
 * MUSICIAN_ROLES order; nothing else changes. Runs the real migration files in a scratch schema
 * inside a transaction that is rolled back. Synthetic data only.
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import type { Prisma } from '../src/generated/prisma/client.js';
import { closeTestDb, testDb } from './helpers.js';

const MIGRATIONS = path.resolve(import.meta.dirname, '../prisma/migrations');
const UNDER_TEST = '20261019140000_person_roles';
const BEFORE = readdirSync(MIGRATIONS)
  .filter((m) => /^\d{14}_/.test(m) && m < UNDER_TEST)
  .sort();
const SCHEMA = 'migration_test_task027';

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
  it('backfills roles from musician-role cost lines on non-deleted gigs', async () => {
    let people: { id: string; name: string; active: boolean; updated_at: string; roles: string[] }[] = [];
    let newPersonRoles: string[] | null = null;

    await expect(
      testDb().$transaction(
        async (tx) => {
          await tx.$executeRawUnsafe(`CREATE SCHEMA "${SCHEMA}"`);
          await tx.$executeRawUnsafe(`SET LOCAL search_path TO "${SCHEMA}", public`);
          for (const m of BEFORE) await run(tx, m);

          for (let i = 1; i <= 5; i++) {
            await tx.$executeRawUnsafe(
              `INSERT INTO "person" ("id", "name", "active", "updated_at") VALUES ('${id(i)}', 'Person ${i}', ${i !== 4}, '2026-01-01 12:00:00')`,
            );
          }
          await tx.$executeRawUnsafe(
            `INSERT INTO "partner" ("id", "person_id", "email", "updated_at") VALUES ('${id(100)}', '${id(5)}', 'partner.a@example.com', now())`,
          );
          const gig = async (n: number, startDate: string, status: string, deleted: boolean) =>
            tx.$executeRawUnsafe(
              `INSERT INTO "gig" ("id", "start_date", "status", "lineup_name", "venue", "seller_id", "producer_id", "price_cents", "deleted_at", "updated_at")
               VALUES ('${id(n)}', '${startDate}', '${status}', 'Lineup A', 'Venue X', '${id(100)}', '${id(100)}', 100000, ${deleted ? 'now()' : 'NULL'}, now())`,
            );
          await gig(201, '2020-03-01', 'SOLD', false);
          await gig(202, '2030-03-01', 'CANCELLED', false); // any status, any year
          await gig(203, '2025-03-01', 'SOLD', true); // deleted: ignored
          let line = 300;
          const costLine = async (gigN: number, type: string, personN: number | null) =>
            tx.$executeRawUnsafe(
              `INSERT INTO "cost_line" ("id", "gig_id", "type", "person_id", "budgeted_cents", "updated_at")
               VALUES ('${id(line++)}', '${id(gigN)}', '${type}', ${personN === null ? 'NULL' : `'${id(personN)}'`}, 10000, now())`,
            );
          // Person 1: two gigs, duplicates, out of order, plus internal/expense lines
          await costLine(201, 'DJ', 1);
          await costLine(201, 'VOC', 1);
          await costLine(202, 'VOC', 1);
          await costLine(202, 'BASS', 1);
          await costLine(201, 'OFFICE', 1);
          await costLine(201, 'FUEL', 1);
          // Person 2: only a deleted gig and an internal line
          await costLine(203, 'GUITAR', 2);
          await costLine(201, 'SALES', 2);
          // Person 3: nothing. Person 4 (inactive): one line. Person 5 (partner): plays too.
          await costLine(202, 'OTHER_ROLE', 4);
          await costLine(201, 'KEYS', 5);
          await costLine(201, 'PRODUCTION', 5);
          await costLine(201, 'TRUMPET', null);

          await run(tx, UNDER_TEST);

          people = await tx.$queryRawUnsafe(
            `SELECT "id"::text, "name", "active", "updated_at"::text, "roles"::text[] AS "roles" FROM "person" ORDER BY "id"`,
          );
          await tx.$executeRawUnsafe(`INSERT INTO "person" ("id", "name", "updated_at") VALUES ('${id(9)}', 'Person 9', now())`);
          const [row] = await tx.$queryRawUnsafe<{ roles: string[] }[]>(
            `SELECT "roles"::text[] AS "roles" FROM "person" WHERE "id" = '${id(9)}'`,
          );
          newPersonRoles = row!.roles;
          throw new Rollback();
        },
        { timeout: 30_000 },
      ),
    ).rejects.toBeInstanceOf(Rollback);

    expect(people.map((p) => [p.name, p.roles])).toEqual([
      ['Person 1', ['VOC', 'BASS', 'DJ']],
      ['Person 2', []],
      ['Person 3', []],
      ['Person 4', ['OTHER_ROLE']],
      ['Person 5', ['KEYS']],
    ]);
    // Name, active and updated_at untouched
    people.forEach((p, i) => {
      expect(p).toMatchObject({ id: id(i + 1), name: `Person ${i + 1}`, active: i + 1 !== 4, updated_at: '2026-01-01 12:00:00' });
    });
    expect(newPersonRoles).toEqual([]);
  });
});
