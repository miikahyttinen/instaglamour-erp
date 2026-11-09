/**
 * My offers (docs/api-contract.md "Contract done, follow-up done, My offers"): the signed-in
 * partner's non-deleted offers (seller = me) that still need action.
 * - contractMissing: ACCEPTED, and not converted yet, or converted to a non-deleted, non-cancelled
 *   gig whose contract is not done.
 * - followUp: OPEN, not expired (event date today or later, Helsinki), follow-up not done.
 * Both sorted by the offer's event date ascending (then event name, creation time, id).
 */
import { dateFromIso, isoFromDate } from '../domain/dates.js';
import type { Prisma } from '../generated/prisma/client.js';
import type { Tx } from '../events/store.js';

export interface MyOfferDto {
  offerId: string;
  eventName: string;
  eventDate: string;
  clientName: string;
  venue: string;
  city: string | null;
  priceCents: number | null;
  eventId: string | null;
}

export interface MyOffersDto {
  contractMissing: MyOfferDto[];
  followUp: MyOfferDto[];
}

const select = {
  id: true,
  eventName: true,
  eventDate: true,
  venue: true,
  city: true,
  priceCents: true,
  client: { select: { name: true } },
  event: { select: { id: true } },
} as const satisfies Prisma.OfferSelect;

const orderBy: Prisma.OfferOrderByWithRelationInput[] = [
  { eventDate: 'asc' },
  { eventName: 'asc' },
  { createdAt: 'asc' },
  { id: 'asc' },
];

type Row = Prisma.OfferGetPayload<{ select: typeof select }>;

function toMyOfferDto(o: Row): MyOfferDto {
  return {
    offerId: o.id,
    eventName: o.eventName,
    eventDate: isoFromDate(o.eventDate),
    clientName: o.client.name,
    venue: o.venue,
    city: o.city,
    priceCents: o.priceCents,
    eventId: o.event?.id ?? null,
  };
}

export async function loadMyOffers(db: Tx, partnerId: string, today: string): Promise<MyOffersDto> {
  const mine: Prisma.OfferWhereInput = { sellerId: partnerId, deletedAt: null };
  // One query after the other: `db` may be a transaction client.
  const contractMissing = await db.offer.findMany({
    where: {
      ...mine,
      disposition: 'WON',
      OR: [
        { event: { is: null } },
        { event: { is: { deletedAt: null, status: { not: 'CANCELLED' }, contractDone: false } } },
      ],
    },
    select,
    orderBy,
  });
  const followUp = await db.offer.findMany({
    where: { ...mine, disposition: 'PENDING', eventDate: { gte: dateFromIso(today) }, followUpDone: false },
    select,
    orderBy,
  });
  return { contractMissing: contractMissing.map(toMyOfferDto), followUp: followUp.map(toMyOfferDto) };
}
