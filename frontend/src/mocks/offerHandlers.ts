// Mock handlers for docs/api-contract.md → Offers (UC-028, UC-029, UC-031; BR-102…BR-106).
// Business logic lives in offerStore.ts; converting creates the event in the event store.
import { http, HttpResponse } from 'msw';
import type { FieldCode } from '../api/enums';
import { OFFER_DISPOSITIONS, OFFER_EVENT_TYPES, OFFER_SOURCES, OFFER_STATUS_FILTERS } from '../api/enums';
import type {
  EventCreate,
  OfferConvertResponse,
  OfferCreate,
  OfferListResponse,
  OfferUpdate,
} from '../api/types';
import { todayIso } from '../lib/format';
import { db } from './data';
import { parseEventCreate } from './eventHandlers';
import { createEvent, nowTs, toDetail, type NewEventInput } from './eventStore';
import {
  createOffer,
  eventInputFromOffer,
  logOfferEvent,
  markConverted,
  helsinkiYear,
  offerStats,
  offerYearSummary,
  regenerateLink,
  statusOf,
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

const ctx = () => ({ clients: db.events.clients, partners: db.partners, references: db.references });
const findOffer = (id: unknown): MockOffer | undefined => db.offers.offers.find((o) => o.id === id);
const notFound = () => errorResponse(404, 'NOT_FOUND', 'Offer not found');
/** Deleted offers are read-only: only GET, history and restore work. */
const isDeleted = () => errorResponse(409, 'INVALID_STATUS_TRANSITION', 'Offer is deleted');
const alreadyConverted = () => errorResponse(409, 'ALREADY_CONVERTED', 'Offer already has an event');
/** BR-109: only ACCEPTED offers with event date today or later (checked after ALREADY_CONVERTED). */
const notConvertible = (offer: MockOffer) =>
  statusOf(offer.disposition) !== 'ACCEPTED' || offer.eventDate < todayIso()
    ? errorResponse(409, 'OFFER_NOT_CONVERTIBLE', 'Offer is not accepted or its date has passed')
    : null;
const isActivePartner = (id: string) => db.partners.some((p) => p.id === id && p.active !== false);
const LINEUP_MAX_ITEMS = 100;
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
  const optionalString = (key: 'city' | 'includesText', max: number) => {
    const v = body[key];
    if (v === undefined) return;
    if (v !== null && typeof v !== 'string') fields[key] = 'INVALID_VALUE';
    else if (v && v.length > max) fields[key] = 'TOO_LONG';
    else patch[key] = v?.trim() ? (key === 'includesText' ? v.replace(/\s+$/, '') : v.trim()) : null;
  };

  if (body.clientId !== undefined || create) {
    const id = body.clientId;
    if (id === undefined || id === null || id === '') fields.clientId = 'REQUIRED';
    else if (!db.events.clients.some((c) => c.id === id && c.deletedAt === null)) fields.clientId = 'UNKNOWN_REFERENCE';
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
  // Contract 2026-10-15: the Spotify link is fixed in code; sending it at all is refused.
  if ('spotifyUrl' in body) fields.spotifyUrl = 'INVALID_VALUE';
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
  // PATCH only (contract 2026-11-09); not part of OfferCreate, so ignored on create.
  if (!create && body.followUpDone !== undefined) {
    if (typeof body.followUpDone !== 'boolean') fields.followUpDone = 'INVALID_VALUE';
    else patch.followUpDone = body.followUpDone;
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
    // `year` is optional (contract "Year is no longer global"): without it, every year.
    const yearParam = params.get('year');
    if (yearParam !== null && !/^\d{4}$/.test(yearParam)) return validationError({ year: 'INVALID_VALUE' });
    const year = yearParam === null ? null : Number(yearParam);
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
      .filter((o) => year === null || o.eventDate.startsWith(`${year}-`))
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
      // With a year: by event date; without: newest created first.
      .sort((a, b) =>
        year === null
          ? b.createdAt.localeCompare(a.createdAt)
          : a.eventDate.localeCompare(b.eventDate) || a.createdAt.localeCompare(b.createdAt),
      );
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

  // Before `/api/offers/:id` (first match wins).
  http.get('/api/offers/stats', ({ request }) => {
    if (!currentPartner()) return unauthenticated();
    // `year` optional: default = the current year in Europe/Helsinki.
    const yearParam = new URL(request.url).searchParams.get('year');
    if (yearParam !== null && !/^\d{4}$/.test(yearParam)) return validationError({ year: 'INVALID_VALUE' });
    return HttpResponse.json(offerStats(db.offers, yearParam === null ? helsinkiYear() : Number(yearParam)));
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

  http.get('/api/offers/:id/event-draft', ({ params }) => {
    const me = currentPartner();
    if (!me) return unauthenticated();
    const offer = findOffer(params.id);
    if (!offer) return notFound();
    if (offer.deletedAt) return isDeleted();
    if (offer.eventId) return alreadyConverted();
    const blocked = notConvertible(offer);
    if (blocked) return blocked;
    const draft: EventCreate = {
      ...eventInputFromOffer(offer, { isActive: isActivePartner, callerId: me.id }),
      // No lineup prefill (owner 2026-11-07); the body-less convert keeps the BR-105 defaults.
      lineupTemplateId: null,
      lineupName: null,
    };
    // A deleted client can't be linked (UC-027): the draft leaves it empty.
    if (!db.events.clients.some((c) => c.id === draft.clientId && c.deletedAt === null)) draft.clientId = null;
    return HttpResponse.json(draft);
  }),

  // Optional EventCreate body (2026-10-20): validated like POST /api/events; no body → BR-105 defaults.
  http.post('/api/offers/:id/convert', async ({ params, request }) => {
    const me = currentPartner();
    if (!me) return unauthenticated();
    const offer = findOffer(params.id);
    if (!offer) return notFound();
    if (offer.deletedAt) return isDeleted();
    if (offer.eventId) return alreadyConverted();
    const blocked = notConvertible(offer);
    if (blocked) return blocked;
    const text = await request.text();
    let input: NewEventInput = eventInputFromOffer(offer);
    if (text.trim() !== '') {
      let body: unknown;
      try {
        body = JSON.parse(text);
      } catch {
        body = null;
      }
      const parsed = parseEventCreate(
        typeof body === 'object' && body !== null ? (body as Partial<EventCreate>) : {},
      );
      if (parsed.fields) return validationError(parsed.fields);
      input = parsed.input;
    }
    const event = createEvent(db.events, input, me.id, {
      templates: db.reference.lineupTemplates,
          partners: db.partners,
    });
    event.offerId = offer.id;
    markConverted(db.offers, offer, event.id, me.id);
    const body: OfferConvertResponse = {
      offer: toOfferDetail(db.offers, offer, ctx()),
      event: toDetail(db.events, event),
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
