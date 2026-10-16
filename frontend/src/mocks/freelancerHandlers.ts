// Mock handlers for docs/api-contract.md → Purchase orders: the public freelancer page
// (`/api/public/freelancers/{token}`, no session, UC-033) and the person page link
// (`/api/people/{id}/freelancer-link`, signed in, UC-034 A4). State: db.freelancer
// (freelancerStore.ts) over the gig store's cost lines. Rate limiting (429) is not simulated;
// tests override a handler for it. Synthetic data only (BR-090).
import { http, HttpResponse } from 'msw';
import type { ApiErrorBody, FreelancerLink, Id } from '../api/types';
import { db } from './data';
import {
  createPurchaseOrder,
  freelancerToken,
  freelancerView,
  personByToken,
  regenerateFreelancerToken,
  toPublicPurchaseOrder,
} from './freelancerStore';
import { currentPartner, errorResponse, unauthenticated, validationError } from './util';

export { DEMO_FREELANCER_TOKEN } from './freelancerStore';

const NOINDEX = { 'X-Robots-Tag': 'noindex' };
const MAX_IDS = 200;

const notFound = () => errorResponse(404, 'NOT_FOUND', 'Not found');

/** 1…200 unique strings, else null. */
function checkIds(value: unknown): Id[] | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_IDS) return null;
  if (!value.every((id) => typeof id === 'string' && id.length > 0)) return null;
  if (new Set(value).size !== value.length) return null;
  return value as Id[];
}

const linkBody = (token: string): FreelancerLink => ({ sharePath: `/f/${token}` });

export const freelancerHandlers = [
  http.get('/api/public/freelancers/:token', ({ params }) => {
    const person = personByToken(db.freelancer, db.gigs, String(params.token));
    if (!person) return notFound();
    return HttpResponse.json(freelancerView(db.freelancer, db.gigs, person), { headers: NOINDEX });
  }),

  http.post('/api/public/freelancers/:token/purchase-orders', async ({ params, request }) => {
    const body = (await request.json().catch(() => null)) as { costLineIds?: unknown } | null;
    const ids = checkIds(body?.costLineIds);
    if (!ids) return validationError({ costLineIds: 'INVALID_VALUE' });
    const person = personByToken(db.freelancer, db.gigs, String(params.token));
    if (!person) return notFound();
    const result = createPurchaseOrder(db.freelancer, db.gigs, person, ids);
    if (!result.ok) {
      const error: ApiErrorBody = {
        error: {
          code: 'COST_LINE_NOT_ELIGIBLE',
          message: 'Some cost lines are not eligible',
          details: { costLineIds: result.notEligible },
        },
      };
      return HttpResponse.json(error, { status: 409, headers: NOINDEX });
    }
    return HttpResponse.json(toPublicPurchaseOrder(result.purchaseOrder), { status: 201, headers: NOINDEX });
  }),

  http.get('/api/people/:id/freelancer-link', ({ params }) => {
    if (!currentPartner()) return unauthenticated();
    const person = db.gigs.people.find((p) => p.id === params.id);
    if (!person) return notFound();
    return HttpResponse.json(linkBody(freelancerToken(db.freelancer, person.id)));
  }),

  http.post('/api/people/:id/freelancer-link/regenerate', ({ params }) => {
    if (!currentPartner()) return unauthenticated();
    const person = db.gigs.people.find((p) => p.id === params.id);
    if (!person) return notFound();
    return HttpResponse.json(linkBody(regenerateFreelancerToken(db.freelancer, person.id)));
  }),
];
