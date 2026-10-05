/**
 * Budget rows (docs/api-contract.md "Budget rows"; UC-020 A2–A4, E2).
 * Partners add, rename and remove rows. Removing is a soft delete (active = false): the row's year
 * values are kept but it disappears from every year, total and the year page.
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppDeps } from '../app.js';
import { toBudgetCategoryDto } from '../budget/store.js';
import { Prisma, type BudgetCategory } from '../generated/prisma/client.js';
import { notFound, parseInput, validationError } from '../http/errors.js';
import { requiredText } from '../gigs/schemas.js';
import { inTransaction, isUuid, type Tx } from '../gigs/store.js';

type IdParams = { Params: { id: string } };

/** Trimmed, non-blank (REQUIRED), ≤ 500 chars (TOO_LONG). */
const nameBody = z.object({ name: requiredText() });

const duplicateName = () => validationError({ name: 'DUPLICATE' }, 'An active budget row already has this name');

/** Postgres unique violation (the partial index on active names), e.g. from a concurrent request. */
export function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
}

/**
 * True if another active row has this name, compared the same way as the database index
 * "budget_category_active_name_key" (lower(btrim(name))).
 */
async function nameTaken(db: Tx, name: string, exceptId: string | null): Promise<boolean> {
  const rows = await db.$queryRaw<{ id: string }[]>`
    SELECT "id"::text FROM "budget_category"
    WHERE "active" AND lower(btrim("name")) = lower(btrim(${name}))
      AND (${exceptId}::uuid IS NULL OR "id" <> ${exceptId}::uuid)
    LIMIT 1`;
  return rows.length > 0;
}

async function findActive(db: Tx, id: string): Promise<BudgetCategory> {
  const category = isUuid(id) ? await db.budgetCategory.findUnique({ where: { id } }) : null;
  if (!category?.active) throw notFound('Budget row not found');
  return category;
}

/** Runs a write; a unique violation on the active-name index becomes 400 name: DUPLICATE. */
async function asDuplicateError<T>(write: () => Promise<T>): Promise<T> {
  try {
    return await write();
  } catch (err) {
    if (isUniqueViolation(err)) throw duplicateName();
    throw err;
  }
}

export function budgetCategoryRoutes(app: FastifyInstance, deps: AppDeps): void {
  const { db } = deps;

  app.post('/api/budget-categories', async (request, reply) => {
    const { name } = parseInput(nameBody, request.body);
    const created = await asDuplicateError(() =>
      inTransaction(db, async (tx) => {
        if (await nameTaken(tx, name, null)) throw duplicateName();
        // New rows go last (sort order = creation order); removed rows keep their slot.
        const { _max } = await tx.budgetCategory.aggregate({ _max: { sortOrder: true } });
        return tx.budgetCategory.create({ data: { name, sortOrder: (_max.sortOrder ?? -1) + 1 } });
      }),
    );
    return reply.status(201).send(toBudgetCategoryDto(created));
  });

  app.patch<IdParams>('/api/budget-categories/:id', async (request) => {
    const { name } = parseInput(nameBody, request.body);
    const category = await findActive(db, request.params.id);
    if (category.name === name) return toBudgetCategoryDto(category); // no-op
    if (await nameTaken(db, name, category.id)) throw duplicateName();
    const updated = await asDuplicateError(() => db.budgetCategory.update({ where: { id: category.id }, data: { name } }));
    return toBudgetCategoryDto(updated);
  });

  app.delete<IdParams>('/api/budget-categories/:id', async (request, reply) => {
    const category = await findActive(db, request.params.id);
    // Soft delete: budget_year values stay in the database.
    await db.budgetCategory.update({ where: { id: category.id }, data: { active: false } });
    return reply.status(204).send();
  });
}
