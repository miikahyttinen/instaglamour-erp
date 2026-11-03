/**
 * AUTH_EXTRA_ALLOWED_EMAILS (contract "Extra allowed sign-in emails"): exact addresses outside
 * AUTH_ALLOWED_DOMAIN that may sign in (Google, dev login) and be made partners. Synthetic data only.
 */
import type { FastifyInstance } from 'fastify';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { isAllowedEmail, isInAllowedDomain } from '../src/auth/allowedEmail.js';
import { checkGoogleIdentity } from '../src/auth/google.js';
import { loadConfig, parseExtraAllowedEmails } from '../src/config.js';
import { importOnlyErrors } from '../src/import/store.js';
import { closeTestDb, createPartner, FakeGoogle, login, resetDb, testApp, testDb, TEST_DOMAIN } from './helpers.js';

const GUEST = 'guest.one@example.org';
const OTHER = 'other.person@example.org';
const EXTRA = [GUEST, 'guest.two@example.net'];
const CONFIG = { authAllowedDomain: TEST_DOMAIN, authExtraAllowedEmails: EXTRA };

const baseEnv = {
  DATABASE_URL: 'postgresql://localhost/unused',
  SESSION_SECRET: 'test-session-secret-0123456789abcdef',
  AUTH_ALLOWED_DOMAIN: TEST_DOMAIN,
};

describe('config: AUTH_EXTRA_ALLOWED_EMAILS', () => {
  it('is optional: unset or empty means no exceptions', () => {
    expect(loadConfig(baseEnv).authExtraAllowedEmails).toEqual([]);
    expect(loadConfig({ ...baseEnv, AUTH_EXTRA_ALLOWED_EMAILS: '' }).authExtraAllowedEmails).toEqual([]);
    expect(loadConfig({ ...baseEnv, AUTH_EXTRA_ALLOWED_EMAILS: ' , ,' }).authExtraAllowedEmails).toEqual([]);
  });

  it('splits on commas, trims, lower-cases and removes duplicates', () => {
    const config = loadConfig({ ...baseEnv, AUTH_EXTRA_ALLOWED_EMAILS: ' Guest.One@Example.org ,guest.two@example.net,,GUEST.ONE@example.org ' });
    expect(config.authExtraAllowedEmails).toEqual(['guest.one@example.org', 'guest.two@example.net']);
  });

  it('refuses to start with an entry that is not an email address', () => {
    for (const raw of ['not-an-email', `${GUEST}, example.org`, `${GUEST};guest.two@example.net`, '@example.org', 'a b@example.org']) {
      expect(() => loadConfig({ ...baseEnv, AUTH_EXTRA_ALLOWED_EMAILS: raw }), raw).toThrow(/AUTH_EXTRA_ALLOWED_EMAILS/);
    }
    expect(() => parseExtraAllowedEmails('nope')).toThrow(/AUTH_EXTRA_ALLOWED_EMAILS/);
  });
});

describe('isAllowedEmail', () => {
  it('allows the domain (exactly, case-insensitive)', () => {
    expect(isAllowedEmail(CONFIG, 'Partner.A@Example.com')).toBe(true);
    expect(isAllowedEmail(CONFIG, 'a@sub.example.com')).toBe(false);
    expect(isInAllowedDomain('a@example.com', '')).toBe(false);
  });

  it('allows listed addresses exactly (case-insensitive, trimmed)', () => {
    expect(isAllowedEmail(CONFIG, GUEST)).toBe(true);
    expect(isAllowedEmail(CONFIG, ' Guest.One@EXAMPLE.org ')).toBe(true);
    expect(isAllowedEmail(CONFIG, 'guest.two@example.net')).toBe(true);
  });

  it('refuses everything else, including other addresses of a listed address’s domain', () => {
    expect(isAllowedEmail(CONFIG, OTHER)).toBe(false);
    expect(isAllowedEmail(CONFIG, 'guest.one@example.org.attacker.test')).toBe(false);
    expect(isAllowedEmail(CONFIG, 'xguest.one@example.org')).toBe(false);
    expect(isAllowedEmail(CONFIG, '')).toBe(false);
    expect(isAllowedEmail({ ...CONFIG, authExtraAllowedEmails: [] }, GUEST)).toBe(false);
  });
});

describe('checkGoogleIdentity with extra emails', () => {
  it('accepts a verified listed address, whatever its hosted domain', () => {
    expect(checkGoogleIdentity({ email: 'Guest.One@Example.org', email_verified: true }, CONFIG)).toEqual({ ok: true, email: GUEST });
    expect(checkGoogleIdentity({ email: GUEST, email_verified: true, hd: 'example.org' }, CONFIG)).toEqual({ ok: true, email: GUEST });
  });

  it('still requires a verified email', () => {
    expect(checkGoogleIdentity({ email: GUEST, email_verified: false }, CONFIG)).toMatchObject({ error: 'WRONG_DOMAIN' });
  });

  it('refuses unlisted addresses outside the domain; domain hd check unchanged', () => {
    expect(checkGoogleIdentity({ email: OTHER, email_verified: true }, CONFIG)).toMatchObject({ error: 'WRONG_DOMAIN' });
    expect(checkGoogleIdentity({ email: 'partner.a@example.com', email_verified: true, hd: 'example.org' }, CONFIG)).toMatchObject({
      error: 'WRONG_DOMAIN',
    });
  });
});

describe('importOnlyErrors with extra emails', () => {
  it('accepts listed partner emails and still reports others', () => {
    const doc = { partners: [{ email: 'Guest.One@example.org' }, { email: OTHER }, { email: 'partner.a@example.com' }] };
    const errors = importOnlyErrors(doc, CONFIG);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/^partners\.1\.email:/);
  });
});

describe('sign-in and partner validation (HTTP)', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    await resetDb();
    await createPartner('Partner A', `partner.a@${TEST_DOMAIN}`);
  });
  afterEach(async () => {
    await app?.close();
  });
  afterAll(closeTestDb);

  const devLogin = (email: string) => app.inject({ method: 'POST', url: '/api/auth/dev-login', payload: { email } });

  async function googleCallback(identity: FakeGoogle['identity']) {
    const google = new FakeGoogle();
    google.identity = identity;
    app = await testApp({ google, config: { authExtraAllowedEmails: EXTRA } });
    const start = await app.inject({ method: 'GET', url: '/api/auth/google/start' });
    const oauthCookie = String(start.headers['set-cookie']).split(';', 1)[0]!;
    return app.inject({ method: 'GET', url: '/api/auth/google/callback?code=abc&state=fake-state', headers: { cookie: oauthCookie } });
  }

  it('dev login: a listed address that is an active partner signs in', async () => {
    await createPartner('Person 1', GUEST);
    app = await testApp({ config: { authExtraAllowedEmails: EXTRA } });
    const res = await devLogin('Guest.One@Example.org');
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ email: GUEST });
  });

  it('dev login: refused (403) for a partner outside the domain that is not listed', async () => {
    await createPartner('Person 1', GUEST);
    app = await testApp(); // no extra emails
    const res = await devLogin(GUEST);
    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ error: { code: 'FORBIDDEN', message: expect.any(String) } });
    expect(await testDb().session.count()).toBe(0);
  });

  it('dev login: a listed address must still be an active partner', async () => {
    app = await testApp({ config: { authExtraAllowedEmails: EXTRA } });
    expect((await devLogin(GUEST)).statusCode).toBe(403);
    const p = await createPartner('Person 1', GUEST);
    await testDb().partner.update({ where: { id: p.id }, data: { active: false } });
    expect((await devLogin(GUEST)).statusCode).toBe(403);
    expect(await testDb().session.count()).toBe(0);
  });

  it('Google: a listed active partner signs in', async () => {
    await createPartner('Person 1', GUEST);
    const res = await googleCallback({ email: GUEST, email_verified: true });
    expect(res.headers.location).toBe('http://localhost:5173/');
    expect(await testDb().session.count()).toBe(1);
  });

  it('Google: a listed address that is not a partner gets NOT_A_PARTNER; an unlisted one WRONG_DOMAIN', async () => {
    let res = await googleCallback({ email: GUEST, email_verified: true });
    expect(res.headers.location).toBe('http://localhost:5173/login?error=NOT_A_PARTNER');
    await app.close();
    res = await googleCallback({ email: OTHER, email_verified: true });
    expect(res.headers.location).toBe('http://localhost:5173/login?error=WRONG_DOMAIN');
    expect(await testDb().session.count()).toBe(0);
  });

  it('PUT /api/people/{id}/partner: a listed address is accepted, an unlisted one is INVALID_VALUE', async () => {
    app = await testApp({ config: { authExtraAllowedEmails: EXTRA } });
    const cookie = await login(app, `partner.a@${TEST_DOMAIN}`);
    const person = await testDb().person.create({ data: { name: 'Person 1' } });
    const put = (email: string) =>
      app.inject({ method: 'PUT', url: `/api/people/${person.id}/partner`, headers: { cookie }, payload: { email } });

    const refused = await put(OTHER);
    expect(refused.statusCode).toBe(400);
    expect(refused.json().error).toMatchObject({ code: 'VALIDATION_ERROR', fields: { email: 'INVALID_VALUE' } });

    const ok = await put('Guest.One@Example.org');
    expect(ok.statusCode).toBe(200);
    expect(await testDb().partner.findFirst({ where: { personId: person.id } })).toMatchObject({ email: GUEST, active: true });
    expect((await devLogin(GUEST)).statusCode).toBe(200);
  });
});
