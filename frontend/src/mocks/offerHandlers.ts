// Mock handlers for docs/api-contract.md → Offers (UC-028, UC-029, UC-031; BR-102…BR-106).
// Business logic lives in offerStore.ts; converting creates the gig in the gig store.
import { http, HttpResponse } from 'msw';
import type { FieldCode } from '../api/enums';
import { OFFER_DISPOSITIONS, OFFER_EVENT_TYPES, OFFER_SOURCES, OFFER_STATUS_FILTERS } from '../api/enums';
import type { OfferConvertResponse, OfferCreate, OfferListResponse, OfferUpdate } from '../api/types';
import { todayIso } from '../lib/format';
import { db } from './data';
import { createGig, nowTs, toDetail } from './gigStore';
import {
  createOffer,
  gigInputFromOffer,
  logOfferEvent,
  markConverted,
  offerYearSummary,
  regenerateLink,
  toOfferDetail,
  toOfferSummary,
  updateOffer,
  type MockOffer,
  type OfferPatch,
} from './offerStore';
import { currentPartner, errorResponse, unauthenticated, validationError } from './util';

const STRING_MAX = 500;
const TEXT_MAX = 5000;
type Fields = Record<string, FieldCode>;

const ctx = () => ({ clients: db.gigs.clients, partners: db.partners });
const findOffer = (id: unknown): MockOffer | undefined => db.offers.offers.find((o) => o.id === id);
const notFound = () => errorResponse(404, 'NOT_FOUND', 'Offer not found');
/** Deleted offers are read-only: only GET, history and restore work. */
const isDeleted = () => errorResponse(409, 'INVALID_STATUS_TRANSITION', 'Offer is deleted');
const LINEUP_MAX_ITEMS = 100;
const isHttpUrl = (v: string) => {
  try {
    const url = new URL(v);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
};
const detail = (offer: MockOffer, status = 200) =>
  HttpResponse.json(toOfferDetail(db.offers, offer, ctx()), { status });

async function readJson<T>(request: Request): Promise<Partial<T>> {
  try {
    const body: unknown = await request.json();
    return typeof body === 'object' && body !== null ? (body as Partial<T>) : {};
  } catch {
    return {};
  }
}

const isDate = (v: unknown): v is string =>
  typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));
const oneOf = <T extends string>(list: readonly T[], v: unknown): v is T =>
  typeof v === 'string' && (list as readonly string[]).includes(v);

/**
 * Validates the fields present in `body` and returns the cleaned patch. `create` makes the four
 * required fields required. Strings are trimmed; optional blanks become null.
 */
function parseOfferBody(body: Partial<OfferUpdate>, create: boolean): { patch: OfferPatch; fields: Fields } {
  const fields: Fields = {};
  const patch: OfferPatch = {};

  const requiredString = (key: 'eventName' | 'venue') => {
    const v = body[key];
    if (v === undefined) {
      if (create) fields[key] = 'REQUIRED';
      return;
    }
    if (typeof v !== 'string') fields[key] = 'INVALID_VALUE';
    else if (!v.trim()) fields[key] = 'REQUIRED';
    else if (v.trim().length > STRING_MAX) fields[key] = 'TOO_LONG';
    else patch[key] = v.trim();
  };
  const optionalString = (key: 'city' | 'includesText' | 'spotifyUrl', max: number) => {
    const v = body[key];
    if (v === undefined) return;
    if (v !== null && typeof v !== 'string') fields[key] = 'INVALID_VALUE';
    else if (v && v.length > max) fields[key] = 'TOO_LONG';
    else patch[key] = v?.trim() ? (key === 'includesText' ? v.replace(/\s+$/, '') : v.trim()) : null;
  };

  if (body.clientId !== undefined || create) {
    const id = body.clientId;
    if (id === undefined || id === null || id === '') fields.clientId = 'REQUIRED';
    else if (!db.gigs.clients.some((c) => c.id === id && c.deletedAt === null)) fields.clientId = 'UNKNOWN_REFERENCE';
    else patch.clientId = id;
  }
  requiredString('eventName');
  requiredString('venue');
  if (body.eventDate !== undefined || create) {
    if (!body.eventDate) fields.eventDate = 'REQUIRED';
    else if (!isDate(body.eventDate)) fields.eventDate = 'INVALID_DATE';
    else patch.eventDate = body.eventDate;
  }
  optionalString('city', STRING_MAX);
  optionalString('includesText', TEXT_MAX);
  optionalString('spotifyUrl', STRING_MAX);
  if (patch.spotifyUrl && !isHttpUrl(patch.spotifyUrl)) fields.spotifyUrl = 'INVALID_VALUE';
  if (body.lineup !== undefined) {
    const lines = Array.isArray(body.lineup) ? body.lineup : null;
    if (!lines || lines.some((l) => typeof l !== 'string')) fields.lineup = 'INVALID_VALUE';
    else {
      const items = lines.map((l) => l.trim()).filter(Boolean);
      if (items.length > LINEUP_MAX_ITEMS || items.some((l) => l.length > STRING_MAX)) fields.lineup = 'TOO_LONG';
      else patch.lineup = items;
    }
  }
  if (body.showReferences !== undefined) {
    if (typeof body.showReferences !== 'boolean') fields.showReferences = 'INVALID_VALUE';
    else patch.showReferences = body.showReferences;
  }
  if (body.priceCents !== undefined) {
    const v = body.priceCents;
    if (v !== null && (typeof v !== 'number' || !Number.isInteger(v))) fields.priceCents = 'INVALID_VALUE';
    else if (v !== null && v < 0) fields.priceCents = 'NEGATIVE_AMOUNT';
    else patch.priceCents = v;
  }
  if (body.sellerId !== undefined) {
    if (!db.partners.some((p) => p.id === body.sellerId)) fields.sellerId = 'UNKNOWN_REFERENCE';
    else patch.sellerId = body.sellerId;
  }
  if (body.source !== undefined) {
    if (body.source !== null && !oneOf(OFFER_SOURCES, body.source)) fields.source = 'INVALID_VALUE';
    else patch.source = body.source;
  }
  if (body.eventType !== undefined) {
    if (body.eventType !== null && !oneOf(OFFER_EVENT_TYPES, body.eventType)) fields.eventType = 'INVALID_VALUE';
    else patch.eventType = body.eventType;
  }
  if (body.disposition !== undefined) {
    if (create || !oneOf(OFFER_DISPOSITIONS, body.disposition)) fields.disposition = 'INVALID_VALUE';
    else patch.disposition = body.disposition;
  }
  return { patch, fields };
}

export const offerHandlers = [
  http.get('/api/offers', ({ request }) => {
    if (!currentPartner()) return unauthenticated();
    const params = new URL(request.url).searchParams;
    const yearParam = params.get('year') ?? '';
    if (!/^\d{4}$/.test(yearParam)) return validationError({ year: 'INVALID_VALUE' });
    const year = Number(yearParam);
    const status = params.get('status');
    if (status && !oneOf(OFFER_STATUS_FILTERS, status)) return validationError({ status: 'INVALID_VALUE' });
    const today = todayIso();
    const q = (params.get('q') ?? '').trim().toLowerCase();
    const deleted = params.get('deleted') === 'true';
    const sellerId = params.get('sellerId');
    const disposition = params.get('disposition');
    const eventType = params.get('eventType');
    const source = params.get('source');
    const offers = db.offers.offers
      .filter((o) => o.eventDate.startsWith(`${year}-`))
      .filter((o) => (deleted ? o.deletedAt !== null : o.deletedAt === null))
      .map((o) => toOfferSummary(o, ctx(), today))
      .filter((o) => !status || (status === 'EXPIRED' ? o.expired : o.status === status))
      .filter((o) => !sellerId || o.sellerId === sellerId)
      .filter((o) => !disposition || o.disposition === disposition)
      .filter((o) => !eventType || o.eventType === eventType)
      .filter((o) => !source || o.source === source)
      .filter(
        (o) =>
          !q ||
          [o.eventName, o.clientName, o.venue, o.city ?? ''].some((v) => v.toLowerCase().includes(q)),
      )
      .sort((a, b) => a.eventDate.localeCompare(b.eventDate) || a.createdAt.localeCompare(b.createdAt));
    const body: OfferListResponse = { offers, summary: offerYearSummary(db.offers, year, today) };
    return HttpResponse.json(body);
  }),

  http.post('/api/offers', async ({ request }) => {
    const me = currentPartner();
    if (!me) return unauthenticated();
    const body = await readJson<OfferCreate>(request);
    const { patch, fields } = parseOfferBody(body, true);
    if (Object.keys(fields).length > 0) return validationError(fields);
    const { settings } = db.offers;
    const offer = createOffer(
      db.offers,
      {
        clientId: patch.clientId!,
        eventName: patch.eventName!,
        eventDate: patch.eventDate!,
        venue: patch.venue!,
        city: patch.city ?? null,
        lineup: patch.lineup ?? [],
        includesText: patch.includesText === undefined ? settings.defaultIncludes : patch.includesText,
        spotifyUrl: patch.spotifyUrl === undefined ? settings.defaultSpotifyUrl : patch.spotifyUrl,
        showReferences: patch.showReferences ?? false,
        priceCents: patch.priceCents ?? null,
        sellerId: patch.sellerId ?? me.id,
        source: patch.source ?? null,
        eventType: patch.eventType ?? null,
      },
      me.id,
    );
    return detail(offer, 201);
  }),

  http.get('/api/offers/:id', ({ params }) => {
    if (!currentPartner()) return unauthenticated();
    const offer = findOffer(params.id);
    return offer ? detail(offer) : notFound();
  }),

  http.patch('/api/offers/:id', async ({ params, request }) => {
    const me = currentPartner();
    if (!me) return unauthenticated();
    const body = await readJson<OfferUpdate>(request);
    const { patch, fields } = parseOfferBody(body, false);
    if (Object.keys(fields).length > 0) return validationError(fields);
    const offer = findOffer(params.id);
    if (!offer) return notFound();
    if (offer.deletedAt) return isDeleted();
    updateOffer(db.offers, offer, patch, me.id);
    return detail(offer);
  }),

  http.post('/api/offers/:id/regenerate-link', ({ params }) => {
    const me = currentPartner();
    if (!me) return unauthenticated();
    const offer = findOffer(params.id);
    if (!offer) return notFound();
    if (offer.deletedAt) return isDeleted();
    regenerateLink(db.offers, offer, me.id);
    return detail(offer);
  }),

  http.post('/api/offers/:id/convert', ({ params }) => {
    const me = currentPartner();
    if (!me) return unauthenticated();
    const offer = findOffer(params.id);
    if (!offer) return notFound();
    if (offer.deletedAt) return isDeleted();
    if (offer.gigId) return errorResponse(409, 'ALREADY_CONVERTED', 'Offer already has a gig');
    const gig = createGig(db.gigs, gigInputFromOffer(offer), me.id, {
      templates: db.reference.lineupTemplates,
      settings: db.reference.settings,
      partners: db.partners,
    });
    gig.offerId = offer.id;
    markConverted(db.offers, offer, gig.id, me.id);
    const body: OfferConvertResponse = {
      offer: toOfferDetail(db.offers, offer, ctx()),
      gig: toDetail(db.gigs, gig),
    };
    return HttpResponse.json(body, { status: 201 });
  }),

  http.post('/api/offers/:id/delete', ({ params }) => {
    const me = currentPartner();
    if (!me) return unauthenticated();
    const offer = findOffer(params.id);
    if (!offer) return notFound();
    if (offer.deletedAt) return isDeleted();
    offer.deletedAt = nowTs();
    logOfferEvent(db.offers, offer.id, 'DELETED', me.id);
    return new HttpResponse(null, { status: 204 });
  }),

  http.post('/api/offers/:id/restore', ({ params }) => {
    const me = currentPartner();
    if (!me) return unauthenticated();
    const offer = findOffer(params.id);
    if (!offer) return notFound();
    if (offer.deletedAt === null) {
      return errorResponse(409, 'INVALID_STATUS_TRANSITION', 'Offer is not deleted');
    }
    offer.deletedAt = null;
    logOfferEvent(db.offers, offer.id, 'RESTORED', me.id);
    return detail(offer);
  }),

  http.get('/api/offers/:id/history', ({ params }) => {
    if (!currentPartner()) return unauthenticated();
    const offer = findOffer(params.id);
    if (!offer) return notFound();
    const events = db.offers.events
      .filter((e) => e.offerId === offer.id)
      .sort((a, b) => b.at.localeCompare(a.at));
    return HttpResponse.json(events);
  }),
];
