/**
 * Freelancer link (docs/api-contract.md "Purchase orders" → public endpoints; UC-033, BR-113…116).
 * NO authentication.
 *
 * - Responses are exactly the FreelancerView / PublicPurchaseOrder whitelists: never client, event
 *   price, other people, notes, ids of other records, partner data or cancel reasons.
 * - Unknown, malformed, regenerated tokens, inactive people and active partners (BR-113, 2026-10-18)
 *   all give the same 404.
 * - `X-Robots-Tag: noindex`, no-store; rate limited per IP with the limiter shared with the public
 *   offer page (http/publicGuard.ts).
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { AppDeps } from '../app.js';
import { notFound } from '../http/errors.js';
import { publicGuard } from '../http/publicGuard.js';
import type { FixedWindowRateLimiter } from '../http/rateLimit.js';
import { sameToken } from '../offers/shareToken.js';
import {
  createPurchaseOrder,
  isLinkUsable,
  loadFreelancerView,
  toPublicPurchaseOrderDto,
} from '../purchaseOrders/store.js';
import { parseCostLineIds } from '../purchaseOrders/input.js';
import { isWellFormedFreelancerToken } from '../purchaseOrders/token.js';

export const PUBLIC_FREELANCER_ROUTE = '/api/public/freelancers/:token';
export const PUBLIC_FREELANCER_PO_ROUTE = '/api/public/freelancers/:token/purchase-orders';
/** Freelancer route patterns reachable without a session (auth gate in app.ts). */
export const PUBLIC_FREELANCER_ROUTES: readonly string[] = [PUBLIC_FREELANCER_ROUTE, PUBLIC_FREELANCER_PO_ROUTE];

type TokenParams = { Params: { token: string } };

export function publicFreelancerRoutes(app: FastifyInstance, deps: AppDeps, pageLimiter: FixedWindowRateLimiter): void {
  const { db } = deps;
  const linkNotFound = () => notFound('Not found');
  const guard = (request: FastifyRequest, reply: FastifyReply) => publicGuard(request, reply, pageLimiter);

  /** The active person this exact token belongs to, else null (callers answer a uniform 404). */
  const findPerson = async (token: string) => {
    if (!isWellFormedFreelancerToken(token)) return null;
    const person = await db.person.findUnique({
      where: { freelancerToken: token },
      select: { id: true, name: true, active: true, freelancerToken: true, partner: { select: { active: true } } },
    });
    if (!person || !isLinkUsable(person) || !sameToken(person.freelancerToken, token)) return null;
    return person;
  };

  app.get<TokenParams>(PUBLIC_FREELANCER_ROUTE, async (request, reply) => {
    guard(request, reply);
    const person = await findPerson(request.params.token);
    if (!person) throw linkNotFound();
    return loadFreelancerView(db, person);
  });

  app.post<TokenParams>(PUBLIC_FREELANCER_PO_ROUTE, async (request, reply) => {
    guard(request, reply);
    const costLineIds = parseCostLineIds(request.body);
    const { token } = request.params;
    const person = await findPerson(token);
    if (!person) throw linkNotFound();
    const po = await createPurchaseOrder(db, {
      personId: person.id,
      costLineIds,
      // Re-checked under the lock: the link may have been regenerated or the person deactivated.
      isCurrent: (p) => isLinkUsable(p) && sameToken(p.freelancerToken, token),
      eligibility: 'FREELANCER',
      createdBy: null,
    });
    return reply.status(201).send(toPublicPurchaseOrderDto(po));
  });
}
