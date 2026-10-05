import cookie from '@fastify/cookie';
import multipart from '@fastify/multipart';
import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';
import { createGoogleAuthClient, type GoogleAuthClient } from './auth/google.js';
import { resolveSession, type PartnerWithPerson } from './auth/session.js';
import type { AppConfig } from './config.js';
import type { Db } from './db.js';
import { registerErrorHandling, unauthenticated } from './http/errors.js';
import { attachmentRoutes } from './routes/attachments.js';
import { authRoutes } from './routes/auth.js';
import { budgetRoutes } from './routes/budget.js';
import { budgetCategoryRoutes } from './routes/budgetCategories.js';
import { costLineRoutes } from './routes/costLines.js';
import { gigRoutes } from './routes/gigs.js';
import { hourRoutes } from './routes/hours.js';
import { meRoutes } from './routes/me.js';
import { peopleRoutes } from './routes/people.js';
import { referenceRoutes } from './routes/reference.js';
import { taskRoutes } from './routes/tasks.js';
import { yearRoutes } from './routes/years.js';

export interface AppDeps {
  db: Db;
  config: AppConfig;
  google: GoogleAuthClient;
}

declare module 'fastify' {
  interface FastifyRequest {
    /** The signed-in partner; set for every non-auth /api route. */
    partner: PartnerWithPerson | null;
    /** The signed-in partner, or a 401 if (unexpectedly) missing. */
    requirePartner(): PartnerWithPerson;
  }
}

const PUBLIC_PREFIX = '/api/auth/';

export interface BuildAppOptions {
  db: Db;
  config: AppConfig;
  google?: GoogleAuthClient;
  logger?: FastifyServerOptions['logger'];
}

export async function buildApp(options: BuildAppOptions): Promise<FastifyInstance> {
  const deps: AppDeps = {
    db: options.db,
    config: options.config,
    google: options.google ?? createGoogleAuthClient(options.config),
  };

  const app = Fastify({ logger: options.logger ?? false, trustProxy: true });

  await app.register(cookie, { secret: deps.config.sessionSecret });
  // Attachments are streamed to disk; size and file count limits are set per request.
  await app.register(multipart);
  registerErrorHandling(app);

  app.decorateRequest('partner', null);
  app.decorateRequest('requirePartner', function (this: { partner: PartnerWithPerson | null }) {
    if (!this.partner) throw unauthenticated();
    return this.partner;
  });

  // Global auth gate: every /api route except /api/auth/* needs a session — including unknown
  // routes, so the API surface isn't discoverable without signing in.
  app.addHook('onRequest', async (request, reply) => {
    // Decide by the matched route pattern when there is one (not the raw URL), else by the path.
    const path = request.routeOptions.url ?? request.url.split('?', 1)[0] ?? '';
    if (path.startsWith(PUBLIC_PREFIX) || !(path === '/api' || path.startsWith('/api/'))) return;
    const partner = await resolveSession(deps.db, deps.config, request, reply);
    if (!partner) throw unauthenticated();
    request.partner = partner;
  });

  authRoutes(app, deps);
  meRoutes(app, deps);
  referenceRoutes(app, deps);
  gigRoutes(app, deps);
  costLineRoutes(app, deps);
  attachmentRoutes(app, deps);
  yearRoutes(app, deps);
  peopleRoutes(app, deps);
  taskRoutes(app, deps);
  hourRoutes(app, deps);
  budgetRoutes(app, deps);
  budgetCategoryRoutes(app, deps);

  return app;
}
