// Mock for the My gigs page: GET /api/me/events and GET /api/me/offers. Derived from the shared
// event and offer stores with the contract's rules, so it matches the gig / offer lists and pages.
// Synthetic data only (BR-090).
import { http, HttpResponse } from 'msw';
import { isMusicianRole } from '../api/enums';
import type { MyEvent, MyOffer, MyOffersResponse, MyRole, Partner } from '../api/types';
import { todayIso } from '../lib/format';
import { db } from './data';
import { linesOf, toSummary, type EventState, type MockClient } from './eventStore';
import { isExpired, statusOf, type MockOffer, type OfferState } from './offerStore';
import { currentPartner, unauthenticated } from './util';

/**
 * Upcoming (start date ≥ today), non-deleted SOLD gigs where `partner` is the producer or their
 * linked person has a musician-role line. Roles: PRODUCER first, then the own musician lines in
 * cost-line order. Sorted by start date, then lineup name.
 */
export function myEvents(
  state: EventState,
  partner: Pick<Partner, 'id'> & { personId: string | null },
  today = todayIso(),
): MyEvent[] {
  const result: MyEvent[] = [];
  for (const event of state.events) {
    if (event.status !== 'SOLD' || event.deletedAt !== null || event.startDate < today) continue;
    const roles: MyRole[] = [];
    if (event.producerId === partner.id) roles.push({ kind: 'PRODUCER' });
    if (partner.personId) {
      for (const line of linesOf(state, event.id)) {
        if (isMusicianRole(line.type) && line.personId === partner.personId) {
          roles.push({
            kind: 'MUSICIAN',
            type: line.type,
            description: line.type === 'OTHER_ROLE' ? line.description : null,
          });
        }
      }
    }
    if (roles.length === 0) continue;
    const summary = toSummary(state, event, today);
    result.push({
      eventId: event.id,
      startDate: event.startDate,
      endDate: event.endDate,
      lineupName: event.lineupName,
      venue: event.venue,
      clientName: summary.clientName,
      roles,
      notFullyStaffed: summary.notFullyStaffed,
    });
  }
  return result.sort((a, b) => a.startDate.localeCompare(b.startDate) || a.lineupName.localeCompare(b.lineupName));
}

/**
 * GET /api/me/offers (contract 2026-11-09): non-deleted offers where seller = me.
 * contractMissing: ACCEPTED and either not converted, or the linked gig is non-deleted, not
 * CANCELLED and its contract is not done. followUp: OPEN, not expired, follow-up not done.
 * Both sorted by event date ascending.
 */
export function myOffers(
  offers: OfferState,
  events: EventState,
  clients: MockClient[],
  partnerId: string,
  today = todayIso(),
): MyOffersResponse {
  const toMyOffer = (offer: MockOffer): MyOffer => ({
    offerId: offer.id,
    eventName: offer.eventName,
    eventDate: offer.eventDate,
    clientName: clients.find((c) => c.id === offer.clientId)?.name ?? '',
    venue: offer.venue,
    city: offer.city,
    priceCents: offer.priceCents,
    eventId: offer.eventId,
  });
  const mine = offers.offers
    .filter((o) => o.sellerId === partnerId && o.deletedAt === null)
    .sort((a, b) => a.eventDate.localeCompare(b.eventDate) || a.createdAt.localeCompare(b.createdAt));
  const contractMissing = mine.filter((o) => {
    if (statusOf(o.disposition) !== 'ACCEPTED') return false;
    if (o.eventId === null) return true;
    const event = events.events.find((e) => e.id === o.eventId);
    return !!event && event.deletedAt === null && event.status !== 'CANCELLED' && !event.contractDone;
  });
  const followUp = mine.filter(
    (o) => statusOf(o.disposition) === 'OPEN' && !isExpired(o, today) && !o.followUpDone,
  );
  return { contractMissing: contractMissing.map(toMyOffer), followUp: followUp.map(toMyOffer) };
}

export const myEventsHandlers = [
  http.get('/api/me/events', () => {
    const me = currentPartner();
    if (!me) return unauthenticated();
    return HttpResponse.json(myEvents(db.events, me));
  }),
  http.get('/api/me/offers', () => {
    const me = currentPartner();
    if (!me) return unauthenticated();
    return HttpResponse.json(myOffers(db.offers, db.events, db.events.clients, me.id));
  }),
];
