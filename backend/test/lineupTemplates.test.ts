/**
 * Lineups (api-contract "Lineups and settings page", owner decision 2026-11-06; TASK-051):
 * CRUD endpoints, /api/reference, and how events (incl. offer conversion) get their cost lines
 * (BR-020, BR-021 revised). Synthetic data only; money is 1000 or multiples of 10000 cents.
 */
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { todayIso } from '../src/domain/dates.js';
import { defaultCostLines } from '../src/domain/costLines.js';
import { closeTestDb, resetDb, testApp, testDb } from './helpers.js';
import { call, createEvent, eventBody, history, startSession, UNKNOWN_ID, type Json, type Session } from './eventFixtures.js';

let s: Session;

beforeEach(async () => {
  await resetDb();
  s = await startSession();
});
afterEach(async () => {
  await s.app.close();
});
afterAll(closeTestDb);

const list = () => call(s, 'GET', '/api/lineup-templates');
const post = (body: unknown) => call(s, 'POST', '/api/lineup-templates', body);
const patch = (id: string, body: unknown) => call(s, 'PATCH', `/api/lineup-templates/${id}`, body);
const del = (id: string) => call(s, 'DELETE', `/api/lineup-templates/${id}`);

const validation = (fields: Record<string, string>) => ({
  error: { code: 'VALIDATION_ERROR', message: expect.any(String), fields },
});

async function createLineup(body: Record<string, unknown>): Promise<Json> {
  const res = await post(body);
  if (res.statusCode !== 201) throw new Error(`create lineup failed: ${res.statusCode} ${res.body}`);
  return res.json();
}

const LINES_B = [
  { type: 'DJ', description: null, defaultCents: 20000 },
  { type: 'TRAVEL', description: null, defaultCents: 1000 },
  { type: 'OTHER', description: 'Stage rental', defaultCents: 10000 },
  { type: 'OFFICE', description: null, defaultCents: 10000 },
];

describe('authentication', () => {
  it('every lineup endpoint needs a session (401)', async () => {
    const app = await testApp();
    try {
      for (const [method, url] of [
        ['GET', '/api/lineup-templates'],
        ['POST', '/api/lineup-templates'],
        ['PATCH', `/api/lineup-templates/${UNKNOWN_ID}`],
        ['DELETE', `/api/lineup-templates/${UNKNOWN_ID}`],
      ] as const) {
        expect((await app.inject({ method, url, payload: {} })).statusCode, `${method} ${url}`).toBe(401);
      }
    } finally {
      await app.close();
    }
  });
});

describe('GET /api/lineup-templates', () => {
  it('lists all lineups (active first, then by name) with lines in order and eventCount incl. deleted events', async () => {
    const z = await createLineup({ name: 'Zulu Lineup' });
    const b = await createLineup({ name: 'Lineup B', lines: LINES_B });
    await patch(b.id, { active: false });
    const event = await createEvent(s);
    await createEvent(s, { venue: 'Venue Y' });
    await call(s, 'POST', `/api/events/${event.id}/delete`, { reason: 'Duplicate' });

    const res = await list();
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([
      {
        id: s.world.templateA.id,
        name: 'Template A',
        active: true,
        lines: [
          { type: 'VOC', description: null, defaultCents: 30000 },
          { type: 'BASS', description: null, defaultCents: 20000 },
          { type: 'OFFICE', description: null, defaultCents: 10000 },
          { type: 'SALES', description: null, defaultCents: 10000 },
          { type: 'PRODUCTION', description: null, defaultCents: 10000 },
        ],
        eventCount: 2,
      },
      { id: z.id, name: 'Zulu Lineup', active: true, lines: [], eventCount: 0 },
      { id: b.id, name: 'Lineup B', active: false, lines: LINES_B, eventCount: 0 },
    ]);
  });
});

describe('POST /api/lineup-templates', () => {
  it('creates an active lineup with lines of any type (same type may repeat); blank description → null', async () => {
    const lines = [...LINES_B, { type: 'DJ', description: '  ', defaultCents: 0 }];
    const res = await post({ name: '  Lineup B  ', lines });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toEqual({
      id: expect.any(String),
      name: 'Lineup B',
      active: true,
      lines: [...LINES_B, { type: 'DJ', description: null, defaultCents: 0 }],
      eventCount: 0,
    });
  });

  it('lines are optional', async () => {
    expect((await post({ name: 'Lineup C' })).json()).toMatchObject({ name: 'Lineup C', lines: [], active: true });
  });

  it('name is required, ≤ 500 chars, unique case-insensitively', async () => {
    expect((await post({})).json()).toEqual(validation({ name: 'REQUIRED' }));
    expect((await post({ name: '   ' })).json()).toEqual(validation({ name: 'REQUIRED' }));
    expect((await post({ name: 'x'.repeat(501) })).json()).toEqual(validation({ name: 'TOO_LONG' }));
    const res = await post({ name: ' TEMPLATE a ' });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual(validation({ name: 'DUPLICATE' }));
  });

  it('validates lines: type, description, amount, count', async () => {
    const cases: [unknown, Record<string, string>][] = [
      [[{ type: 'HORN_1', defaultCents: 0 }], { 'lines[0].type': 'INVALID_VALUE' }],
      [[{ defaultCents: 0 }], { 'lines[0].type': 'REQUIRED' }],
      [[{ type: 'OTHER', defaultCents: 0 }], { 'lines[0].description': 'DESCRIPTION_REQUIRED' }],
      [[{ type: 'VOC', defaultCents: 0 }, { type: 'OTHER_ROLE', description: ' ', defaultCents: 0 }], { 'lines[1].description': 'DESCRIPTION_REQUIRED' }],
      [[{ type: 'VOC', description: 'x'.repeat(501), defaultCents: 0 }], { 'lines[0].description': 'TOO_LONG' }],
      [[{ type: 'VOC', defaultCents: -1000 }], { 'lines[0].defaultCents': 'NEGATIVE_AMOUNT' }],
      [[{ type: 'VOC', defaultCents: 10.5 }], { 'lines[0].defaultCents': 'INVALID_VALUE' }],
      [[{ type: 'VOC', defaultCents: '1000' }], { 'lines[0].defaultCents': 'INVALID_VALUE' }],
      [[{ type: 'VOC' }], { 'lines[0].defaultCents': 'REQUIRED' }],
      [Array.from({ length: 101 }, () => ({ type: 'VOC', defaultCents: 0 })), { lines: 'TOO_LONG' }],
      ['VOC', { lines: 'INVALID_VALUE' }],
    ];
    for (const [lines, fields] of cases) {
      const res = await post({ name: 'Lineup X', lines });
      expect(res.statusCode, JSON.stringify(fields)).toBe(400);
      expect(res.json(), JSON.stringify(fields)).toEqual(validation(fields));
    }
    expect(await testDb().lineupTemplate.count()).toBe(1);
    // Exactly 100 lines is fine.
    const ok = await post({ name: 'Lineup X', lines: Array.from({ length: 100 }, () => ({ type: 'VOC', defaultCents: 0 })) });
    expect(ok.statusCode).toBe(201);
    expect(ok.json().lines).toHaveLength(100);
  });
});

describe('PATCH /api/lineup-templates/{id}', () => {
  it('renames, deactivates and replaces the whole line list; existing events are unchanged', async () => {
    const event = await createEvent(s);
    const before = (await call(s, 'GET', `/api/events/${event.id}`)).json();

    const res = await patch(s.world.templateA.id, { name: 'Template A2', active: false, lines: LINES_B });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ id: s.world.templateA.id, name: 'Template A2', active: false, lines: LINES_B, eventCount: 1 });

    const after = (await call(s, 'GET', `/api/events/${event.id}`)).json();
    expect(after.costLines).toEqual(before.costLines);
    expect(after.lineupName).toBe('Template A');

    const reactivated = await patch(s.world.templateA.id, { active: true });
    expect(reactivated.json()).toMatchObject({ name: 'Template A2', active: true, lines: LINES_B });
    expect((await patch(s.world.templateA.id, { lines: [] })).json().lines).toEqual([]);
  });

  it('an empty body or same values is a no-op 200; renaming to a different case of its own name is allowed', async () => {
    const id = s.world.templateA.id;
    expect((await patch(id, {})).json()).toMatchObject({ name: 'Template A', active: true });
    expect((await patch(id, { name: 'Template A', active: true })).statusCode).toBe(200);
    expect((await patch(id, { name: 'TEMPLATE A' })).json().name).toBe('TEMPLATE A');
  });

  it('400 before 404; DUPLICATE name; invalid fields', async () => {
    const other = await createLineup({ name: 'Lineup B' });
    expect((await patch(other.id, { name: 'template a' })).json()).toEqual(validation({ name: 'DUPLICATE' }));
    expect((await patch(other.id, { name: '' })).json()).toEqual(validation({ name: 'REQUIRED' }));
    expect((await patch(other.id, { active: null })).json()).toEqual(validation({ active: 'INVALID_VALUE' }));
    expect((await patch(other.id, { active: 'yes' })).json()).toEqual(validation({ active: 'INVALID_VALUE' }));
    expect((await patch(other.id, { lines: [{ type: 'OTHER', defaultCents: 0 }] })).json()).toEqual(
      validation({ 'lines[0].description': 'DESCRIPTION_REQUIRED' }),
    );
    expect((await patch(UNKNOWN_ID, { name: '' })).statusCode).toBe(400);
    expect((await patch(UNKNOWN_ID, { name: 'Lineup Q' })).statusCode).toBe(404);
    expect((await patch('not-a-uuid', {})).json().error.code).toBe('NOT_FOUND');
  });
});

describe('DELETE /api/lineup-templates/{id}', () => {
  it('deletes an unused lineup with its lines (204)', async () => {
    const b = await createLineup({ name: 'Lineup B', lines: LINES_B });
    expect((await del(b.id)).statusCode).toBe(204);
    expect(await testDb().lineupTemplate.findUnique({ where: { id: b.id } })).toBeNull();
    expect(await testDb().lineupLine.count({ where: { templateId: b.id } })).toBe(0);
  });

  it('409 LINEUP_IN_USE when events (also deleted ones) use it; 404 unknown', async () => {
    const event = await createEvent(s);
    await call(s, 'POST', `/api/events/${event.id}/delete`, { reason: 'Duplicate' });
    const res = await del(s.world.templateA.id);
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('LINEUP_IN_USE');
    expect(await testDb().lineupTemplate.count()).toBe(1);
    expect((await del(UNKNOWN_ID)).statusCode).toBe(404);
    expect((await del('nope')).statusCode).toBe(404);
  });
});

describe('GET /api/reference lineups', () => {
  it('lists active lineups only as { id, name, lines }; no roles or default fee settings', async () => {
    const b = await createLineup({ name: 'Lineup B', lines: LINES_B });
    await createLineup({ name: 'Lineup C' });
    await patch(b.id, { active: false });
    const body = (await call(s, 'GET', '/api/reference')).json();
    expect(body.lineupTemplates.map((t: { name: string }) => t.name)).toEqual(['Lineup C', 'Template A']);
    expect(body.lineupTemplates[0]).toEqual({ id: expect.any(String), name: 'Lineup C', lines: [] });
    expect(body.lineupTemplates[1].lines[0]).toEqual({ type: 'VOC', description: null, defaultCents: 30000 });
    expect(body.settings).toEqual({ loadInDeductionCents: 10000 });
  });
});

const lineSummary = (event: Json): unknown[][] =>
  (event.costLines as Json[]).map((l: Json): unknown[] => [l.type, l.personId, l.description, l.budgetedCents, l.joinsLoadIn]);

describe('event create from a lineup (BR-020, BR-021 revised)', () => {
  it('one line per lineup line in order; SALES = seller, PRODUCTION = producer; descriptions copied', async () => {
    const { world } = s;
    const lineup = await createLineup({
      name: 'Lineup B',
      lines: [
        { type: 'PRODUCTION', defaultCents: 20000 },
        { type: 'VOC', defaultCents: 30000 },
        { type: 'OTHER_ROLE', description: 'Dancer', defaultCents: 10000 },
        { type: 'SALES', defaultCents: 1000 },
        { type: 'SALES', defaultCents: 1000 },
        { type: 'FUEL', defaultCents: 1000 },
      ],
    });
    const event = await createEvent(s, { lineupTemplateId: lineup.id });
    expect(event.lineupName).toBe('Lineup B');
    expect(lineSummary(event)).toEqual([
      ['PRODUCTION', world.b.personId, null, 20000, null],
      ['VOC', null, null, 30000, true],
      ['OTHER_ROLE', null, 'Dancer', 10000, true],
      ['SALES', world.a.personId, null, 1000, null],
      ['SALES', world.a.personId, null, 1000, null],
      ['FUEL', null, null, 1000, null],
    ]);
    expect((await history(s, event.id)).map((h) => h.type)).toEqual(['CREATED']);
  });

  it('adds missing SALES / PRODUCTION lines at 0; no automatic OFFICE line', async () => {
    const { world } = s;
    const lineup = await createLineup({ name: 'Lineup B', lines: [{ type: 'DJ', defaultCents: 20000 }] });
    const event = await createEvent(s, { lineupTemplateId: lineup.id });
    expect(lineSummary(event)).toEqual([
      ['DJ', null, null, 20000, true],
      ['SALES', world.a.personId, null, 0, null],
      ['PRODUCTION', world.b.personId, null, 0, null],
    ]);
    const empty = await createLineup({ name: 'Lineup C' });
    expect(lineSummary(await createEvent(s, { lineupTemplateId: empty.id }))).toEqual([
      ['SALES', world.a.personId, null, 0, null],
      ['PRODUCTION', world.b.personId, null, 0, null],
    ]);
  });

  it('custom lineup: OFFICE, SALES and PRODUCTION at 0', async () => {
    const { world } = s;
    const event = await createEvent(s, { lineupTemplateId: null, lineupName: 'Custom Band' });
    expect(lineSummary(event)).toEqual([
      ['OFFICE', null, null, 0, null],
      ['SALES', world.a.personId, null, 0, null],
      ['PRODUCTION', world.b.personId, null, 0, null],
    ]);
  });

  it('an inactive lineup is 400 lineupTemplateId: UNKNOWN_REFERENCE', async () => {
    await patch(s.world.templateA.id, { active: false });
    const res = await call(s, 'POST', '/api/events', eventBody(s.world));
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual(validation({ lineupTemplateId: 'UNKNOWN_REFERENCE' }));
    expect(await testDb().event.count()).toBe(0);
  });
});

describe('offer conversion uses the same rules', () => {
  function shiftDays(iso: string, days: number): string {
    const d = new Date(`${iso}T00:00:00.000Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  }

  async function wonOffer(): Promise<Json> {
    const client = await testDb().client.create({ data: { name: 'Client A Oy' } });
    const created = await call(s, 'POST', '/api/offers', {
      clientId: client.id,
      eventName: 'Event 1',
      eventDate: shiftDays(todayIso(), 30),
      venue: 'Venue X',
      priceCents: 100000,
    });
    if (created.statusCode !== 201) throw new Error(`create offer failed: ${created.body}`);
    const offer = created.json();
    await call(s, 'PATCH', `/api/offers/${offer.id}`, { disposition: 'WON' });
    return offer;
  }

  it('with a lineup: its lines + missing PRODUCTION; an inactive lineup → 400', async () => {
    const { world } = s;
    const lineup = await createLineup({ name: 'Lineup B', lines: [{ type: 'VOC', defaultCents: 30000 }, { type: 'SALES', defaultCents: 1000 }] });
    const offer = await wonOffer();
    const draft = (await call(s, 'GET', `/api/offers/${offer.id}/event-draft`)).json();

    await patch(lineup.id, { active: false });
    const inactive = await call(s, 'POST', `/api/offers/${offer.id}/convert`, { ...draft, lineupTemplateId: lineup.id });
    expect(inactive.json()).toEqual(validation({ lineupTemplateId: 'UNKNOWN_REFERENCE' }));
    await patch(lineup.id, { active: true });

    const res = await call(s, 'POST', `/api/offers/${offer.id}/convert`, {
      ...draft,
      lineupTemplateId: lineup.id,
      lineupName: null,
      sellerId: world.a.id,
      producerId: world.c.id,
    });
    expect(res.statusCode).toBe(201);
    expect(lineSummary(res.json().event)).toEqual([
      ['VOC', null, null, 30000, true],
      ['SALES', world.a.personId, null, 1000, null],
      ['PRODUCTION', world.c.personId, null, 0, null],
    ]);
  });

  it('without a body: custom lineup with OFFICE / SALES / PRODUCTION at 0', async () => {
    const offer = await wonOffer();
    const res = await call(s, 'POST', `/api/offers/${offer.id}/convert`);
    expect(res.statusCode).toBe(201);
    expect((res.json().event.costLines as Json[]).map((l: Json): unknown[] => [l.type, l.budgetedCents])).toEqual([
      ['OFFICE', 0],
      ['SALES', 0],
      ['PRODUCTION', 0],
    ]);
  });
});

describe('defaultCostLines', () => {
  const persons = { sellerPersonId: 'seller', producerPersonId: 'producer' };

  it('custom (null) → OFFICE/SALES/PRODUCTION at 0', () => {
    expect(defaultCostLines({ lineupLines: null, ...persons }).map((l) => [l.type, l.personId, l.budgetedCents])).toEqual([
      ['OFFICE', null, 0],
      ['SALES', 'seller', 0],
      ['PRODUCTION', 'producer', 0],
    ]);
  });

  it('keeps the lineup order and amounts; adds only what is missing', () => {
    const lines = defaultCostLines({
      lineupLines: [
        { type: 'SALES', description: 'Split', defaultCents: 1000 },
        { type: 'OFFICE', description: null, defaultCents: 10000 },
        { type: 'MIX', description: null, defaultCents: 20000 },
      ],
      ...persons,
    });
    expect(lines).toEqual([
      { type: 'SALES', personId: 'seller', description: 'Split', budgetedCents: 1000, joinsLoadIn: null },
      { type: 'OFFICE', personId: null, description: null, budgetedCents: 10000, joinsLoadIn: null },
      { type: 'MIX', personId: null, description: null, budgetedCents: 20000, joinsLoadIn: true },
      { type: 'PRODUCTION', personId: 'producer', description: null, budgetedCents: 0, joinsLoadIn: null },
    ]);
  });
});
