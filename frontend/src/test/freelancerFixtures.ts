// Synthetic freelancer data for tests (BR-090): Person 5 has no lines in the default seed, so
// these are their only fees.
import { db } from '../mocks/data';
import { freelancerToken } from '../mocks/freelancerStore';
import { addCostLine, payCostLine } from '../mocks/eventStore';
import { addMockEvent, mockLine, partnerA, person, staffMockEvent } from './eventFixtures';

export const FREELANCER = 'Person 5';

/**
 * Person 5's fees: two played unpaid events (selectable, 100,00 € each), an "Other" role line
 * (50,00 €), a paid one, an upcoming one; plus lines that must never show (cancelled event,
 * deleted event, zero amount).
 */
export function seedFreelancerFees() {
  const p = person(FREELANCER);
  const played1 = addMockEvent({ startDate: '2020-03-01', venue: 'Venue X' });
  staffMockEvent(played1, [FREELANCER]);
  const played2 = addMockEvent({ startDate: '2020-05-01', venue: 'Venue Y' });
  staffMockEvent(played2, [FREELANCER]);
  const other = addCostLine(
    db.events,
    played2,
    { type: 'OTHER_ROLE', personId: p.id, description: 'Role Q', budgetedCents: 5000 },
    partnerA().id,
  );
  const paid = addMockEvent({ startDate: '2020-01-10', venue: 'Venue W' });
  staffMockEvent(paid, [FREELANCER]);
  payCostLine(db.events, mockLine(paid, 'VOC'), 12000, partnerA().id);
  const upcoming = addMockEvent({ startDate: '2099-06-01', venue: 'Venue Z' });
  staffMockEvent(upcoming, [FREELANCER]);

  const cancelled = addMockEvent({ startDate: '2020-04-01', venue: 'Venue C' });
  staffMockEvent(cancelled, [FREELANCER]);
  cancelled.status = 'CANCELLED';
  const deleted = addMockEvent({ startDate: '2020-04-02', venue: 'Venue D' });
  staffMockEvent(deleted, [FREELANCER]);
  deleted.deletedAt = new Date().toISOString();
  const zero = addMockEvent({ startDate: '2020-04-03', venue: 'Venue E' });
  staffMockEvent(zero, [FREELANCER]);
  mockLine(zero, 'VOC').budgetedCents = 0;

  return {
    person: p,
    token: freelancerToken(db.freelancer, p.id),
    lines: {
      played1: mockLine(played1, 'VOC'),
      played2: mockLine(played2, 'VOC'),
      other,
      paid: mockLine(paid, 'VOC'),
      upcoming: mockLine(upcoming, 'VOC'),
      cancelled: mockLine(cancelled, 'VOC'),
      deleted: mockLine(deleted, 'VOC'),
      zero: mockLine(zero, 'VOC'),
    },
  };
}
