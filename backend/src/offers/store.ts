/**
 * Offer data access, derived values and serializers (docs/api-contract.md "Offers", "Public offer";
 * UC-028…UC-031, BR-102…BR-106).
 */
import { isoFromDate, todayIso } from '../domain/dates.js';
import { OFFER_SETTING_KEYS } from '../domain/enums.js';
import type { Offer, OfferDisposition, OfferEvent, OfferEventType, Prisma } from '../generated/prisma/client.js';
import { insertEvent, type EventCreateInput, type EventFees, type PreparedEvent } from '../events/create.js';
import { isUuid, type Tx } from '../events/store.js';
import { AppError, notFound } from '../http/errors.js';
import { imageVersion, publicReferenceImageUrl, type PublicReferenceSource } from '../references/store.js';
import { SPOTIFY_URL } from './constants.js';
import { sharePath } from './shareToken.js';

/** What the offer serializers need: client name, converted event id and the seller's public contact. */
export const offerInclude = {
  client: { select: { name: true } },
  event: { select: { id: true } },
  seller: { select: { email: true, phone: true, person: { select: { name: true } } } },
} as const satisfies Prisma.OfferInclude;

export type OfferWithRefs = Offer & {
  client: { name: string };
  event: { id: string } | null;
  seller: { email: string; phone: string | null; person: { name: string } };
};

export type OfferStatus = 'OPEN' | 'ACCEPTED' | 'REJECTED';

/** BR-102: PENDING → OPEN, WON → ACCEPTED, anything else → REJECTED. */
export function offerStatus(disposition: OfferDisposition): OfferStatus {
  if (disposition === 'PENDING') return 'OPEN';
  if (disposition === 'WON') return 'ACCEPTED';
  return 'REJECTED';
}

/** BR-102: expired = OPEN and the event date is before today (Europe/Helsinki). */
export function isExpired(offer: { disposition: OfferDisposition; eventDate: Date }, today: string): boolean {
  return offerStatus(offer.disposition) === 'OPEN' && isoFromDate(offer.eventDate) < today;
}

export function toOfferSummaryDto(offer: OfferWithRefs, today: string) {
  return {
    id: offer.id,
    clientId: offer.clientId,
    clientName: offer.client.name,
    eventName: offer.eventName,
    eventDate: isoFromDate(offer.eventDate),
    venue: offer.venue,
    city: offer.city,
    priceCents: offer.priceCents,
    sellerId: offer.sellerId,
    source: offer.source,
    eventType: offer.eventType,
    disposition: offer.disposition,
    status: offerStatus(offer.disposition),
    expired: isExpired(offer, today),
    eventId: offer.event?.id ?? null,
    createdAt: offer.createdAt.toISOString(),
    updatedAt: offer.updatedAt.toISOString(),
    deletedAt: offer.deletedAt?.toISOString() ?? null,
  };
}

export type OfferSummaryDto = ReturnType<typeof toOfferSummaryDto>;

/**
 * Contract `PublicOffer` (BR-104): the ONLY shape the public endpoint returns, and `OfferDetail.preview`.
 * Built field by field from an explicit whitelist — never spread an offer row in here: price,
 * disposition, source, event type, event, ids and the token must never reach the customer.
 */
export interface PublicOfferDto {
  eventName: string;
  clientName: string;
  eventDate: string;
  venue: string;
  city: string | null;
  lineup: string[];
  includesText: string | null;
  /** Always SPOTIFY_URL (one fixed link for all offers). */
  spotifyUrl: string;
  references: PublicReferenceDto[] | null;
  seller: { name: string; email: string; phone: string | null };
}

/** One reference on the public offer (BR-108); both quotes are sent, the page falls back EN → FI. */
export interface PublicReferenceDto {
  id: string;
  quote: { fi: string; en: string | null };
  author: string;
  imageUrl: string | null;
}

/**
 * `references` = the active references in order (loadActiveReferences) — shown only when the offer
 * has showReferences. Photo URLs are scoped to this offer's token (BR-108).
 */
export function toPublicOfferDto(offer: OfferWithRefs, references: readonly PublicReferenceSource[]): PublicOfferDto {
  return {
    eventName: offer.eventName,
    clientName: offer.client.name,
    eventDate: isoFromDate(offer.eventDate),
    venue: offer.venue,
    city: offer.city,
    lineup: [...offer.lineup],
    includesText: offer.includesText,
    spotifyUrl: SPOTIFY_URL,
    references: offer.showReferences
      ? references.map((r) => {
          const version = r.imageStorageKey ? imageVersion(r) : null;
          return {
            id: r.id,
            quote: { fi: r.quoteFi, en: r.quoteEn },
            author: r.author,
            imageUrl: version ? publicReferenceImageUrl(offer.shareToken, r.id, version) : null,
          };
        })
      : null,
    seller: { name: offer.seller.person.name, email: offer.seller.email, phone: offer.seller.phone },
  };
}

export function toOfferDetailDto(offer: OfferWithRefs, today: string, references: readonly PublicReferenceSource[]) {
  return {
    ...toOfferSummaryDto(offer, today),
    lineup: [...offer.lineup],
    includesText: offer.includesText,
    showReferences: offer.showReferences,
    sharePath: sharePath(offer.shareToken),
    preview: toPublicOfferDto(offer, references),
  };
}

export type OfferDetailDto = ReturnType<typeof toOfferDetailDto>;

export function toOfferEventDto(e: OfferEvent) {
  return { id: e.id, offerId: e.offerId, type: e.type, partnerId: e.partnerId, at: e.at.toISOString(), details: e.details };
}

/** Year figures (BR-106) over the non-deleted offers whose event date is in the year. */
export function offerYearSummary(offers: readonly Pick<Offer, 'disposition' | 'eventDate' | 'priceCents'>[], today: string) {
  let openValueCents = 0;
  let wonCount = 0;
  let decidedCount = 0;
  for (const o of offers) {
    if (offerStatus(o.disposition) === 'OPEN' && !isExpired(o, today)) openValueCents += o.priceCents ?? 0;
    if (o.disposition !== 'PENDING' && o.disposition !== 'CANCELLED') decidedCount++;
    if (o.disposition === 'WON') wonCount++;
  }
  const winRatePct = decidedCount === 0 ? null : Math.round((wonCount / decidedCount) * 1000) / 10;
  return { openValueCents, winRatePct, wonCount, decidedCount };
}

export async function loadOffer(db: Tx, id: string): Promise<OfferWithRefs | null> {
  if (!isUuid(id)) return null;
  return db.offer.findUnique({ where: { id }, include: offerInclude });
}

export async function requireOffer(db: Tx, id: string): Promise<OfferWithRefs> {
  const offer = await loadOffer(db, id);
  if (!offer) throw notFound('Offer not found');
  return offer;
}

/** Changing a deleted offer is not allowed (except restore). */
export function assertOfferNotDeleted(offer: { deletedAt: Date | null }): void {
  if (offer.deletedAt) throw new AppError('INVALID_STATUS_TRANSITION', 'The offer is deleted');
}

/** Append one offer history event (BR-103). History is never edited or deleted. */
export async function logOfferEvent(
  tx: Tx,
  event: { offerId: string; type: OfferEventType; partnerId: string; details?: Prisma.InputJsonObject },
): Promise<void> {
  await tx.offerEvent.create({
    data: { offerId: event.offerId, type: event.type, partnerId: event.partnerId, details: event.details ?? {} },
  });
}

export interface OfferSettings {
  defaultIncludes: string | null;
}

/** Current offer text settings; a missing or blank key is null. */
export async function loadOfferSettings(db: Tx): Promise<OfferSettings> {
  const rows = await db.setting.findMany({ where: { key: { in: Object.values(OFFER_SETTING_KEYS) } } });
  // Texts are kept as written (line breaks included); a blank value counts as missing.
  const value = (key: string) => {
    const text = rows.find((r) => r.key === key)?.valueText;
    return text && text.trim() !== '' ? text : null;
  };
  return {
    defaultIncludes: value(OFFER_SETTING_KEYS.defaultIncludes),
  };
}

/** The offer fields the BR-105 event prefill reads. */
type DraftSource = Pick<Offer, 'eventDate' | 'eventName' | 'venue' | 'city' | 'priceCents' | 'clientId' | 'sellerId'> & {
  seller: { active: boolean; personId: string };
};

/**
 * The event a conversion prefills (BR-105) as a EventCreate: start date = event date, custom lineup
 * named after the event, venue "venue, city", client, price (0 if empty), seller and producer =
 * offer seller. BR-111: a removed (inactive) partner is never chosen for a new event, so if the
 * offer's seller has been removed, the converting partner is used instead.
 */
export async function offerEventDraft(
  tx: Tx,
  offer: DraftSource,
  callerPartnerId: string,
): Promise<{ draft: EventCreateInput & { clientId: string }; partnerPersonId: string }> {
  const partner = offer.seller.active
    ? { id: offer.sellerId, personId: offer.seller.personId }
    : await tx.partner.findUniqueOrThrow({ where: { id: callerPartnerId }, select: { id: true, personId: true } });
  return {
    draft: {
      startDate: isoFromDate(offer.eventDate),
      endDate: null,
      lineupTemplateId: null,
      lineupName: offer.eventName,
      venue: offer.city ? `${offer.venue}, ${offer.city}` : offer.venue,
      technicalSetup: null,
      logistics: null,
      houseTechnician: false,
      sellerId: partner.id,
      producerId: partner.id,
      priceCents: offer.priceCents ?? 0,
      additionalSalesCents: 0,
      additionalSalesDescription: null,
      notes: null,
      clientId: offer.clientId,
    },
    partnerPersonId: partner.personId,
  };
}

/**
 * The offer behind a conversion: 404 unknown, 409 INVALID_STATUS_TRANSITION deleted, 409
 * ALREADY_CONVERTED, then BR-109: 409 OFFER_NOT_CONVERTIBLE unless the offer is WON (ACCEPTED)
 * and its event date is today or later (Europe/Helsinki). `historical: true` (seed/import
 * `converted: true`) skips the BR-109 check.
 */
export async function requireConvertibleOffer(tx: Tx, offerId: string, options: { historical?: boolean } = {}) {
  const offer = isUuid(offerId)
    ? await tx.offer.findUnique({
        where: { id: offerId },
        include: {
          event: { select: { id: true } },
          seller: { select: { personId: true, active: true } },
          client: { select: { deletedAt: true } },
        },
      })
    : null;
  if (!offer) throw notFound('Offer not found');
  assertOfferNotDeleted(offer);
  if (offer.event) throw new AppError('ALREADY_CONVERTED', 'The offer already has an event');
  if (!options.historical && (offer.disposition !== 'WON' || isoFromDate(offer.eventDate) < todayIso()))
    throw new AppError('OFFER_NOT_CONVERTIBLE', 'Only an accepted offer whose event date is today or later can be converted');
  return offer;
}

/**
 * Convert an offer to an event (BR-105) inside the caller's transaction. The offer row is locked
 * first, so concurrent conversions of the same offer run one after the other and the second one
 * sees the first one's event (409 ALREADY_CONVERTED). The unique event.offer_id is the last line of
 * defence; callers map its unique violation to ALREADY_CONVERTED as well.
 *
 * `event` = a EventCreate already validated by `prepareEventCreate` (the edited form); without it the
 * event is created from the BR-105 prefill as is. `historical: true` (seed/import `converted: true`)
 * is exempt from BR-109 and may convert any offer, e.g. an open or past one.
 */
export async function convertOfferInTx(
  tx: Prisma.TransactionClient,
  input: { offerId: string; partnerId: string; fees: EventFees; event?: PreparedEvent; historical?: boolean },
): Promise<{ eventId: string }> {
  const locked = await tx.$queryRaw<{ id: string }[]>`
    SELECT "id"::text FROM "offer" WHERE "id" = ${input.offerId}::uuid FOR UPDATE`;
  if (locked.length === 0) throw notFound('Offer not found');

  const offer = await requireConvertibleOffer(tx, input.offerId, { historical: input.historical });

  let event = input.event;
  if (!event) {
    const { draft, partnerPersonId } = await offerEventDraft(tx, offer, input.partnerId);
    event = { input: draft, template: null, sellerPersonId: partnerPersonId, producerPersonId: partnerPersonId };
  }
  const eventId = await insertEvent(tx, event, { partnerId: input.partnerId, fees: input.fees, offerId: offer.id });

  if (offer.disposition !== 'WON') {
    await tx.offer.update({ where: { id: offer.id }, data: { disposition: 'WON' } });
    await logOfferEvent(tx, {
      offerId: offer.id,
      type: 'DISPOSITION_CHANGED',
      partnerId: input.partnerId,
      details: { from: offer.disposition, to: 'WON' },
    });
  } else {
    // Touch updatedAt: the offer gained an event.
    await tx.offer.update({ where: { id: offer.id }, data: { updatedAt: new Date() } });
  }
  await logOfferEvent(tx, { offerId: offer.id, type: 'CONVERTED', partnerId: input.partnerId, details: { eventId } });
  return { eventId };
}
