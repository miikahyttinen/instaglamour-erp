/**
 * People: roles and gig count (TASK-027; docs/api-contract.md "People: roles and gig count").
 * Synthetic data only; money is multiples of 10000 cents.
 */
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { CostType } from '../src/generated/prisma/enums.js';
import { dateFromIso, todayIso } from '../src/domain/dates.js';
import { loadGigCounts } from '../src/people/store.js';
import { closeTestDb, resetDb, testDb } from './helpers.js';
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

/** `YYYY-MM-DD` shifted by whole days from the business "today". */
function daysFromToday(days: number): string {
  const d = dateFromIso(todayIso());
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** A gig written directly, with cost lines `[type, personId]`. */
async function gigWith(
  lines: [CostType, string | null][],
  options: { startDate?: string; status?: 'SOLD' | 'CANCELLED'; deleted?: boolean } = {},
) {
  return testDb().gig.create({
    data: {
      startDate: dateFromIso(options.startDate ?? daysFromToday(-10)),
      status: options.status ?? 'SOLD',
      lineupName: 'Lineup A',
      venue: 'Venue X',
      sellerId: s.world.a.id,
      producerId: s.world.a.id,
      priceCents: 100000,
      deletedAt: options.deleted ? new Date() : null,
      costLines: { create: lines.map(([type, personId]) => ({ type, personId, budgetedCents: 10000 })) },
    },
  });
}

async function person(id: string): Promise<Json> {
  const res = await call(s, 'GET', '/api/people?active=all');
  expect(res.statusCode).toBe(200);
  return res.json().find((p: Json) => p.id === id);
}

describe('Person.gigCount', () => {
  it('counts distinct played SOLD non-deleted gigs with a musician-role line, all years', async () => {
    const { p1, p2 } = s.world;
    await gigWith([['VOC', p1.id], ['BACKING_VOC', p1.id], ['BASS', p2.id]]); // two lines on one gig = 1
    await gigWith([['GUITAR', p1.id]], { startDate: '2020-06-01' }); // an earlier year counts
    await gigWith([['DRUMS', p1.id]], { status: 'CANCELLED' }); // cancelled: no
    await gigWith([['DRUMS', p1.id]], { deleted: true }); // deleted: no
    await gigWith([['DRUMS', p1.id]], { startDate: daysFromToday(1) }); // upcoming: no
    await gigWith([['DRUMS', p1.id]], { startDate: todayIso() }); // today = not played yet
    await gigWith([['OFFICE', p1.id], ['FUEL', p1.id]]); // only internal / expense lines: no
    await gigWith([['VOC', null]]); // unstaffed line: nobody

    expect((await person(p1.id)).gigCount).toBe(2);
    expect((await person(p2.id)).gigCount).toBe(1);
    expect((await person(s.world.p3.id)).gigCount).toBe(0);
  });

  it('counts a partner who plays and appears in POST, PATCH and partner responses', async () => {
    const a = s.world.a;
    await gigWith([['KEYS', a.personId], ['SALES', a.personId]]);
    expect((await person(a.personId)).gigCount).toBe(1);

    const patched = await call(s, 'PATCH', `/api/people/${a.personId}`, { name: 'Partner A' });
    expect(patched.json().person).toMatchObject({ gigCount: 1, roles: [] });

    const created = await call(s, 'POST', '/api/people', { name: 'Person 4' });
    expect(created.json().person).toMatchObject({ gigCount: 0, roles: [] });

    const revoked = await call(s, 'DELETE', `/api/people/${s.world.b.personId}/partner`);
    expect(revoked.statusCode).toBe(200);
    expect(revoked.json()).toMatchObject({ gigCount: 0, roles: [] });
  });

  it('loads the counts of a whole list with one grouped query', async () => {
    const { p1, p2, p3 } = s.world;
    await gigWith([['VOC', p1.id], ['BASS', p2.id]]);
    await gigWith([['VOC', p1.id]]);
    const counts = await loadGigCounts(testDb(), [p1.id, p2.id, p3.id]);
    expect(Object.fromEntries(counts)).toEqual({ [p1.id]: 2, [p2.id]: 1 });
    expect((await loadGigCounts(testDb(), [])).size).toBe(0);
    // `today` is a parameter: a date before the gigs counts nothing
    expect((await loadGigCounts(testDb(), [p1.id], '2000-01-01')).size).toBe(0);
  });
});

describe('PATCH /api/people/{id} roles', () => {
  it('replaces the list and returns it in MUSICIAN_ROLES order', async () => {
    const id = s.world.p1.id;
    const res = await call(s, 'PATCH', `/api/people/${id}`, { roles: ['DJ', 'VOC', 'BASS'] });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      person: { id, name: 'Person 1', active: true, partner: null, roles: ['VOC', 'BASS', 'DJ'], gigCount: 0 },
      warnings: [],
    });
    expect((await testDb().person.findUniqueOrThrow({ where: { id } })).roles).toEqual(['VOC', 'BASS', 'DJ']);

    const replaced = await call(s, 'PATCH', `/api/people/${id}`, { roles: ['GUITAR'] });
    expect(replaced.json().person.roles).toEqual(['GUITAR']);

    const cleared = await call(s, 'PATCH', `/api/people/${id}`, { roles: [] });
    expect(cleared.json().person.roles).toEqual([]);
  });

  it('is a no-op when the same set is sent in another order', async () => {
    const id = s.world.p1.id;
    await call(s, 'PATCH', `/api/people/${id}`, { roles: ['VOC', 'BASS'] });
    const before = await testDb().person.findUniqueOrThrow({ where: { id } });
    const res = await call(s, 'PATCH', `/api/people/${id}`, { roles: ['BASS', 'VOC'] });
    expect(res.json().person.roles).toEqual(['VOC', 'BASS']);
    expect((await testDb().person.findUniqueOrThrow({ where: { id } })).updatedAt).toEqual(before.updatedAt);
  });

  it('rejects duplicates, non-musician codes and non-lists with roles: INVALID_VALUE', async () => {
    const id = s.world.p1.id;
    for (const roles of [['VOC', 'VOC'], ['OFFICE'], ['FUEL'], ['NOPE'], 'VOC', null, [1], [null]]) {
      const res = await call(s, 'PATCH', `/api/people/${id}`, { roles });
      expect(res.statusCode, JSON.stringify(roles)).toBe(400);
      expect(res.json().error).toMatchObject({ code: 'VALIDATION_ERROR', fields: { roles: 'INVALID_VALUE' } });
    }
    expect((await testDb().person.findUniqueOrThrow({ where: { id } })).roles).toEqual([]);
  });

  it('404s for an unknown person', async () => {
    const res = await call(s, 'PATCH', `/api/people/${UNKNOWN_ID}`, { roles: ['VOC'] });
    expect(res.statusCode).toBe(404);
  });
});

describe('GET /api/people?role=', () => {
  it('lists people whose roles include the role, combined with active and partner', async () => {
    const db = testDb();
    const { p1, p2, p3, a } = s.world;
    await db.person.update({ where: { id: p1.id }, data: { roles: ['VOC', 'BASS'] } });
    await db.person.update({ where: { id: p2.id }, data: { roles: ['BASS'], active: false } });
    await db.person.update({ where: { id: p3.id }, data: { roles: ['DRUMS'] } });
    await db.person.update({ where: { id: a.personId }, data: { roles: ['BASS'] } });

    const names = async (query: string) => {
      const res = await call(s, 'GET', `/api/people?${query}`);
      expect(res.statusCode).toBe(200);
      return res.json<{ name: string }[]>().map((p) => p.name);
    };
    expect(await names('role=BASS')).toEqual(['Partner A', 'Person 1']);
    expect(await names('role=BASS&active=all')).toEqual(['Partner A', 'Person 1', 'Person 2']);
    expect(await names('role=BASS&active=false')).toEqual(['Person 2']);
    expect(await names('role=BASS&partner=false')).toEqual(['Person 1']);
    expect(await names('role=BASS&partner=true')).toEqual(['Partner A']);
    expect(await names('role=PIANO')).toEqual([]);
  });

  it('rejects an unknown or non-musician role code', async () => {
    for (const role of ['NOPE', 'OFFICE', 'FUEL', 'voc']) {
      const res = await call(s, 'GET', `/api/people?role=${role}`);
      expect(res.statusCode).toBe(400);
      expect(res.json().error).toMatchObject({ code: 'VALIDATION_ERROR', fields: { role: 'INVALID_VALUE' } });
    }
  });
});
