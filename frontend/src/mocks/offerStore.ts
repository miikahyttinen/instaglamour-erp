// In-memory mock of the offers domain (docs/api-contract.md → Offers, Public offer; BR-102…BR-106).
// Pure functions over `OfferState`; the handlers (offerHandlers.ts, publicOfferHandlers.ts) pass in
// clients and partners. Synthetic data only (BR-090). Does not import mocks/data.ts (no cycle).
import type { OfferDisposition, OfferEventType, OfferHistoryType, OfferSource, OfferStatus } from '../api/enums';
import { OFFER_EVENT_TYPES } from '../api/enums';
import type {
  FieldChange,
  Id,
  IsoDate,
  OfferDetail,
  OfferEvent,
  OfferEventDetails,
  OfferStats,
  OfferSummary,
  OfferYearSummary,
  Partner,
  PublicOffer,
} from '../api/types';
import { todayIso } from '../lib/format';
import { mockId, nowTs, type MockClient } from './eventStore';
import { publicReferences, type ReferencesState } from './referencesStore';

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
  showReferences: boolean;
  priceCents: number | null;
  sellerId: Id;
  source: OfferSource | null;
  eventType: OfferEventType | null;
  disposition: OfferDisposition;
  eventId: Id | null;
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
  /** Partner id → phone shown as seller contact (domain model: Partner.phone). */
  partnerPhones: Record<Id, string | null>;
}

export interface OfferState {
  offers: MockOffer[];
  events: OfferEvent[];
  settings: OfferSettings;
}

/**
 * The fixed listening link of every offer (contract 2026-10-15: one constant in backend code).
 * Synthetic placeholder in the mock; the real link lives only in the backend.
 */
export const MOCK_SPOTIFY_URL = 'https://example.com/listen/demo-band';

/** What the store needs from the rest of the mock backend. */
export interface OfferContext {
  clients: MockClient[];
  partners: Partner[];
  /** The reference register (BR-108); without it an offer that shows references gets an empty list. */
  references?: ReferencesState;
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
    eventId: offer.eventId,
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
    spotifyUrl: MOCK_SPOTIFY_URL,
    references: offer.showReferences
      ? ctx.references
        ? publicReferences(ctx.references, offer.shareToken)
        : []
      : null,
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
    references: offer.references
      ? offer.references.map((r) => ({
          id: r.id,
          quote: { fi: r.quote.fi, en: r.quote.en },
          author: r.author,
          imageUrl: r.imageUrl,
        }))
      : null,
    seller: { name: offer.seller.name, email: offer.seller.email, phone: offer.seller.phone },
  };
}

export function toOfferDetail(state: OfferState, offer: MockOffer, ctx: OfferContext): OfferDetail {
  return {
    ...toOfferSummary(offer, ctx),
    lineup: [...offer.lineup],
    includesText: offer.includesText,
    showReferences: offer.showReferences,
    sharePath: `/o/${offer.shareToken}`,
    preview: toPublicOffer(toPublicView(state, offer, ctx)),
  };
}

/** BR-106 over the non-deleted offers whose event date is in `year` (`null` = all years). */
export function offerYearSummary(state: OfferState, year: number | null, today = todayIso()): OfferYearSummary {
  const offers = state.offers.filter(
    (o) => o.deletedAt === null && (year === null || o.eventDate.startsWith(`${year}-`)),
  );
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

const helsinkiMonth = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Helsinki',
  year: 'numeric',
  month: '2-digit',
});

/** The current year (or the year of `now`) in Europe/Helsinki. */
export function helsinkiYear(now: Date = new Date()): number {
  return Number(helsinkiYearMonth(now.toISOString()).slice(0, 4));
}

/** `YYYY-MM` of a timestamp in Europe/Helsinki. */
export function helsinkiYearMonth(ts: string): string {
  const parts = helsinkiMonth.formatToParts(new Date(ts));
  const y = parts.find((p) => p.type === 'year')?.value ?? '0000';
  const m = parts.find((p) => p.type === 'month')?.value ?? '00';
  return `${y}-${m}`;
}

const pctOf = (won: number, decided: number) =>
  decided === 0 ? null : Math.round((won / decided) * 1000) / 10;

/**
 * Contract "Offer statistics" (BR-122) over every non-deleted offer, all years. `createdByMonth`
 * counts back from today (ignores `year`); average `count` = priced offers; untyped decided
 * offers count only in the overall win rate; only types with open offers are listed.
 */
export function offerStats(state: OfferState, year: number, today = todayIso()): OfferStats {
  const offers = state.offers.filter((o) => o.deletedAt === null);
  const value = (o: MockOffer) => o.priceCents ?? 0;
  const isOpen = (o: MockOffer) => o.disposition === 'PENDING' && o.eventDate >= today;
  const eventYear = (o: MockOffer) => Number(o.eventDate.slice(0, 4));
  const range = (from: number, n: number) => Array.from({ length: n }, (_, i) => from + i);

  // The 6 completed months before the current month.
  const [ty, tm] = [Number(today.slice(0, 4)), Number(today.slice(5, 7))];
  const months = range(0, 6).map((i) => {
    const d = new Date(Date.UTC(ty, tm - 1 - (6 - i), 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  });
  const created = offers.map((o) => ({ o, month: helsinkiYearMonth(o.createdAt) }));

  const open = offers.filter(isOpen);
  const typeKeys = [...new Set(open.map((o) => o.eventType))];
  const decided = offers.filter((o) => o.disposition !== 'PENDING' && o.disposition !== 'CANCELLED');
  const typeRank = (t: OfferEventType | null) => (t === null ? OFFER_EVENT_TYPES.length : OFFER_EVENT_TYPES.indexOf(t));
  const won = (list: MockOffer[]) => list.filter((o) => o.disposition === 'WON').length;

  return {
    createdByMonth: months.map((month) => {
      const list = created.filter((c) => c.month === month).map((c) => c.o);
      return { month, count: list.length, valueCents: list.reduce((s, o) => s + value(o), 0) };
    }),
    averageByCreatedYear: range(year - 3, 6).map((y) => {
      const list = created.filter((c) => c.month.startsWith(`${y}-`)).map((c) => c.o);
      const priced = list.filter((o) => o.priceCents !== null);
      return {
        year: y,
        count: priced.length,
        averageCents:
          priced.length === 0 ? null : Math.round(priced.reduce((s, o) => s + value(o), 0) / priced.length),
      };
    }),
    byEventYear: range(year - 3, 6).map((y) => {
      const list = offers.filter((o) => eventYear(o) === y);
      return { year: y, count: list.length, valueCents: list.reduce((s, o) => s + value(o), 0) };
    }),
    openValueByEventYear: range(year - 3, 6).map((y) => {
      const list = open.filter((o) => eventYear(o) === y);
      return { year: y, count: list.length, valueCents: list.reduce((s, o) => s + value(o), 0) };
    }),
    openByEventType: typeKeys
      .map((eventType) => {
        const list = open.filter((o) => o.eventType === eventType);
        return { eventType, count: list.length, valueCents: list.reduce((s, o) => s + value(o), 0) };
      })
      // Ties: more offers first, then EVENT_TYPES order, "no type" last (like the backend).
      .sort((a, b) => b.valueCents - a.valueCents || b.count - a.count || typeRank(a.eventType) - typeRank(b.eventType)),
    winRate: {
      pct: pctOf(won(decided), decided.length),
      won: won(decided),
      decided: decided.length,
      byEventType: OFFER_EVENT_TYPES.map((eventType) => {
        const list = decided.filter((o) => o.eventType === eventType);
        return { eventType, pct: pctOf(won(list), list.length), won: won(list), decided: list.length };
      }),
    },
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
  showReferences: boolean;
  priceCents: number | null;
  sellerId: Id;
  source: OfferSource | null;
  eventType: OfferEventType | null;
  disposition?: OfferDisposition;
  shareToken?: string;
  internalNote?: string | null;
  /** Fixed id (seed only, so demo links survive a reload). */
  id?: Id;
}

export function createOffer(state: OfferState, input: NewOfferInput, actorId: Id): MockOffer {
  const ts = nowTs();
  const offer: MockOffer = {
    id: input.id ?? mockId(),
    clientId: input.clientId,
    eventName: input.eventName,
    eventDate: input.eventDate,
    venue: input.venue,
    city: input.city,
    lineup: [...input.lineup],
    includesText: input.includesText,
    showReferences: input.showReferences,
    priceCents: input.priceCents,
    sellerId: input.sellerId,
    source: input.source,
    eventType: input.eventType,
    disposition: input.disposition ?? 'PENDING',
    eventId: null,
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

/**
 * BR-105 event fields from the offer. The caller creates the event and then calls `markConverted`.
 * `isActive` + `callerId`: an inactive offer seller falls back to the caller (BR-111).
 */
export function eventInputFromOffer(
  offer: MockOffer,
  fallback?: { isActive: (partnerId: Id) => boolean; callerId: Id },
) {
  const sellerId =
    fallback && !fallback.isActive(offer.sellerId) ? fallback.callerId : offer.sellerId;
  return {
    startDate: offer.eventDate,
    endDate: null,
    lineupTemplateId: null,
    lineupName: offer.eventName,
    venue: offer.city ? `${offer.venue}, ${offer.city}` : offer.venue,
    technicalSetup: null,
    logistics: null,
    houseTechnician: false,
    sellerId,
    producerId: sellerId,
    priceCents: offer.priceCents ?? 0,
    additionalSalesCents: 0,
    additionalSalesDescription: null,
    notes: null,
    clientId: offer.clientId,
  };
}

/** Links the event, sets disposition WON (logged) and logs CONVERTED (UC-031, BR-105). */
export function markConverted(state: OfferState, offer: MockOffer, eventId: Id, actorId: Id): void {
  updateOffer(state, offer, { disposition: 'WON' }, actorId);
  offer.eventId = eventId;
  offer.updatedAt = nowTs();
  logOfferEvent(state, offer.id, 'CONVERTED', actorId, { eventId });
}
