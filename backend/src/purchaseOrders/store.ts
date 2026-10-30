/**
 * Purchase orders (UC-033, UC-034, BR-113…BR-119): data access, state changes and serializers.
 *
 * - Creation (freelancer, via the public link) runs in one transaction under an advisory lock per
 *   person, locks the requested cost lines (FOR UPDATE) and their events (FOR SHARE), re-checks
 *   eligibility (BR-114) and creates everything or nothing (BR-115).
 * - Pay / unpay / cancel (partners) lock the PO row, check the state (BR-117) and update the cost
 *   lines with event history entries carrying the PO number.
 * - Partners can also create a PO for one person by hand (api-contract "Purchase orders created by
 *   partners", 2026-10-31): same path, but upcoming SOLD events are eligible too and the CREATED
 *   event carries the partner's id.
 * - Every change appends a PurchaseOrderEvent (BR-119); CREATED has partnerId null when the
 *   freelancer created it via the link.
 */
import type { Db } from '../db.js';
import { isoFromDate, todayIso } from '../domain/dates.js';
import { isPayable } from '../domain/enums.js';
import { Prisma, type PurchaseOrderStatus } from '../generated/prisma/client.js';
import { AppError, notFound } from '../http/errors.js';
import { compareCostLines, costLinePurchaseOrderInclude } from '../events/serialize.js';
import { logHistory } from '../events/store.js';
import { purchaseOrderNumber } from './number.js';

type Tx = Prisma.TransactionClient;

// ---------------------------------------------------------------- loading + serializing

export const purchaseOrderInclude = {
  person: { select: { name: true } },
  lines: {
    orderBy: { position: 'asc' },
    include: {
      event: { select: { startDate: true, venue: true, lineupName: true } },
      costLine: { select: { description: true } },
    },
  },
} as const satisfies Prisma.PurchaseOrderInclude;

export type PurchaseOrderWithLines = Prisma.PurchaseOrderGetPayload<{ include: typeof purchaseOrderInclude }>;
type PoLine = PurchaseOrderWithLines['lines'][number];

/** The line's description: the cost line's current one (it stays editable), else the snapshot. */
const lineDescription = (line: PoLine) => (line.costLine ? line.costLine.description : line.description);

export function toPurchaseOrderDto(po: PurchaseOrderWithLines) {
  return {
    id: po.id,
    number: po.number,
    personId: po.personId,
    personName: po.person.name,
    status: po.status,
    totalCents: po.totalCents,
    createdAt: po.createdAt.toISOString(),
    paidAt: po.paidAt?.toISOString() ?? null,
    paidBy: po.paidById,
    cancelledAt: po.cancelledAt?.toISOString() ?? null,
    cancelledBy: po.cancelledById,
    cancelReason: po.cancelReason,
    lines: po.lines.map((l) => ({
      costLineId: l.costLineRef,
      eventId: l.eventId,
      eventStartDate: isoFromDate(l.event.startDate),
      eventVenue: l.event.venue,
      eventLineupName: l.event.lineupName,
      type: l.type,
      description: lineDescription(l),
      amountCents: l.amountCents,
    })),
  };
}

/** PublicPurchaseOrder: whitelist only — no ids, partner data or cancel reason (BR-113). */
export function toPublicPurchaseOrderDto(po: PurchaseOrderWithLines) {
  return {
    number: po.number,
    status: po.status,
    totalCents: po.totalCents,
    createdAt: po.createdAt.toISOString(),
    paidAt: po.paidAt?.toISOString() ?? null,
    lines: po.lines.map((l) => ({
      eventStartDate: isoFromDate(l.event.startDate),
      venue: l.event.venue,
      type: l.type,
      description: lineDescription(l),
      amountCents: l.amountCents,
    })),
  };
}

export const purchaseOrderEventInclude = { purchaseOrder: { select: { number: true } } } as const;

export function toPurchaseOrderEventDto(
  e: Prisma.PurchaseOrderEventGetPayload<{ include: typeof purchaseOrderEventInclude }>,
) {
  return {
    id: e.id,
    purchaseOrderId: e.purchaseOrderId,
    number: e.purchaseOrder.number,
    type: e.type,
    partnerId: e.partnerId,
    at: e.at.toISOString(),
    details: e.details,
  };
}

/** Newest first; `seq` breaks ties between POs created in the same millisecond. */
export const newestFirst = [{ createdAt: 'desc' }, { seq: 'desc' }] as const satisfies Prisma.PurchaseOrderOrderByWithRelationInput[];

export async function requirePurchaseOrder(db: Db | Tx, id: string): Promise<PurchaseOrderWithLines> {
  const po = await db.purchaseOrder.findUnique({ where: { id }, include: purchaseOrderInclude });
  if (!po) throw notFound('Purchase order not found');
  return po;
}

/**
 * Bounds of a year in Europe/Helsinki as UTC instants (BR-119: list year = year of creation).
 * 1 January is always in winter time (UTC+2) in Helsinki.
 */
export function helsinkiYearRange(year: number): { gte: Date; lt: Date } {
  const start = (y: number) => new Date(`${String(y).padStart(4, '0')}-01-01T00:00:00.000+02:00`);
  return { gte: start(year), lt: start(year + 1) };
}

// ---------------------------------------------------------------- freelancer view (BR-113)

type FreelancerLineState = 'SELECTABLE' | 'UPCOMING' | 'ON_PO' | 'PAID';

/** Lines shown on the freelancer page: own, amount > 0, payable, on non-deleted SOLD events. */
const freelancerLinesWhere = (personId: string): Prisma.CostLineWhereInput => ({
  personId,
  budgetedCents: { gt: 0 },
  type: { not: 'FUEL' },
  event: { status: 'SOLD', deletedAt: null },
});

export async function loadFreelancerView(db: Db, person: { id: string; name: string }, today = todayIso()) {
  const lines = await db.costLine.findMany({
    where: freelancerLinesWhere(person.id),
    include: {
      event: { select: { id: true, startDate: true, endDate: true, venue: true, createdAt: true } },
      purchaseOrderLines: {
        where: { active: true },
        select: { amountCents: true, purchaseOrder: { select: { number: true, status: true } } },
      },
    },
  });
  // Newest event first; an event's own lines in their contract order.
  lines.sort(
    (a, b) =>
      b.event.startDate.getTime() - a.event.startDate.getTime() ||
      b.event.createdAt.getTime() - a.event.createdAt.getTime() ||
      (a.event.id < b.event.id ? -1 : a.event.id > b.event.id ? 1 : 0) ||
      compareCostLines(a, b),
  );

  const purchaseOrders = await db.purchaseOrder.findMany({
    where: { personId: person.id },
    include: purchaseOrderInclude,
    orderBy: newestFirst,
  });

  return {
    name: person.name,
    lines: lines.map((line) => {
      const onPo = line.purchaseOrderLines[0];
      const eventStartDate = isoFromDate(line.event.startDate);
      let state: FreelancerLineState;
      let amountCents = line.budgetedCents;
      if (line.paidAt !== null) {
        state = 'PAID';
        amountCents = line.actualCents ?? 0;
      } else if (onPo) {
        state = 'ON_PO';
        amountCents = onPo.amountCents;
      } else {
        state = eventStartDate < today ? 'SELECTABLE' : 'UPCOMING';
      }
      return {
        costLineId: line.id,
        eventStartDate,
        eventEndDate: line.event.endDate ? isoFromDate(line.event.endDate) : null,
        venue: line.event.venue,
        type: line.type,
        description: line.description,
        amountCents,
        state,
        purchaseOrderNumber: onPo?.purchaseOrder.number ?? null,
      };
    }),
    purchaseOrders: purchaseOrders.map(toPublicPurchaseOrderDto),
  };
}

// ---------------------------------------------------------------- create (BR-114, BR-115, BR-116)

/** Transaction-scoped advisory lock: one PO creation per person at a time. */
async function lockPerson(tx: Tx, personId: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`purchase_order:person:${personId}`}, 0))`;
}

/** The person fields that decide whether their freelancer link works. */
export type LinkPerson = { active: boolean; freelancerToken: string; partner: { active: boolean } | null };

/** BR-113: the link works for active people who are not active partners (a removed partner's works again). */
export const isLinkUsable = (person: { active: boolean; partner: { active: boolean } | null }): boolean =>
  person.active && !person.partner?.active;

const uuidList = (ids: readonly string[]) => Prisma.join(ids.map((id) => Prisma.sql`${id}::uuid`));

/**
 * Which lines may go on a new PO:
 * - `FREELANCER` (BR-114): the event must have been played (start date < today).
 * - `PARTNER` (manual PO, 2026-10-31): played or upcoming.
 * Both: own line, event SOLD and not deleted, unpaid, amount > 0, not FUEL, not on an OPEN/PAID PO.
 */
export type PoEligibility = 'FREELANCER' | 'PARTNER';

/** Cost lines a partner may put on a manual PO for this person (optionally one event only). */
const partnerEligibleWhere = (personId: string, eventId?: string): Prisma.CostLineWhereInput => ({
  personId,
  budgetedCents: { gt: 0 },
  type: { not: 'FUEL' },
  paidAt: null,
  purchaseOrderLines: { none: { active: true } },
  event: { status: 'SOLD', deletedAt: null },
  ...(eventId !== undefined && { eventId }),
});

/** `GET /api/people/{id}/po-eligible-lines`: newest event first, an event's lines in contract order. */
export async function loadPartnerEligibleLines(db: Db, personId: string, eventId?: string) {
  const lines = await db.costLine.findMany({
    where: partnerEligibleWhere(personId, eventId),
    include: { event: { select: { id: true, startDate: true, venue: true, lineupName: true, createdAt: true } } },
  });
  lines.sort(
    (a, b) =>
      b.event.startDate.getTime() - a.event.startDate.getTime() ||
      b.event.createdAt.getTime() - a.event.createdAt.getTime() ||
      (a.event.id < b.event.id ? -1 : a.event.id > b.event.id ? 1 : 0) ||
      compareCostLines(a, b),
  );
  return lines.map((line) => ({
    costLineId: line.id,
    eventId: line.event.id,
    eventStartDate: isoFromDate(line.event.startDate),
    eventVenue: line.event.venue,
    eventLineupName: line.event.lineupName,
    type: line.type,
    description: line.description,
    amountCents: line.budgetedCents,
  }));
}

/**
 * Create one PO from the given cost lines, all or nothing. `isCurrent` re-checks inside the lock
 * that the person may still get a PO this way (freelancer link: person active, not an active partner,
 * token not regenerated meanwhile). `createdBy` = the partner creating it by hand, null = freelancer.
 */
export async function createPurchaseOrder(
  db: Db,
  input: {
    personId: string;
    costLineIds: readonly string[];
    isCurrent: (person: LinkPerson) => boolean;
    eligibility: PoEligibility;
    createdBy: string | null;
    today?: string;
  },
): Promise<PurchaseOrderWithLines> {
  const today = input.today ?? todayIso();
  const requirePlayed = input.eligibility === 'FREELANCER';
  const ids = [...input.costLineIds];
  return db.$transaction(async (tx) => {
    await lockPerson(tx, input.personId);
    const person = await tx.person.findUnique({
      where: { id: input.personId },
      include: { partner: { select: { active: true } } },
    });
    if (!person || !input.isCurrent(person)) throw notFound('Not found');

    // Same lock order everywhere: cost lines, then events (see purchaseOrders/lock.ts).
    await tx.$queryRaw`SELECT "id" FROM "cost_line" WHERE "id" IN (${uuidList(ids)}) ORDER BY "id" FOR UPDATE`;
    await tx.$queryRaw`SELECT g."id" FROM "event" g WHERE g."id" IN (SELECT c."event_id" FROM "cost_line" c WHERE c."id" IN (${uuidList(ids)})) ORDER BY g."id" FOR SHARE`;

    const lines = await tx.costLine.findMany({
      where: { id: { in: ids } },
      include: { event: true, ...costLinePurchaseOrderInclude },
    });
    const byId = new Map(lines.map((l) => [l.id, l]));
    const offending = ids.filter((id) => {
      const line = byId.get(id);
      return (
        !line ||
        line.personId !== person.id ||
        line.event.status !== 'SOLD' ||
        line.event.deletedAt !== null ||
        (requirePlayed && !(isoFromDate(line.event.startDate) < today)) ||
        line.paidAt !== null ||
        line.budgetedCents <= 0 ||
        !isPayable(line.type) ||
        line.purchaseOrderLines.length > 0
      );
    });
    if (offending.length > 0) {
      throw new AppError('COST_LINE_NOT_ELIGIBLE', 'Some fees are not eligible for a purchase order', undefined, {
        costLineIds: offending,
      });
    }

    // Oldest event first on the PO, an event's lines in their contract order.
    const ordered = [...lines].sort(
      (a, b) =>
        a.event.startDate.getTime() - b.event.startDate.getTime() ||
        a.event.createdAt.getTime() - b.event.createdAt.getTime() ||
        (a.event.id < b.event.id ? -1 : a.event.id > b.event.id ? 1 : 0) ||
        compareCostLines(a, b),
    );
    const [{ seq }] = await tx.$queryRaw<[{ seq: number }]>`SELECT nextval('purchase_order_seq')::int AS "seq"`;
    const po = await tx.purchaseOrder.create({
      data: {
        number: purchaseOrderNumber(person.name, seq),
        seq,
        personId: person.id,
        totalCents: ordered.reduce((sum, l) => sum + l.budgetedCents, 0),
        lines: {
          create: ordered.map((l, position) => ({
            costLineId: l.id,
            costLineRef: l.id,
            eventId: l.eventId,
            type: l.type,
            description: l.description,
            amountCents: l.budgetedCents,
            position,
          })),
        },
        events: { create: { type: 'CREATED', partnerId: input.createdBy, details: {} } },
      },
    });
    return requirePurchaseOrder(tx, po.id);
  });
}

// ---------------------------------------------------------------- pay / unpay / cancel (BR-117)

async function lockPurchaseOrder(tx: Tx, id: string): Promise<PurchaseOrderWithLines> {
  await tx.$queryRaw`SELECT "id" FROM "purchase_order" WHERE "id" = ${id}::uuid FOR UPDATE`;
  return requirePurchaseOrder(tx, id);
}

function assertStatus(po: { status: PurchaseOrderStatus }, expected: PurchaseOrderStatus): void {
  if (po.status !== expected) {
    throw new AppError('INVALID_STATUS_TRANSITION', `Purchase order is ${po.status}, expected ${expected}`);
  }
}

/** OPEN → PAID: every line's cost line paid with its snapshot amount, now, by the partner. */
export async function payPurchaseOrder(db: Db, id: string, partnerId: string): Promise<PurchaseOrderWithLines> {
  return db.$transaction(async (tx) => {
    const po = await lockPurchaseOrder(tx, id);
    assertStatus(po, 'OPEN');
    const now = new Date();
    for (const line of po.lines) {
      if (!line.costLineId) continue; // can't happen: lines on an OPEN PO can't be deleted (BR-118)
      await tx.costLine.update({
        where: { id: line.costLineId },
        data: { actualCents: line.amountCents, paidAt: now, paidById: partnerId },
      });
      await logHistory(tx, {
        eventId: line.eventId,
        type: 'COST_PAID',
        partnerId,
        details: { costLineId: line.costLineId, type: line.type, actualCents: line.amountCents, purchaseOrderNumber: po.number },
      });
    }
    await tx.purchaseOrder.update({ where: { id }, data: { status: 'PAID', paidAt: now, paidById: partnerId } });
    await tx.purchaseOrderEvent.create({
      data: { purchaseOrderId: id, type: 'PAID', partnerId, at: now, details: { totalCents: po.totalCents } },
    });
    return requirePurchaseOrder(tx, id);
  });
}

/** PAID → OPEN: the lines' cost lines become unpaid again. */
export async function unpayPurchaseOrder(db: Db, id: string, partnerId: string): Promise<PurchaseOrderWithLines> {
  return db.$transaction(async (tx) => {
    const po = await lockPurchaseOrder(tx, id);
    assertStatus(po, 'PAID');
    for (const line of po.lines) {
      if (!line.costLineId) continue; // can't happen: lines on a PAID PO can't be deleted (BR-118)
      const current = await tx.costLine.findUniqueOrThrow({ where: { id: line.costLineId } });
      await tx.costLine.update({
        where: { id: line.costLineId },
        data: { actualCents: null, paidAt: null, paidById: null },
      });
      await logHistory(tx, {
        eventId: line.eventId,
        type: 'COST_UNPAID',
        partnerId,
        details: {
          costLineId: line.costLineId,
          type: line.type,
          previousActualCents: current.actualCents,
          purchaseOrderNumber: po.number,
        },
      });
    }
    await tx.purchaseOrder.update({ where: { id }, data: { status: 'OPEN', paidAt: null, paidById: null } });
    await tx.purchaseOrderEvent.create({ data: { purchaseOrderId: id, type: 'UNPAID', partnerId, details: {} } });
    return requirePurchaseOrder(tx, id);
  });
}

/** OPEN → CANCELLED (final): the lines are freed (selectable again for the freelancer). */
export async function cancelPurchaseOrder(
  db: Db,
  id: string,
  partnerId: string,
  reason: string,
): Promise<PurchaseOrderWithLines> {
  return db.$transaction(async (tx) => {
    const po = await lockPurchaseOrder(tx, id);
    assertStatus(po, 'OPEN');
    const now = new Date();
    await tx.purchaseOrderLine.updateMany({ where: { purchaseOrderId: id }, data: { active: false } });
    await tx.purchaseOrder.update({
      where: { id },
      data: { status: 'CANCELLED', cancelledAt: now, cancelledById: partnerId, cancelReason: reason },
    });
    await tx.purchaseOrderEvent.create({
      data: { purchaseOrderId: id, type: 'CANCELLED', partnerId, at: now, details: { reason } },
    });
    return requirePurchaseOrder(tx, id);
  });
}
