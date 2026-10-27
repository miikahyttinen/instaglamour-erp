// Synthetic purchase orders for UI tests (BR-090), written straight into the mock backend.
import type { PurchaseOrder } from '../api/types';
import { db } from '../mocks/data';
import type { MockEvent } from '../mocks/eventStore';
import { linesOf } from '../mocks/eventStore';
import { addPurchaseOrder, cancelPurchaseOrder, payPurchaseOrder } from '../mocks/purchaseOrderStore';
import { addMockEvent, partnerA, person, staffMockEvent, TEST_YEAR } from './eventFixtures';

/** Local time → ISO timestamp (so the UI shows exactly `day.month.year hh.mm`). */
export const localTs = (y: number, m: number, d: number, hh = 12, mm = 0) =>
  new Date(y, m - 1, d, hh, mm).toISOString();

/** Removes the seeded purchase orders, so a test sees only its own. */
export function clearPurchaseOrders(): void {
  db.freelancer.purchaseOrders = [];
  db.freelancer.events = [];
  for (const line of db.events.costLines) line.purchaseOrder = null;
}

export interface MockPoOptions {
  personName?: string;
  /** Event of the fee (default: a new Template An event on TEST_YEAR-06-01 at `venue`). */
  event?: MockEvent;
  venue?: string;
  createdAt?: string;
  status?: 'OPEN' | 'PAID' | 'CANCELLED';
  paidAt?: string;
}

/** A PO for the person's first musician fee on an event (the person is put on the VOC line). */
export function addMockPurchaseOrder(options: MockPoOptions = {}): { po: PurchaseOrder; event: MockEvent } {
  const name = options.personName ?? 'Person 1';
  const event = options.event ?? addMockEvent({ venue: options.venue ?? 'Venue X' });
  if (!options.event) staffMockEvent(event, [name]);
  const line = linesOf(db.events, event.id).find((l) => l.personId === person(name).id);
  if (!line) throw new Error(`${name} has no line on the event`);
  const po = addPurchaseOrder(
    db.freelancer,
    db.events,
    person(name).id,
    [line.id],
    options.createdAt ?? localTs(TEST_YEAR, 6, 5, 9, 0),
  );
  if (options.status === 'PAID') {
    payPurchaseOrder(db.freelancer, db.events, po, partnerA().id, options.paidAt ?? localTs(TEST_YEAR, 6, 10, 14, 32));
  }
  if (options.status === 'CANCELLED') {
    cancelPurchaseOrder(db.freelancer, db.events, po, partnerA().id, 'Wrong fee.', localTs(TEST_YEAR, 6, 6));
  }
  return { po, event };
}
