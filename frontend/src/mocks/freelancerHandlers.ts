// Mock handlers for docs/api-contract.md → Purchase orders: the public freelancer page
// (`/api/public/freelancers/{token}`, no session, UC-033) and the person page link
// (`/api/people/{id}/freelancer-link`, signed in, UC-034 A4). State: db.freelancer
// (freelancerStore.ts) over the event store's cost lines. Rate limiting (429) is not simulated;
// tests override a handler for it. Synthetic data only (BR-090).
import { http, HttpResponse } from 'msw';
import type { FieldCode } from '../api/enums';
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
const personIsPartner = () =>
  errorResponse(409, 'PERSON_IS_PARTNER', 'Partners have no freelancer link');

/** BR-113: active partners have no freelancer link. */
const isActivePartner = (personId: Id) => db.partners.some((p) => p.personId === personId && p.active);

/** The person behind a public token; unknown, inactive or active partner → undefined (404). */
function publicPerson(token: string) {
  const person = personByToken(db.freelancer, db.events, token);
  return person && !isActivePartner(person.id) ? person : undefined;
}

/** 1…200 unique strings, else null. */
function checkIds(value: unknown): Id[] | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_IDS) return null;
  if (!value.every((id) => typeof id === 'string' && id.length > 0)) return null;
  if (new Set(value).size !== value.length) return null;
  return value as Id[];
}

type CreateBody =
  | { ok: true; ids: Id[]; vatRateBp: number; soundcheck: Record<Id, boolean> }
  | { ok: false; fields: Record<string, FieldCode> };

/** Legacy `vatLiable: true` maps to this rate (contract "Freelancer PO: VAT rate choice"). */
const LEGACY_VAT_RATE_BP = 1350;

/**
 * New body `{ vatRateBp, lines: [{ costLineId, soundcheck }] }` (rate 0 or one of `allowedRates`),
 * the older `{ vatLiable, lines }` (true = 1350, false = 0), or the legacy `{ costLineIds }`
 * (= no VAT, all at the sound check).
 */
function parseCreateBody(body: Record<string, unknown> | null, allowedRates: number[]): CreateBody {
  if (
    body &&
    body.lines === undefined &&
    body.vatRateBp === undefined &&
    body.vatLiable === undefined &&
    body.costLineIds !== undefined
  ) {
    const ids = checkIds(body.costLineIds);
    return ids ? { ok: true, ids, vatRateBp: 0, soundcheck: {} } : { ok: false, fields: { costLineIds: 'INVALID_VALUE' } };
  }
  const fields: Record<string, FieldCode> = {};
  let vatRateBp: number | null = null;
  const rate = body?.vatRateBp;
  const legacy = body?.vatLiable;
  if (rate !== undefined && rate !== null) {
    if (typeof rate === 'number' && (rate === 0 || allowedRates.includes(rate))) vatRateBp = rate;
    else fields.vatRateBp = 'INVALID_VALUE';
  } else if (legacy !== undefined && legacy !== null) {
    if (typeof legacy === 'boolean') vatRateBp = legacy ? LEGACY_VAT_RATE_BP : 0;
    else fields.vatLiable = 'INVALID_VALUE';
  } else fields.vatRateBp = 'REQUIRED';
  const lines = body?.lines;
  const valid =
    Array.isArray(lines) &&
    lines.every(
      (l: unknown) =>
        typeof l === 'object' &&
        l !== null &&
        typeof (l as { costLineId?: unknown }).costLineId === 'string' &&
        typeof (l as { soundcheck?: unknown }).soundcheck === 'boolean',
    );
  const typed = valid ? (lines as { costLineId: Id; soundcheck: boolean }[]) : [];
  const ids = valid ? checkIds(typed.map((l) => l.costLineId)) : null;
  if (!ids) fields.lines = 'INVALID_VALUE';
  if (!ids || Object.keys(fields).length > 0) return { ok: false, fields };
  return {
    ok: true,
    ids,
    vatRateBp: vatRateBp ?? 0,
    soundcheck: Object.fromEntries(typed.map((l) => [l.costLineId, l.soundcheck])),
  };
}

const linkBody = (token: string): FreelancerLink => ({ sharePath: `/f/${token}` });

export const freelancerHandlers = [
  http.get('/api/public/freelancers/:token', ({ params }) => {
    const person = publicPerson(String(params.token));
    if (!person) return notFound();
    const deduction = db.reference.settings.loadInDeductionCents;
    return HttpResponse.json(freelancerView(db.freelancer, db.events, person, deduction), { headers: NOINDEX });
  }),

  http.post('/api/public/freelancers/:token/purchase-orders', async ({ params, request }) => {
    const raw = (await request.json().catch(() => null)) as unknown;
    const parsed = parseCreateBody(
      typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : null,
      db.freelancer.vatRatesBp,
    );
    if (!parsed.ok) return validationError(parsed.fields);
    const person = publicPerson(String(params.token));
    if (!person) return notFound();
    const result = createPurchaseOrder(db.freelancer, db.events, person, parsed.ids, {
      vatRateBp: parsed.vatRateBp,
      soundcheck: parsed.soundcheck,
      settings: { soundcheckDeductionCents: db.reference.settings.loadInDeductionCents },
    });
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
    const person = db.events.people.find((p) => p.id === params.id);
    if (!person) return notFound();
    if (isActivePartner(person.id)) return personIsPartner();
    return HttpResponse.json(linkBody(freelancerToken(db.freelancer, person.id)));
  }),

  http.post('/api/people/:id/freelancer-link/regenerate', ({ params }) => {
    if (!currentPartner()) return unauthenticated();
    const person = db.events.people.find((p) => p.id === params.id);
    if (!person) return notFound();
    if (isActivePartner(person.id)) return personIsPartner();
    return HttpResponse.json(linkBody(regenerateFreelancerToken(db.freelancer, person.id)));
  }),
];
