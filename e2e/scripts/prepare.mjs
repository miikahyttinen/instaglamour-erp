// Prepares the e2e stack before Playwright starts the servers:
//  1. installs backend/frontend dependencies if missing,
//  2. starts the test Postgres (docker compose service db-test on :5433),
//  3. drops and recreates the e2e database, migrates it and loads the *example* seed only.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { backendDir, backendEnv, e2eDbName, frontendDir, repoRoot, uploadDir } from './env.mjs';

function run(cmd, args, opts = {}) {
  console.log(`[e2e] $ ${cmd} ${args.join(' ')}`);
  execFileSync(cmd, args, { stdio: 'inherit', ...opts });
}

const env = backendEnv();

// 1. Dependencies. Prisma's postinstall needs DATABASE_URL (FINDINGS F-002); backendEnv() provides it.
for (const dir of [backendDir, frontendDir]) {
  if (!fs.existsSync(path.join(dir, 'node_modules'))) run('npm', ['ci'], { cwd: dir, env });
}

// 2. Test Postgres only (the dev database is not touched).
run('docker', ['compose', 'up', '-d', '--wait', 'db-test'], { cwd: repoRoot });

// 3. Fresh e2e database.
if (!/^instaglamour_e2e[a-z0-9_]*$/.test(e2eDbName)) throw new Error('Refusing to recreate an unexpected database');
const psql = (sql) =>
  run(
    'docker',
    ['compose', 'exec', '-T', 'db-test', 'psql', '-v', 'ON_ERROR_STOP=1', '-U', 'instaglamour', '-d', 'postgres', '-c', sql],
    { cwd: repoRoot },
  );
psql(`DROP DATABASE IF EXISTS ${e2eDbName} WITH (FORCE)`);
psql(`CREATE DATABASE ${e2eDbName}`);

run('npx', ['prisma', 'migrate', 'deploy'], { cwd: backendDir, env });
// Always the synthetic example seed, even if a developer has seed.local.json (BR-090).
run('npx', ['tsx', 'seed/run.ts', '--file', 'seed/seed.example.json'], { cwd: backendDir, env });

fs.rmSync(uploadDir, { recursive: true, force: true });
fs.mkdirSync(uploadDir, { recursive: true });
console.log('[e2e] database ready');
