/** Hours endpoints (UC-018, UC-019; BR-050, BR-051, BR-083). Synthetic data only. */
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { isValidHours } from '../src/hours/store.js';
import { closeTestDb, login, resetDb, testDb } from './helpers.js';
import { call, startSession, UNKNOWN_ID, type Json, type Session } from './gigFixtures.js';

let s: Session;

beforeEach(async () => {
  await resetDb();
  s = await startSession();
});
afterEach(async () => {
  await s.app.close();
});
afterAll(closeTestDb);

async function logHours(session: Session, date: string, hours: number, comment = 'Work 1'): Promise<Json> {
  const res = await call(session, 'POST', '/api/hours', { date, comment, hours });
  if (res.statusCode !== 201) throw new Error(`log hours failed: ${res.statusCode} ${res.body}`);
  return res.json();
}

async function asPartnerB(): Promise<Session> {
  return { ...s, cookie: await login(s.app, 'partner.b@example.com') };
}

describe('isValidHours', () => {
  it('accepts 0.25…24 in 0.25 steps only', () => {
    for (const h of [0.25, 0.5, 1, 1.25, 7.75, 23.75, 24]) expect(isValidHours(h)).toBe(true);
    for (const h of [0, -0.25, 0.1, 1.3, 24.25, 25, Number.NaN, Number.POSITIVE_INFINITY]) expect(isValidHours(h)).toBe(false);
  });
});

describe('POST /api/hours', () => {
  it('logs an entry for me', async () => {
    const res = await call(s, 'POST', '/api/hours', { date: '2026-03-02', comment: ' Work 1 ', hours: 1.5 });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toEqual({ id: expect.any(String), partnerId: s.world.a.id, date: '2026-03-02', comment: 'Work 1', hours: 1.5 });
  });

  it('ignores a partnerId in the body (always me)', async () => {
    const res = await call(s, 'POST', '/api/hours', { date: '2026-03-02', comment: 'Work 1', hours: 1, partnerId: s.world.b.id });
    expect(res.json().partnerId).toBe(s.world.a.id);
  });

  it('rejects invalid hours with INVALID_HOURS', async () => {
    for (const hours of [0, 0.1, 1.3, 24.25, -1, '2', true]) {
      const res = await call(s, 'POST', '/api/hours', { date: '2026-03-02', comment: 'Work 1', hours });
      expect(res.statusCode).toBe(400);
      expect(res.json().error).toMatchObject({ code: 'VALIDATION_ERROR', fields: { hours: 'INVALID_HOURS' } });
    }
    expect(await testDb().hourEntry.count()).toBe(0);
  });

  it('requires date, comment and hours', async () => {
    const res = await call(s, 'POST', '/api/hours', { comment: '   ' });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.fields).toEqual({ date: 'REQUIRED', comment: 'REQUIRED', hours: 'REQUIRED' });
    const bad = await call(s, 'POST', '/api/hours', { date: '2026-13-01', comment: 'x'.repeat(501), hours: 1 });
    expect(bad.json().error.fields).toEqual({ date: 'INVALID_DATE', comment: 'TOO_LONG' });
  });
});

describe('GET /api/hours', () => {
  it("lists my entries of the year newest first; partnerId shows another partner's", async () => {
    const jan = await logHours(s, '2026-01-10', 2);
    const mar = await logHours(s, '2026-03-02', 1.25);
    const mar2 = await logHours(s, '2026-03-02', 0.5);
    await logHours(s, '2025-12-31', 3);
    const b = await asPartnerB();
    const bEntry = await logHours(b, '2026-02-01', 4);

    const mine = await call(s, 'GET', '/api/hours?year=2026');
    expect(mine.statusCode).toBe(200);
    expect(mine.json().map((e: { id: string }) => e.id)).toEqual([mar2.id, mar.id, jan.id]);

    const theirs = await call(s, 'GET', `/api/hours?year=2026&partnerId=${s.world.b.id}`);
    expect(theirs.json()).toEqual([bEntry]);
    expect((await call(s, 'GET', `/api/hours?year=2026&partnerId=${UNKNOWN_ID}`)).json()).toEqual([]);
  });

  it('validates the query', async () => {
    const missing = await call(s, 'GET', '/api/hours');
    expect(missing.statusCode).toBe(400);
    expect(missing.json().error.fields).toEqual({ year: 'REQUIRED' });
    const bad = await call(s, 'GET', '/api/hours?year=abcd&partnerId=x');
    expect(bad.json().error.fields).toEqual({ year: 'INVALID_VALUE', partnerId: 'INVALID_VALUE' });
  });
});

describe('PATCH /api/hours/{id}', () => {
  it('edits my own entry', async () => {
    const entry = await logHours(s, '2026-03-02', 1);
    const res = await call(s, 'PATCH', `/api/hours/${entry.id}`, { date: '2026-04-01', comment: 'Work 2', hours: 23.75 });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ...entry, date: '2026-04-01', comment: 'Work 2', hours: 23.75 });
  });

  it('a no-op returns 200 and writes nothing', async () => {
    const entry = await logHours(s, '2026-03-02', 1.5);
    const before = await testDb().hourEntry.findUniqueOrThrow({ where: { id: entry.id } });
    const res = await call(s, 'PATCH', `/api/hours/${entry.id}`, { date: '2026-03-02', comment: 'Work 1', hours: 1.5 });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual(entry);
    expect((await testDb().hourEntry.findUniqueOrThrow({ where: { id: entry.id } })).updatedAt).toEqual(before.updatedAt);
  });

  it("403 for another partner's entry; 400 before 404 before 403", async () => {
    const b = await asPartnerB();
    const entry = await logHours(b, '2026-03-02', 1);

    const forbidden = await call(s, 'PATCH', `/api/hours/${entry.id}`, { hours: 2 });
    expect(forbidden.statusCode).toBe(403);
    expect(forbidden.json().error.code).toBe('FORBIDDEN');
    expect((await testDb().hourEntry.findUniqueOrThrow({ where: { id: entry.id } })).hours.toString()).toBe('1');

    const invalid = await call(s, 'PATCH', `/api/hours/${entry.id}`, { hours: 0.3, comment: '' });
    expect(invalid.statusCode).toBe(400);
    expect(invalid.json().error.fields).toEqual({ hours: 'INVALID_HOURS', comment: 'REQUIRED' });

    expect((await call(s, 'PATCH', `/api/hours/${UNKNOWN_ID}`, { hours: 2 })).statusCode).toBe(404);
  });
});

describe('DELETE /api/hours/{id}', () => {
  it('deletes my own entry; 403 for others; 404 for unknown', async () => {
    const mine = await logHours(s, '2026-03-02', 1);
    const b = await asPartnerB();
    const theirs = await logHours(b, '2026-03-02', 1);

    expect((await call(s, 'DELETE', `/api/hours/${theirs.id}`)).statusCode).toBe(403);
    expect((await call(s, 'DELETE', `/api/hours/${mine.id}`)).statusCode).toBe(204);
    expect((await call(s, 'DELETE', `/api/hours/${mine.id}`)).statusCode).toBe(404);
    expect(await testDb().hourEntry.count()).toBe(1);
  });
});

describe('GET /api/hours/totals', () => {
  it('lists every partner with monthly totals, year total and grand total', async () => {
    await logHours(s, '2026-01-01', 1.25);
    await logHours(s, '2026-01-31', 0.5);
    await logHours(s, '2026-12-31', 24);
    await logHours(s, '2027-01-01', 8); // other year
    await logHours(s, '2025-12-31', 8); // other year
    const b = await asPartnerB();
    await logHours(b, '2026-06-15', 0.25);
    await logHours(b, '2026-06-16', 0.25);

    const res = await call(s, 'GET', '/api/hours/totals?year=2026');
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      year: 2026,
      partners: [
        { partnerId: s.world.a.id, months: [1.75, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 24], total: 25.75 },
        { partnerId: s.world.b.id, months: [0, 0, 0, 0, 0, 0.5, 0, 0, 0, 0, 0, 0], total: 0.5 },
        { partnerId: s.world.c.id, months: new Array(12).fill(0), total: 0 },
      ],
      grandTotal: 26.25,
    });
  });

  it('is all zeros for an empty year and validates the year', async () => {
    const res = await call(s, 'GET', '/api/hours/totals?year=2030');
    expect(res.json().grandTotal).toBe(0);
    expect(res.json().partners).toHaveLength(3);
    const bad = await call(s, 'GET', '/api/hours/totals');
    expect(bad.statusCode).toBe(400);
    expect(bad.json().error.fields).toEqual({ year: 'REQUIRED' });
  });
});
