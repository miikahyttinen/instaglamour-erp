import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { testDatabaseUrl } from './testDatabaseUrl.js';

/** Apply all migrations to the test database once before the test run. */
export default function setup(): void {
  const url = testDatabaseUrl();
  const backendDir = path.resolve(import.meta.dirname, '..');
  try {
    execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
      cwd: backendDir,
      env: { ...process.env, DATABASE_URL: url },
      stdio: 'pipe',
    });
  } catch (err) {
    const e = err as { stdout?: Buffer; stderr?: Buffer };
    throw new Error(
      `Could not migrate the test database (${url}). Is it running? Try \`docker compose up -d\` in the repo root.\n` +
        `${e.stdout?.toString() ?? ''}${e.stderr?.toString() ?? ''}`,
      { cause: err },
    );
  }
}
