// Starts the real frontend dev server (no mocks) on the e2e port.
//
// frontend/vite.config.ts hard-codes the /api proxy target (http://localhost:3000), see
// FINDINGS.md F-001. Workaround without touching frontend/: start Vite through its JS API with
// the frontend's own config file and override only server.port and the proxy target.
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { backendUrl, frontendDir, frontendEnv, frontendPort } from './env.mjs';

Object.assign(process.env, frontendEnv());

const require = createRequire(path.join(frontendDir, 'package.json'));
const { createServer } = await import(pathToFileURL(require.resolve('vite')).href);

const server = await createServer({
  root: frontendDir,
  configFile: path.join(frontendDir, 'vite.config.ts'),
  server: {
    port: frontendPort,
    strictPort: true,
    proxy: { '/api': { target: backendUrl } },
  },
});
await server.listen();
server.printUrls();
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => void server.close().then(() => process.exit(0)));
}
