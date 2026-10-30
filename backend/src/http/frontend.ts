/**
 * Single-service deployment: the backend serves the built frontend (`frontend/dist`).
 * - Files are served from the dist directory; Vite's content-hashed files under `assets/` are
 *   cached for a year, everything else (incl. index.html) must be revalidated.
 * - SPA fallback: any other GET/HEAD outside /api answers with index.html, so client-side routes
 *   (e.g. /events/123) survive a reload. /api/* is never touched.
 */
import { access } from 'node:fs/promises';
import path from 'node:path';
import fastifyStatic from '@fastify/static';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

export const IMMUTABLE_CACHE = 'public, max-age=31536000, immutable';
export const NO_CACHE = 'no-cache';

const isApiPath = (url: string) => {
  const p = url.split('?', 1)[0] ?? '';
  return p === '/api' || p.startsWith('/api/');
};

export async function registerFrontend(app: FastifyInstance, staticDir: string): Promise<void> {
  const indexFile = path.join(staticDir, 'index.html');
  try {
    await access(indexFile);
  } catch {
    throw new Error(
      `Frontend build not found: ${indexFile} is missing. Run \`npm run build\` in the repo root ` +
        '(or set FRONTEND_DIST_DIR to the directory containing index.html).',
    );
  }

  await app.register(fastifyStatic, {
    root: staticDir,
    prefix: '/',
    // One route per file found at startup (the build is immutable); unknown paths reach the
    // not-found handler below instead of a catch-all route that would shadow /api 404s.
    wildcard: false,
    index: false,
    cacheControl: false,
    setHeaders: (reply, filePath) => {
      const rel = path.relative(staticDir, filePath).split(path.sep).join('/');
      void reply.header('cache-control', rel.startsWith('assets/') ? IMMUTABLE_CACHE : NO_CACHE);
    },
  });
}

/**
 * Not-found handler hook: serve index.html for browser navigations; returns false when not
 * applicable (non-GET, /api/*, or a missing build asset — a stale /assets/x.js must 404, not HTML).
 */
export function spaFallback(request: FastifyRequest, reply: FastifyReply): boolean {
  if (request.method !== 'GET' && request.method !== 'HEAD') return false;
  if (isApiPath(request.url) || request.url.startsWith('/assets/')) return false;
  void reply.header('cache-control', NO_CACHE).sendFile('index.html');
  return true;
}
