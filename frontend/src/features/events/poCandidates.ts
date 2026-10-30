import type { EventDetail, Person } from '../../api/types';
import type { PoCandidate } from '../purchaseOrders/CreatePurchaseOrderDialog';
import { personName } from './queries';

/**
 * Crew of the event with at least one fee that can go on a PO by hand: amount > 0, unpaid, not on
 * a PO, not FUEL, on a SOLD non-deleted event. The server decides finally (eligible-lines).
 */
export function poCandidates(event: EventDetail, people: Person[] | undefined): PoCandidate[] {
  if (event.status !== 'SOLD' || event.deletedAt !== null) return [];
  const ids = new Set<string>();
  for (const line of event.costLines) {
    if (
      line.personId &&
      line.budgetedCents > 0 &&
      line.paidAt === null &&
      line.purchaseOrder === null &&
      line.type !== 'FUEL'
    ) {
      ids.add(line.personId);
    }
  }
  return [...ids]
    .map((id) => ({ id, name: personName(people, id) ?? '–' }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
