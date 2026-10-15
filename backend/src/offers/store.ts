/**
 * Offer data access, derived values and serializers (docs/api-contract.md "Offers", "Public offer";
 * UC-028…UC-031, BR-102…BR-106).
 */
import { defaultCostLines } from '../domain/costLines.js';
import { isoFromDate } from '../domain/dates.js';
import { OFFER_SETTING_KEYS } from '../domain/enums.js';
import type { Offer, OfferDisposition, OfferEvent, OfferEventType, Prisma } from '../generated/prisma/client.js';
import { isUuid, logEvent, type Tx } from '../gigs/store.js';
import { AppError, notFound } from '../http/errors.js';
import { imageVersion, publicReferenceImageUrl, type PublicReferenceSource } from '../references/store.js';
import type { FeeSettings } from '../routes/reference.js';
import { SPOTIFY_URL } from './constants.js';
import { sharePath } from './shareToken.js';

/** What the offer serializers need: client name, converted gig id and the seller's public contact. */
export const offerInclude = {
  client: { select: { name: true } },
  gig: { select: { id: true } },
  seller: { select: { email: true, phone: true, person: { select: { name: true } } } },
} as const satisfies Prisma.OfferInclude;

export type OfferWithRefs = Offer & {
  client: { name: string };
  gig: { id: string } | null;
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
    gigId: offer.gig?.id ?? null,
    createdAt: offer.createdAt.toISOString(),
    updatedAt: offer.updatedAt.toISOString(),
    deletedAt: offer.deletedAt?.toISOString() ?? null,
  };
}

export type OfferSummaryDto = ReturnType<typeof toOfferSummaryDto>;

/**
 * Contract `PublicOffer` (BR-104): the ONLY shape the public endpoint returns, and `OfferDetail.preview`.
 * Built field by field from an explicit whitelist — never spread an offer row in here: price,
 * disposition, source, event type, gig, ids and the token must never reach the customer.
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

/**
 * Convert an offer to a gig (BR-105) inside the caller's transaction. The offer row is locked
 * first, so concurrent conversions of the same offer run one after the other and the second one
 * sees the first one's gig (409 ALREADY_CONVERTED). The unique gig.offer_id is the last line of
 * defence; callers map its unique violation to ALREADY_CONVERTED as well.
 */
export async function convertOfferInTx(
  tx: Prisma.TransactionClient,
  input: { offerId: string; partnerId: string; fees: Pick<FeeSettings, 'officeDefaultCents' | 'salesDefaultCents' | 'productionDefaultCents'> },
): Promise<{ gigId: string }> {
  const locked = await tx.$queryRaw<{ id: string }[]>`
    SELECT "id"::text FROM "offer" WHERE "id" = ${input.offerId}::uuid FOR UPDATE`;
  if (locked.length === 0) throw notFound('Offer not found');

  const offer = await tx.offer.findUniqueOrThrow({
    where: { id: input.offerId },
    include: { gig: { select: { id: true } }, seller: { select: { personId: true, active: true } } },
  });
  assertOfferNotDeleted(offer);
  if (offer.gig) throw new AppError('ALREADY_CONVERTED', 'The offer already has a gig');

  // BR-111: a removed (inactive) partner is never chosen for a new gig. If the offer's seller has
  // been removed, the partner doing the conversion becomes the gig's seller and producer.
  const gigPartner = offer.seller.active
    ? { id: offer.sellerId, personId: offer.seller.personId }
    : await tx.partner.findUniqueOrThrow({ where: { id: input.partnerId }, select: { id: true, personId: true } });

  const lines = defaultCostLines({
    templateRoles: [],
    sellerPersonId: gigPartner.personId,
    producerPersonId: gigPartner.personId,
    fees: input.fees,
  });
  const createdBase = Date.now();
  const gig = await tx.gig.create({
    data: {
      startDate: offer.eventDate,
      endDate: null,
      lineupTemplateId: null,
      lineupName: offer.eventName,
      venue: offer.city ? `${offer.venue}, ${offer.city}` : offer.venue,
      sellerId: gigPartner.id,
      producerId: gigPartner.id,
      priceCents: offer.priceCents ?? 0,
      clientId: offer.clientId,
      offerId: offer.id,
      // Explicit, increasing creation times keep the lines in creation order (contract).
      costLines: { createMany: { data: lines.map((l, i) => ({ ...l, createdAt: new Date(createdBase + i) })) } },
    },
  });
  await logEvent(tx, { gigId: gig.id, type: 'CREATED', partnerId: input.partnerId });

  if (offer.disposition !== 'WON') {
    await tx.offer.update({ where: { id: offer.id }, data: { disposition: 'WON' } });
    await logOfferEvent(tx, {
      offerId: offer.id,
      type: 'DISPOSITION_CHANGED',
      partnerId: input.partnerId,
      details: { from: offer.disposition, to: 'WON' },
    });
  } else {
    // Touch updatedAt: the offer gained a gig.
    await tx.offer.update({ where: { id: offer.id }, data: { updatedAt: new Date() } });
  }
  await logOfferEvent(tx, { offerId: offer.id, type: 'CONVERTED', partnerId: input.partnerId, details: { gigId: gig.id } });
  return { gigId: gig.id };
}
