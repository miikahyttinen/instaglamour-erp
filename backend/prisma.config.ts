import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

// `prisma generate` (run by `npm install` via postinstall) never connects to the database, so a
// fresh checkout without `.env` must still install. Only for `generate` do we fall back to a
// placeholder URL; every other command (migrate, db, studio…) still requires a real
// DATABASE_URL and fails clearly without it. The app itself validates DATABASE_URL in
// src/config.ts at startup.
const GENERATE_PLACEHOLDER_URL = 'postgresql://placeholder:placeholder@localhost:5432/placeholder';
const isGenerate = process.argv.slice(2).includes('generate');

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx seed/run.ts',
  },
  datasource: {
    url: isGenerate && !process.env.DATABASE_URL ? GENERATE_PLACEHOLDER_URL : env('DATABASE_URL'),
  },
});
