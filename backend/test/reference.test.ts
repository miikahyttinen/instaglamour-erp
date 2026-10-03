import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadSeed, readSeedFile } from '../seed/load.js';
import { EXPENSE_CATEGORIES, INTERNAL_ROLES, MUSICIAN_ROLES, TECHNICAL_SETUPS } from '../src/domain/enums.js';
import { closeTestDb, login, resetDb, testApp, testDb } from './helpers.js';

const exampleSeed = path.resolve(import.meta.dirname, '../seed/seed.example.json');

let app: FastifyInstance;

beforeEach(async () => {
  await resetDb();
  await loadSeed(testDb(), readSeedFile(exampleSeed));
  app = await testApp();
});
afterEach(async () => {
  await app.close();
});
afterAll(closeTestDb);

describe('GET /api/reference', () => {
  it('matches the contract shape', async () => {
    const cookie = await login(app, 'partner.a@example.com');
    const res = await app.inject({ method: 'GET', url: '/api/reference', headers: { cookie } });
    expect(res.statusCode).toBe(200);
    const body = res.json();

    expect(Object.keys(body).sort()).toEqual(
      ['budgetCategories', 'costTypes', 'lineupTemplates', 'partners', 'settings', 'technicalSetups'].sort(),
    );

    expect(body.partners).toHaveLength(5);
    expect(body.partners.map((p: { name: string }) => p.name)).toEqual(['Partner A', 'Partner B', 'Partner C', 'Partner D', 'Partner E']);
    expect(body.partners[0]).toEqual({
      id: expect.any(String),
      personId: expect.any(String),
      name: 'Partner A',
      email: 'partner.a@example.com',
      language: 'fi',
      selectedYear: expect.any(Number),
    });

    expect(body.lineupTemplates.map((t: { name: string }) => t.name)).toEqual(['Template A', 'Template B', 'Template C']);
    expect(body.lineupTemplates[1]).toEqual({
      id: expect.any(String),
      name: 'Template B',
      roles: [
        { role: 'VOC', defaultFeeCents: 20000 },
        { role: 'GUITAR', defaultFeeCents: 20000 },
        { role: 'DJ', defaultFeeCents: 20000 },
      ],
    });

    expect(body.settings).toEqual({
      officeDefaultCents: 10000,
      salesDefaultCents: 10000,
      productionDefaultCents: 10000,
      loadInDeductionCents: 1000,
    });

    expect(body.costTypes).toEqual({
      musicianRoles: [...MUSICIAN_ROLES],
      internalRoles: ['OFFICE', 'SALES', 'PRODUCTION'],
      expenseCategories: [...EXPENSE_CATEGORIES],
    });
    expect(body.costTypes.musicianRoles).toContain('VOC');
    expect(INTERNAL_ROLES).toHaveLength(3);
    expect(body.costTypes.expenseCategories[0]).toBe('FUEL');
    expect(body.technicalSetups).toEqual([...TECHNICAL_SETUPS]);

    expect(body.budgetCategories).toHaveLength(10);
    expect(body.budgetCategories[0]).toEqual({ id: expect.any(String), code: 'RENT', nameFi: 'Vuokra', nameEn: 'Rent', budgeted: true });
    expect(body.budgetCategories.find((c: { code: string }) => c.code === 'FUEL')).toMatchObject({ budgeted: false });
  });

  it('returns 401 without a session', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/reference' });
    expect(res.statusCode).toBe(401);
  });
});
