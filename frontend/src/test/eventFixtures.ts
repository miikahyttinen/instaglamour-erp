// Synthetic events for UI tests (BR-090), written straight into the mock backend.
import { db } from '../mocks/data';
import { createEvent, linesOf, mockId, type MockClient, type MockEvent, type NewEventInput } from '../mocks/eventStore';

export const TEST_YEAR = 2030;

export const partnerA = () => db.partners[0]!;
export const partnerB = () => db.partners[1]!;
export const person = (name: string) => db.events.people.find((p) => p.name === name)!;

/** Creates an event (Template A by default) in TEST_YEAR, logged as created by Partner A. */
export function addMockEvent(overrides: Partial<NewEventInput> = {}): MockEvent {
  return createEvent(
    db.events,
    {
      startDate: `${TEST_YEAR}-06-01`,
      endDate: null,
      lineupTemplateId: db.reference.lineupTemplates[0]!.id,
      lineupName: null,
      venue: 'Venue X',
      technicalSetup: null,
      logistics: null,
      houseTechnician: false,
      sellerId: partnerA().id,
      producerId: partnerA().id,
      priceCents: 100000,
      additionalSalesCents: 0,
      additionalSalesDescription: null,
      notes: null,
      ...overrides,
    },
    partnerA().id,
    { templates: db.reference.lineupTemplates, settings: db.reference.settings, partners: db.partners },
  );
}

/** Puts people on the event's musician lines in order (no history event). */
export function staffMockEvent(event: MockEvent, names: string[]): void {
  linesOf(db.events, event.id)
    .filter((l) => l.joinsLoadIn !== null)
    .forEach((line, i) => {
      line.personId = names[i] ? person(names[i]).id : null;
    });
}

export function mockLine(event: MockEvent, type: string) {
  return linesOf(db.events, event.id).find((l) => l.type === type)!;
}

/** Synthetic client (UC-027) straight into the mock backend. */
export function addMockClient(name: string, notes: string | null = null): MockClient {
  const client: MockClient = { id: mockId(), name, notes, deletedAt: null };
  db.events.clients.push(client);
  return client;
}
