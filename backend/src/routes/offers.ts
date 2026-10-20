/**
 * Offer endpoints (docs/api-contract.md "Offers"; UC-028, UC-029, UC-031; BR-102…BR-106).
 * Every change is logged as an OfferEvent (BR-103). Status and `expired` are derived on the server.
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppDeps } from '../app.js';
import { findActiveClient, lockActiveClient } from '../clients/store.js';
import { dateFromIso, isoFromDate, todayIso } from '../domain/dates.js';
import { EVENT_TYPES, OFFER_DISPOSITIONS, OFFER_SOURCES } from '../domain/enums.js';
import type { Prisma } from '../generated/prisma/client.js';
import { flag, isoDate, LONG_TEXT_MAX, money, oneOf, optionalText, requiredText, SHORT_TEXT_MAX, yearString } from '../gigs/schemas.js';
import { prepareGigCreate } from '../gigs/create.js';
import { toGigDetailDto } from '../gigs/serialize.js';
import { inTransaction, isUuid, requireGigDetail, yearDateRange } from '../gigs/store.js';
import { AppError, parseInput, validationError, type FieldCode } from '../http/errors.js';
import { newShareToken } from '../offers/shareToken.js';
import {
  assertOfferNotDeleted,
  convertOfferInTx,
  loadOfferSettings,
  offerInclude,
  offerStatus,
  isExpired,
  offerGigDraft,
  offerYearSummary,
  requireConvertibleOffer,
  requireOffer,
  logOfferEvent,
  toOfferDetailDto,
  toOfferEventDto,
  toOfferSummaryDto,
} from '../offers/store.js';
import { computeOfferStats } from '../offers/stats.js';
import { loadActiveReferences } from '../references/store.js';
import { isUniqueViolation } from './budgetCategories.js';
import { loadFeeSettings } from './reference.js';

type IdParams = { Params: { id: string } };

export const LINEUP_MAX_ITEMS = 100;

/** Lineup: a list of strings, one item per line; items are trimmed and blank ones dropped. null = empty. */
const lineup = z.unknown().transform((value, ctx): string[] => {
  if (value === null) return [];
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    ctx.addIssue({ code: 'custom', message: 'INVALID_VALUE' });
    return z.NEVER;
  }
  const items = (value as string[]).map((item) => item.trim()).filter((item) => item !== '');
  if (items.some((item) => item.length > SHORT_TEXT_MAX)) {
    ctx.addIssue({ code: 'custom', message: 'TOO_LONG' });
    return z.NEVER;
  }
  if (items.length > LINEUP_MAX_ITEMS) {
    ctx.addIssue({ code: 'custom', message: 'INVALID_VALUE' });
    return z.NEVER;
  }
  return items;
});

/**
 * The Spotify link is a fixed constant (offers/constants.ts); offers have no such field. Sending it
 * (any value, null included) is rejected rather than silently ignored, so outdated clients notice.
 */
const spotifyUrl = z.never({ message: 'INVALID_VALUE' }).optional();

const reference = z.string().min(1);
const source = z.enum(OFFER_SOURCES, { message: 'INVALID_VALUE' }).nullable();
const eventType = z.enum(EVENT_TYPES, { message: 'INVALID_VALUE' }).nullable();
const disposition = oneOf(OFFER_DISPOSITIONS);

const createBody = z.object({
  clientId: reference,
  eventName: requiredText(),
  eventDate: isoDate,
  venue: requiredText(),
  city: optionalText(),
  lineup: lineup.optional(),
  includesText: optionalText(LONG_TEXT_MAX),
  spotifyUrl,
  showReferences: flag.optional(),
  priceCents: money.nullable().optional(),
  sellerId: reference.optional(),
  source: source.optional(),
  eventType: eventType.optional(),
});

const updateBody = z.object({
  clientId: reference.optional(),
  eventName: requiredText().optional(),
  eventDate: isoDate.optional(),
  venue: requiredText().optional(),
  city: optionalText(),
  lineup: lineup.optional(),
  includesText: optionalText(LONG_TEXT_MAX),
  spotifyUrl,
  showReferences: flag.optional(),
  priceCents: money.nullable().optional(),
  sellerId: reference.optional(),
  source: source.optional(),
  eventType: eventType.optional(),
  disposition: disposition.optional(),
});

/** Editable fields other than disposition, in the order they are logged in UPDATED. */
const UPDATE_FIELDS = [
  'clientId',
  'eventName',
  'eventDate',
  'venue',
  'city',
  'lineup',
  'includesText',
  'showReferences',
  'priceCents',
  'sellerId',
  'source',
  'eventType',
] as const;

const OFFER_STATUS_FILTERS = ['OPEN', 'ACCEPTED', 'REJECTED', 'EXPIRED'] as const;

const listQuery = z.object({
  year: yearString,
  q: z.string().max(SHORT_TEXT_MAX).optional(),
  status: z.enum(OFFER_STATUS_FILTERS, { message: 'INVALID_VALUE' }).optional(),
  sellerId: z.string().refine(isUuid, { message: 'INVALID_VALUE' }).optional(),
  disposition: disposition.optional(),
  eventType: z.enum(EVENT_TYPES, { message: 'INVALID_VALUE' }).optional(),
  source: z.enum(OFFER_SOURCES, { message: 'INVALID_VALUE' }).optional(),
  deleted: z.enum(['true', 'false'], { message: 'INVALID_VALUE' }).optional(),
});

function throwIfAny(fields: Record<string, FieldCode>): void {
  if (Object.keys(fields).length > 0) throw validationError(fields);
}

function sameValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

const alreadyConverted = () => new AppError('ALREADY_CONVERTED', 'The offer already has a gig');

export function offerRoutes(app: FastifyInstance, deps: AppDeps): void {
  const { db } = deps;

  /** BR-111: new seller choices must be active partners. */
  const partnerExists = async (id: string) =>
    isUuid(id) && (await db.partner.count({ where: { id, active: true } })) > 0;

  const detail = async (id: string) =>
    toOfferDetailDto(await requireOffer(db, id), todayIso(), await loadActiveReferences(db));

  // ---------------------------------------------------------------- list (+ BR-106 summary)
  app.get('/api/offers', async (request) => {
    const query = parseInput(listQuery, request.query);
    const today = todayIso();
    const offers = await db.offer.findMany({
      where: { eventDate: yearDateRange(query.year) },
      include: offerInclude,
      orderBy: [{ eventDate: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
    });
    // The summary ignores every filter except the year (BR-106).
    const summary = offerYearSummary(
      offers.filter((o) => o.deletedAt === null),
      today,
    );

    const q = query.q?.trim().toLowerCase();
    const filtered = offers.filter((o) => {
      if (query.deleted === 'true' ? o.deletedAt === null : o.deletedAt !== null) return false;
      if (query.status === 'EXPIRED' ? !isExpired(o, today) : query.status && offerStatus(o.disposition) !== query.status)
        return false;
      if (query.sellerId && o.sellerId !== query.sellerId) return false;
      if (query.disposition && o.disposition !== query.disposition) return false;
      if (query.eventType && o.eventType !== query.eventType) return false;
      if (query.source && o.source !== query.source) return false;
      if (q && ![o.eventName, o.client.name, o.venue, o.city ?? ''].some((s) => s.toLowerCase().includes(q))) return false;
      return true;
    });
    return { offers: filtered.map((o) => toOfferSummaryDto(o, today)), summary };
  });

  // ---------------------------------------------------------------- KPI card statistics (BR-122)
  app.get('/api/offers/stats', async (request) => {
    // Contract: a missing or invalid year is INVALID_VALUE (not REQUIRED).
    const year = (request.query as Record<string, unknown> | undefined)?.year;
    if (typeof year !== 'string' || !/^\d{4}$/.test(year)) throw validationError({ year: 'INVALID_VALUE' });
    // All years, non-deleted; only the columns the figures need.
    const rows = await db.offer.findMany({
      where: { deletedAt: null },
      select: { disposition: true, eventDate: true, priceCents: true, eventType: true, createdAt: true },
    });
    return computeOfferStats(rows, Number(year));
  });

  // ---------------------------------------------------------------- create
  app.post('/api/offers', async (request, reply) => {
    const me = request.requirePartner();
    const body = parseInput(createBody, request.body);

    const fields: Record<string, FieldCode> = {};
    if (!(await findActiveClient(db, body.clientId))) fields.clientId = 'UNKNOWN_REFERENCE';
    const sellerId = body.sellerId ?? me.id;
    if (body.sellerId !== undefined && !(await partnerExists(body.sellerId))) fields.sellerId = 'UNKNOWN_REFERENCE';
    throwIfAny(fields);

    const settings = await loadOfferSettings(db);
    const token = newShareToken();
    const id = await inTransaction(db, async (tx) => {
      if (!(await lockActiveClient(tx, body.clientId))) throw validationError({ clientId: 'UNKNOWN_REFERENCE' });
      const offer = await tx.offer.create({
        data: {
          clientId: body.clientId,
          eventName: body.eventName,
          eventDate: dateFromIso(body.eventDate),
          venue: body.venue,
          city: body.city ?? null,
          lineup: body.lineup ?? [],
          // Omitted → default from settings; an explicit null / blank stays empty.
          includesText: body.includesText === undefined ? settings.defaultIncludes : body.includesText,
          showReferences: body.showReferences ?? false,
          priceCents: body.priceCents ?? null,
          sellerId,
          source: body.source ?? null,
          eventType: body.eventType ?? null,
          shareToken: token.token,
          shareTokenHash: token.hash,
        },
      });
      await logOfferEvent(tx, { offerId: offer.id, type: 'CREATED', partnerId: me.id });
      return offer.id;
    });
    return reply.status(201).send(await detail(id));
  });

  // ---------------------------------------------------------------- read
  app.get<IdParams>('/api/offers/:id', async (request) => detail(request.params.id));

  app.get<IdParams>('/api/offers/:id/history', async (request) => {
    const offer = await requireOffer(db, request.params.id);
    const events = await db.offerEvent.findMany({
      where: { offerId: offer.id },
      orderBy: [{ at: 'desc' }, { seq: 'desc' }],
    });
    return events.map(toOfferEventDto);
  });

  // ---------------------------------------------------------------- update (BR-103)
  app.patch<IdParams>('/api/offers/:id', async (request) => {
    const me = request.requirePartner();
    const body = parseInput(updateBody, request.body);
    const offer = await requireOffer(db, request.params.id);

    const fields: Record<string, FieldCode> = {};
    if (body.clientId !== undefined && body.clientId !== offer.clientId && !(await findActiveClient(db, body.clientId)))
      fields.clientId = 'UNKNOWN_REFERENCE';
    if (body.sellerId !== undefined && body.sellerId !== offer.sellerId && !(await partnerExists(body.sellerId)))
      fields.sellerId = 'UNKNOWN_REFERENCE';
    throwIfAny(fields);
    assertOfferNotDeleted(offer);

    // Current values in request form (dates as YYYY-MM-DD) so old → new compares and logs cleanly.
    const current: Record<(typeof UPDATE_FIELDS)[number], unknown> = {
      clientId: offer.clientId,
      eventName: offer.eventName,
      eventDate: isoFromDate(offer.eventDate),
      venue: offer.venue,
      city: offer.city,
      lineup: offer.lineup,
      includesText: offer.includesText,
      showReferences: offer.showReferences,
      priceCents: offer.priceCents,
      sellerId: offer.sellerId,
      source: offer.source,
      eventType: offer.eventType,
    };
    const changes: { field: string; from: unknown; to: unknown }[] = [];
    const data: Prisma.OfferUncheckedUpdateInput = {};
    for (const field of UPDATE_FIELDS) {
      const next = body[field];
      if (next === undefined || sameValue(current[field], next)) continue;
      changes.push({ field, from: current[field], to: next });
      (data as Record<string, unknown>)[field] = field === 'eventDate' ? dateFromIso(next as string) : next;
    }
    const dispositionChange =
      body.disposition !== undefined && body.disposition !== offer.disposition
        ? { from: offer.disposition, to: body.disposition }
        : null;
    if (dispositionChange) data.disposition = dispositionChange.to;

    if (changes.length > 0 || dispositionChange) {
      await inTransaction(db, async (tx) => {
        if (typeof data.clientId === 'string' && !(await lockActiveClient(tx, data.clientId)))
          throw validationError({ clientId: 'UNKNOWN_REFERENCE' });
        await tx.offer.update({ where: { id: offer.id }, data });
        if (changes.length > 0) {
          await logOfferEvent(tx, {
            offerId: offer.id,
            type: 'UPDATED',
            partnerId: me.id,
            details: { changes: changes as Prisma.InputJsonArray },
          });
        }
        if (dispositionChange) {
          await logOfferEvent(tx, { offerId: offer.id, type: 'DISPOSITION_CHANGED', partnerId: me.id, details: dispositionChange });
        }
      });
    }
    return detail(offer.id);
  });

  // ---------------------------------------------------------------- regenerate public link (BR-104)
  app.post<IdParams>('/api/offers/:id/regenerate-link', async (request) => {
    const me = request.requirePartner();
    const offer = await requireOffer(db, request.params.id);
    assertOfferNotDeleted(offer);
    const token = newShareToken();
    await inTransaction(db, async (tx) => {
      await tx.offer.update({ where: { id: offer.id }, data: { shareToken: token.token, shareTokenHash: token.hash } });
      // The token itself is never written to the history.
      await logOfferEvent(tx, { offerId: offer.id, type: 'LINK_REGENERATED', partnerId: me.id });
    });
    return detail(offer.id);
  });

  // ---------------------------------------------------------------- convert to gig (BR-105)
  app.get<IdParams>('/api/offers/:id/gig-draft', async (request) => {
    const me = request.requirePartner();
    const offer = await requireConvertibleOffer(db, request.params.id);
    const { draft } = await offerGigDraft(db, offer, me.id);
    // A deleted client cannot be linked to a new gig (UNKNOWN_REFERENCE), so the draft leaves it
    // empty and the prefilled form submits cleanly (PM decision 2026-10-20). Convert without a
    // body is unchanged.
    return { ...draft, clientId: offer.client.deletedAt ? null : draft.clientId };
  });

  app.post<IdParams>('/api/offers/:id/convert', async (request, reply) => {
    const me = request.requirePartner();
    const offer = await requireConvertibleOffer(db, request.params.id);
    // Optional body: an edited GigCreate (the prefilled form), validated exactly as POST /api/gigs.
    // No body (or JSON null) → the BR-105 prefill as is.
    const gig =
      request.body === undefined || request.body === null ? undefined : await prepareGigCreate(db, request.body);

    const fees = await loadFeeSettings(db);
    let gigId: string;
    try {
      ({ gigId } = await inTransaction(db, (tx) => convertOfferInTx(tx, { offerId: offer.id, partnerId: me.id, fees, gig })));
    } catch (err) {
      // A concurrent conversion that slipped past the row lock still hits the unique gig.offer_id.
      if (isUniqueViolation(err)) throw alreadyConverted();
      throw err;
    }
    const today = todayIso();
    return reply.status(201).send({
      offer: toOfferDetailDto(await requireOffer(db, offer.id), today, await loadActiveReferences(db)),
      gig: toGigDetailDto(await requireGigDetail(db, gigId), today),
    });
  });

  // ---------------------------------------------------------------- delete / restore (soft)
  app.post<IdParams>('/api/offers/:id/delete', async (request, reply) => {
    const me = request.requirePartner();
    const offer = await requireOffer(db, request.params.id);
    assertOfferNotDeleted(offer);
    await inTransaction(db, async (tx) => {
      await tx.offer.update({ where: { id: offer.id }, data: { deletedAt: new Date() } });
      await logOfferEvent(tx, { offerId: offer.id, type: 'DELETED', partnerId: me.id });
    });
    return reply.status(204).send();
  });

  app.post<IdParams>('/api/offers/:id/restore', async (request) => {
    const me = request.requirePartner();
    const offer = await requireOffer(db, request.params.id);
    if (!offer.deletedAt) throw new AppError('INVALID_STATUS_TRANSITION', 'Offer is not deleted');
    await inTransaction(db, async (tx) => {
      await tx.offer.update({ where: { id: offer.id }, data: { deletedAt: null } });
      await logOfferEvent(tx, { offerId: offer.id, type: 'RESTORED', partnerId: me.id });
    });
    return detail(offer.id);
  });
}
