// In-memory mock of the offers domain (docs/api-contract.md → Offers, Public offer; BR-102…BR-106).
// Pure functions over `OfferState`; the handlers (offerHandlers.ts, publicOfferHandlers.ts) pass in
// clients and partners. Synthetic data only (BR-090). Does not import mocks/data.ts (no cycle).
import type { OfferDisposition, OfferEventType, OfferHistoryType, OfferSource, OfferStatus } from '../api/enums';
import type {
  FieldChange,
  Id,
  IsoDate,
  OfferDetail,
  OfferEvent,
  OfferEventDetails,
  OfferSummary,
  OfferYearSummary,
  Partner,
  PublicOffer,
} from '../api/types';
import { todayIso } from '../lib/format';
import { mockId, nowTs, type MockClient } from './gigStore';

/** Full offer record, including the internal fields the public endpoint must never return. */
export interface MockOffer {
  id: Id;
  clientId: Id;
  eventName: string;
  eventDate: IsoDate;
  venue: string;
  city: string | null;
  lineup: string[];
  includesText: string | null;
  spotifyUrl: string | null;
  showReferences: boolean;
  priceCents: number | null;
  sellerId: Id;
  source: OfferSource | null;
  eventType: OfferEventType | null;
  disposition: OfferDisposition;
  gigId: Id | null;
  shareToken: string;
  /** Internal note: not in the contract objects; only here to prove the public whitelist. */
  internalNote: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

/** Settings `offers.*` (local seed in the real app) and the partners' phone numbers. */
export interface OfferSettings {
  defaultIncludes: string;
  defaultSpotifyUrl: string;
  referencesFi: string;
  referencesEn: string;
  /** Partner id → phone shown as seller contact (domain model: Partner.phone). */
  partnerPhones: Record<Id, string | null>;
}

export interface OfferState {
  offers: MockOffer[];
  events: OfferEvent[];
  settings: OfferSettings;
}

/** What the store needs from the rest of the mock backend. */
export interface OfferContext {
  clients: MockClient[];
  partners: Partner[];
}

// ---------- Derived values (BR-102, BR-106) ----------

export function statusOf(disposition: OfferDisposition): OfferStatus {
  if (disposition === 'PENDING') return 'OPEN';
  if (disposition === 'WON') return 'ACCEPTED';
  return 'REJECTED';
}

export function isExpired(offer: Pick<MockOffer, 'disposition' | 'eventDate'>, today = todayIso()): boolean {
  return statusOf(offer.disposition) === 'OPEN' && offer.eventDate < today;
}

export function toOfferSummary(offer: MockOffer, ctx: OfferContext, today = todayIso()): OfferSummary {
  return {
    id: offer.id,
    clientId: offer.clientId,
    clientName: ctx.clients.find((c) => c.id === offer.clientId)?.name ?? '',
    eventName: offer.eventName,
    eventDate: offer.eventDate,
    venue: offer.venue,
    city: offer.city,
    priceCents: offer.priceCents,
    sellerId: offer.sellerId,
    source: offer.source,
    eventType: offer.eventType,
    disposition: offer.disposition,
    status: statusOf(offer.disposition),
    expired: isExpired(offer, today),
    gigId: offer.gigId,
    createdAt: offer.createdAt,
    updatedAt: offer.updatedAt,
    deletedAt: offer.deletedAt,
  };
}

/** The customer view (BR-104) built from the full record. Filtered once more by `toPublicOffer`. */
export function toPublicView(state: OfferState, offer: MockOffer, ctx: OfferContext): PublicOffer {
  const seller = ctx.partners.find((p) => p.id === offer.sellerId);
  const { settings } = state;
  return {
    eventName: offer.eventName,
    clientName: ctx.clients.find((c) => c.id === offer.clientId)?.name ?? '',
    eventDate: offer.eventDate,
    venue: offer.venue,
    city: offer.city,
    lineup: [...offer.lineup],
    includesText: offer.includesText,
    spotifyUrl: offer.spotifyUrl,
    references: offer.showReferences ? { fi: settings.referencesFi, en: settings.referencesEn } : null,
    seller: {
      name: seller?.name ?? '',
      email: seller?.email ?? '',
      phone: settings.partnerPhones[offer.sellerId] ?? null,
    },
  };
}

/** The contract's whitelist for `GET /api/public/offers/{token}`: exactly these fields. */
export function toPublicOffer(offer: PublicOffer): PublicOffer {
  return {
    eventName: offer.eventName,
    clientName: offer.clientName,
    eventDate: offer.eventDate,
    venue: offer.venue,
    city: offer.city,
    lineup: [...offer.lineup],
    includesText: offer.includesText,
    spotifyUrl: offer.spotifyUrl,
    references: offer.references ? { fi: offer.references.fi, en: offer.references.en } : null,
    seller: { name: offer.seller.name, email: offer.seller.email, phone: offer.seller.phone },
  };
}

export function toOfferDetail(state: OfferState, offer: MockOffer, ctx: OfferContext): OfferDetail {
  return {
    ...toOfferSummary(offer, ctx),
    lineup: [...offer.lineup],
    includesText: offer.includesText,
    spotifyUrl: offer.spotifyUrl,
    showReferences: offer.showReferences,
    sharePath: `/o/${offer.shareToken}`,
    preview: toPublicOffer(toPublicView(state, offer, ctx)),
  };
}

/** BR-106 over the non-deleted offers whose event date is in `year`. */
export function offerYearSummary(state: OfferState, year: number, today = todayIso()): OfferYearSummary {
  const offers = state.offers.filter((o) => o.deletedAt === null && o.eventDate.startsWith(`${year}-`));
  const openValueCents = offers
    .filter((o) => statusOf(o.disposition) === 'OPEN' && !isExpired(o, today))
    .reduce((sum, o) => sum + (o.priceCents ?? 0), 0);
  const decided = offers.filter((o) => o.disposition !== 'PENDING' && o.disposition !== 'CANCELLED');
  const wonCount = decided.filter((o) => o.disposition === 'WON').length;
  return {
    openValueCents,
    winRatePct: decided.length === 0 ? null : Math.round((wonCount / decided.length) * 1000) / 10,
    wonCount,
    decidedCount: decided.length,
  };
}

// ---------- Tokens and history ----------

/** URL-safe token from 32 random bytes (BR-104). */
export function newShareToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function logOfferEvent(
  state: OfferState,
  offerId: Id,
  type: OfferHistoryType,
  partnerId: Id,
  details: OfferEventDetails = {},
): void {
  state.events.push({ id: mockId(), offerId, type, partnerId, at: nowTs(), details });
}

// ---------- Mutations ----------

export interface NewOfferInput {
  clientId: Id;
  eventName: string;
  eventDate: IsoDate;
  venue: string;
  city: string | null;
  lineup: string[];
  includesText: string | null;
  spotifyUrl: string | null;
  showReferences: boolean;
  priceCents: number | null;
  sellerId: Id;
  source: OfferSource | null;
  eventType: OfferEventType | null;
  disposition?: OfferDisposition;
  shareToken?: string;
  internalNote?: string | null;
}

export function createOffer(state: OfferState, input: NewOfferInput, actorId: Id): MockOffer {
  const ts = nowTs();
  const offer: MockOffer = {
    id: mockId(),
    clientId: input.clientId,
    eventName: input.eventName,
    eventDate: input.eventDate,
    venue: input.venue,
    city: input.city,
    lineup: [...input.lineup],
    includesText: input.includesText,
    spotifyUrl: input.spotifyUrl,
    showReferences: input.showReferences,
    priceCents: input.priceCents,
    sellerId: input.sellerId,
    source: input.source,
    eventType: input.eventType,
    disposition: input.disposition ?? 'PENDING',
    gigId: null,
    shareToken: input.shareToken ?? newShareToken(),
    internalNote: input.internalNote ?? null,
    createdAt: ts,
    updatedAt: ts,
    deletedAt: null,
  };
  state.offers.push(offer);
  logOfferEvent(state, offer.id, 'CREATED', actorId);
  return offer;
}

export const OFFER_PATCH_FIELDS = [
  'clientId',
  'eventName',
  'eventDate',
  'venue',
  'city',
  'lineup',
  'includesText',
  'spotifyUrl',
  'showReferences',
  'priceCents',
  'sellerId',
  'source',
  'eventType',
] as const;
export type OfferPatchField = (typeof OFFER_PATCH_FIELDS)[number];
export type OfferPatch = Partial<Pick<MockOffer, OfferPatchField | 'disposition'>>;

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Applies a PATCH. Field changes are one UPDATED event; a disposition change is always its own
 * DISPOSITION_CHANGED event with old → new (BR-103). A no-op writes nothing.
 */
export function updateOffer(state: OfferState, offer: MockOffer, patch: OfferPatch, actorId: Id): void {
  const changes: FieldChange[] = [];
  for (const field of OFFER_PATCH_FIELDS) {
    const value = patch[field];
    if (value === undefined || same(offer[field], value)) continue;
    changes.push({ field, from: offer[field], to: value });
    (offer as unknown as Record<string, unknown>)[field] = value;
  }
  let dispositionChanged = false;
  if (patch.disposition !== undefined && patch.disposition !== offer.disposition) {
    logOfferEvent(state, offer.id, 'DISPOSITION_CHANGED', actorId, {
      from: offer.disposition,
      to: patch.disposition,
    });
    offer.disposition = patch.disposition;
    dispositionChanged = true;
  }
  if (changes.length > 0) logOfferEvent(state, offer.id, 'UPDATED', actorId, { changes });
  if (changes.length > 0 || dispositionChanged) offer.updatedAt = nowTs();
}

export function regenerateLink(state: OfferState, offer: MockOffer, actorId: Id): void {
  offer.shareToken = newShareToken();
  offer.updatedAt = nowTs();
  logOfferEvent(state, offer.id, 'LINK_REGENERATED', actorId);
}

/** BR-105 gig fields from the offer. The caller creates the gig and then calls `markConverted`. */
export function gigInputFromOffer(offer: MockOffer) {
  return {
    startDate: offer.eventDate,
    endDate: null,
    lineupTemplateId: null,
    lineupName: offer.eventName,
    venue: offer.city ? `${offer.venue}, ${offer.city}` : offer.venue,
    technicalSetup: null,
    logistics: null,
    houseTechnician: false,
    sellerId: offer.sellerId,
    producerId: offer.sellerId,
    priceCents: offer.priceCents ?? 0,
    additionalSalesCents: 0,
    additionalSalesDescription: null,
    notes: null,
    clientId: offer.clientId,
  };
}

/** Links the gig, sets disposition WON (logged) and logs CONVERTED (UC-031, BR-105). */
export function markConverted(state: OfferState, offer: MockOffer, gigId: Id, actorId: Id): void {
  updateOffer(state, offer, { disposition: 'WON' }, actorId);
  offer.gigId = gigId;
  offer.updatedAt = nowTs();
  logOfferEvent(state, offer.id, 'CONVERTED', actorId, { gigId });
}
