import 'dotenv/config';
import type { FastifyInstance } from 'fastify';
import { buildApp } from './app.js';
import { loadConfig, type AppConfig } from './config.js';
import { createDb } from './db.js';
import { ensureUploadDir } from './fileStore/uploadDir.js';
import { startFinalInvoiceJob } from './invoicing/finalInvoiceJob.js';

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

let stopInvoiceJob = () => {};

const shutdown = async () => {
  stopInvoiceJob();
  await app.close();
  await db.$disconnect();
  process.exit(0);
};
process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());

try {
  await app.listen({ port: config.port, host: config.host });
  // Automatic final invoice (TASK-049): now and every 15 minutes; safe if several instances run it.
  if (config.invoiceJobEnabled) stopInvoiceJob = startFinalInvoiceJob(db, app.log);
  else app.log.info('INVOICE_JOB_ENABLED=false — the automatic final invoice job is off');
} catch (err) {
  app.log.error(err);
  await db.$disconnect();
  process.exit(1);
}
