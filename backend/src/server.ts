import 'dotenv/config';
import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { createDb } from './db.js';

const config = loadConfig();
const db = createDb(config.databaseUrl);
const app = await buildApp({
  db,
  config,
  logger: { level: process.env.LOG_LEVEL ?? 'info' },
});

if (config.devLoginEnabled) {
  app.log.warn('DEV_LOGIN_ENABLED=true — POST /api/auth/dev-login is active. Never enable this outside local development.');
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
