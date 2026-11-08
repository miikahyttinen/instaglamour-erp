import { beforeEach, describe, expect, it } from 'vitest';
import type { CostType } from '../api/enums';
import { addMockEvent, partnerA, partnerB, person } from '../test/eventFixtures';
import { db } from './data';
import { addCostLine, linesOf, type MockEvent } from './eventStore';
import { myEvents } from './myEventsHandlers';

const TODAY = '2030-05-01';

/** Removes the template lines so every test starts from a gig without cost lines. */
function bare(event: MockEvent): MockEvent {
  db.events.costLines = db.events.costLines.filter((l) => l.eventId !== event.id);
  return event;
}

function line(event: MockEvent, type: CostType, personId: string | null, description: string | null = null) {
  return addCostLine(db.events, event, { type, personId, description, budgetedCents: 1000 }, partnerA().id);
}

describe('myEvents mock (GET /api/me/events)', () => {
  beforeEach(() => {
    db.events.events = [];
    db.events.costLines = [];
  });

  it('lists producer gigs and gigs with an own musician-role line, roles PRODUCER first', () => {
    const me = partnerA();
    bare(addMockEvent({ startDate: '2030-06-02', venue: 'Venue P' }));
    const played = bare(addMockEvent({ startDate: '2030-06-01', venue: 'Venue M', producerId: partnerB().id }));
    line(played, 'VOC', me.personId);
    const both = bare(addMockEvent({ startDate: '2030-06-03', venue: 'Venue B' }));
    line(both, 'KEYS', me.personId);
    line(both, 'VOC', person('Person 1').id);
    line(both, 'OTHER_ROLE', me.personId, 'Role X');
    // Someone else's gig, and an own non-musician line: not listed.
    const other = bare(addMockEvent({ startDate: '2030-06-04', producerId: partnerB().id }));
    line(other, 'VOC', person('Person 1').id);
    line(other, 'PRODUCTION', me.personId);

    const list = myEvents(db.events, me, TODAY);
    expect(list.map((e) => e.venue)).toEqual(['Venue M', 'Venue P', 'Venue B']);
    expect(list[0]!.roles).toEqual([{ kind: 'MUSICIAN', type: 'VOC', description: null }]);
    expect(list[1]!.roles).toEqual([{ kind: 'PRODUCER' }]);
    expect(list[2]!.roles).toEqual([
      { kind: 'PRODUCER' },
      { kind: 'MUSICIAN', type: 'KEYS', description: null },
      { kind: 'MUSICIAN', type: 'OTHER_ROLE', description: 'Role X' },
    ]);
    expect(list[2]!.eventId).toBe(both.id);
  });

  it('only upcoming, non-deleted SOLD gigs (start date ≥ today); same date sorted by lineup name', () => {
    const me = partnerA();
    addMockEvent({ startDate: '2030-04-30', lineupName: 'Past' });
    addMockEvent({ startDate: TODAY, lineupName: 'Today B' });
    addMockEvent({ startDate: TODAY, lineupName: 'Today A' });
    addMockEvent({ startDate: '2030-07-01', lineupName: 'Cancelled' }).status = 'CANCELLED';
    addMockEvent({ startDate: '2030-07-01', lineupName: 'Deleted' }).deletedAt = '2030-01-01T00:00:00Z';
    expect(myEvents(db.events, me, TODAY).map((e) => e.lineupName)).toEqual(['Today A', 'Today B']);
  });

  it('notFullyStaffed follows BR-023 (an unassigned musician-role line); a partner without a person gets producer gigs only', () => {
    const me = partnerA();
    const open = addMockEvent({ startDate: '2030-06-01', lineupName: 'Open' });
    expect(linesOf(db.events, open.id).some((l) => l.personId === null)).toBe(true);
    const full = bare(addMockEvent({ startDate: '2030-06-02', lineupName: 'Full', producerId: partnerB().id }));
    line(full, 'VOC', me.personId);
    const list = myEvents(db.events, me, TODAY);
    expect(list.map((e) => [e.lineupName, e.notFullyStaffed])).toEqual([
      ['Open', true],
      ['Full', false],
    ]);
    expect(myEvents(db.events, { id: me.id, personId: null }, TODAY).map((e) => e.lineupName)).toEqual(['Open']);
  });
});
