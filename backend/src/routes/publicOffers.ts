/**
 * Public offer (docs/api-contract.md "Public offer"; UC-030, BR-104). NO authentication.
 *
 * - Returns exactly the `PublicOffer` whitelist (toPublicOfferDto); nothing internal.
 * - Unknown, malformed, regenerated and deleted tokens all give the same 404 (no hint whether an
 *   offer ever existed).
 * - Lookup by the SHA-256 of the token, then a constant-time comparison of the token itself.
 * - `X-Robots-Tag: noindex` and `Cache-Control: no-store` on every response (incl. errors).
 * - Rate limited per client IP (PUBLIC_OFFER_RATE_LIMIT per minute) → 429 RATE_LIMITED.
 */
import type { FastifyInstance } from 'fastify';
import type { AppDeps } from '../app.js';
import { AppError, notFound } from '../http/errors.js';
import { FixedWindowRateLimiter } from '../http/rateLimit.js';
import { hashShareToken, isWellFormedShareToken, sameToken } from '../offers/shareToken.js';
import { loadOfferSettings, offerInclude, toPublicOfferDto } from '../offers/store.js';

/** The route pattern; the auth gate in app.ts lets exactly this pattern through without a session. */
export const PUBLIC_OFFER_ROUTE = '/api/public/offers/:token';

export const PUBLIC_OFFER_RATE_LIMIT = 60;
const RATE_WINDOW_MS = 60_000;

export function publicOfferRoutes(app: FastifyInstance, deps: AppDeps): void {
  const { db } = deps;
  const limiter = new FixedWindowRateLimiter(PUBLIC_OFFER_RATE_LIMIT, RATE_WINDOW_MS);
  const offerNotFound = () => notFound('Offer not found');

  app.get<{ Params: { token: string } }>(PUBLIC_OFFER_ROUTE, async (request, reply) => {
    reply.header('X-Robots-Tag', 'noindex');
    reply.header('Cache-Control', 'no-store');
    reply.header('Referrer-Policy', 'no-referrer');

    const limit = limiter.hit(request.ip);
    if (!limit.allowed) {
      reply.header('Retry-After', String(limit.retryAfterSeconds));
      throw new AppError('RATE_LIMITED', 'Too many requests');
    }

    const { token } = request.params;
    if (!isWellFormedShareToken(token)) throw offerNotFound();
    const offer = await db.offer.findUnique({ where: { shareTokenHash: hashShareToken(token) }, include: offerInclude });
    if (!offer || offer.deletedAt !== null || !sameToken(offer.shareToken, token)) throw offerNotFound();

    return toPublicOfferDto(offer, await loadOfferSettings(db));
  });
}
