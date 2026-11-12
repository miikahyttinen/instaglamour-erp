/**
 * Seed command (UC-024).
 *   npm run db:seed                 load seed.local.json if present, else seed.example.json
 *   npm run db:reset                empty all data, then seed
 *   tsx seed/run.ts --file <path>   load a specific file
 */
import 'dotenv/config';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { createDb } from '../src/db.js';
import { loadSeed, readSeedFile, resolveSeedFile, SeedValidationError } from './load.js';

const { values } = parseArgs({
  options: { reset: { type: 'boolean', default: false }, file: { type: 'string' } },
});

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('DATABASE_URL is not set (copy backend/.env.example to backend/.env).');
  process.exit(1);
}

const file = values.file ? path.resolve(values.file) : resolveSeedFile(import.meta.dirname);
console.log(`Seeding from ${path.relative(process.cwd(), file)}${values.reset ? ' (reset: all data is deleted first)' : ''}`);

const db = createDb(databaseUrl);
try {
  const summary = await loadSeed(db, readSeedFile(file), {
    reset: values.reset,
    seedDir: path.dirname(file),
  });
  console.log('Seed loaded (per data type: created / updated / skipped = already there):');
  console.table(summary);
} catch (err) {
  if (err instanceof SeedValidationError) {
    console.error(err.message);
    console.error('Nothing was loaded.');
  } else {
    console.error('Seeding failed, nothing was loaded:', err);
  }
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
