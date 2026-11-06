import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadSeed, readSeedFile } from '../seed/load.js';
import { EXPENSE_CATEGORIES, INTERNAL_ROLES, LOGISTICS, MUSICIAN_ROLES, TECHNICAL_SETUPS } from '../src/domain/enums.js';
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
      ['budgetCategories', 'costTypes', 'lineupTemplates', 'logistics', 'partners', 'settings', 'technicalSetups'].sort(),
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
      active: true,
    });

    expect(body.lineupTemplates.map((t: { name: string }) => t.name)).toEqual(['Template A', 'Template B', 'Template C']);
    expect(body.lineupTemplates[1]).toEqual({
      id: expect.any(String),
      name: 'Template B',
      lines: [
        { type: 'VOC', description: null, defaultCents: 20000 },
        { type: 'GUITAR', description: null, defaultCents: 20000 },
        { type: 'DJ', description: null, defaultCents: 20000 },
        { type: 'OFFICE', description: null, defaultCents: 10000 },
        { type: 'SALES', description: null, defaultCents: 10000 },
        { type: 'PRODUCTION', description: null, defaultCents: 10000 },
      ],
    });

    // The default fee settings are gone (lineups define all fees, 2026-11-06).
    expect(body.settings).toEqual({ loadInDeductionCents: 1000 });

    expect(body.costTypes).toEqual({
      musicianRoles: [...MUSICIAN_ROLES],
      personRoles: MUSICIAN_ROLES.filter((r) => r !== 'OTHER_ROLE'),
      internalRoles: ['OFFICE', 'SALES', 'PRODUCTION'],
      expenseCategories: [...EXPENSE_CATEGORIES],
    });
    expect(body.costTypes.musicianRoles).toContain('VOC');
    // TASK-041: removed roles
    // TASK-052: PIANO merged into KEYS
    for (const removed of ['HORN_1', 'HORN_2', 'TECHNICIAN', 'PIANO']) expect(body.costTypes.musicianRoles).not.toContain(removed);
    expect(body.costTypes.musicianRoles).toEqual(
      ['VOC', 'BACKING_VOC', 'VOC_KEYS', 'BASS', 'GUITAR', 'DRUMS', 'KEYS', 'MIX', 'SAX', 'TRUMPET', 'TROMBONE', 'VIOLIN', 'DJ', 'OTHER_ROLE'],
    );
    // TASK-052: OTHER_ROLE is a cost line type only, never a person role
    expect(body.costTypes.personRoles).toEqual(
      ['VOC', 'BACKING_VOC', 'VOC_KEYS', 'BASS', 'GUITAR', 'DRUMS', 'KEYS', 'MIX', 'SAX', 'TRUMPET', 'TROMBONE', 'VIOLIN', 'DJ'],
    );
    expect(INTERNAL_ROLES).toHaveLength(3);
    expect(body.costTypes.expenseCategories[0]).toBe('FUEL');
    expect(body.technicalSetups).toEqual(['HOUSE_TECH', 'SET_A', 'SET_B', 'SET_C']);
    expect(body.technicalSetups).toEqual([...TECHNICAL_SETUPS]);
    expect(body.logistics).toEqual(['OWN_VAN', 'RENTAL_VAN', 'TAXI', 'OTHER']);
    expect(body.logistics).toEqual([...LOGISTICS]);

    // Only { id, name }: no code / nameFi / nameEn / budgeted (TASK-012)
    expect(body.budgetCategories).toHaveLength(9);
    expect(body.budgetCategories[0]).toEqual({ id: expect.any(String), name: 'Category A' });
    for (const c of body.budgetCategories) expect(Object.keys(c).sort()).toEqual(['id', 'name']);
  });

  it('lists active budget rows only, in sort order, and follows add / rename / remove', async () => {
    const cookie = await login(app, 'partner.a@example.com');
    const names = async (): Promise<string[]> => {
      const res = await app.inject({ method: 'GET', url: '/api/reference', headers: { cookie } });
      return res.json<{ budgetCategories: { name: string }[] }>().budgetCategories.map((c) => c.name);
    };
    const send = (method: 'POST' | 'PATCH' | 'DELETE', url: string, payload?: object) =>
      app.inject({ method, url, headers: { cookie }, ...(payload ? { payload } : {}) });

    const a = await testDb().budgetCategory.findFirstOrThrow({ where: { name: 'Category A' } });
    const b = await testDb().budgetCategory.findFirstOrThrow({ where: { name: 'Category B' } });
    expect((await send('DELETE', `/api/budget-categories/${a.id}`)).statusCode).toBe(204);
    expect((await send('PATCH', `/api/budget-categories/${b.id}`, { name: 'Category B2' })).statusCode).toBe(200);
    expect((await send('POST', '/api/budget-categories', { name: 'Category J' })).statusCode).toBe(201);

    expect(await names()).toEqual(['Category B2', 'Category C', 'Category D', 'Category E', 'Category F', 'Category G', 'Category H', 'Category I', 'Category J']);
  });

  it('returns 401 without a session', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/reference' });
    expect(res.statusCode).toBe(401);
  });
});
