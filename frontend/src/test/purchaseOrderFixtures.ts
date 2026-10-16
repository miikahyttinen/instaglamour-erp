// Synthetic purchase orders for UI tests (BR-090), written straight into the mock backend.
import type { PurchaseOrder } from '../api/types';
import { db } from '../mocks/data';
import type { MockGig } from '../mocks/gigStore';
import { linesOf } from '../mocks/gigStore';
import { addPurchaseOrder, cancelPurchaseOrder, payPurchaseOrder } from '../mocks/purchaseOrderStore';
import { addMockGig, partnerA, person, staffMockGig, TEST_YEAR } from './gigFixtures';

/** Local time → ISO timestamp (so the UI shows exactly `day.month.year hh.mm`). */
export const localTs = (y: number, m: number, d: number, hh = 12, mm = 0) =>
  new Date(y, m - 1, d, hh, mm).toISOString();

/** Removes the seeded purchase orders, so a test sees only its own. */
export function clearPurchaseOrders(): void {
  db.freelancer.purchaseOrders = [];
  db.freelancer.events = [];
  for (const line of db.gigs.costLines) line.purchaseOrder = null;
}

export interface MockPoOptions {
  personName?: string;
  /** Gig of the fee (default: a new Template A gig on TEST_YEAR-06-01 at `venue`). */
  gig?: MockGig;
  venue?: string;
  createdAt?: string;
  status?: 'OPEN' | 'PAID' | 'CANCELLED';
  paidAt?: string;
}

/** A PO for the person's first musician fee on a gig (the person is put on the VOC line). */
export function addMockPurchaseOrder(options: MockPoOptions = {}): { po: PurchaseOrder; gig: MockGig } {
  const name = options.personName ?? 'Person 1';
  const gig = options.gig ?? addMockGig({ venue: options.venue ?? 'Venue X' });
  if (!options.gig) staffMockGig(gig, [name]);
  const line = linesOf(db.gigs, gig.id).find((l) => l.personId === person(name).id);
  if (!line) throw new Error(`${name} has no line on the gig`);
  const po = addPurchaseOrder(
    db.freelancer,
    db.gigs,
    person(name).id,
    [line.id],
    options.createdAt ?? localTs(TEST_YEAR, 6, 5, 9, 0),
  );
  if (options.status === 'PAID') {
    payPurchaseOrder(db.freelancer, db.gigs, po, partnerA().id, options.paidAt ?? localTs(TEST_YEAR, 6, 10, 14, 32));
  }
  if (options.status === 'CANCELLED') {
    cancelPurchaseOrder(db.freelancer, db.gigs, po, partnerA().id, 'Wrong fee.', localTs(TEST_YEAR, 6, 6));
  }
  return { po, gig };
}
