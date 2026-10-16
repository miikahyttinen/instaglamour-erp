// In-memory mock of purchase orders (UC-033, UC-034, BR-113…BR-119). State lives in
// `db.purchaseOrders`; the cost lines it touches live in `db.gigs` (gigStore.ts), which keeps
// `CostLine.purchaseOrder` in sync. Synthetic data only (BR-090).
// Like gigStore.ts, this file does not import mocks/data.ts: callers pass the states in.
import type {
  CostLine,
  Id,
  LineupTemplate,
  Partner,
  PurchaseOrder,
  PurchaseOrderEvent,
  PurchaseOrderEventType,
  Settings,
} from '../api/types';
import type { GigState } from './gigStore';
import { createGig, linesOf, logEvent, mockId, nowTs } from './gigStore';

export interface PurchaseOrderState {
  /** Newest last (creation order). */
  orders: PurchaseOrder[];
  events: PurchaseOrderEvent[];
  /** Global running number (BR-116); the next PO gets `seq + 1`. */
  seq: number;
}

export function emptyPurchaseOrderState(): PurchaseOrderState {
  return { orders: [], events: [], seq: 0 };
}

/** BR-116 slug: accents removed, upper case, non-letters/digits → `-`, empty → `PERSON`. */
export function purchaseOrderSlug(name: string): string {
  const slug = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'PERSON';
}

export function purchaseOrderNumber(name: string, seq: number): string {
  return `${purchaseOrderSlug(name)}-${String(seq).padStart(4, '0')}`;
}

function logPoEvent(
  state: PurchaseOrderState,
  po: PurchaseOrder,
  type: PurchaseOrderEventType,
  partnerId: Id | null,
  details: object = {},
  at = nowTs(),
): void {
  state.events.push({
    id: mockId(),
    purchaseOrderId: po.id,
    number: po.number,
    type,
    partnerId,
    at,
    details,
  } as PurchaseOrderEvent);
}

/** A copy as the API returns it. */
export function toPurchaseOrder(po: PurchaseOrder): PurchaseOrder {
  return { ...po, lines: po.lines.map((l) => ({ ...l })) };
}

function costLinesOf(gigs: GigState, po: PurchaseOrder): CostLine[] {
  return po.lines
    .map((l) => gigs.costLines.find((c) => c.id === l.costLineId))
    .filter((c): c is CostLine => c !== undefined);
}

/**
 * Creates an OPEN PO for `personId` from the given cost lines (snapshot of each budget, BR-115)
 * and puts the lines on it. The freelancer creates it (event without partner). Eligibility
 * (BR-114) is the caller's job: the public freelancer endpoint checks it, the seed knows.
 */
export function createPurchaseOrder(
  state: PurchaseOrderState,
  gigs: GigState,
  personId: Id,
  costLineIds: Id[],
  at = nowTs(),
): PurchaseOrder {
  const person = gigs.people.find((p) => p.id === personId);
  state.seq += 1;
  const lines = costLineIds.map((id) => {
    const line = gigs.costLines.find((c) => c.id === id);
    const gig = line ? gigs.gigs.find((g) => g.id === line.gigId) : undefined;
    if (!line || !gig) throw new Error(`Unknown cost line ${id}`);
    return {
      costLineId: line.id,
      gigId: gig.id,
      gigStartDate: gig.startDate,
      gigVenue: gig.venue,
      gigLineupName: gig.lineupName,
      type: line.type,
      description: line.description,
      amountCents: line.budgetedCents,
    };
  });
  const po: PurchaseOrder = {
    id: mockId(),
    number: purchaseOrderNumber(person?.name ?? '', state.seq),
    personId,
    personName: person?.name ?? '',
    status: 'OPEN',
    totalCents: lines.reduce((sum, l) => sum + l.amountCents, 0),
    createdAt: at,
    paidAt: null,
    paidBy: null,
    cancelledAt: null,
    cancelledBy: null,
    cancelReason: null,
    lines,
  };
  state.orders.push(po);
  for (const line of costLinesOf(gigs, po)) {
    line.purchaseOrder = { id: po.id, number: po.number, status: 'OPEN' };
  }
  logPoEvent(state, po, 'CREATED', null, {}, at);
  return po;
}

/** OPEN → PAID: every line paid with its snapshot amount, now, by the partner (BR-117). */
export function payPurchaseOrder(
  state: PurchaseOrderState,
  gigs: GigState,
  po: PurchaseOrder,
  actorId: Id,
  at = nowTs(),
): void {
  po.status = 'PAID';
  po.paidAt = at;
  po.paidBy = actorId;
  for (const poLine of po.lines) {
    const line = gigs.costLines.find((c) => c.id === poLine.costLineId);
    if (!line) continue;
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
  logPoEvent(state, po, 'PAID', actorId, { totalCents: po.totalCents }, at);
}

/** PAID → OPEN: the lines back to unpaid (BR-117). */
export function unpayPurchaseOrder(state: PurchaseOrderState, gigs: GigState, po: PurchaseOrder, actorId: Id): void {
  po.status = 'OPEN';
  po.paidAt = null;
  po.paidBy = null;
  for (const line of costLinesOf(gigs, po)) {
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
  logPoEvent(state, po, 'UNPAID', actorId);
}

/** OPEN → CANCELLED (final): the lines are freed for a new PO (BR-117). */
export function cancelPurchaseOrder(
  state: PurchaseOrderState,
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
  for (const line of costLinesOf(gigs, po)) {
    if (line.purchaseOrder?.id === po.id) line.purchaseOrder = null;
  }
  logPoEvent(state, po, 'CANCELLED', actorId, { reason }, at);
}

// ---------- Seed ----------

/** `YYYY-MM-DD` + days at a fixed time, never later than now (the mock "now" keeps order). */
function seedTs(date: string, days: number, time: string): string {
  const d = new Date(`${date}T${time}:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  const now = Date.now() - 60_000;
  return new Date(Math.min(d.getTime(), now)).toISOString();
}

/**
 * Demo purchase orders (synthetic, BR-090): a paid one, a cancelled one and its open
 * replacement on an extra gig of `year`, an open one on the seeded 1 May gig, and a paid one
 * in the previous year (search covers all years). Adds two gigs to `gigs`.
 */
export function seedPurchaseOrders(
  gigs: GigState,
  partners: Partner[],
  reference: { lineupTemplates: LineupTemplate[]; settings: Settings },
  year = new Date().getFullYear(),
): PurchaseOrderState {
  const state = emptyPurchaseOrderState();
  const [a, b] = partners;
  const templateB = reference.lineupTemplates[1];
  if (!a || !b || !templateB) return state;
  const ctx = { templates: reference.lineupTemplates, settings: reference.settings, partners };
  const person = (name: string) => gigs.people.find((p) => p.name === name)?.id ?? null;
  const base = {
    endDate: null,
    lineupTemplateId: templateB.id,
    lineupName: null,
    technicalSetup: null,
    logistics: null,
    houseTechnician: false,
    sellerId: a.id,
    producerId: b.id,
    priceCents: 100000,
    additionalSalesCents: 0,
    additionalSalesDescription: null,
    notes: null,
  };
  const staffed = (startDate: string, venue: string, names: string[]) => {
    const gig = createGig(gigs, { ...base, startDate, venue }, a.id, ctx);
    const musicians = linesOf(gigs, gig.id).filter((l) => l.joinsLoadIn !== null);
    musicians.forEach((line, i) => {
      line.personId = names[i] ? person(names[i]) : null;
    });
    return musicians;
  };

  // Previous year: Person 4, paid.
  const lastYearDate = `${year - 1}-11-14`;
  const [lastYearVoc] = staffed(lastYearDate, 'Venue S', ['Person 4']);
  if (lastYearVoc?.personId) {
    const po = createPurchaseOrder(state, gigs, lastYearVoc.personId, [lastYearVoc.id], seedTs(lastYearDate, 3, '09:15'));
    payPurchaseOrder(state, gigs, po, a.id, seedTs(lastYearDate, 6, '12:40'));
  }

  // This year, 20 March: Person 2 paid; Person 3 cancelled and created again.
  const marchDate = `${year}-03-20`;
  const [voc, keys] = staffed(marchDate, 'Venue T', ['Person 2', 'Person 3']);
  if (voc?.personId) {
    const po = createPurchaseOrder(state, gigs, voc.personId, [voc.id], seedTs(marchDate, 2, '08:05'));
    payPurchaseOrder(state, gigs, po, b.id, seedTs(marchDate, 4, '11:32'));
  }
  if (keys?.personId) {
    const first = createPurchaseOrder(state, gigs, keys.personId, [keys.id], seedTs(marchDate, 2, '09:00'));
    cancelPurchaseOrder(state, gigs, first, a.id, 'Wrong fee, will be created again.', seedTs(marchDate, 3, '10:00'));
    createPurchaseOrder(state, gigs, keys.personId, [keys.id], seedTs(marchDate, 3, '18:20'));
  }

  // The seeded 1 May gig: Person 1's fee on an open PO.
  const may = gigs.gigs.find((g) => g.startDate === `${year}-05-01` && g.deletedAt === null);
  const mayLine = may ? linesOf(gigs, may.id).find((l) => l.personId === person('Person 1')) : undefined;
  if (mayLine?.personId) {
    createPurchaseOrder(state, gigs, mayLine.personId, [mayLine.id], seedTs(`${year}-05-02`, 1, '07:45'));
  }
  return state;
}
