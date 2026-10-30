// In-memory mock of purchase orders as seen through the freelancer link (UC-033, BR-113…BR-116):
// one link token per person, the POs and their log. Fee lines are the cost lines of the event
// store (db.events), so eligibility always reflects the current event data. Implements BR-114
// eligibility, BR-115 all-or-nothing creation and the BR-116 number. The partner PO pages
// (TASK-152, pay / unpay / cancel) work on the same `purchaseOrders` list.
// Synthetic data only (BR-090). Does not import mocks/data.ts (no import cycle).
import type {
  CostLine,
  FreelancerLine,
  FreelancerView,
  Id,
  IsoDate,
  PublicPurchaseOrder,
  PurchaseOrder,
  PurchaseOrderEvent,
} from '../api/types';
import { todayIso } from '../lib/format';
import { PERSON_IDS } from './eventSeed';
import { mockId, nowTs, type EventState, type MockEvent, type MockPerson } from './eventStore';

export interface FreelancerState {
  /** Person id → current link token (`/f/<token>`). Created on first use. */
  tokens: Record<Id, string>;
  /** Newest last (creation order); the API returns newest first. */
  purchaseOrders: PurchaseOrder[];
  events: PurchaseOrderEvent[];
  /** Global running number of BR-116 (next value). */
  nextSeq: number;
}

/** Fixed token of Person 1 for the demo (`npm run dev:mock` → /f/<token>). Not a real secret. */
export const DEMO_FREELANCER_TOKEN = 'demo-person-1-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

/** Unguessable-looking URL-safe token (the real backend uses ≥ 32 random bytes). */
function newToken(): string {
  return `${mockId()}${mockId()}`.replace(/-/g, '');
}

/** BR-116 slug: accents removed, upper case, runs of non-letters/digits → `-`, empty → PERSON. */
export function purchaseOrderSlug(name: string): string {
  const slug = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'PERSON';
}

/** BR-116 number, e.g. `PERSON-1-0042` (≥ 4 digits, grows past 9999). */
export function purchaseOrderNumber(name: string, seq: number): string {
  return `${purchaseOrderSlug(name)}-${String(seq).padStart(4, '0')}`;
}

export function freelancerToken(state: FreelancerState, personId: Id): string {
  let token = state.tokens[personId];
  if (!token) {
    token = newToken();
    state.tokens[personId] = token;
  }
  return token;
}

export function regenerateFreelancerToken(state: FreelancerState, personId: Id): string {
  const token = newToken();
  state.tokens[personId] = token;
  return token;
}

/** The active person behind a token; unknown / regenerated token or inactive person → undefined. */
export function personByToken(state: FreelancerState, events: EventState, token: string): MockPerson | undefined {
  const personId = Object.keys(state.tokens).find((id) => state.tokens[id] === token);
  const person = events.people.find((p) => p.id === personId);
  return person?.active ? person : undefined;
}

/** The OPEN or PAID PO a cost line is on (cancelled POs don't count). */
export function activePurchaseOrderOf(state: FreelancerState, costLineId: Id): PurchaseOrder | undefined {
  return state.purchaseOrders.find(
    (po) => po.status !== 'CANCELLED' && po.lines.some((l) => l.costLineId === costLineId),
  );
}

export interface FeeLine {
  line: CostLine;
  event: MockEvent;
}

/** BR-113: the person's lines with an amount > 0 on non-deleted SOLD events, newest event first. */
export function feeLines(events: EventState, personId: Id): FeeLine[] {
  const out: FeeLine[] = [];
  events.costLines.forEach((line) => {
    if (line.personId !== personId || line.budgetedCents <= 0) return;
    const event = events.events.find((g) => g.id === line.eventId);
    if (!event || event.status !== 'SOLD' || event.deletedAt !== null) return;
    out.push({ line, event });
  });
  // Stable sort keeps creation order within an event / date.
  return out.sort((a, b) => b.event.startDate.localeCompare(a.event.startDate));
}

function toFreelancerLine(state: FreelancerState, { line, event }: FeeLine, today: IsoDate): FreelancerLine {
  const po = activePurchaseOrderOf(state, line.id);
  const base = {
    costLineId: line.id,
    eventStartDate: event.startDate,
    eventEndDate: event.endDate,
    venue: event.venue,
    type: line.type,
    description: line.description,
  };
  if (line.paidAt !== null) {
    return {
      ...base,
      amountCents: line.actualCents ?? line.budgetedCents,
      state: 'PAID',
      purchaseOrderNumber: po?.status === 'PAID' ? po.number : null,
    };
  }
  if (po) {
    const snapshot = po.lines.find((l) => l.costLineId === line.id)?.amountCents ?? line.budgetedCents;
    return { ...base, amountCents: snapshot, state: 'ON_PO', purchaseOrderNumber: po.number };
  }
  // BR-114: played = start date before today.
  const played = event.startDate < today;
  return { ...base, amountCents: line.budgetedCents, state: played ? 'SELECTABLE' : 'UPCOMING', purchaseOrderNumber: null };
}

/** Whitelist of the public PO: no ids, partner names or cancel reason. */
export function toPublicPurchaseOrder(po: PurchaseOrder): PublicPurchaseOrder {
  return {
    number: po.number,
    status: po.status,
    totalCents: po.totalCents,
    createdAt: po.createdAt,
    paidAt: po.paidAt,
    lines: po.lines.map((l) => ({
      eventStartDate: l.eventStartDate,
      venue: l.eventVenue,
      type: l.type,
      description: l.description,
      amountCents: l.amountCents,
    })),
  };
}

/** `GET /api/public/freelancers/{token}`: exactly the contract fields. */
export function freelancerView(
  state: FreelancerState,
  events: EventState,
  person: MockPerson,
  today: IsoDate = todayIso(),
): FreelancerView {
  return {
    name: person.name,
    lines: feeLines(events, person.id).map((fee) => toFreelancerLine(state, fee, today)),
    purchaseOrders: state.purchaseOrders
      .filter((po) => po.personId === person.id)
      .slice()
      .reverse()
      .map(toPublicPurchaseOrder),
  };
}

export type CreateResult = { ok: true; purchaseOrder: PurchaseOrder } | { ok: false; notEligible: Id[] };

/** Creates an OPEN PO (no eligibility check) and puts the lines on it (`CostLine.purchaseOrder`). */
export function newPurchaseOrder(
  state: FreelancerState,
  person: MockPerson,
  fees: FeeLine[],
  amount: (fee: FeeLine) => number,
  createdAt: string,
  /** Partner who created it by hand; null = the freelancer via the link. */
  createdBy: Id | null = null,
): PurchaseOrder {
  const lines = fees.map((fee) => ({
    costLineId: fee.line.id,
    eventId: fee.event.id,
    eventStartDate: fee.event.startDate,
    eventVenue: fee.event.venue,
    eventLineupName: fee.event.lineupName,
    type: fee.line.type,
    description: fee.line.description,
    amountCents: amount(fee),
  }));
  const po: PurchaseOrder = {
    id: mockId(),
    number: purchaseOrderNumber(person.name, state.nextSeq),
    personId: person.id,
    personName: person.name,
    status: 'OPEN',
    totalCents: lines.reduce((sum, l) => sum + l.amountCents, 0),
    createdAt,
    paidAt: null,
    paidBy: null,
    cancelledAt: null,
    cancelledBy: null,
    cancelReason: null,
    lines,
  };
  state.nextSeq += 1;
  state.purchaseOrders.push(po);
  for (const fee of fees) fee.line.purchaseOrder = { id: po.id, number: po.number, status: 'OPEN' };
  logPurchaseOrderEvent(state, po, 'CREATED', createdBy, {}, createdAt);
  return po;
}

export function logPurchaseOrderEvent(
  state: FreelancerState,
  po: PurchaseOrder,
  type: PurchaseOrderEvent['type'],
  partnerId: Id | null,
  details: PurchaseOrderEvent['details'] = {},
  at: string = nowTs(),
): void {
  state.events.push({ id: mockId(), purchaseOrderId: po.id, number: po.number, type, partnerId, at, details });
}

/**
 * BR-115: one PO with a snapshot of every selected fee, or nothing when any id is not an
 * eligible fee of this person (BR-114). Returns the offending ids.
 */
export function createPurchaseOrder(
  state: FreelancerState,
  events: EventState,
  person: MockPerson,
  costLineIds: Id[],
  today: IsoDate = todayIso(),
): CreateResult {
  const fees = feeLines(events, person.id);
  const chosen: FeeLine[] = [];
  const notEligible: Id[] = [];
  for (const id of costLineIds) {
    const fee = fees.find((f) => f.line.id === id);
    if (fee && toFreelancerLine(state, fee, today).state === 'SELECTABLE') chosen.push(fee);
    else notEligible.push(id);
  }
  if (notEligible.length > 0) return { ok: false, notEligible };
  // Event order, newest first (same as the page).
  chosen.sort((a, b) => b.event.startDate.localeCompare(a.event.startDate));
  return { ok: true, purchaseOrder: newPurchaseOrder(state, person, chosen, (f) => f.line.budgetedCents, nowTs()) };
}

function at(date: IsoDate, days: number, time = '12:00:00.000Z'): string {
  const d = new Date(`${date}T${time}`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString();
}

/**
 * Demo data on the seeded events: Person 1 has a fixed link, a PAID PO for their paid fee and a
 * CANCELLED PO for an unpaid one (which is therefore selectable again, UC-034 AC-3).
 */
export function seedFreelancer(events: EventState, partnerId: Id | undefined): FreelancerState {
  const state: FreelancerState = { tokens: {}, purchaseOrders: [], events: [], nextSeq: 1 };
  const personId = PERSON_IDS[0];
  const person = events.people.find((p) => p.id === personId);
  if (!person) return state;
  state.tokens[person.id] = DEMO_FREELANCER_TOKEN;

  const fees = feeLines(events, person.id).reverse(); // oldest first
  const today = todayIso();
  const paid = fees.find((f) => f.line.paidAt !== null);
  if (paid) {
    const created = at(paid.event.startDate, 2);
    const po = newPurchaseOrder(state, person, [paid], (f) => f.line.actualCents ?? f.line.budgetedCents, created);
    po.status = 'PAID';
    po.paidAt = at(paid.event.startDate, 9, '11:32:00.000Z');
    po.paidBy = partnerId ?? null;
    paid.line.purchaseOrder = { id: po.id, number: po.number, status: 'PAID' };
    logPurchaseOrderEvent(state, po, 'PAID', po.paidBy, { totalCents: po.totalCents }, po.paidAt);
  }
  const open = fees.find((f) => f.line.paidAt === null && f.event.startDate < today);
  if (open) {
    const created = at(open.event.startDate, 1);
    const po = newPurchaseOrder(state, person, [open], (f) => f.line.budgetedCents, created);
    po.status = 'CANCELLED';
    po.cancelledAt = at(open.event.startDate, 1, '15:00:00.000Z');
    po.cancelledBy = partnerId ?? null;
    po.cancelReason = 'Wrong fee selected.';
    open.line.purchaseOrder = null;
    logPurchaseOrderEvent(state, po, 'CANCELLED', po.cancelledBy, { reason: po.cancelReason }, po.cancelledAt);
  }
  return state;
}
