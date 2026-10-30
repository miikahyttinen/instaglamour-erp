/** GET /api/health — liveness + database check for the platform healthcheck. No session needed. */
import type { FastifyInstance } from 'fastify';
import type { AppDeps } from '../app.js';

export const HEALTH_ROUTE = '/api/health';

export function healthRoutes(app: FastifyInstance, deps: AppDeps): void {
  app.get(HEALTH_ROUTE, async (request, reply) => {
    void reply.header('cache-control', 'no-store');
    try {
      await deps.db.$queryRaw`SELECT 1`;
      return { ok: true };
    } catch (err) {
      request.log.error({ err }, 'Health check: database unreachable');
      return reply.status(503).send({ ok: false });
    }
  });
}
