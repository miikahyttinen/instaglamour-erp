// Synthetic gigs for UI tests (BR-090), written straight into the mock backend.
import { db } from '../mocks/data';
import { createGig, linesOf, type MockGig, type NewGigInput } from '../mocks/gigStore';

export const TEST_YEAR = 2030;

export const partnerA = () => db.partners[0]!;
export const partnerB = () => db.partners[1]!;
export const person = (name: string) => db.gigs.people.find((p) => p.name === name)!;

/** Creates a gig (Template A by default) in TEST_YEAR, logged as created by Partner A. */
export function addMockGig(overrides: Partial<NewGigInput> = {}): MockGig {
  return createGig(
    db.gigs,
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

/** Puts people on the gig's musician lines in order (no history event). */
export function staffMockGig(gig: MockGig, names: string[]): void {
  linesOf(db.gigs, gig.id)
    .filter((l) => l.joinsLoadIn !== null)
    .forEach((line, i) => {
      line.personId = names[i] ? person(names[i]).id : null;
    });
}

export function mockLine(gig: MockGig, type: string) {
  return linesOf(db.gigs, gig.id).find((l) => l.type === type)!;
}
