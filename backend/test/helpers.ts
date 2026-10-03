/** Shared test helpers. All data here is synthetic (BR-090). */
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import type { GoogleAuthClient, VerifiedGoogleIdentity } from '../src/auth/google.js';
import { loadConfig, type AppConfig } from '../src/config.js';
import { createDb, type Db } from '../src/db.js';
import { emptyDatabase } from '../seed/load.js';
import { testDatabaseUrl } from './testDatabaseUrl.js';

export const TEST_DOMAIN = 'example.com';

let db: Db | undefined;

export function testDb(): Db {
  db ??= createDb(testDatabaseUrl());
  return db;
}

export async function closeTestDb(): Promise<void> {
  await db?.$disconnect();
  db = undefined;
}

export async function resetDb(): Promise<void> {
  await testDb().$transaction((tx) => emptyDatabase(tx));
}

export function testConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    ...loadConfig({
      DATABASE_URL: testDatabaseUrl(),
      SESSION_SECRET: 'test-session-secret-0123456789abcdef',
      AUTH_ALLOWED_DOMAIN: TEST_DOMAIN,
      FRONTEND_URL: 'http://localhost:5173',
      GOOGLE_CLIENT_ID: 'test-client-id',
      GOOGLE_CLIENT_SECRET: 'test-client-secret',
    }),
    ...overrides,
  };
}

/** A fake Google client: the "verified" identity is whatever the test sets. */
export class FakeGoogle implements GoogleAuthClient {
  identity: VerifiedGoogleIdentity | Error = { email: `partner.a@${TEST_DOMAIN}`, email_verified: true };
  lastCode?: string;
  lastVerifier?: string;

  createAuthRequest() {
    return Promise.resolve({
      url: 'https://accounts.google.com/o/oauth2/v2/auth?fake=1',
      state: 'fake-state',
      codeVerifier: 'fake-verifier',
    });
  }

  exchangeCode(code: string, codeVerifier: string) {
    this.lastCode = code;
    this.lastVerifier = codeVerifier;
    return this.identity instanceof Error ? Promise.reject(this.identity) : Promise.resolve(this.identity);
  }
}

export async function testApp(
  options: { config?: Partial<AppConfig>; google?: GoogleAuthClient } = {},
): Promise<FastifyInstance> {
  return buildApp({
    db: testDb(),
    config: testConfig({ devLoginEnabled: true, ...options.config }),
    google: options.google ?? new FakeGoogle(),
  });
}

export async function createPartner(name: string, email: string, language: 'fi' | 'en' = 'fi') {
  return testDb().partner.create({
    data: { email, language, person: { create: { name } } },
    include: { person: true },
  });
}

/** Sign in through the dev login and return the Cookie header value. */
export async function login(app: FastifyInstance, email: string): Promise<string> {
  const res = await app.inject({ method: 'POST', url: '/api/auth/dev-login', payload: { email } });
  if (res.statusCode !== 200) throw new Error(`dev-login failed: ${res.statusCode} ${res.body}`);
  return sessionCookieHeader(res.headers['set-cookie']);
}

export function sessionCookieHeader(setCookie: string | string[] | undefined): string {
  const list = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  const cookie = list.find((c) => c.startsWith('ig_session='));
  if (!cookie) throw new Error('no session cookie set');
  return cookie.split(';', 1)[0]!;
}
