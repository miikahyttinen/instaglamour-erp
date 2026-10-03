import type { FastifyInstance } from 'fastify';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resolveSession, SESSION_TTL_MS } from '../src/auth/session.js';
import { closeTestDb, createPartner, FakeGoogle, login, resetDb, sessionCookieHeader, testApp, testConfig, testDb } from './helpers.js';

const PARTNER_EMAIL = 'partner.a@example.com';

let app: FastifyInstance;

beforeEach(async () => {
  await resetDb();
  await createPartner('Partner A', PARTNER_EMAIL);
});
afterEach(async () => {
  await app?.close();
});
afterAll(closeTestDb);

describe('dev login', () => {
  it('signs in a registered partner and returns the Partner', async () => {
    app = await testApp();
    const res = await app.inject({ method: 'POST', url: '/api/auth/dev-login', payload: { email: 'Partner.A@example.com' } });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ name: 'Partner A', email: PARTNER_EMAIL, language: 'fi' });
    const setCookie = String(res.headers['set-cookie']);
    expect(setCookie).toMatch(/ig_session=/);
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/SameSite=Lax/i);
  });

  it('returns 403 for an email that is not a partner', async () => {
    app = await testApp();
    const res = await app.inject({ method: 'POST', url: '/api/auth/dev-login', payload: { email: 'nobody@example.com' } });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ error: { code: 'FORBIDDEN', message: expect.any(String) } });
  });

  it('returns 400 for a missing or invalid email', async () => {
    app = await testApp();
    const missing = await app.inject({ method: 'POST', url: '/api/auth/dev-login', payload: {} });
    expect(missing.statusCode).toBe(400);
    expect(missing.json().error).toMatchObject({ code: 'VALIDATION_ERROR', fields: { email: 'REQUIRED' } });
    const invalid = await app.inject({ method: 'POST', url: '/api/auth/dev-login', payload: { email: 'not-an-email' } });
    expect(invalid.json().error.fields).toEqual({ email: 'INVALID_VALUE' });
  });

  it('does not exist (404) unless DEV_LOGIN_ENABLED=true', async () => {
    app = await testApp({ config: { devLoginEnabled: false } });
    const res = await app.inject({ method: 'POST', url: '/api/auth/dev-login', payload: { email: PARTNER_EMAIL } });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('NOT_FOUND');
  });
});

describe('global 401', () => {
  const protectedRequests = [
    ['GET', '/api/me'],
    ['PATCH', '/api/me'],
    ['GET', '/api/reference'],
    ['GET', '/api/gigs?year=2026'],
    ['GET', '/api/does-not-exist'],
  ] as const;

  it.each(protectedRequests)('%s %s returns 401 without a session', async (method, url) => {
    app = await testApp();
    const res = await app.inject({ method, url, payload: method === 'PATCH' ? {} : undefined });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: { code: 'UNAUTHENTICATED', message: expect.any(String) } });
  });

  it('returns 401 for a forged / unsigned session cookie', async () => {
    app = await testApp();
    const res = await app.inject({ method: 'GET', url: '/api/me', headers: { cookie: 'ig_session=forged-token' } });
    expect(res.statusCode).toBe(401);
  });

  it('keeps /api/auth/* reachable without a session', async () => {
    app = await testApp();
    const res = await app.inject({ method: 'POST', url: '/api/auth/logout' });
    expect(res.statusCode).toBe(204);
  });
});

describe('logout', () => {
  it('ends the session and clears the cookie', async () => {
    app = await testApp();
    const cookie = await login(app, PARTNER_EMAIL);
    expect((await app.inject({ method: 'GET', url: '/api/me', headers: { cookie } })).statusCode).toBe(200);

    const res = await app.inject({ method: 'POST', url: '/api/auth/logout', headers: { cookie } });
    expect(res.statusCode).toBe(204);
    expect(String(res.headers['set-cookie'])).toMatch(/ig_session=;/);
    expect((await app.inject({ method: 'GET', url: '/api/me', headers: { cookie } })).statusCode).toBe(401);
    expect(await testDb().session.count()).toBe(0);
  });
});

describe('session expiry (30 days sliding)', () => {
  it('expires after 30 days of inactivity and slides on use', async () => {
    app = await testApp();
    const cookie = await login(app, PARTNER_EMAIL);
    const session = await testDb().session.findFirstOrThrow();
    const ttlDays = (session.expiresAt.getTime() - session.createdAt.getTime()) / 86_400_000;
    expect(Math.round(ttlDays)).toBe(30);

    // Used 10 days before expiry → extended to 30 days from now.
    await testDb().session.update({ where: { id: session.id }, data: { expiresAt: new Date(Date.now() + 10 * 86_400_000) } });
    expect((await app.inject({ method: 'GET', url: '/api/me', headers: { cookie } })).statusCode).toBe(200);
    const slid = await testDb().session.findFirstOrThrow();
    expect(slid.expiresAt.getTime()).toBeGreaterThan(Date.now() + SESSION_TTL_MS - 60_000);

    // Expired → 401 and the session is removed.
    await testDb().session.update({ where: { id: session.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await app.inject({ method: 'GET', url: '/api/me', headers: { cookie } })).statusCode).toBe(401);
    expect(await testDb().session.count()).toBe(0);
  });

  it('resolveSession returns null without a cookie', async () => {
    app = await testApp();
    const fakeRequest = { cookies: {}, unsignCookie: () => ({ valid: false, value: null }) };
    expect(await resolveSession(testDb(), testConfig(), fakeRequest as never, {} as never)).toBeNull();
  });
});

describe('Google OAuth', () => {
  async function startFlow(google: FakeGoogle) {
    app = await testApp({ google });
    const start = await app.inject({ method: 'GET', url: '/api/auth/google/start' });
    expect(start.statusCode).toBe(302);
    expect(start.headers.location).toMatch(/^https:\/\/accounts\.google\.com\//);
    const oauthCookie = String(start.headers['set-cookie']).split(';', 1)[0]!;
    expect(oauthCookie).toMatch(/^ig_oauth=/);
    return oauthCookie;
  }

  const callback = (cookie: string | undefined, query = 'code=abc&state=fake-state') =>
    app.inject({ method: 'GET', url: `/api/auth/google/callback?${query}`, headers: cookie ? { cookie } : {} });

  it('signs a partner in and redirects to the app', async () => {
    const google = new FakeGoogle();
    google.identity = { email: PARTNER_EMAIL, email_verified: true, hd: 'example.com' };
    const oauthCookie = await startFlow(google);
    const res = await callback(oauthCookie);
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('http://localhost:5173/');
    expect(google.lastCode).toBe('abc');
    expect(google.lastVerifier).toBe('fake-verifier');

    const cookie = sessionCookieHeader(res.headers['set-cookie']);
    const me = await app.inject({ method: 'GET', url: '/api/me', headers: { cookie } });
    expect(me.json()).toMatchObject({ email: PARTNER_EMAIL });
  });

  it('rejects another domain with WRONG_DOMAIN', async () => {
    const google = new FakeGoogle();
    google.identity = { email: 'partner.a@example.org', email_verified: true };
    const res = await callback(await startFlow(google));
    expect(res.headers.location).toBe('http://localhost:5173/login?error=WRONG_DOMAIN');
    expect(await testDb().session.count()).toBe(0);
  });

  it('rejects a non-partner in the allowed domain with NOT_A_PARTNER', async () => {
    const google = new FakeGoogle();
    google.identity = { email: 'stranger@example.com', email_verified: true };
    const res = await callback(await startFlow(google));
    expect(res.headers.location).toBe('http://localhost:5173/login?error=NOT_A_PARTNER');
    expect(await testDb().session.count()).toBe(0);
  });

  it('fails with SIGN_IN_FAILED when the state does not match', async () => {
    const res = await callback(await startFlow(new FakeGoogle()), 'code=abc&state=other-state');
    expect(res.headers.location).toBe('http://localhost:5173/login?error=SIGN_IN_FAILED');
  });

  it('fails with SIGN_IN_FAILED without the state cookie', async () => {
    await startFlow(new FakeGoogle());
    const res = await callback(undefined);
    expect(res.headers.location).toBe('http://localhost:5173/login?error=SIGN_IN_FAILED');
  });

  it('fails with SIGN_IN_FAILED when the state cookie is tampered with', async () => {
    await startFlow(new FakeGoogle());
    const forged = `ig_oauth=${encodeURIComponent(JSON.stringify({ state: 'fake-state', codeVerifier: 'x' }))}`;
    const res = await callback(forged);
    expect(res.headers.location).toBe('http://localhost:5173/login?error=SIGN_IN_FAILED');
  });

  it('fails with SIGN_IN_FAILED when the user cancels at Google', async () => {
    const res = await callback(await startFlow(new FakeGoogle()), 'error=access_denied&state=fake-state');
    expect(res.headers.location).toBe('http://localhost:5173/login?error=SIGN_IN_FAILED');
  });

  it('fails with SIGN_IN_FAILED when token exchange / verification fails', async () => {
    const google = new FakeGoogle();
    google.identity = new Error('invalid token signature');
    const res = await callback(await startFlow(google));
    expect(res.headers.location).toBe('http://localhost:5173/login?error=SIGN_IN_FAILED');
  });

  it('start redirects to the login page with SIGN_IN_FAILED when Google is not configured', async () => {
    // Use the real Google client so the missing configuration is detected.
    const { buildApp } = await import('../src/app.js');
    app = await buildApp({
      db: testDb(),
      config: testConfig({ google: { clientId: '', clientSecret: '', redirectUrl: 'http://localhost:3000/api/auth/google/callback' } }),
    });
    const res = await app.inject({ method: 'GET', url: '/api/auth/google/start' });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('http://localhost:5173/login?error=SIGN_IN_FAILED');
  });

  it('real client builds a Google URL with PKCE, state and the hosted domain', async () => {
    const { buildApp } = await import('../src/app.js');
    app = await buildApp({ db: testDb(), config: testConfig() });
    const res = await app.inject({ method: 'GET', url: '/api/auth/google/start' });
    const url = new URL(String(res.headers.location));
    expect(url.hostname).toBe('accounts.google.com');
    expect(url.searchParams.get('client_id')).toBe('test-client-id');
    expect(url.searchParams.get('hd')).toBe('example.com');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('code_challenge')).toBeTruthy();
    expect(url.searchParams.get('state')).toBeTruthy();
    expect(url.searchParams.get('scope')).toContain('email');
  });
});
