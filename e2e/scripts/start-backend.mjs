// Starts the real backend against the e2e database (environment only, no .env file).
import { spawn } from 'node:child_process';
import { backendDir, backendEnv } from './env.mjs';

const child = spawn('npx', ['tsx', 'src/server.ts'], { cwd: backendDir, env: backendEnv(), stdio: 'inherit' });
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => child.kill(sig));
child.on('exit', (code) => process.exit(code ?? 0));
