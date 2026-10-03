import type { FastifyInstance } from 'fastify';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { currentYear } from '../src/domain/dates.js';
import { closeTestDb, createPartner, login, resetDb, testApp } from './helpers.js';

let app: FastifyInstance;
let cookie: string;

beforeEach(async () => {
  await resetDb();
  await createPartner('Partner A', 'partner.a@example.com', 'en');
  await createPartner('Partner B', 'partner.b@example.com');
  app = await testApp();
  cookie = await login(app, 'partner.a@example.com');
});
afterEach(async () => {
  await app.close();
});
afterAll(closeTestDb);

const patchMe = (payload: unknown) => app.inject({ method: 'PATCH', url: '/api/me', headers: { cookie }, payload: payload as object });

describe('GET /api/me', () => {
  it('returns the signed-in partner; selectedYear defaults to the current year', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/me', headers: { cookie } });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toEqual({
      id: expect.any(String),
      personId: expect.any(String),
      name: 'Partner A',
      email: 'partner.a@example.com',
      language: 'en',
      selectedYear: currentYear(),
    });
  });
});

describe('PATCH /api/me', () => {
  it('saves language and selected year', async () => {
    const res = await patchMe({ language: 'fi', selectedYear: 2025 });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ language: 'fi', selectedYear: 2025, name: 'Partner A' });

    const again = await app.inject({ method: 'GET', url: '/api/me', headers: { cookie } });
    expect(again.json()).toMatchObject({ language: 'fi', selectedYear: 2025 });
  });

  it('accepts a partial update and an empty body', async () => {
    expect((await patchMe({ selectedYear: 2027 })).json()).toMatchObject({ language: 'en', selectedYear: 2027 });
    expect((await patchMe({})).json()).toMatchObject({ language: 'en', selectedYear: 2027 });
  });

  it('only changes the signed-in partner', async () => {
    await patchMe({ selectedYear: 2030 });
    const b = await login(app, 'partner.b@example.com');
    const res = await app.inject({ method: 'GET', url: '/api/me', headers: { cookie: b } });
    expect(res.json()).toMatchObject({ email: 'partner.b@example.com', selectedYear: currentYear() });
  });

  it.each([
    [{ language: 'sv' }, 'language'],
    [{ language: 1 }, 'language'],
    [{ language: null }, 'language'],
    [{ selectedYear: '2026' }, 'selectedYear'],
    [{ selectedYear: 2026.5 }, 'selectedYear'],
    [{ selectedYear: 1999 }, 'selectedYear'],
    [{ selectedYear: 2101 }, 'selectedYear'],
    [{ selectedYear: null }, 'selectedYear'],
  ])('rejects %j with VALIDATION_ERROR', async (payload, field) => {
    const res = await patchMe(payload);
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({
      error: { code: 'VALIDATION_ERROR', message: expect.any(String), fields: { [field]: 'INVALID_VALUE' } },
    });
  });

  it('rejects malformed JSON with VALIDATION_ERROR', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/me',
      headers: { cookie, 'content-type': 'application/json' },
      payload: '{not json',
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
  });
});
