/**
 * Purchase orders (UC-033, UC-034, BR-113…BR-119): data access, state changes and serializers.
 *
 * - Creation (freelancer, via the public link) runs in one transaction under an advisory lock per
 *   person, locks the requested cost lines (FOR UPDATE) and their gigs (FOR SHARE), re-checks
 *   eligibility (BR-114) and creates everything or nothing (BR-115).
 * - Pay / unpay / cancel (partners) lock the PO row, check the state (BR-117) and update the cost
 *   lines with gig events carrying the PO number.
 * - Every change appends a PurchaseOrderEvent (BR-119); CREATED has partnerId null (freelancer).
 */
import type { Db } from '../db.js';
import { isoFromDate, todayIso } from '../domain/dates.js';
import { isPayable } from '../domain/enums.js';
import { Prisma, type PurchaseOrderStatus } from '../generated/prisma/client.js';
import { AppError, notFound } from '../http/errors.js';
import { compareCostLines, costLinePurchaseOrderInclude } from '../gigs/serialize.js';
import { logEvent } from '../gigs/store.js';
import { purchaseOrderNumber } from './number.js';

type Tx = Prisma.TransactionClient;

// ---------------------------------------------------------------- loading + serializing

export const purchaseOrderInclude = {
  person: { select: { name: true } },
  lines: {
    orderBy: { position: 'asc' },
    include: {
      gig: { select: { startDate: true, venue: true, lineupName: true } },
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
      gigId: l.gigId,
      gigStartDate: isoFromDate(l.gig.startDate),
      gigVenue: l.gig.venue,
      gigLineupName: l.gig.lineupName,
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
      gigStartDate: isoFromDate(l.gig.startDate),
      venue: l.gig.venue,
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

/** Lines shown on the freelancer page: own, amount > 0, payable, on non-deleted SOLD gigs. */
const freelancerLinesWhere = (personId: string): Prisma.CostLineWhereInput => ({
  personId,
  budgetedCents: { gt: 0 },
  type: { not: 'FUEL' },
  gig: { status: 'SOLD', deletedAt: null },
});

export async function loadFreelancerView(db: Db, person: { id: string; name: string }, today = todayIso()) {
  const lines = await db.costLine.findMany({
    where: freelancerLinesWhere(person.id),
    include: {
      gig: { select: { id: true, startDate: true, endDate: true, venue: true, createdAt: true } },
      purchaseOrderLines: {
        where: { active: true },
        select: { amountCents: true, purchaseOrder: { select: { number: true, status: true } } },
      },
    },
  });
  // Newest gig first; a gig's own lines in their contract order.
  lines.sort(
    (a, b) =>
      b.gig.startDate.getTime() - a.gig.startDate.getTime() ||
      b.gig.createdAt.getTime() - a.gig.createdAt.getTime() ||
      (a.gig.id < b.gig.id ? -1 : a.gig.id > b.gig.id ? 1 : 0) ||
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
      const gigStartDate = isoFromDate(line.gig.startDate);
      let state: FreelancerLineState;
      let amountCents = line.budgetedCents;
      if (line.paidAt !== null) {
        state = 'PAID';
        amountCents = line.actualCents ?? 0;
      } else if (onPo) {
        state = 'ON_PO';
        amountCents = onPo.amountCents;
      } else {
        state = gigStartDate < today ? 'SELECTABLE' : 'UPCOMING';
      }
      return {
        costLineId: line.id,
        gigStartDate,
        gigEndDate: line.gig.endDate ? isoFromDate(line.gig.endDate) : null,
        venue: line.gig.venue,
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

const uuidList = (ids: readonly string[]) => Prisma.join(ids.map((id) => Prisma.sql`${id}::uuid`));

/**
 * Create one PO from the given cost lines, all or nothing. `isCurrent` re-checks inside the lock
 * that the link is still valid (person active, token not regenerated meanwhile).
 */
export async function createPurchaseOrder(
  db: Db,
  input: {
    personId: string;
    costLineIds: readonly string[];
    isCurrent: (person: { active: boolean; freelancerToken: string }) => boolean;
    today?: string;
  },
): Promise<PurchaseOrderWithLines> {
  const today = input.today ?? todayIso();
  const ids = [...input.costLineIds];
  return db.$transaction(async (tx) => {
    await lockPerson(tx, input.personId);
    const person = await tx.person.findUnique({ where: { id: input.personId } });
    if (!person || !input.isCurrent(person)) throw notFound('Not found');

    // Same lock order everywhere: cost lines, then gigs (see purchaseOrders/lock.ts).
    await tx.$queryRaw`SELECT "id" FROM "cost_line" WHERE "id" IN (${uuidList(ids)}) ORDER BY "id" FOR UPDATE`;
    await tx.$queryRaw`SELECT g."id" FROM "gig" g WHERE g."id" IN (SELECT c."gig_id" FROM "cost_line" c WHERE c."id" IN (${uuidList(ids)})) ORDER BY g."id" FOR SHARE`;

    const lines = await tx.costLine.findMany({
      where: { id: { in: ids } },
      include: { gig: true, ...costLinePurchaseOrderInclude },
    });
    const byId = new Map(lines.map((l) => [l.id, l]));
    const offending = ids.filter((id) => {
      const line = byId.get(id);
      return (
        !line ||
        line.personId !== person.id ||
        line.gig.status !== 'SOLD' ||
        line.gig.deletedAt !== null ||
        !(isoFromDate(line.gig.startDate) < today) ||
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

    // Oldest gig first on the PO, a gig's lines in their contract order.
    const ordered = [...lines].sort(
      (a, b) =>
        a.gig.startDate.getTime() - b.gig.startDate.getTime() ||
        a.gig.createdAt.getTime() - b.gig.createdAt.getTime() ||
        (a.gig.id < b.gig.id ? -1 : a.gig.id > b.gig.id ? 1 : 0) ||
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
            gigId: l.gigId,
            type: l.type,
            description: l.description,
            amountCents: l.budgetedCents,
            position,
          })),
        },
        events: { create: { type: 'CREATED', partnerId: null, details: {} } },
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
      await logEvent(tx, {
        gigId: line.gigId,
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
      await logEvent(tx, {
        gigId: line.gigId,
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
