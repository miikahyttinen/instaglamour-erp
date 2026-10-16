/**
 * Shared guard for the unauthenticated public routes (public offer UC-030, freelancer link UC-033):
 * `X-Robots-Tag: noindex`, no caching, no referrer, then the per-IP rate limit → 429 RATE_LIMITED.
 *
 * The public offer page and the freelancer endpoints share ONE limiter (contract: "rate limit
 * 60/min/IP shared with public offers"); it is created once per app in app.ts.
 */
import type { FastifyReply, FastifyRequest } from 'fastify';
import { AppError } from './errors.js';
import { FixedWindowRateLimiter } from './rateLimit.js';

export const PUBLIC_RATE_LIMIT = 60;
export const PUBLIC_RATE_WINDOW_MS = 60_000;

export function newPublicRateLimiter(): FixedWindowRateLimiter {
  return new FixedWindowRateLimiter(PUBLIC_RATE_LIMIT, PUBLIC_RATE_WINDOW_MS);
}

/** Headers for every public response (incl. errors), then the per-IP limit. */
export function publicGuard(request: FastifyRequest, reply: FastifyReply, limiter: FixedWindowRateLimiter): void {
  reply.header('X-Robots-Tag', 'noindex');
  reply.header('Cache-Control', 'no-store'); // overridden by a successful photo response
  reply.header('Referrer-Policy', 'no-referrer');
  const limit = limiter.hit(request.ip);
  if (!limit.allowed) {
    reply.header('Retry-After', String(limit.retryAfterSeconds));
    throw new AppError('RATE_LIMITED', 'Too many requests');
  }
}
