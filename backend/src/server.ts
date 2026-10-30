import 'dotenv/config';
import type { FastifyInstance } from 'fastify';
import { buildApp } from './app.js';
import { loadConfig, type AppConfig } from './config.js';
import { createDb } from './db.js';
import { ensureUploadDir } from './fileStore/uploadDir.js';

/** Print one clear line (e.g. unsafe production config) instead of a stack trace, and exit. */
function abort(err: unknown): never {
  console.error(`Startup aborted: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
}

let config: AppConfig;
try {
  config = loadConfig();
  await ensureUploadDir(config.uploadDir);
} catch (err) {
  abort(err);
}

const db = createDb(config.databaseUrl);
let app: FastifyInstance;
try {
  app = await buildApp({
    db,
    config,
    logger: { level: process.env.LOG_LEVEL ?? 'info' },
  });
} catch (err) {
  await db.$disconnect();
  abort(err);
}

if (config.devLoginEnabled) {
  app.log.warn('DEV_LOGIN_ENABLED=true — POST /api/auth/dev-login is active. Never enable this outside local development.');
}
if (config.staticDir) {
  app.log.info({ staticDir: config.staticDir }, 'Serving the built frontend');
}

const shutdown = async () => {
  await app.close();
  await db.$disconnect();
  process.exit(0);
};
process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());

try {
  await app.listen({ port: config.port, host: config.host });
} catch (err) {
  app.log.error(err);
  await db.$disconnect();
  process.exit(1);
}
