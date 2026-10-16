// Partner-side purchase order mutations (UC-034, BR-117…BR-119) on the one PO store of the mock:
// `db.freelancer` (freelancerStore.ts: purchaseOrders, events, nextSeq; creation is there). The
// cost lines live in `db.gigs`; `CostLine.purchaseOrder` is kept in sync (pay / unpay keep it,
// cancel clears it). Synthetic data only (BR-090). Does not import mocks/data.ts.
import type { Id, LineupTemplate, Partner, PurchaseOrder, Settings } from '../api/types';
import type { FeeLine, FreelancerState } from './freelancerStore';
import { logPurchaseOrderEvent, newPurchaseOrder } from './freelancerStore';
import type { GigState } from './gigStore';
import { createGig, linesOf, logEvent, nowTs } from './gigStore';

/** A copy as the API returns it. */
export function toPurchaseOrder(po: PurchaseOrder): PurchaseOrder {
  return { ...po, lines: po.lines.map((l) => ({ ...l })) };
}

/**
 * An OPEN PO for the person's given cost lines with a snapshot of each budget, without the BR-114
 * eligibility check (seed and tests; the public endpoint checks eligibility). Event: CREATED by
 * the freelancer.
 */
export function addPurchaseOrder(
  state: FreelancerState,
  gigs: GigState,
  personId: Id,
  costLineIds: Id[],
  createdAt = nowTs(),
): PurchaseOrder {
  const person = gigs.people.find((p) => p.id === personId);
  if (!person) throw new Error(`Unknown person ${personId}`);
  const fees: FeeLine[] = costLineIds.map((id) => {
    const line = gigs.costLines.find((c) => c.id === id);
    const gig = line ? gigs.gigs.find((g) => g.id === line.gigId) : undefined;
    if (!line || !gig) throw new Error(`Unknown cost line ${id}`);
    return { line, gig };
  });
  return newPurchaseOrder(state, person, fees, (f) => f.line.budgetedCents, createdAt);
}

function costLinesOf(gigs: GigState, po: PurchaseOrder) {
  return po.lines
    .map((l) => ({ poLine: l, line: gigs.costLines.find((c) => c.id === l.costLineId) }))
    .filter((x): x is { poLine: (typeof po.lines)[number]; line: NonNullable<typeof x.line> } => !!x.line);
}

/** OPEN → PAID: every line paid with its snapshot amount, now, by the partner (BR-117, BR-025). */
export function payPurchaseOrder(
  state: FreelancerState,
  gigs: GigState,
  po: PurchaseOrder,
  actorId: Id,
  at = nowTs(),
): void {
  po.status = 'PAID';
  po.paidAt = at;
  po.paidBy = actorId;
  for (const { poLine, line } of costLinesOf(gigs, po)) {
    line.actualCents = poLine.amountCents;
    line.paidAt = at;
    line.paidBy = actorId;
    line.purchaseOrder = { id: po.id, number: po.number, status: 'PAID' };
    logEvent(gigs, line.gigId, 'COST_PAID', actorId, {
      costLineId: line.id,
      type: line.type,
      actualCents: poLine.amountCents,
      purchaseOrderNumber: po.number,
    });
  }
  logPurchaseOrderEvent(state, po, 'PAID', actorId, { totalCents: po.totalCents }, at);
}

/** PAID → OPEN: the lines back to unpaid; they stay on the PO (BR-117). */
export function unpayPurchaseOrder(state: FreelancerState, gigs: GigState, po: PurchaseOrder, actorId: Id): void {
  po.status = 'OPEN';
  po.paidAt = null;
  po.paidBy = null;
  for (const { line } of costLinesOf(gigs, po)) {
    const previousActualCents = line.actualCents ?? 0;
    line.actualCents = null;
    line.paidAt = null;
    line.paidBy = null;
    line.purchaseOrder = { id: po.id, number: po.number, status: 'OPEN' };
    logEvent(gigs, line.gigId, 'COST_UNPAID', actorId, {
      costLineId: line.id,
      type: line.type,
      previousActualCents,
      purchaseOrderNumber: po.number,
    });
  }
  logPurchaseOrderEvent(state, po, 'UNPAID', actorId);
}

/** OPEN → CANCELLED (final): the lines are freed for a new PO (BR-117). */
export function cancelPurchaseOrder(
  state: FreelancerState,
  gigs: GigState,
  po: PurchaseOrder,
  actorId: Id,
  reason: string,
  at = nowTs(),
): void {
  po.status = 'CANCELLED';
  po.cancelledAt = at;
  po.cancelledBy = actorId;
  po.cancelReason = reason;
  for (const { line } of costLinesOf(gigs, po)) {
    if (line.purchaseOrder?.id === po.id) line.purchaseOrder = null;
  }
  logPurchaseOrderEvent(state, po, 'CANCELLED', actorId, { reason }, at);
}

// ---------- Seed ----------

/** `YYYY-MM-DD` + days at a fixed UTC time, never later than now. */
function seedTs(date: string, days: number, time: string): string {
  const d = new Date(`${date}T${time}:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return new Date(Math.min(d.getTime(), Date.now() - 60_000)).toISOString();
}

/**
 * More demo POs for the partner pages (synthetic, BR-090), added after the freelancer seed: a
 * paid one, a cancelled one and its open replacement on an extra gig of `year` (20 March), and a
 * paid one on an extra gig of the previous year (search covers all years). Adds two gigs.
 */
export function seedPartnerPurchaseOrders(
  state: FreelancerState,
  gigs: GigState,
  partners: Partner[],
  reference: { lineupTemplates: LineupTemplate[]; settings: Settings },
  year = new Date().getFullYear(),
): void {
  const [a, b] = partners;
  const templateB = reference.lineupTemplates[1];
  if (!a || !b || !templateB) return;
  const ctx = { templates: reference.lineupTemplates, settings: reference.settings, partners };
  const person = (name: string) => gigs.people.find((p) => p.name === name)?.id ?? null;
  const staffed = (startDate: string, venue: string, names: string[]) => {
    const gig = createGig(
      gigs,
      {
        startDate,
        endDate: null,
        lineupTemplateId: templateB.id,
        lineupName: null,
        venue,
        technicalSetup: null,
        logistics: null,
        houseTechnician: false,
        sellerId: a.id,
        producerId: b.id,
        priceCents: 100000,
        additionalSalesCents: 0,
        additionalSalesDescription: null,
        notes: null,
      },
      a.id,
      ctx,
    );
    const musicians = linesOf(gigs, gig.id).filter((l) => l.joinsLoadIn !== null);
    musicians.forEach((line, i) => {
      line.personId = names[i] ? person(names[i]) : null;
    });
    return musicians;
  };

  const lastYear = `${year - 1}-11-14`;
  const [lastYearVoc] = staffed(lastYear, 'Venue S', ['Person 4']);
  if (lastYearVoc?.personId) {
    const po = addPurchaseOrder(state, gigs, lastYearVoc.personId, [lastYearVoc.id], seedTs(lastYear, 3, '09:15'));
    payPurchaseOrder(state, gigs, po, a.id, seedTs(lastYear, 6, '12:40'));
  }

  const march = `${year}-03-20`;
  const [voc, keys] = staffed(march, 'Venue T', ['Person 2', 'Person 3']);
  if (voc?.personId) {
    const po = addPurchaseOrder(state, gigs, voc.personId, [voc.id], seedTs(march, 2, '08:05'));
    payPurchaseOrder(state, gigs, po, b.id, seedTs(march, 4, '11:32'));
  }
  if (keys?.personId) {
    const first = addPurchaseOrder(state, gigs, keys.personId, [keys.id], seedTs(march, 2, '09:00'));
    cancelPurchaseOrder(state, gigs, first, a.id, 'Wrong fee, will be created again.', seedTs(march, 3, '10:00'));
    addPurchaseOrder(state, gigs, keys.personId, [keys.id], seedTs(march, 3, '18:20'));
  }
}
