import { beforeEach, describe, expect, it } from 'vitest';
import type { CostType } from '../api/enums';
import { addMockEvent, partnerA, partnerB, person } from '../test/eventFixtures';
import { db } from './data';
import { addCostLine, linesOf, type MockEvent } from './eventStore';
import { myEvents, myOffers } from './myEventsHandlers';
import { markConverted } from './offerStore';
import { addMockClient } from '../test/eventFixtures';
import { addMockOffer } from '../test/offerFixtures';

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

describe('myOffers mock (GET /api/me/offers)', () => {
  beforeEach(() => {
    db.events.events = [];
    db.events.costLines = [];
    db.offers.offers = [];
  });

  const list = () => myOffers(db.offers, db.events, db.events.clients, partnerA().id, TODAY);
  const names = (rows: { eventName: string }[]) => rows.map((r) => r.eventName);

  function converted(clientId: string, eventName: string, eventDate: string) {
    const offer = addMockOffer({ clientId, eventName, eventDate, disposition: 'WON' });
    const event = bare(addMockEvent({ startDate: eventDate, lineupName: eventName }));
    event.offerId = offer.id;
    markConverted(db.offers, offer, event.id, partnerA().id);
    return { offer, event };
  }

  it('contractMissing: my accepted offers, not converted or the gig is live without a contract; by date', () => {
    const client = addMockClient('Client A');
    addMockOffer({ clientId: client.id, eventName: 'Won later', eventDate: '2030-09-01', disposition: 'WON', city: 'City Y' });
    const { offer: c1, event: e1 } = converted(client.id, 'Converted', '2030-06-01');
    converted(client.id, 'Done', '2030-06-02').event.contractDone = true;
    converted(client.id, 'Cancelled', '2030-06-03').event.status = 'CANCELLED';
    converted(client.id, 'Gig deleted', '2030-06-04').event.deletedAt = '2030-01-01T00:00:00Z';
    addMockOffer({ clientId: client.id, eventName: 'Other seller', disposition: 'WON', sellerId: partnerB().id });
    addMockOffer({ clientId: client.id, eventName: 'Offer deleted', disposition: 'WON' }).deletedAt = '2030-01-01T00:00:00Z';
    addMockOffer({ clientId: client.id, eventName: 'Lost', disposition: 'LOST_PRICE' });
    // Past accepted offers are still listed (no date rule).
    addMockOffer({ clientId: client.id, eventName: 'Past won', eventDate: '2029-01-01', disposition: 'WON' });

    const result = list();
    expect(names(result.contractMissing)).toEqual(['Past won', 'Converted', 'Won later']);
    expect(result.contractMissing[1]).toEqual({
      offerId: c1.id,
      eventName: 'Converted',
      eventDate: '2030-06-01',
      clientName: 'Client A',
      venue: 'Venue X',
      city: null,
      priceCents: 100000,
      eventId: e1.id,
    });
    expect(result.contractMissing[2]).toMatchObject({ city: 'City Y', eventId: null });
  });

  it('followUp: my open, not expired offers without follow-up done; by date', () => {
    const client = addMockClient('Client A');
    addMockOffer({ clientId: client.id, eventName: 'Later', eventDate: '2030-09-01' });
    addMockOffer({ clientId: client.id, eventName: 'Today', eventDate: TODAY });
    addMockOffer({ clientId: client.id, eventName: 'Expired', eventDate: '2030-04-30' });
    addMockOffer({ clientId: client.id, eventName: 'Followed', followUpDone: true });
    addMockOffer({ clientId: client.id, eventName: 'Other seller', sellerId: partnerB().id });
    addMockOffer({ clientId: client.id, eventName: 'Deleted' }).deletedAt = '2030-01-01T00:00:00Z';
    addMockOffer({ clientId: client.id, eventName: 'No response', disposition: 'NO_RESPONSE' });
    const result = list();
    expect(names(result.followUp)).toEqual(['Today', 'Later']);
    expect(result.contractMissing).toEqual([]);
  });
});
