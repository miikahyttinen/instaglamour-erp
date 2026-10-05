/** Budget rows: POST/PATCH/DELETE /api/budget-categories (UC-020 A2–A4, E2). Synthetic data only. */
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { isUniqueViolation } from '../src/routes/budgetCategories.js';
import { closeTestDb, resetDb, testApp, testDb } from './helpers.js';
import { call, createBudgetCategory, startSession, UNKNOWN_ID, type Session } from './gigFixtures.js';

let s: Session;

beforeEach(async () => {
  await resetDb();
  s = await startSession();
});
afterEach(async () => {
  await s.app.close();
});
afterAll(closeTestDb);

const post = (body: unknown) => call(s, 'POST', '/api/budget-categories', body);
const patch = (id: string, body: unknown) => call(s, 'PATCH', `/api/budget-categories/${id}`, body);
const del = (id: string) => call(s, 'DELETE', `/api/budget-categories/${id}`);

const VALIDATION_CASES: [string, unknown, string][] = [
  ['missing', {}, 'REQUIRED'],
  ['null', { name: null }, 'REQUIRED'],
  ['empty', { name: '' }, 'REQUIRED'],
  ['blank', { name: '   ' }, 'REQUIRED'],
  ['not a string', { name: 5 }, 'INVALID_VALUE'],
  ['over 500 chars', { name: 'x'.repeat(501) }, 'TOO_LONG'],
];

describe('POST /api/budget-categories', () => {
  it('creates an active row with a trimmed name, last in order, and returns { id, name }', async () => {
    await createBudgetCategory('Category A', { sortOrder: 4 });
    await createBudgetCategory('Category Old', { sortOrder: 7, active: false });

    const res = await post({ name: '  Category B  ' });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toEqual({ id: expect.any(String), name: 'Category B' });

    const row = await testDb().budgetCategory.findUniqueOrThrow({ where: { id: res.json().id } });
    expect(row).toMatchObject({ name: 'Category B', active: true, code: null, sortOrder: 8 });
  });

  it('the first row gets sort order 0', async () => {
    const res = await post({ name: 'Category A' });
    expect((await testDb().budgetCategory.findUniqueOrThrow({ where: { id: res.json().id } })).sortOrder).toBe(0);
  });

  it('accepts exactly 500 characters', async () => {
    expect((await post({ name: 'x'.repeat(500) })).statusCode).toBe(201);
  });

  it.each(VALIDATION_CASES)('400 for a name that is %s', async (_label, body, code) => {
    const res = await post(body);
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: { code: 'VALIDATION_ERROR', message: expect.any(String), fields: { name: code } } });
    expect(await testDb().budgetCategory.count()).toBe(0);
  });

  it('400 DUPLICATE for the name of another active row (case-insensitive, trimmed); nothing saved', async () => {
    await createBudgetCategory('Category A');
    for (const name of ['Category A', 'category a', '  CATEGORY A ']) {
      const res = await post({ name });
      expect(res.statusCode).toBe(400);
      expect(res.json().error).toEqual({ code: 'VALIDATION_ERROR', message: expect.any(String), fields: { name: 'DUPLICATE' } });
    }
    expect(await testDb().budgetCategory.count()).toBe(1);
  });

  it('the name of a removed row can be used again (a new row; the old one stays removed)', async () => {
    const old = await createBudgetCategory('Category A', { active: false });
    const res = await post({ name: 'Category A' });
    expect(res.statusCode).toBe(201);
    expect(res.json().id).not.toBe(old.id);
    expect((await testDb().budgetCategory.findUniqueOrThrow({ where: { id: old.id } })).active).toBe(false);
  });
});

describe('PATCH /api/budget-categories/{id}', () => {
  it('renames the row (trimmed) and returns { id, name }', async () => {
    const a = await createBudgetCategory('Category A', { sortOrder: 3 });
    const res = await patch(a.id, { name: ' Category X ' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ id: a.id, name: 'Category X' });
    expect(await testDb().budgetCategory.findUniqueOrThrow({ where: { id: a.id } })).toMatchObject({ name: 'Category X', sortOrder: 3, active: true });
  });

  it('the same name is a no-op (200, nothing written)', async () => {
    const a = await createBudgetCategory('Category A');
    const res = await patch(a.id, { name: 'Category A ' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ id: a.id, name: 'Category A' });
    expect((await testDb().budgetCategory.findUniqueOrThrow({ where: { id: a.id } })).updatedAt).toEqual(a.updatedAt);
  });

  it('may change the case of its own name', async () => {
    const a = await createBudgetCategory('Category A');
    const res = await patch(a.id, { name: 'CATEGORY A' });
    expect(res.statusCode).toBe(200);
    expect(res.json().name).toBe('CATEGORY A');
  });

  it('400 DUPLICATE for the name of another active row; a removed row\'s name is free', async () => {
    const a = await createBudgetCategory('Category A');
    await createBudgetCategory('Category B');
    await createBudgetCategory('Category Old', { active: false });

    const dup = await patch(a.id, { name: 'category b' });
    expect(dup.statusCode).toBe(400);
    expect(dup.json().error.fields).toEqual({ name: 'DUPLICATE' });
    expect((await testDb().budgetCategory.findUniqueOrThrow({ where: { id: a.id } })).name).toBe('Category A');

    expect((await patch(a.id, { name: 'Category Old' })).statusCode).toBe(200);
  });

  it.each(VALIDATION_CASES)('400 for a name that is %s', async (_label, body, code) => {
    const a = await createBudgetCategory('Category A');
    const res = await patch(a.id, body);
    expect(res.statusCode).toBe(400);
    expect(res.json().error.fields).toEqual({ name: code });
  });

  it('validation (400) comes before existence (404)', async () => {
    const res = await patch(UNKNOWN_ID, { name: '' });
    expect(res.statusCode).toBe(400);
  });

  it('404 for an unknown, malformed or removed id', async () => {
    const old = await createBudgetCategory('Category Old', { active: false });
    for (const id of [UNKNOWN_ID, 'not-a-uuid', old.id]) {
      const res = await patch(id, { name: 'Category X' });
      expect(res.statusCode).toBe(404);
      expect(res.json().error.code).toBe('NOT_FOUND');
    }
    expect((await testDb().budgetCategory.findUniqueOrThrow({ where: { id: old.id } })).name).toBe('Category Old');
  });
});

describe('DELETE /api/budget-categories/{id}', () => {
  it('204: soft delete; the year values are kept', async () => {
    const a = await createBudgetCategory('Category A');
    await testDb().budgetYear.create({
      data: { categoryId: a.id, year: 2026, budgetExpenseCents: 10000, budgetIncomeCents: 0, actualExpenseCents: 1000, actualIncomeCents: 0 },
    });

    const res = await del(a.id);
    expect(res.statusCode).toBe(204);
    expect(res.body).toBe('');

    expect(await testDb().budgetCategory.findUniqueOrThrow({ where: { id: a.id } })).toMatchObject({ name: 'Category A', active: false });
    expect(await testDb().budgetYear.findFirstOrThrow({ where: { categoryId: a.id } })).toMatchObject({ budgetExpenseCents: 10000, actualExpenseCents: 1000 });
  });

  it('404 for an unknown, malformed or already removed id', async () => {
    const a = await createBudgetCategory('Category A');
    expect((await del(a.id)).statusCode).toBe(204);
    for (const id of [a.id, UNKNOWN_ID, 'not-a-uuid']) {
      const res = await del(id);
      expect(res.statusCode).toBe(404);
      expect(res.json().error.code).toBe('NOT_FOUND');
    }
  });
});

describe('budget rows: auth and database rule', () => {
  it('401 without a session', async () => {
    const app = await testApp();
    try {
      for (const [method, url] of [
        ['POST', '/api/budget-categories'],
        ['PATCH', `/api/budget-categories/${UNKNOWN_ID}`],
        ['DELETE', `/api/budget-categories/${UNKNOWN_ID}`],
      ] as const) {
        const res = await app.inject({ method, url, payload: { name: 'Category A' } });
        expect(res.statusCode).toBe(401);
      }
    } finally {
      await app.close();
    }
    expect(await testDb().budgetCategory.count()).toBe(0);
  });

  it('the database also rejects two active rows with the same name (case-insensitive); removed rows may repeat', async () => {
    await createBudgetCategory('Category A');
    await createBudgetCategory('category a', { active: false });
    await createBudgetCategory('CATEGORY A', { active: false });
    const err = await createBudgetCategory('CATEGORY A').catch((e: unknown) => e);
    expect(isUniqueViolation(err)).toBe(true);
    // Reactivating a removed duplicate is rejected as well.
    const removed = await testDb().budgetCategory.findFirstOrThrow({ where: { name: 'category a' } });
    const err2 = await testDb().budgetCategory.update({ where: { id: removed.id }, data: { active: true } }).catch((e: unknown) => e);
    expect(isUniqueViolation(err2)).toBe(true);
  });
});
