/**
 * Public offer (docs/api-contract.md "Public offer"; UC-030, BR-104, BR-108). NO authentication.
 *
 * - Returns exactly the `PublicOffer` whitelist (toPublicOfferDto); nothing internal.
 * - Unknown, malformed, regenerated and deleted tokens all give the same 404 (no hint whether an
 *   offer ever existed).
 * - Lookup by the SHA-256 of the token, then a constant-time comparison of the token itself.
 * - `X-Robots-Tag: noindex` and `Referrer-Policy: no-referrer` on every response (incl. errors).
 * - Rate limited per client IP (PUBLIC_OFFER_RATE_LIMIT per minute) → 429 RATE_LIMITED.
 *
 * Reference photos (BR-108) are served ONLY through PUBLIC_REFERENCE_IMAGE_ROUTE, and only when the
 * token is valid, the offer is not deleted and shows references, and the reference is active and
 * has a photo whose file exists. Every other case is the same 404. The photo route has its own
 * limiter with the same limit, so a page with several photos doesn't use up the page's budget.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { AppDeps } from '../app.js';
import { AppError, notFound } from '../http/errors.js';
import { FixedWindowRateLimiter } from '../http/rateLimit.js';
import type { Db } from '../db.js';
import { hashShareToken, isWellFormedShareToken, sameToken } from '../offers/shareToken.js';
import { offerInclude, toPublicOfferDto, type OfferWithRefs } from '../offers/store.js';
import { loadActiveReferences, sendReferenceImage, storedImage } from '../references/store.js';
import { isUuid } from '../gigs/store.js';
import { UploadDir } from '../fileStore/uploadDir.js';

/** The route pattern; the auth gate in app.ts lets exactly this pattern through without a session. */
export const PUBLIC_OFFER_ROUTE = '/api/public/offers/:token';
/** Token-scoped reference photo (BR-108); also let through by the auth gate, nothing else is. */
export const PUBLIC_REFERENCE_IMAGE_ROUTE = '/api/public/offers/:token/references/:id/image';
/** The only route patterns reachable without a session besides /api/auth/*. */
export const PUBLIC_ROUTES: ReadonlySet<string> = new Set([PUBLIC_OFFER_ROUTE, PUBLIC_REFERENCE_IMAGE_ROUTE]);

export const PUBLIC_OFFER_RATE_LIMIT = 60;
const RATE_WINDOW_MS = 60_000;

/** The non-deleted offer this exact token belongs to, else null (callers answer a uniform 404). */
async function findOfferByToken(db: Db, token: string): Promise<OfferWithRefs | null> {
  if (!isWellFormedShareToken(token)) return null;
  const offer = await db.offer.findUnique({ where: { shareTokenHash: hashShareToken(token) }, include: offerInclude });
  if (!offer || offer.deletedAt !== null || !sameToken(offer.shareToken, token)) return null;
  return offer;
}

export function publicOfferRoutes(app: FastifyInstance, deps: AppDeps): void {
  const { db, config } = deps;
  const uploads = new UploadDir(config.uploadDir);
  const limiter = new FixedWindowRateLimiter(PUBLIC_OFFER_RATE_LIMIT, RATE_WINDOW_MS);
  const imageLimiter = new FixedWindowRateLimiter(PUBLIC_OFFER_RATE_LIMIT, RATE_WINDOW_MS);
  const offerNotFound = () => notFound('Offer not found');

  /** Headers for every public response, then the per-IP limit. */
  const guard = (request: FastifyRequest, reply: FastifyReply, rateLimiter: FixedWindowRateLimiter) => {
    reply.header('X-Robots-Tag', 'noindex');
    reply.header('Cache-Control', 'no-store'); // overridden by a successful photo response
    reply.header('Referrer-Policy', 'no-referrer');
    const limit = rateLimiter.hit(request.ip);
    if (!limit.allowed) {
      reply.header('Retry-After', String(limit.retryAfterSeconds));
      throw new AppError('RATE_LIMITED', 'Too many requests');
    }
  };

  app.get<{ Params: { token: string } }>(PUBLIC_OFFER_ROUTE, async (request, reply) => {
    guard(request, reply, limiter);
    const offer = await findOfferByToken(db, request.params.token);
    if (!offer) throw offerNotFound();
    return toPublicOfferDto(offer, offer.showReferences ? await loadActiveReferences(db) : []);
  });

  app.get<{ Params: { token: string; id: string } }>(PUBLIC_REFERENCE_IMAGE_ROUTE, async (request, reply) => {
    guard(request, reply, imageLimiter);
    // One message for every miss: the response never tells which check failed.
    const imageNotFound = () => notFound('Not found');
    const offer = await findOfferByToken(db, request.params.token);
    if (!offer || !offer.showReferences || !isUuid(request.params.id)) throw imageNotFound();
    const ref = await db.reference.findUnique({ where: { id: request.params.id } });
    if (!ref || !ref.active) throw imageNotFound();
    const image = storedImage(ref);
    if (!image || !(await uploads.exists(image.storageKey)))
      throw imageNotFound();
    return sendReferenceImage(reply, uploads, image, request);
  });
}
