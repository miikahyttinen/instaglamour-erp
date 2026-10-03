/** People endpoints (UC-014). Synthetic data only; money is 1000 or multiples of 10000 cents. */
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeTestDb, resetDb, testDb } from './helpers.js';
import { call, createGig, startSession, UNKNOWN_ID, type Json, type Session } from './gigFixtures.js';

let s: Session;

beforeEach(async () => {
  await resetDb();
  s = await startSession();
});
afterEach(async () => {
  await s.app.close();
});
afterAll(closeTestDb);

const names = (people: { name: string }[]) => people.map((p) => p.name);

describe('GET /api/people', () => {
  it('lists active people sorted by name by default; active=false and all filter', async () => {
    await testDb().person.create({ data: { name: 'Person 0', active: false } });
    const active = await call(s, 'GET', '/api/people');
    expect(active.statusCode).toBe(200);
    expect(names(active.json())).toEqual(['Partner A', 'Partner B', 'Partner C', 'Person 1', 'Person 2', 'Person 3']);
    expect(active.json()[3]).toEqual({ id: s.world.p1.id, name: 'Person 1', active: true });

    const inactive = await call(s, 'GET', '/api/people?active=false');
    expect(names(inactive.json())).toEqual(['Person 0']);

    const all = await call(s, 'GET', '/api/people?active=all');
    expect(names(all.json())).toEqual(['Partner A', 'Partner B', 'Partner C', 'Person 0', 'Person 1', 'Person 2', 'Person 3']);
  });

  it('rejects an unknown active filter', async () => {
    const res = await call(s, 'GET', '/api/people?active=maybe');
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatchObject({ code: 'VALIDATION_ERROR', fields: { active: 'INVALID_VALUE' } });
  });

  it('requires a session', async () => {
    const res = await s.app.inject({ method: 'GET', url: '/api/people' });
    expect(res.statusCode).toBe(401);
  });
});

describe('POST /api/people', () => {
  it('creates an active person without warnings', async () => {
    const res = await call(s, 'POST', '/api/people', { name: '  Person 4 ' });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toEqual({ person: { id: expect.any(String), name: 'Person 4', active: true }, warnings: [] });
  });

  it('warns on a case-insensitive duplicate name but still creates', async () => {
    const res = await call(s, 'POST', '/api/people', { name: 'PERSON 1' });
    expect(res.statusCode).toBe(201);
    expect(res.json().warnings).toEqual([{ code: 'DUPLICATE_NAME' }]);
    expect(await testDb().person.count({ where: { name: 'PERSON 1' } })).toBe(1);
  });

  it('does not treat a substring as a duplicate', async () => {
    const res = await call(s, 'POST', '/api/people', { name: 'Person' });
    expect(res.json().warnings).toEqual([]);
  });

  it('requires a name', async () => {
    for (const payload of [{}, { name: '   ' }, { name: null }]) {
      const res = await call(s, 'POST', '/api/people', payload);
      expect(res.statusCode).toBe(400);
      expect(res.json().error.fields).toEqual({ name: 'REQUIRED' });
    }
    const long = await call(s, 'POST', '/api/people', { name: 'x'.repeat(501) });
    expect(long.json().error.fields).toEqual({ name: 'TOO_LONG' });
  });
});

describe('PATCH /api/people/{id}', () => {
  it('renames and deactivates', async () => {
    const res = await call(s, 'PATCH', `/api/people/${s.world.p1.id}`, { name: 'Person 9', active: false });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ person: { id: s.world.p1.id, name: 'Person 9', active: false }, warnings: [] });
    const reactivated = await call(s, 'PATCH', `/api/people/${s.world.p1.id}`, { active: true });
    expect(reactivated.json().person.active).toBe(true);
  });

  it('warns when the new name matches another person, not itself', async () => {
    const dup = await call(s, 'PATCH', `/api/people/${s.world.p1.id}`, { name: 'person 2' });
    expect(dup.statusCode).toBe(200);
    expect(dup.json().warnings).toEqual([{ code: 'DUPLICATE_NAME' }]);

    const self = await call(s, 'PATCH', `/api/people/${s.world.p3.id}`, { name: 'PERSON 3' });
    expect(self.json()).toEqual({ person: { id: s.world.p3.id, name: 'PERSON 3', active: true }, warnings: [] });
  });

  it('a no-op returns 200 and writes nothing', async () => {
    const before = await testDb().person.findUniqueOrThrow({ where: { id: s.world.p1.id } });
    const res = await call(s, 'PATCH', `/api/people/${s.world.p1.id}`, { name: 'Person 1', active: true });
    expect(res.statusCode).toBe(200);
    const after = await testDb().person.findUniqueOrThrow({ where: { id: s.world.p1.id } });
    expect(after.updatedAt).toEqual(before.updatedAt);
  });

  it('validates before checking existence', async () => {
    const invalid = await call(s, 'PATCH', `/api/people/${UNKNOWN_ID}`, { name: '', active: 'yes' });
    expect(invalid.statusCode).toBe(400);
    expect(invalid.json().error.fields).toEqual({ name: 'REQUIRED', active: 'INVALID_VALUE' });

    for (const id of [UNKNOWN_ID, 'not-a-uuid']) {
      const res = await call(s, 'PATCH', `/api/people/${id}`, { active: false });
      expect(res.statusCode).toBe(404);
      expect(res.json().error.code).toBe('NOT_FOUND');
    }
  });
});

describe('GET /api/people/{id}/cost-lines', () => {
  async function assign(gig: Json, type: string, personId: string, budgetedCents?: number) {
    const line = gig.costLines.find((l: Json) => l.type === type);
    const res = await call(s, 'PATCH', `/api/cost-lines/${line.id}`, { personId, ...(budgetedCents !== undefined && { budgetedCents }) });
    if (res.statusCode !== 200) throw new Error(res.body);
    return line.id as string;
  }

  it("lists the person's lines on non-deleted gigs of the year in gig order, with totals", async () => {
    const p1 = s.world.p1.id;
    const june = await createGig(s, { startDate: '2026-06-01', venue: 'Venue Y' });
    const may = await createGig(s, { startDate: '2026-05-01' });
    const cancelled = await createGig(s, { startDate: '2026-07-01' });
    const deleted = await createGig(s, { startDate: '2026-08-01' });
    const otherYear = await createGig(s, { startDate: '2027-05-01' });

    const mayVoc = await assign(may, 'VOC', p1);
    const juneBass = await assign(june, 'BASS', p1);
    const cancelledVoc = await assign(cancelled, 'VOC', p1);
    await assign(deleted, 'VOC', p1);
    await assign(otherYear, 'VOC', p1);
    // A second line for the same person on the same gig (BR-024)
    const extra = await call(s, 'POST', `/api/gigs/${may.id}/cost-lines`, { type: 'TRAVEL', personId: p1, budgetedCents: 10000 });
    const mayTravel = extra.json().gig.costLines.at(-1).id;

    await call(s, 'POST', `/api/cost-lines/${mayVoc}/pay`, { actualCents: 20000 });
    await call(s, 'POST', `/api/gigs/${cancelled.id}/cancel`, { reason: 'Reason 1' });
    await call(s, 'POST', `/api/gigs/${deleted.id}/delete`, { reason: 'Reason 1' });

    const res = await call(s, 'GET', `/api/people/${p1}/cost-lines?year=2026`);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.lines.map((l: { costLine: { id: string } }) => l.costLine.id)).toEqual([mayVoc, mayTravel, juneBass, cancelledVoc]);
    expect(body.lines[0]).toEqual({
      costLine: expect.objectContaining({ id: mayVoc, gigId: may.id, type: 'VOC', personId: p1, budgetedCents: 30000, actualCents: 20000 }),
      gigId: may.id,
      gigStartDate: '2026-05-01',
      gigLineupName: 'Template A',
      gigVenue: 'Venue X',
      gigStatus: 'SOLD',
    });
    expect(body.lines[3].gigStatus).toBe('CANCELLED');
    // budgeted: VOC 30000 + TRAVEL 10000 + BASS 20000 + VOC 30000; actual: paid VOC only
    expect(body.totals).toEqual({ budgetedCents: 90000, actualCents: 20000 });
  });

  it('returns an empty list with zero totals', async () => {
    const res = await call(s, 'GET', `/api/people/${s.world.p2.id}/cost-lines?year=2026`);
    expect(res.json()).toEqual({ lines: [], totals: { budgetedCents: 0, actualCents: 0 } });
  });

  it('requires a valid year, then an existing person', async () => {
    const missing = await call(s, 'GET', `/api/people/${UNKNOWN_ID}/cost-lines`);
    expect(missing.statusCode).toBe(400);
    expect(missing.json().error.fields).toEqual({ year: 'REQUIRED' });
    const bad = await call(s, 'GET', `/api/people/${s.world.p1.id}/cost-lines?year=26`);
    expect(bad.json().error.fields).toEqual({ year: 'INVALID_VALUE' });
    const unknown = await call(s, 'GET', `/api/people/${UNKNOWN_ID}/cost-lines?year=2026`);
    expect(unknown.statusCode).toBe(404);
  });
});
