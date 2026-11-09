import cookie from '@fastify/cookie';
import multipart from '@fastify/multipart';
import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';
import { createGoogleAuthClient, type GoogleAuthClient } from './auth/google.js';
import { resolveSession, type PartnerWithPerson } from './auth/session.js';
import type { AppConfig } from './config.js';
import type { Db } from './db.js';
import { registerErrorHandling, unauthenticated } from './http/errors.js';
import { registerFrontend, spaFallback } from './http/frontend.js';
import { authRoutes } from './routes/auth.js';
import { budgetRoutes } from './routes/budget.js';
import { budgetCategoryRoutes } from './routes/budgetCategories.js';
import { clientRoutes } from './routes/clients.js';
import { costLineRoutes } from './routes/costLines.js';
import { invoiceRowRoutes } from './routes/invoiceRows.js';
import { lineupTemplateRoutes } from './routes/lineupTemplates.js';
import { eventRoutes } from './routes/events.js';
import { HEALTH_ROUTE, healthRoutes } from './routes/health.js';
import { hourRoutes } from './routes/hours.js';
import { importRoutes } from './routes/import.js';
import { meRoutes } from './routes/me.js';
import { offerRoutes } from './routes/offers.js';
import { peopleRoutes } from './routes/people.js';
import { newPublicRateLimiter } from './http/publicGuard.js';
import { PUBLIC_FREELANCER_ROUTES, publicFreelancerRoutes } from './routes/publicFreelancers.js';
import { PUBLIC_OFFER_ROUTES, publicOfferRoutes } from './routes/publicOffers.js';
import { purchaseOrderRoutes } from './routes/purchaseOrders.js';
import { referenceRoutes } from './routes/reference.js';
import { referencesRoutes } from './routes/references.js';
import { settingsParameterRoutes } from './routes/settingsParameters.js';
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

/** The only route patterns reachable without a session besides /api/auth/*. */
export const PUBLIC_ROUTES: ReadonlySet<string> = new Set([...PUBLIC_OFFER_ROUTES, ...PUBLIC_FREELANCER_ROUTES]);

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
  // Reference photos are streamed to disk; size and file count limits are set per request.
  await app.register(multipart);
  // Single-service production: serve the built frontend with an SPA fallback (dev: Vite serves it).
  const { staticDir } = deps.config;
  if (staticDir) await registerFrontend(app, staticDir);
  registerErrorHandling(app, staticDir ? { notFoundFallback: spaFallback } : {});

  app.decorateRequest('partner', null);
  app.decorateRequest('requirePartner', function (this: { partner: PartnerWithPerson | null }) {
    if (!this.partner) throw unauthenticated();
    return this.partner;
  });

  // Global auth gate: every /api route except /api/auth/* and the public offer route needs a
  // session — including unknown routes, so the API surface isn't discoverable without signing in.
  app.addHook('onRequest', async (request, reply) => {
    // Public offer (UC-030), its token-scoped reference photos (BR-108) and the freelancer link
    // (UC-033): only these exact matched route patterns; other /api/public/* paths need a session.
    if (request.routeOptions.url !== undefined && PUBLIC_ROUTES.has(request.routeOptions.url)) return;
    // Platform healthcheck: answers only { ok } and needs no session.
    if (request.routeOptions.url === HEALTH_ROUTE) return;
    // Decide by the matched route pattern when there is one (not the raw URL), else by the path.
    const path = request.routeOptions.url ?? request.url.split('?', 1)[0] ?? '';
    if (path.startsWith(PUBLIC_PREFIX) || !(path === '/api' || path.startsWith('/api/'))) return;
    const partner = await resolveSession(deps.db, deps.config, request, reply);
    if (!partner) throw unauthenticated();
    request.partner = partner;
  });

  healthRoutes(app, deps);
  authRoutes(app, deps);
  meRoutes(app, deps);
  referenceRoutes(app, deps);
  lineupTemplateRoutes(app, deps);
  eventRoutes(app, deps);
  costLineRoutes(app, deps);
  invoiceRowRoutes(app, deps);
  yearRoutes(app, deps);
  peopleRoutes(app, deps);
  taskRoutes(app, deps);
  hourRoutes(app, deps);
  budgetRoutes(app, deps);
  budgetCategoryRoutes(app, deps);
  clientRoutes(app, deps);
  offerRoutes(app, deps);
  referencesRoutes(app, deps);
  purchaseOrderRoutes(app, deps);
  importRoutes(app, deps);
  settingsParameterRoutes(app, deps);
  // One per-IP budget for the public offer page and the freelancer endpoints (contract).
  const publicPageLimiter = newPublicRateLimiter();
  publicOfferRoutes(app, deps, publicPageLimiter);
  publicFreelancerRoutes(app, deps, publicPageLimiter);

  return app;
}
