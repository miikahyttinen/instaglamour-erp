import { beforeEach, describe, expect, it } from 'vitest';
import { ApiError } from '../api/client';
import { authApi, meApi, peopleApi, referenceApi } from '../api/endpoints';
import { person } from '../test/gigFixtures';
import { signInMock } from '../test/renderApp';
import { db, setMockSession } from './data';

async function apiError(promise: Promise<unknown>): Promise<ApiError> {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(ApiError);
  return error as ApiError;
}

const byName = (name: string) => db.partners.find((p) => p.name === name)!;

describe('partner status mock (contract → Partner status, UC-032)', () => {
  beforeEach(() => {
    signInMock();
  });

  it('people carry `partner`; ?partner= filters active partners', async () => {
    const all = await peopleApi.list('all');
    expect(all.find((p) => p.name === 'Partner B')!.partner).toEqual({
      id: byName('Partner B').id,
      email: 'partner.b@example.com',
      active: true,
    });
    expect(all.find((p) => p.name === 'Person 1')!.partner).toBeNull();
    expect((await peopleApi.list('true', 'true')).map((p) => p.name)).toEqual(['Partner A', 'Partner B', 'Partner C']);
    expect((await peopleApi.list('true', 'false')).map((p) => p.name)).not.toContain('Partner A');
  });

  it('PUT validates the email: REQUIRED, INVALID_VALUE (domain), DUPLICATE (case-insensitive); 404', async () => {
    const id = person('Person 1').id;
    expect((await apiError(peopleApi.setPartner(id, { email: ' ' }))).fields).toEqual({ email: 'REQUIRED' });
    expect((await apiError(peopleApi.setPartner(id, { email: 'x@other.test' }))).fields).toEqual({
      email: 'INVALID_VALUE',
    });
    expect((await apiError(peopleApi.setPartner(id, { email: 'Partner.B@Example.com' }))).fields).toEqual({
      email: 'DUPLICATE',
    });
    const missing = await apiError(
      peopleApi.setPartner('00000000-0000-4000-8000-0000000fffff', { email: 'new@example.com' }),
    );
    expect(missing.status).toBe(404);
  });

  it('PUT makes a partner who can sign in and is in the reference data; DELETE stops it', async () => {
    const id = person('Person 1').id;
    const made = await peopleApi.setPartner(id, { email: 'person.1@example.com' });
    expect(made.partner).toMatchObject({ email: 'person.1@example.com', active: true });
    const ref = await referenceApi.get();
    expect(ref.partners.find((p) => p.personId === id)).toMatchObject({ name: 'Person 1', active: true });

    // Sign in as the new partner, then remove them from another session.
    const newPartner = await authApi.devLogin({ email: 'person.1@example.com' });
    expect((await meApi.get()).id).toBe(newPartner.id);
    signInMock();
    const removed = await peopleApi.removePartner(id);
    expect(removed.partner).toMatchObject({ active: false });

    // Sign-in refused, an existing session → 401; the name stays in the reference data.
    expect((await apiError(authApi.devLogin({ email: 'person.1@example.com' }))).status).toBe(403);
    setMockSession(newPartner.id);
    expect((await apiError(meApi.get())).status).toBe(401);
    signInMock();
    expect((await referenceApi.get()).partners.find((p) => p.id === newPartner.id)).toMatchObject({
      name: 'Person 1',
      active: false,
    });

    // Re-activating keeps the same partner.
    const again = await peopleApi.setPartner(id, { email: 'person.1@example.com' });
    expect(again.partner).toEqual({ id: newPartner.id, email: 'person.1@example.com', active: true });
  });

  // LAST_PARTNER can't happen while the caller is an active partner other than the target; the
  // mock checks it anyway (after CANNOT_REMOVE_SELF). The UI message is tested with server.use.
  it('DELETE: 409 CANNOT_REMOVE_SELF; 404 when not (or no longer) a partner', async () => {
    const self = await apiError(peopleApi.removePartner(byName('Partner A').personId));
    expect([self.status, self.code]).toEqual([409, 'CANNOT_REMOVE_SELF']);
    byName('Partner B').active = false;
    expect((await apiError(peopleApi.removePartner(byName('Partner B').personId))).status).toBe(404);
    expect((await apiError(peopleApi.removePartner(person('Person 1').id))).status).toBe(404);
  });

  it('renaming a partner person renames the partner', async () => {
    const b = byName('Partner B');
    await peopleApi.update(b.personId, { name: 'Partner B2' });
    expect((await referenceApi.get()).partners.find((p) => p.id === b.id)!.name).toBe('Partner B2');
  });
});
