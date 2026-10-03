// Shared configuration for the e2e stack. Everything is local and synthetic (BR-090).
// Override ports with E2E_BACKEND_PORT / E2E_FRONTEND_PORT if they clash with your own servers.
import path from 'node:path';
import os from 'node:os';

export const repoRoot = path.resolve(import.meta.dirname, '..', '..');
export const backendDir = path.join(repoRoot, 'backend');
export const frontendDir = path.join(repoRoot, 'frontend');

export const backendPort = Number(process.env.E2E_BACKEND_PORT ?? 3100);
export const frontendPort = Number(process.env.E2E_FRONTEND_PORT ?? 5180);
export const frontendUrl = `http://localhost:${frontendPort}`;
export const backendUrl = `http://127.0.0.1:${backendPort}`;

// Separate database on the *test* Postgres (docker compose service db-test, port 5433).
// Never the dev database on :5432.
export const e2eDbName = 'instaglamour_e2e';
export const databaseUrl = `postgresql://instaglamour:instaglamour@127.0.0.1:5433/${e2eDbName}`;

export const uploadDir = path.join(os.tmpdir(), 'instaglamour-e2e-uploads');

/** Environment for the backend process (no .env file is read or written). */
export function backendEnv() {
  return {
    ...process.env,
    PORT: String(backendPort),
    HOST: '127.0.0.1',
    DATABASE_URL: databaseUrl,
    TEST_DATABASE_URL: databaseUrl,
    SESSION_SECRET: 'e2e-local-only-session-secret-not-a-secret',
    AUTH_ALLOWED_DOMAIN: 'example.com',
    DEV_LOGIN_ENABLED: 'true',
    FRONTEND_URL: frontendUrl,
    UPLOAD_DIR: uploadDir,
    LOG_LEVEL: process.env.E2E_LOG_LEVEL ?? 'warn',
  };
}

/** Environment for the frontend dev server: real backend, dev login visible. */
export function frontendEnv() {
  return {
    ...process.env,
    VITE_USE_MOCKS: 'false',
    VITE_DEV_LOGIN: 'true',
  };
}
