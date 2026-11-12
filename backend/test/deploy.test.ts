/** TASK-047: single-service deployment — static frontend + SPA fallback, health, config guards. */
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import type { Db } from '../src/db.js';
import { IMMUTABLE_CACHE, NO_CACHE } from '../src/http/frontend.js';
import { closeTestDb, createPartner, FakeGoogle, login, resetDb, TEST_DOMAIN, testApp, testConfig } from './helpers.js';

const INDEX_HTML = '<!doctype html><html><body><div id="root"></div>synthetic-index</body></html>';

const baseEnv = {
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
  SESSION_SECRET: 'test-session-secret-0123456789abcdef',
  AUTH_ALLOWED_DOMAIN: TEST_DOMAIN,
};
const prodEnv = { ...baseEnv, NODE_ENV: 'production', FRONTEND_URL: 'https://your-app.up.railway.app' };

describe('production config guards', () => {
  it('refuses DEV_LOGIN_ENABLED=true in production', () => {
    expect(() => loadConfig({ ...prodEnv, DEV_LOGIN_ENABLED: 'true' })).toThrow(/DEV_LOGIN_ENABLED/);
  });

  it('requires an https FRONTEND_URL in production', () => {
    expect(() => loadConfig({ ...prodEnv, FRONTEND_URL: 'http://your-app.up.railway.app' })).toThrow(/FRONTEND_URL must be an https/);
    // The localhost default is not acceptable either.
    expect(() => loadConfig({ ...baseEnv, NODE_ENV: 'production' })).toThrow(/FRONTEND_URL/);
  });

  it('accepts a safe production config: binds 0.0.0.0, secure cookies, serves frontend/dist', () => {
    const config = loadConfig({ ...prodEnv, PORT: '8080', DEV_LOGIN_ENABLED: 'false' });
    expect(config.production).toBe(true);
    expect(config.host).toBe('0.0.0.0');
    expect(config.port).toBe(8080);
    expect(config.secureCookies).toBe(true);
    expect(config.staticDir).toBe(path.resolve('../frontend/dist'));
    expect(loadConfig({ ...prodEnv, FRONTEND_DIST_DIR: '/srv/dist' }).staticDir).toBe('/srv/dist');
  });

  it('keeps development defaults: 127.0.0.1, no static serving, dev login allowed', () => {
    const config = loadConfig({ ...baseEnv, DEV_LOGIN_ENABLED: 'true', FRONTEND_URL: 'http://localhost:5173' });
    expect(config.production).toBe(false);
    expect(config.host).toBe('127.0.0.1');
    expect(config.staticDir).toBeNull();
    expect(config.devLoginEnabled).toBe(true);
  });

  it('HOST overrides the default', () => {
    expect(loadConfig({ ...prodEnv, HOST: '::' }).host).toBe('::');
  });
});

describe('GET /api/health', () => {
  afterAll(closeTestDb);

  it('200 { ok: true } without a session when the database answers', async () => {
    const app = await testApp();
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
    expect(res.headers['cache-control']).toBe('no-store');
    await app.close();
  });

  it('503 { ok: false } when the database is down', async () => {
    const brokenDb = { $queryRaw: () => Promise.reject(new Error('connection refused')) } as unknown as Db;
    const app = await buildApp({ db: brokenDb, config: testConfig(), google: new FakeGoogle() });
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({ ok: false });
    await app.close();
  });
});

describe('serving the built frontend (production)', () => {
  let dist: string;
  let app: FastifyInstance;

  beforeAll(async () => {
    dist = await mkdtemp(path.join(os.tmpdir(), 'ig-dist-'));
    await mkdir(path.join(dist, 'assets'));
    await writeFile(path.join(dist, 'index.html'), INDEX_HTML);
    await writeFile(path.join(dist, 'assets', 'index-abc123.js'), 'console.log("synthetic");');
    await writeFile(path.join(dist, 'favicon.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>');
    await resetDb();
    await createPartner('Partner A', `partner.a@${TEST_DOMAIN}`);
    app = await testApp({ config: { staticDir: dist } });
  });

  afterAll(async () => {
    await app.close();
    await rm(dist, { recursive: true, force: true });
    await closeTestDb();
  });

  it('serves index.html at / with no-cache', async () => {
    const res = await app.inject({ method: 'GET', url: '/' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/html/);
    expect(res.headers['cache-control']).toBe(NO_CACHE);
    expect(res.body).toContain('synthetic-index');
  });

  it('serves hashed assets with a long immutable cache', async () => {
    const res = await app.inject({ method: 'GET', url: '/assets/index-abc123.js' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/javascript/);
    expect(res.headers['cache-control']).toBe(IMMUTABLE_CACHE);
  });

  it('serves other public files with no-cache', async () => {
    const res = await app.inject({ method: 'GET', url: '/favicon.svg' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toBe(NO_CACHE);
  });

  it('falls back to index.html for client-side routes (GET and HEAD)', async () => {
    for (const url of ['/events/123', '/login?error=SIGN_IN_FAILED', '/2026/budget', '/index.html']) {
      const res = await app.inject({ method: 'GET', url });
      expect(res.statusCode, url).toBe(200);
      expect(res.body, url).toContain('synthetic-index');
      expect(res.headers['cache-control'], url).toBe(NO_CACHE);
    }
    const head = await app.inject({ method: 'HEAD', url: '/people' });
    expect(head.statusCode).toBe(200);
  });

  it('does not answer a missing build asset with HTML', async () => {
    const res = await app.inject({ method: 'GET', url: '/assets/missing-old.js' });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ error: { code: 'NOT_FOUND' } });
  });

  it('non-GET to a non-API path is a JSON 404', async () => {
    const res = await app.inject({ method: 'POST', url: '/events/123' });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ error: { code: 'NOT_FOUND' } });
  });

  it('leaves /api unchanged: unknown routes 401 without a session, JSON 404 with one', async () => {
    const anon = await app.inject({ method: 'GET', url: '/api/nope' });
    expect(anon.statusCode).toBe(401);
    expect(anon.json()).toMatchObject({ error: { code: 'UNAUTHENTICATED' } });

    const cookie = await login(app, `partner.a@${TEST_DOMAIN}`);
    const authed = await app.inject({ method: 'GET', url: '/api/nope', headers: { cookie } });
    expect(authed.statusCode).toBe(404);
    expect(authed.json()).toMatchObject({ error: { code: 'NOT_FOUND' } });

    const me = await app.inject({ method: 'GET', url: '/api/me', headers: { cookie } });
    expect(me.statusCode).toBe(200);
    expect(me.headers['content-type']).toMatch(/application\/json/);
  });

  it('fails clearly at startup when the build is missing', async () => {
    await expect(testApp({ config: { staticDir: path.join(dist, 'nope') } })).rejects.toThrow(/Frontend build not found/);
  });
});

describe('development (no staticDir)', () => {
  afterAll(closeTestDb);

  it('does not serve the frontend: / is a JSON 404', async () => {
    const app = await testApp();
    const res = await app.inject({ method: 'GET', url: '/' });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ error: { code: 'NOT_FOUND' } });
    await app.close();
  });
});
