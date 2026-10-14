/**
 * Partner status (UC-032, BR-070, BR-110…112): PUT/DELETE /api/people/{id}/partner, sign-in and
 * session rules, people filter, reference, and active-partner validation for new choices.
 * Synthetic data only (BR-090).
 */
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { revokePartner } from '../src/partners/store.js';
import { call, createGig, gigBody, startSession, UNKNOWN_ID, type Json, type Session } from './gigFixtures.js';
import { closeTestDb, FakeGoogle, login, resetDb, testApp, testDb } from './helpers.js';

let s: Session;

beforeEach(async () => {
  await resetDb();
  s = await startSession(); // signed in as Partner A; partners A, B, C; people 1–3
});
afterEach(async () => {
  await s.app.close();
});
afterAll(closeTestDb);

const put = (personId: string, payload: unknown, session: Session = s) =>
  call(session, 'PUT', `/api/people/${personId}/partner`, payload);
const del = (personId: string, session: Session = s) => call(session, 'DELETE', `/api/people/${personId}/partner`);
const me = (cookie: string) => s.app.inject({ method: 'GET', url: '/api/me', headers: { cookie } });
const as = (cookie: string): Session => ({ ...s, cookie });

async function deactivateDirectly(...partnerIds: string[]) {
  await testDb().partner.updateMany({ where: { id: { in: partnerIds } }, data: { active: false } });
}

describe('PUT /api/people/{id}/partner — grant', () => {
  it('makes a person an active partner (email normalised) who can then sign in and be chosen', async () => {
    const res = await put(s.world.p1.id, { email: '  Person.One@EXAMPLE.com ' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      id: s.world.p1.id,
      name: 'Person 1',
      active: true,
      partner: { id: expect.any(String), email: 'person.one@example.com', active: true },
    });
    const partnerId = res.json().partner.id as string;

    const row = await testDb().partner.findUniqueOrThrow({ where: { id: partnerId } });
    expect(row).toMatchObject({ personId: s.world.p1.id, grantedById: s.world.a.id, revokedById: null, revokedAt: null });
    expect(row.grantedAt).toBeInstanceOf(Date);

    // AC-1: can sign in; in reference partners; can be chosen as seller/producer/owner.
    const cookie = await login(s.app, 'person.one@example.com');
    expect((await me(cookie)).json()).toMatchObject({ id: partnerId, name: 'Person 1', active: true });
    const ref = (await call(s, 'GET', '/api/reference')).json();
    expect(ref.partners.find((p: Json) => p.id === partnerId)).toMatchObject({ active: true, name: 'Person 1' });
    const gig = await call(s, 'POST', '/api/gigs', gigBody(s.world, { sellerId: partnerId, producerId: partnerId }));
    expect(gig.statusCode).toBe(201);
    const task = await call(s, 'POST', '/api/tasks', { title: 'Task 1', ownerId: partnerId });
    expect(task.statusCode).toBe(201);
  });

  it('validates the email: required, format and exactly the allowed domain (server-side)', async () => {
    const cases: [unknown, string][] = [
      [{}, 'REQUIRED'],
      [{ email: '   ' }, 'REQUIRED'],
      [{ email: null }, 'REQUIRED'],
      [{ email: 42 }, 'INVALID_VALUE'],
      [{ email: 'not-an-email' }, 'INVALID_VALUE'],
      [{ email: 'person.one@example.org' }, 'INVALID_VALUE'],
      [{ email: 'person.one@sub.example.com' }, 'INVALID_VALUE'],
      [{ email: 'person.one@example.com.attacker.test' }, 'INVALID_VALUE'],
      [{ email: 'person.one@attacker.test@example.com' }, 'INVALID_VALUE'],
      [{ email: '@example.com' }, 'INVALID_VALUE'],
      [{ email: `${'x'.repeat(500)}@example.com` }, 'TOO_LONG'],
    ];
    for (const [payload, code] of cases) {
      const res = await put(s.world.p1.id, payload);
      expect(res.statusCode, JSON.stringify(payload)).toBe(400);
      expect(res.json().error).toMatchObject({ code: 'VALIDATION_ERROR', fields: { email: code } });
    }
    expect(await testDb().partner.count({ where: { personId: s.world.p1.id } })).toBe(0);
  });

  it('rejects an email used by another partner (case-insensitive), including a removed one', async () => {
    const dup = await put(s.world.p1.id, { email: 'PARTNER.B@example.com' });
    expect(dup.statusCode).toBe(400);
    expect(dup.json().error.fields).toEqual({ email: 'DUPLICATE' });

    await deactivateDirectly(s.world.c.id);
    const removed = await put(s.world.p1.id, { email: 'partner.c@example.com' });
    expect(removed.json().error.fields).toEqual({ email: 'DUPLICATE' });
    expect(await testDb().partner.count({ where: { personId: s.world.p1.id } })).toBe(0);
  });

  it('the database enforces case-insensitive email uniqueness too', async () => {
    await expect(
      testDb().partner.create({ data: { email: 'PARTNER.A@example.com', person: { create: { name: 'Person X' } } } }),
    ).rejects.toThrow();
  });

  it('two concurrent grants of the same email: exactly one wins, the other gets DUPLICATE', async () => {
    const [r1, r2] = await Promise.all([
      put(s.world.p1.id, { email: 'same@example.com' }),
      put(s.world.p2.id, { email: 'same@example.com' }),
    ]);
    expect([r1.statusCode, r2.statusCode].sort()).toEqual([200, 400]);
    const loser = r1.statusCode === 400 ? r1 : r2;
    expect(loser.json().error.fields).toEqual({ email: 'DUPLICATE' });
    expect(await testDb().partner.count({ where: { email: 'same@example.com' } })).toBe(1);
  });

  it('an inactive person cannot be made a partner (409 INVALID_STATUS_TRANSITION); nothing changes', async () => {
    await call(s, 'PATCH', `/api/people/${s.world.p1.id}`, { active: false });
    const res = await put(s.world.p1.id, { email: 'person.one@example.com' });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('INVALID_STATUS_TRANSITION');
    expect(await testDb().partner.count({ where: { personId: s.world.p1.id } })).toBe(0);

    // Also for re-granting a removed partner whose person was deactivated.
    await del(s.world.c.personId);
    await call(s, 'PATCH', `/api/people/${s.world.c.personId}`, { active: false });
    const regrant = await put(s.world.c.personId, { email: 'partner.c@example.com' });
    expect(regrant.statusCode).toBe(409);
    expect(regrant.json().error.code).toBe('INVALID_STATUS_TRANSITION');
    expect((await testDb().partner.findUniqueOrThrow({ where: { id: s.world.c.id } })).active).toBe(false);

    // Validation (400) still comes first.
    expect((await put(s.world.p1.id, { email: 'x@example.org' })).statusCode).toBe(400);
  });

  it('validates (400) before existence (404); unknown or malformed id → 404', async () => {
    expect((await put(UNKNOWN_ID, { email: 'x@example.org' })).statusCode).toBe(400);
    for (const id of [UNKNOWN_ID, 'not-a-uuid']) {
      const res = await put(id, { email: 'new.one@example.com' });
      expect(res.statusCode).toBe(404);
      expect(res.json().error.code).toBe('NOT_FOUND');
    }
  });

  it('keeping the same email is a no-op (nothing written, sessions kept)', async () => {
    const bCookie = await login(s.app, 'partner.b@example.com');
    const before = await testDb().partner.findUniqueOrThrow({ where: { id: s.world.b.id } });
    const res = await put(s.world.b.personId, { email: 'Partner.B@example.com' });
    expect(res.statusCode).toBe(200);
    expect(res.json().partner).toEqual({ id: s.world.b.id, email: 'partner.b@example.com', active: true });
    const after = await testDb().partner.findUniqueOrThrow({ where: { id: s.world.b.id } });
    expect(after.updatedAt).toEqual(before.updatedAt);
    expect((await me(bCookie)).statusCode).toBe(200);
  });

  it("changing an active partner's email (A1) revokes that partner's sessions; old email can't sign in", async () => {
    const bCookie = await login(s.app, 'partner.b@example.com');
    const res = await put(s.world.b.personId, { email: 'partner.b2@example.com' });
    expect(res.statusCode).toBe(200);
    expect(res.json().partner).toEqual({ id: s.world.b.id, email: 'partner.b2@example.com', active: true });
    expect((await me(bCookie)).statusCode).toBe(401);
    const old = await s.app.inject({ method: 'POST', url: '/api/auth/dev-login', payload: { email: 'partner.b@example.com' } });
    expect(old.statusCode).toBe(403);
    await login(s.app, 'partner.b2@example.com');
  });

  it('changing your own email keeps the current session but ends your other sessions', async () => {
    const otherDevice = await login(s.app, 'partner.a@example.com');
    const res = await put(s.world.a.personId, { email: 'partner.a2@example.com' });
    expect(res.statusCode).toBe(200);
    expect((await me(s.cookie)).statusCode).toBe(200);
    expect((await me(otherDevice)).statusCode).toBe(401);
  });

  it('requires a session', async () => {
    const res = await s.app.inject({ method: 'PUT', url: `/api/people/${s.world.p1.id}/partner`, payload: { email: 'x@example.com' } });
    expect(res.statusCode).toBe(401);
  });
});

describe('DELETE /api/people/{id}/partner — revoke', () => {
  it('deactivates, records who/when, and revokes all sessions immediately (AC-2)', async () => {
    const bCookie1 = await login(s.app, 'partner.b@example.com');
    const bCookie2 = await login(s.app, 'partner.b@example.com');
    expect((await me(bCookie1)).statusCode).toBe(200);

    const res = await del(s.world.b.personId);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      id: s.world.b.personId,
      name: 'Partner B',
      active: true,
      partner: { id: s.world.b.id, email: 'partner.b@example.com', active: false },
    });

    const row = await testDb().partner.findUniqueOrThrow({ where: { id: s.world.b.id } });
    expect(row).toMatchObject({ active: false, revokedById: s.world.a.id });
    expect(row.revokedAt).toBeInstanceOf(Date);
    expect(await testDb().session.count({ where: { partnerId: s.world.b.id } })).toBe(0);

    for (const cookie of [bCookie1, bCookie2]) {
      const after = await me(cookie);
      expect(after.statusCode).toBe(401);
      expect(after.json().error.code).toBe('UNAUTHENTICATED');
    }
    // Sign-in refused: dev login…
    const dev = await s.app.inject({ method: 'POST', url: '/api/auth/dev-login', payload: { email: 'partner.b@example.com' } });
    expect(dev.statusCode).toBe(403);
    // …and Google.
    const google = new FakeGoogle();
    google.identity = { email: 'partner.b@example.com', email_verified: true, hd: 'example.com' };
    const gApp = await testApp({ google });
    try {
      const start = await gApp.inject({ method: 'GET', url: '/api/auth/google/start' });
      const oauthCookie = String(start.headers['set-cookie']).split(';', 1)[0]!;
      const cb = await gApp.inject({
        method: 'GET',
        url: '/api/auth/google/callback?code=abc&state=fake-state',
        headers: { cookie: oauthCookie },
      });
      expect(cb.headers.location).toBe('http://localhost:5173/login?error=NOT_A_PARTNER');
    } finally {
      await gApp.close();
    }
    expect(await testDb().session.count({ where: { partnerId: s.world.b.id } })).toBe(0);
  });

  it('a leftover session of an inactive partner is refused and deleted', async () => {
    const bCookie = await login(s.app, 'partner.b@example.com');
    await deactivateDirectly(s.world.b.id); // bypasses the endpoint: sessions still exist
    expect((await me(bCookie)).statusCode).toBe(401);
    expect(await testDb().session.count({ where: { partnerId: s.world.b.id } })).toBe(0);
  });

  it('cannot remove yourself (409 CANNOT_REMOVE_SELF); nothing changes', async () => {
    const res = await del(s.world.a.personId);
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('CANNOT_REMOVE_SELF');
    expect((await testDb().partner.findUniqueOrThrow({ where: { id: s.world.a.id } })).active).toBe(true);
    expect((await me(s.cookie)).statusCode).toBe(200);
  });

  it('cannot remove the last active partner (409 LAST_PARTNER)', async () => {
    // Only reachable when the actor is no longer active itself; exercise the guard directly.
    await deactivateDirectly(s.world.b.id, s.world.c.id);
    await expect(revokePartner(testDb(), { personId: s.world.a.personId, actorId: s.world.b.id })).rejects.toMatchObject({
      code: 'LAST_PARTNER',
    });
    expect((await testDb().partner.findUniqueOrThrow({ where: { id: s.world.a.id } })).active).toBe(true);
  });

  it('an actor removed in the meantime cannot remove others (401)', async () => {
    const bCookie = await login(s.app, 'partner.b@example.com');
    await testDb().partner.update({ where: { id: s.world.b.id }, data: { active: false } });
    // Simulate the in-flight request that passed the auth gate before the removal.
    await expect(revokePartner(testDb(), { personId: s.world.c.personId, actorId: s.world.b.id })).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
    });
    expect((await del(s.world.c.personId, as(bCookie))).statusCode).toBe(401);
    expect((await testDb().partner.findUniqueOrThrow({ where: { id: s.world.c.id } })).active).toBe(true);
  });

  it('two partners removing each other at the same time: exactly one succeeds, one partner stays', async () => {
    for (let round = 0; round < 5; round++) {
      await testDb().partner.updateMany({ data: { active: true, revokedAt: null, revokedById: null } });
      await deactivateDirectly(s.world.c.id);
      const aCookie = await login(s.app, 'partner.a@example.com');
      const bCookie = await login(s.app, 'partner.b@example.com');

      const [r1, r2] = await Promise.all([del(s.world.b.personId, as(aCookie)), del(s.world.a.personId, as(bCookie))]);
      const statuses = [r1.statusCode, r2.statusCode].sort();
      expect(statuses).toEqual([200, 409]);
      const loser = r1.statusCode === 409 ? r1 : r2;
      expect(loser.json().error.code).toBe('LAST_PARTNER');
      expect(await testDb().partner.count({ where: { active: true } })).toBe(1);
    }
  });

  it('three partners removing each other concurrently never leave zero active partners', async () => {
    for (let round = 0; round < 5; round++) {
      await testDb().partner.updateMany({ data: { active: true, revokedAt: null, revokedById: null } });
      const [aCookie, bCookie, cCookie] = [
        await login(s.app, 'partner.a@example.com'),
        await login(s.app, 'partner.b@example.com'),
        await login(s.app, 'partner.c@example.com'),
      ];
      const results = await Promise.all([
        del(s.world.b.personId, as(aCookie)),
        del(s.world.c.personId, as(bCookie)),
        del(s.world.a.personId, as(cCookie)),
      ]);
      for (const r of results) expect([200, 401, 409]).toContain(r.statusCode);
      const active = await testDb().partner.count({ where: { active: true } });
      expect(active).toBeGreaterThanOrEqual(1);
      expect(results.filter((r) => r.statusCode === 200)).toHaveLength(3 - active);
    }
  });

  it('404 when the person is not (or no longer) a partner, or unknown', async () => {
    for (const id of [s.world.p1.id, UNKNOWN_ID, 'not-a-uuid']) {
      const res = await del(id);
      expect(res.statusCode).toBe(404);
      expect(res.json().error.code).toBe('NOT_FOUND');
    }
    expect((await del(s.world.b.personId)).statusCode).toBe(200);
    expect((await del(s.world.b.personId)).statusCode).toBe(404);
  });

  it('requires a session', async () => {
    const res = await s.app.inject({ method: 'DELETE', url: `/api/people/${s.world.b.personId}/partner` });
    expect(res.statusCode).toBe(401);
  });
});

describe('re-grant a removed partner', () => {
  it('re-activates the same Partner row (id kept), clears revocation, and allows sign-in again', async () => {
    const oldCookie = await login(s.app, 'partner.b@example.com');
    const gig = await createGig(s, { sellerId: s.world.b.id, producerId: s.world.b.id });
    expect((await del(s.world.b.personId)).statusCode).toBe(200);

    const res = await put(s.world.b.personId, { email: 'partner.b.new@example.com' });
    expect(res.statusCode).toBe(200);
    expect(res.json().partner).toEqual({ id: s.world.b.id, email: 'partner.b.new@example.com', active: true });
    const row = await testDb().partner.findUniqueOrThrow({ where: { id: s.world.b.id } });
    expect(row).toMatchObject({ active: true, grantedById: s.world.a.id, revokedById: null, revokedAt: null });
    expect(await testDb().partner.count({ where: { personId: s.world.b.personId } })).toBe(1);

    // Old sessions stay dead; the gig is still theirs.
    expect((await me(oldCookie)).statusCode).toBe(401);
    await login(s.app, 'partner.b.new@example.com');
    expect((await call(s, 'GET', `/api/gigs/${gig.id}`)).json()).toMatchObject({ sellerId: s.world.b.id });
  });

  it('re-granting with the old email works too', async () => {
    await del(s.world.b.personId);
    const res = await put(s.world.b.personId, { email: 'partner.b@example.com' });
    expect(res.statusCode).toBe(200);
    expect(res.json().partner).toEqual({ id: s.world.b.id, email: 'partner.b@example.com', active: true });
  });
});

describe('people list and reference', () => {
  it('?partner=true|false filters by active partner status; combines with ?active', async () => {
    await del(s.world.c.personId);
    type PersonJson = { name: string; partner: unknown };
    const names = async (q: string): Promise<string[]> =>
      (await call(s, 'GET', `/api/people${q}`)).json<PersonJson[]>().map((p) => p.name);
    expect(await names('?partner=true')).toEqual(['Partner A', 'Partner B']);
    expect(await names('?partner=false')).toEqual(['Partner C', 'Person 1', 'Person 2', 'Person 3']);
    await call(s, 'PATCH', `/api/people/${s.world.p1.id}`, { active: false });
    expect(await names('?partner=false&active=false')).toEqual(['Person 1']);
    expect(await names('?partner=false&active=all')).toEqual(['Partner C', 'Person 1', 'Person 2', 'Person 3']);

    const people = (await call(s, 'GET', '/api/people')).json<PersonJson[]>();
    expect(people.find((p) => p.name === 'Partner C')?.partner).toEqual({
      id: s.world.c.id,
      email: 'partner.c@example.com',
      active: false,
    });
    expect(people.find((p) => p.name === 'Person 2')?.partner).toBeNull();

    const bad = await call(s, 'GET', '/api/people?partner=maybe');
    expect(bad.statusCode).toBe(400);
    expect(bad.json().error.fields).toEqual({ partner: 'INVALID_VALUE' });
  });

  it('reference keeps removed partners (active: false) so old records still show their name (AC-4)', async () => {
    await del(s.world.c.personId);
    const ref = (await call(s, 'GET', '/api/reference')).json<{ partners: { name: string; active: boolean }[] }>();
    expect(ref.partners.map((p) => [p.name, p.active])).toEqual([
      ['Partner A', true],
      ['Partner B', true],
      ['Partner C', false],
    ]);
  });
});

describe('new choices reject removed partners; existing records keep them (BR-111)', () => {
  it('gigs: new seller/producer must be active; an unchanged removed one is kept', async () => {
    const gig = await createGig(s, { sellerId: s.world.c.id, producerId: s.world.c.id });
    await del(s.world.c.personId);

    const create = await call(s, 'POST', '/api/gigs', gigBody(s.world, { sellerId: s.world.c.id, producerId: s.world.c.id }));
    expect(create.statusCode).toBe(400);
    expect(create.json().error.fields).toEqual({ sellerId: 'UNKNOWN_REFERENCE', producerId: 'UNKNOWN_REFERENCE' });

    const edit = await call(s, 'PATCH', `/api/gigs/${gig.id}`, { venue: 'Venue Y', sellerId: s.world.c.id });
    expect(edit.statusCode).toBe(200);
    expect(edit.json().gig).toMatchObject({ venue: 'Venue Y', sellerId: s.world.c.id, producerId: s.world.c.id });

    const other = await createGig(s);
    const change = await call(s, 'PATCH', `/api/gigs/${other.id}`, { producerId: s.world.c.id });
    expect(change.statusCode).toBe(400);
    expect(change.json().error.fields).toEqual({ producerId: 'UNKNOWN_REFERENCE' });
  });

  it('offers: a new seller must be active; an unchanged removed one is kept', async () => {
    const client = await testDb().client.create({ data: { name: 'Client A Oy' } });
    const body = {
      clientId: client.id,
      eventName: 'Event 1',
      eventDate: '2026-11-14',
      venue: 'Venue X',
      lineup: ['Vocals'],
      priceCents: 100000,
      source: 'EMAIL',
      eventType: 'CORPORATE',
    };
    const offer = await call(s, 'POST', '/api/offers', { ...body, sellerId: s.world.c.id });
    expect(offer.statusCode).toBe(201);
    await del(s.world.c.personId);

    const create = await call(s, 'POST', '/api/offers', { ...body, sellerId: s.world.c.id });
    expect(create.statusCode).toBe(400);
    expect(create.json().error.fields).toEqual({ sellerId: 'UNKNOWN_REFERENCE' });

    const edit = await call(s, 'PATCH', `/api/offers/${offer.json().id}`, { venue: 'Venue Y', sellerId: s.world.c.id });
    expect(edit.statusCode).toBe(200);

    const other = await call(s, 'POST', '/api/offers', body);
    const change = await call(s, 'PATCH', `/api/offers/${other.json().id}`, { sellerId: s.world.c.id });
    expect(change.statusCode).toBe(400);
    expect(change.json().error.fields).toEqual({ sellerId: 'UNKNOWN_REFERENCE' });
  });

  it('tasks: a new owner must be active; an unchanged removed one is kept; unknown owner still 400 before 404', async () => {
    const task = await call(s, 'POST', '/api/tasks', { title: 'Task 1', ownerId: s.world.c.id });
    expect(task.statusCode).toBe(201);
    await del(s.world.c.personId);

    const create = await call(s, 'POST', '/api/tasks', { title: 'Task 2', ownerId: s.world.c.id });
    expect(create.statusCode).toBe(400);
    expect(create.json().error.fields).toEqual({ ownerId: 'UNKNOWN_REFERENCE' });

    const edit = await call(s, 'PATCH', `/api/tasks/${task.json().id}`, { title: 'Task 1b', ownerId: s.world.c.id });
    expect(edit.statusCode).toBe(200);
    expect(edit.json()).toMatchObject({ title: 'Task 1b', ownerId: s.world.c.id });

    const other = await call(s, 'POST', '/api/tasks', { title: 'Task 3' });
    const change = await call(s, 'PATCH', `/api/tasks/${other.json().id}`, { ownerId: s.world.c.id });
    expect(change.statusCode).toBe(400);
    expect(change.json().error.fields).toEqual({ ownerId: 'UNKNOWN_REFERENCE' });

    const unknown = await call(s, 'PATCH', `/api/tasks/${UNKNOWN_ID}`, { ownerId: UNKNOWN_ID });
    expect(unknown.statusCode).toBe(400);
    const missingTask = await call(s, 'PATCH', `/api/tasks/${UNKNOWN_ID}`, { ownerId: s.world.c.id });
    expect(missingTask.statusCode).toBe(404);
  });

  it("converting an offer whose seller was removed makes the converting partner the gig's seller and producer", async () => {
    const client = await testDb().client.create({ data: { name: 'Client A Oy' } });
    const body = {
      clientId: client.id,
      eventName: 'Event 1',
      eventDate: '2026-11-14',
      venue: 'Venue X',
      lineup: ['Vocals'],
      priceCents: 100000,
      source: 'EMAIL',
      eventType: 'CORPORATE',
    };
    const removedSeller = (await call(s, 'POST', '/api/offers', { ...body, sellerId: s.world.c.id })).json();
    const activeSeller = (await call(s, 'POST', '/api/offers', { ...body, eventName: 'Event 2', sellerId: s.world.b.id })).json();
    await del(s.world.c.personId);

    const res = await call(s, 'POST', `/api/offers/${removedSeller.id}/convert`);
    expect(res.statusCode).toBe(201);
    const { gig, offer } = res.json();
    expect(gig).toMatchObject({ sellerId: s.world.a.id, producerId: s.world.a.id });
    expect(gig.costLines.map((l: { type: string; personId: string | null }) => [l.type, l.personId])).toEqual([
      ['OFFICE', null],
      ['SALES', s.world.a.personId],
      ['PRODUCTION', s.world.a.personId],
    ]);
    expect(offer.sellerId).toBe(s.world.c.id); // the offer itself keeps its seller

    // An active seller is still used as before.
    const kept = (await call(s, 'POST', `/api/offers/${activeSeller.id}/convert`)).json();
    expect(kept.gig).toMatchObject({ sellerId: s.world.b.id, producerId: s.world.b.id });
  });

  it("a removed partner's hours stay readable", async () => {
    const bCookie = await login(s.app, 'partner.b@example.com');
    const entry = await call(as(bCookie), 'POST', '/api/hours', { date: '2026-03-02', comment: 'Work', hours: 1.5 });
    expect(entry.statusCode).toBe(201);
    await del(s.world.b.personId);
    const list = await call(s, 'GET', `/api/hours?year=2026&partnerId=${s.world.b.id}`);
    expect(list.statusCode).toBe(200);
    expect(JSON.stringify(list.json())).toContain(entry.json().id);
  });
});
