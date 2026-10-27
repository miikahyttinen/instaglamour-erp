// Synthetic demo events for `npm run dev:mock` and tests (BR-090: no real names or numbers).
// Dates are in the current year so the default event list shows something.
import type { MusicianRole } from '../api/enums';
import type { LineupTemplate, Partner, Settings } from '../api/types';
import type { EventState, MockClient, MockPerson, NewEventInput } from './eventStore';
import {
  addAttachment,
  addCostLine,
  createEvent,
  linesOf,
  logEvent,
  nowTs,
  payCostLine,
} from './eventStore';

/** Fixed ids of the synthetic people (Person 1…9). */
export const PERSON_IDS = Array.from(
  { length: 9 },
  (_, i) => `00000000-0000-4000-8000-0000000003${String(i + 1).padStart(2, '0')}`,
);

/** Synthetic roles per seeded person (Person 1…9); in MUSICIAN_ROLES order. The last has none. */
const PERSON_ROLES: MusicianRole[][] = [
  ['VOC', 'BACKING_VOC'],
  ['BASS'],
  ['GUITAR', 'BACKING_VOC'],
  ['DRUMS'],
  ['KEYS', 'PIANO'],
  ['MIX', 'TECHNICIAN'],
  ['SAX', 'HORN_1'],
  ['DJ'],
  [],
];
/** Synthetic roles for the seeded partners (Partner A, B…). */
const PARTNER_ROLES: MusicianRole[][] = [['VOC'], ['GUITAR', 'KEYS']];

export function seedPeople(partners: Partner[]): MockPerson[] {
  return [
    ...partners.map((p, i) => ({ id: p.personId, name: p.name, active: true, roles: [...(PARTNER_ROLES[i] ?? [])] })),
    ...PERSON_IDS.map((id, i) => ({
      id,
      name: `Person ${i + 1}`,
      active: i < 8,
      roles: [...(PERSON_ROLES[i] ?? [])],
    })),
  ];
}

/** Synthetic demo clients (BR-090). Fixed ids so the seed can link events to them. */
export const CLIENT_IDS = {
  a: '00000000-0000-4000-8000-000000000501',
  b: '00000000-0000-4000-8000-000000000502',
  c: '00000000-0000-4000-8000-000000000503',
} as const;

export function seedClients(): MockClient[] {
  return [
    { id: CLIENT_IDS.a, name: 'Client A', notes: 'Synthetic demo client.', deletedAt: null },
    { id: CLIENT_IDS.b, name: 'Client B', notes: null, deletedAt: null },
    { id: CLIENT_IDS.c, name: 'Client C', notes: null, deletedAt: null },
  ];
}

export function seedEventState(
  state: EventState,
  partners: Partner[],
  reference: { lineupTemplates: LineupTemplate[]; settings: Settings },
  year = new Date().getFullYear(),
): void {
  state.people = seedPeople(partners);
  state.clients = seedClients();
  const [a, b] = partners;
  if (!a || !b) return;
  const ctx = { templates: reference.lineupTemplates, settings: reference.settings, partners };
  const [templateA, templateB] = reference.lineupTemplates;
  const base: NewEventInput = {
    startDate: `${year}-01-01`,
    endDate: null,
    lineupTemplateId: templateA?.id ?? null,
    lineupName: null,
    venue: 'Venue X',
    technicalSetup: null,
    logistics: null,
    houseTechnician: false,
    sellerId: a.id,
    producerId: a.id,
    priceCents: 100000,
    additionalSalesCents: 0,
    additionalSalesDescription: null,
    notes: null,
  };
  const staff = (eventId: string, people: string[]) => {
    const musicianLines = linesOf(state, eventId).filter((l) => l.joinsLoadIn !== null);
    musicianLines.forEach((line, i) => {
      line.personId = people[i] ?? null;
    });
  };

  // 1. Fully staffed, everything paid.
  const g1 = createEvent(
    state,
    { ...base, startDate: `${year}-02-14`, clientId: CLIENT_IDS.a, priceCents: 200000, technicalSetup: 'HOUSE_TECH', houseTechnician: true },
    a.id,
    ctx,
  );
  staff(g1.id, PERSON_IDS.slice(0, 4));
  linesOf(state, g1.id).forEach((line) => payCostLine(state, line, line.budgetedCents, a.id));

  // 2. Two-day event with additional sales; keys not staffed.
  const g2 = createEvent(
    state,
    {
      ...base,
      startDate: `${year}-05-01`,
      endDate: `${year}-05-02`,
      lineupTemplateId: templateB?.id ?? null,
      venue: 'Venue Y',
      clientId: CLIENT_IDS.b,
      sellerId: b.id,
      technicalSetup: 'SET_A',
      logistics: 'OWN_VAN',
      additionalSalesCents: 10000,
      additionalSalesDescription: 'Additional set',
    },
    a.id,
    ctx,
  );
  staff(g2.id, [PERSON_IDS[0]!]);
  addCostLine(state, g2, { type: 'FUEL', personId: null, description: null, budgetedCents: 10000 }, a.id);

  // 3. Cancelled; price adjusted to what is still billed.
  const g3 = createEvent(
    state,
    { ...base, startDate: `${year}-08-15`, venue: 'Venue V', priceCents: 10000, notes: 'Partial fee billed.' },
    b.id,
    ctx,
  );
  g3.status = 'CANCELLED';
  logEvent(state, g3.id, 'CANCELLED', b.id, {}, 'Event called off by the client.');

  // 4. Deleted by mistake (shows in Events → Deleted).
  const g4 = createEvent(
    state,
    { ...base, startDate: `${year}-09-05`, lineupTemplateId: null, lineupName: 'Custom lineup', venue: 'Venue U' },
    a.id,
    ctx,
  );
  g4.deletedAt = nowTs();
  logEvent(state, g4.id, 'DELETED', a.id, {}, 'Duplicate entry.');

  // 5. and 6. Same date: assigning Person 1 to a musician line of event 6 warns about event 5 (BR-022).
  const g5 = createEvent(
    state,
    { ...base, startDate: `${year}-11-20`, venue: 'Venue Z', clientId: CLIENT_IDS.a, producerId: b.id, priceCents: 300000 },
    a.id,
    ctx,
  );
  staff(g5.id, PERSON_IDS.slice(0, 4));
  addCostLine(state, g5, { type: 'FOOD', personId: null, description: 'Catering', budgetedCents: 10000 }, a.id);
  addAttachment(
    state,
    g5,
    {
      filename: 'contract.pdf',
      contentType: 'application/pdf',
      content: new Blob(['%PDF-1.4 synthetic test file'], { type: 'application/pdf' }),
    },
    a.id,
  );
  createEvent(
    state,
    { ...base, startDate: `${year}-11-20`, lineupTemplateId: templateB?.id ?? null, venue: 'Venue W', sellerId: b.id, producerId: b.id },
    b.id,
    ctx,
  );
}
