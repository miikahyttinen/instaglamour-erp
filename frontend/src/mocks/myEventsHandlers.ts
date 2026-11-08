// Mock for the My gigs page: GET /api/me/events. Derived from the shared event store with the
// contract's rules, so it matches the gig list and gig pages. Synthetic data only (BR-090).
import { http, HttpResponse } from 'msw';
import { isMusicianRole } from '../api/enums';
import type { MyEvent, MyRole, Partner } from '../api/types';
import { todayIso } from '../lib/format';
import { db } from './data';
import { linesOf, toSummary, type EventState } from './eventStore';
import { currentPartner, unauthenticated } from './util';

/**
 * Upcoming (start date ≥ today), non-deleted SOLD gigs where `partner` is the producer or their
 * linked person has a musician-role line. Roles: PRODUCER first, then the own musician lines in
 * cost-line order. Sorted by start date, then lineup name.
 */
export function myEvents(
  state: EventState,
  partner: Pick<Partner, 'id'> & { personId: string | null },
  today = todayIso(),
): MyEvent[] {
  const result: MyEvent[] = [];
  for (const event of state.events) {
    if (event.status !== 'SOLD' || event.deletedAt !== null || event.startDate < today) continue;
    const roles: MyRole[] = [];
    if (event.producerId === partner.id) roles.push({ kind: 'PRODUCER' });
    if (partner.personId) {
      for (const line of linesOf(state, event.id)) {
        if (isMusicianRole(line.type) && line.personId === partner.personId) {
          roles.push({
            kind: 'MUSICIAN',
            type: line.type,
            description: line.type === 'OTHER_ROLE' ? line.description : null,
          });
        }
      }
    }
    if (roles.length === 0) continue;
    const summary = toSummary(state, event, today);
    result.push({
      eventId: event.id,
      startDate: event.startDate,
      endDate: event.endDate,
      lineupName: event.lineupName,
      venue: event.venue,
      clientName: summary.clientName,
      roles,
      notFullyStaffed: summary.notFullyStaffed,
    });
  }
  return result.sort((a, b) => a.startDate.localeCompare(b.startDate) || a.lineupName.localeCompare(b.lineupName));
}

export const myEventsHandlers = [
  http.get('/api/me/events', () => {
    const me = currentPartner();
    if (!me) return unauthenticated();
    return HttpResponse.json(myEvents(db.events, me));
  }),
];
