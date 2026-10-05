/** Budget endpoints (UC-020; BR-060, BR-062). Synthetic data only; money is 1000 or multiples of 10000 cents. */
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeTestDb, resetDb, testDb } from './helpers.js';
import { call, createBudgetCategory, startSession, UNKNOWN_ID, type Json, type Session } from './gigFixtures.js';

let s: Session;
let cats: Awaited<ReturnType<typeof seedCategories>>;

async function seedCategories() {
  // Created out of display order on purpose.
  const b = await createBudgetCategory('Category B', { sortOrder: 2 });
  const c = await createBudgetCategory('Category C', { sortOrder: 3 });
  const a = await createBudgetCategory('Category A', { sortOrder: 1 });
  const old = await createBudgetCategory('Category Old', { sortOrder: 0, active: false });
  return { a, b, c, old };
}

beforeEach(async () => {
  await resetDb();
  s = await startSession();
  cats = await seedCategories();
});
afterEach(async () => {
  await s.app.close();
});
afterAll(closeTestDb);

const amounts = (be: number, bi: number, ae: number, ai: number) => ({
  budgetExpenseCents: be,
  budgetIncomeCents: bi,
  actualExpenseCents: ae,
  actualIncomeCents: ai,
});

async function put(year: number | string, categoryId: string, body: unknown) {
  return call(s, 'PUT', `/api/budget/${year}/${categoryId}`, body);
}

async function putOk(year: number, categoryId: string, body: unknown): Promise<Json> {
  const res = await put(year, categoryId, body);
  if (res.statusCode !== 200) throw new Error(`put budget failed: ${res.statusCode} ${res.body}`);
  return res.json();
}

describe('GET /api/budget', () => {
  it('has one zero row per active category in sort order', async () => {
    const res = await call(s, 'GET', '/api/budget?year=2026');
    expect(res.statusCode).toBe(200);
    const zero = { ...amounts(0, 0, 0, 0), varianceExpenseCents: 0, varianceIncomeCents: 0 };
    expect(res.json()).toEqual({
      year: 2026,
      rows: [cats.a, cats.b, cats.c].map((c) => ({ categoryId: c.id, year: 2026, ...zero })),
      totals: zero,
    });
  });

  it('computes variance (budget − actual) per row and totals over active categories', async () => {
    await putOk(2026, cats.a.id, amounts(100000, 20000, 120000, 10000));
    await putOk(2026, cats.b.id, amounts(30000, 0, 10000, 20000));
    await putOk(2026, cats.c.id, amounts(0, 0, 20000, 0));
    await putOk(2025, cats.a.id, amounts(90000, 0, 0, 0)); // other year
    // Stored data of an inactive category is hidden
    await testDb().budgetYear.create({ data: { categoryId: cats.old.id, year: 2026, ...amounts(10000, 0, 10000, 0) } });

    const body = (await call(s, 'GET', '/api/budget?year=2026')).json();
    expect(body.rows.map((r: { categoryId: string }) => r.categoryId)).toEqual([cats.a.id, cats.b.id, cats.c.id]);
    expect(body.rows[0]).toEqual({
      categoryId: cats.a.id,
      year: 2026,
      ...amounts(100000, 20000, 120000, 10000),
      varianceExpenseCents: -20000,
      varianceIncomeCents: 10000,
    });
    expect(body.totals).toEqual({
      ...amounts(130000, 20000, 150000, 30000),
      varianceExpenseCents: -20000,
      varianceIncomeCents: -10000,
    });
  });

  it('a removed row disappears from the rows and the totals of every year; values are kept', async () => {
    await putOk(2025, cats.b.id, amounts(30000, 0, 10000, 0));
    await putOk(2026, cats.a.id, amounts(100000, 0, 90000, 0));
    await putOk(2026, cats.b.id, amounts(30000, 10000, 20000, 1000));

    expect((await call(s, 'DELETE', `/api/budget-categories/${cats.b.id}`)).statusCode).toBe(204);

    for (const year of [2025, 2026, 2027]) {
      const body = (await call(s, 'GET', `/api/budget?year=${year}`)).json();
      expect(body.rows.map((r: { categoryId: string }) => r.categoryId)).toEqual([cats.a.id, cats.c.id]);
    }
    expect((await call(s, 'GET', '/api/budget?year=2026')).json().totals).toEqual({
      ...amounts(100000, 0, 90000, 0),
      varianceExpenseCents: 10000,
      varianceIncomeCents: 0,
    });
    expect((await call(s, 'GET', '/api/budget?year=2025')).json().totals).toMatchObject(amounts(0, 0, 0, 0));
    expect(await testDb().budgetYear.count({ where: { categoryId: cats.b.id } })).toBe(2);
  });

  it('a row added through the API appears in every year with zeros, last', async () => {
    const created = (await call(s, 'POST', '/api/budget-categories', { name: 'Category New' })).json();
    for (const year of [2025, 2026]) {
      const body = (await call(s, 'GET', `/api/budget?year=${year}`)).json();
      expect(body.rows.map((r: { categoryId: string }) => r.categoryId)).toEqual([cats.a.id, cats.b.id, cats.c.id, created.id]);
      expect(body.rows[3]).toEqual({ categoryId: created.id, year, ...amounts(0, 0, 0, 0), varianceExpenseCents: 0, varianceIncomeCents: 0 });
    }
  });

  it('validates the year', async () => {
    expect((await call(s, 'GET', '/api/budget')).json().error.fields).toEqual({ year: 'REQUIRED' });
    expect((await call(s, 'GET', '/api/budget?year=x')).json().error.fields).toEqual({ year: 'INVALID_VALUE' });
  });
});

describe('PUT /api/budget/{year}/{categoryId}', () => {
  it('creates, then updates the row and returns a BudgetRow', async () => {
    const created = await putOk(2026, cats.a.id, amounts(100000, 0, 0, 0));
    expect(created).toEqual({
      categoryId: cats.a.id,
      year: 2026,
      ...amounts(100000, 0, 0, 0),
      varianceExpenseCents: 100000,
      varianceIncomeCents: 0,
    });
    const updated = await putOk(2026, cats.a.id, amounts(100000, 0, 90000, 0));
    expect(updated.varianceExpenseCents).toBe(10000);
    expect(await testDb().budgetYear.count()).toBe(1);
  });

  it('a no-op returns 200 and writes nothing (also for an all-zero row never stored)', async () => {
    await putOk(2026, cats.a.id, amounts(100000, 0, 0, 0));
    const before = await testDb().budgetYear.findFirstOrThrow();
    await putOk(2026, cats.a.id, amounts(100000, 0, 0, 0));
    expect((await testDb().budgetYear.findFirstOrThrow()).updatedAt).toEqual(before.updatedAt);

    const zero = await putOk(2026, cats.b.id, amounts(0, 0, 0, 0));
    expect(zero).toMatchObject(amounts(0, 0, 0, 0));
    expect(await testDb().budgetYear.count()).toBe(1);
  });

  it('every active row takes all four amounts (no actuals-only rows)', async () => {
    for (const c of [cats.a, cats.b, cats.c]) {
      expect(await putOk(2026, c.id, amounts(10000, 1000, 20000, 1000))).toMatchObject(amounts(10000, 1000, 20000, 1000));
    }
  });

  it('404 for a row removed through the API; its stored values are kept', async () => {
    await putOk(2026, cats.b.id, amounts(10000, 0, 0, 0));
    expect((await call(s, 'DELETE', `/api/budget-categories/${cats.b.id}`)).statusCode).toBe(204);
    const res = await put(2026, cats.b.id, amounts(20000, 0, 0, 0));
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('NOT_FOUND');
    expect(await testDb().budgetYear.findFirstOrThrow({ where: { categoryId: cats.b.id } })).toMatchObject(amounts(10000, 0, 0, 0));
  });

  it('validates the amounts', async () => {
    const res = await put(2026, cats.a.id, { budgetExpenseCents: -1000, budgetIncomeCents: 1.5, actualExpenseCents: '10000' });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.fields).toEqual({
      budgetExpenseCents: 'NEGATIVE_AMOUNT',
      budgetIncomeCents: 'INVALID_VALUE',
      actualExpenseCents: 'INVALID_VALUE',
      actualIncomeCents: 'REQUIRED',
    });
  });

  it('400 for a bad year before 404 for an unknown or inactive category', async () => {
    const badYear = await put('20x6', UNKNOWN_ID, amounts(0, 0, 0, 0));
    expect(badYear.statusCode).toBe(400);
    expect(badYear.json().error.fields).toEqual({ year: 'INVALID_VALUE' });
    const badBody = await put(2026, UNKNOWN_ID, {});
    expect(badBody.statusCode).toBe(400);
    for (const id of [UNKNOWN_ID, 'not-a-uuid', cats.old.id]) {
      const res = await put(2026, id, amounts(0, 0, 0, 0));
      expect(res.statusCode).toBe(404);
      expect(res.json().error.code).toBe('NOT_FOUND');
    }
  });
});

describe('POST /api/budget/{year}/copy-from-previous', () => {
  it('copies budget fields only from the previous year; actuals stay', async () => {
    await putOk(2025, cats.a.id, amounts(100000, 20000, 90000, 10000));
    await putOk(2025, cats.b.id, amounts(30000, 0, 30000, 0));
    await putOk(2025, cats.c.id, amounts(0, 0, 20000, 0));
    // Target year already has actuals: they must survive
    await putOk(2026, cats.a.id, amounts(0, 0, 1000, 0));
    await putOk(2026, cats.c.id, amounts(0, 0, 10000, 0));

    const res = await call(s, 'POST', '/api/budget/2026/copy-from-previous');
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.year).toBe(2026);
    expect(body.rows.map((r: Record<string, number>) => [r.budgetExpenseCents, r.budgetIncomeCents, r.actualExpenseCents, r.actualIncomeCents])).toEqual([
      [100000, 20000, 1000, 0],
      [30000, 0, 0, 0],
      [0, 0, 10000, 0],
    ]);
    expect(body).toEqual((await call(s, 'GET', '/api/budget?year=2026')).json());
    // The previous year is unchanged
    expect((await call(s, 'GET', '/api/budget?year=2025')).json().totals).toMatchObject(amounts(130000, 20000, 140000, 10000));
  });

  it('ignores removed rows on both sides', async () => {
    await putOk(2025, cats.a.id, amounts(100000, 0, 0, 0));
    await putOk(2025, cats.b.id, amounts(30000, 0, 0, 0));
    await putOk(2026, cats.c.id, amounts(10000, 0, 0, 0)); // a budget number, but on a row removed below
    await call(s, 'DELETE', `/api/budget-categories/${cats.b.id}`);
    await call(s, 'DELETE', `/api/budget-categories/${cats.c.id}`);

    const res = await call(s, 'POST', '/api/budget/2026/copy-from-previous');
    expect(res.statusCode).toBe(200);
    expect(res.json().rows).toEqual([expect.objectContaining({ categoryId: cats.a.id, budgetExpenseCents: 100000 })]);
    // Nothing was written for the removed rows
    expect(await testDb().budgetYear.count({ where: { year: 2026, categoryId: cats.b.id } })).toBe(0);
    expect(await testDb().budgetYear.findFirstOrThrow({ where: { year: 2026, categoryId: cats.c.id } })).toMatchObject(amounts(10000, 0, 0, 0));
  });

  it('409 BUDGET_NOT_EMPTY when the year already has a budget number', async () => {
    await putOk(2025, cats.a.id, amounts(100000, 0, 0, 0));
    await putOk(2026, cats.b.id, amounts(0, 1000, 0, 0));
    const res = await call(s, 'POST', '/api/budget/2026/copy-from-previous');
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('BUDGET_NOT_EMPTY');
    expect((await call(s, 'GET', '/api/budget?year=2026')).json().rows[0].budgetExpenseCents).toBe(0);
  });

  it('copying an empty previous year is a 200 no-op', async () => {
    const res = await call(s, 'POST', '/api/budget/2026/copy-from-previous');
    expect(res.statusCode).toBe(200);
    expect(res.json().totals).toMatchObject(amounts(0, 0, 0, 0));
    expect(await testDb().budgetYear.count()).toBe(0);
  });

  it('validates the year', async () => {
    const res = await call(s, 'POST', '/api/budget/26/copy-from-previous');
    expect(res.statusCode).toBe(400);
    expect(res.json().error.fields).toEqual({ year: 'INVALID_VALUE' });
  });
});
