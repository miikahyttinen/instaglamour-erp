/** Budget endpoints (docs/api-contract.md "Budget"; UC-020; BR-060, BR-062). */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppDeps } from '../app.js';
import { amountsOf, loadActiveBudgetCategories, loadBudget, toBudgetRowDto, type BudgetAmounts } from '../budget/store.js';
import { AppError, notFound, parseInput, validationError, type FieldCode } from '../http/errors.js';
import { money, yearString } from '../gigs/schemas.js';
import { inTransaction, isUuid } from '../gigs/store.js';

const yearQuery = z.object({ year: yearString });
const yearParams = z.object({ year: yearString });

const putBody = z.object({
  budgetExpenseCents: money,
  budgetIncomeCents: money,
  actualExpenseCents: money,
  actualIncomeCents: money,
});

const BUDGET_FIELDS = ['budgetExpenseCents', 'budgetIncomeCents'] as const;
const AMOUNT_FIELDS = [...BUDGET_FIELDS, 'actualExpenseCents', 'actualIncomeCents'] as const;

const sameAmounts = (a: BudgetAmounts, b: BudgetAmounts) => AMOUNT_FIELDS.every((f) => a[f] === b[f]);

export function budgetRoutes(app: FastifyInstance, deps: AppDeps): void {
  const { db } = deps;

  app.get('/api/budget', async (request) => {
    const { year } = parseInput(yearQuery, request.query);
    return loadBudget(db, year);
  });

  app.put<{ Params: { year: string; categoryId: string } }>('/api/budget/:year/:categoryId', async (request) => {
    const { year } = parseInput(yearParams, { year: request.params.year });
    const body = parseInput(putBody, request.body);
    const { categoryId } = request.params;

    // Inactive categories are hidden (domain model), so they can't be edited either.
    const category = isUuid(categoryId) ? await db.budgetCategory.findUnique({ where: { id: categoryId } }) : null;
    if (!category?.active) throw notFound('Budget category not found');

    // Actuals-only categories (e.g. fuel) take no budget numbers.
    if (!category.budgeted) {
      const fields: Record<string, FieldCode> = {};
      for (const f of BUDGET_FIELDS) if (body[f] !== 0) fields[f] = 'INVALID_VALUE';
      if (Object.keys(fields).length > 0) throw validationError(fields);
    }

    const where = { categoryId_year: { categoryId, year } };
    const existing = await db.budgetYear.findUnique({ where });
    if (sameAmounts(amountsOf(existing), body)) return toBudgetRowDto(categoryId, year, existing); // no-op

    const row = await db.budgetYear.upsert({ where, create: { categoryId, year, ...body }, update: body });
    return toBudgetRowDto(categoryId, year, row);
  });

  app.post<{ Params: { year: string } }>('/api/budget/:year/copy-from-previous', async (request) => {
    const { year } = parseInput(yearParams, request.params);

    await inTransaction(db, async (tx) => {
      const categories = (await loadActiveBudgetCategories(tx)).filter((c) => c.budgeted);
      const ids = categories.map((c) => c.id);
      const [target, previous] = await Promise.all([
        tx.budgetYear.findMany({ where: { year, categoryId: { in: ids } } }),
        tx.budgetYear.findMany({ where: { year: year - 1, categoryId: { in: ids } } }),
      ]);
      if (target.some((r) => r.budgetExpenseCents !== 0 || r.budgetIncomeCents !== 0)) {
        throw new AppError('BUDGET_NOT_EMPTY', `Year ${year} already has budget numbers`);
      }
      // Budget fields only; actuals stay as they are (UC-020 A1).
      for (const row of previous) {
        if (row.budgetExpenseCents === 0 && row.budgetIncomeCents === 0) continue;
        const budget = { budgetExpenseCents: row.budgetExpenseCents, budgetIncomeCents: row.budgetIncomeCents };
        await tx.budgetYear.upsert({
          where: { categoryId_year: { categoryId: row.categoryId, year } },
          create: { categoryId: row.categoryId, year, ...budget },
          update: budget,
        });
      }
    });

    return loadBudget(db, year);
  });
}
