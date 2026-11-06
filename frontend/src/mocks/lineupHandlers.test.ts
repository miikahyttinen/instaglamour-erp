// Lineup mocks follow the contract ("Lineups and settings page"), so the UI behaves like the backend.
import { beforeEach, describe, expect, it } from 'vitest';
import type { ApiError } from '../api/client';
import { eventsApi, lineupsApi, referenceApi } from '../api/endpoints';
import { signInMock } from '../test/renderApp';
import { db } from './data';

async function apiError(promise: Promise<unknown>): Promise<ApiError> {
  try {
    await promise;
  } catch (error) {
    return error as ApiError;
  }
  throw new Error('expected an error');
}

const partnerA = () => db.partners[0]!;
const partnerB = () => db.partners[1]!;

describe('lineup mocks', () => {
  beforeEach(() => {
    signInMock();
  });

  it('lists all lineups, active first then by name, with gig counts', async () => {
    const list = await lineupsApi.list();
    expect(list.map((l) => [l.name, l.active])).toEqual([
      ['Template A', true],
      ['Template B', true],
      ['Template C', false],
    ]);
    expect(list[0]!.eventCount).toBe(db.events.events.filter((e) => e.lineupTemplateId === list[0]!.id).length);
    expect(list[2]!.eventCount).toBe(0);
  });

  it('reference lists the active lineups with lines only (no roles, no default fee settings)', async () => {
    const reference = await referenceApi.get();
    expect(reference.lineupTemplates.map((l) => l.name)).toEqual(['Template A', 'Template B']);
    expect(Object.keys(reference.lineupTemplates[0]!).sort()).toEqual(['id', 'lines', 'name']);
    expect(reference.settings).toEqual({ loadInDeductionCents: expect.any(Number) });
  });

  it('creates, renames (unique, case-insensitive), replaces lines and validates them', async () => {
    const created = await lineupsApi.create({ name: 'Lineup Q' });
    expect(created).toMatchObject({ name: 'Lineup Q', active: true, lines: [], eventCount: 0 });
    expect((await apiError(lineupsApi.create({ name: 'template a' }))).fields).toEqual({ name: 'DUPLICATE' });
    expect((await apiError(lineupsApi.update(created.id, { name: ' ' }))).fields).toEqual({ name: 'REQUIRED' });

    const updated = await lineupsApi.update(created.id, {
      lines: [
        { type: 'DJ', description: null, defaultCents: 5000 },
        { type: 'OTHER', description: 'Stage', defaultCents: 0 },
      ],
    });
    expect(updated.lines).toHaveLength(2);
    const bad = await apiError(
      lineupsApi.update(created.id, {
        lines: [
          { type: 'OTHER', description: null, defaultCents: 100 },
          { type: 'BASS', description: null, defaultCents: -1 },
        ],
      }),
    );
    expect(bad.fields).toEqual({ 'lines[0].description': 'DESCRIPTION_REQUIRED', 'lines[1].defaultCents': 'NEGATIVE_AMOUNT' });
    expect((await lineupsApi.list()).find((l) => l.id === created.id)!.lines).toEqual(updated.lines);
  });

  it('delete: 204 when unused, 409 LINEUP_IN_USE when gigs link to it, 404 unknown', async () => {
    const unused = db.reference.lineupTemplates[2]!;
    await lineupsApi.remove(unused.id);
    expect(db.reference.lineupTemplates.some((l) => l.id === unused.id)).toBe(false);
    const used = db.reference.lineupTemplates[0]!;
    expect((await apiError(lineupsApi.remove(used.id))).code).toBe('LINEUP_IN_USE');
    expect((await apiError(lineupsApi.remove(unused.id))).status).toBe(404);
  });

  it('gig create: lines from the lineup in order; SALES/PRODUCTION added at 0 € when missing; inactive → UNKNOWN_REFERENCE', async () => {
    const lineup = await lineupsApi.create({
      name: 'Lineup L',
      lines: [
        { type: 'BASS', description: null, defaultCents: 20000 },
        { type: 'OTHER', description: 'Stage', defaultCents: 3000 },
        { type: 'SALES', description: null, defaultCents: 1500 },
      ],
    });
    const base = {
      startDate: '2030-06-01',
      venue: 'Venue X',
      sellerId: partnerA().id,
      producerId: partnerB().id,
      priceCents: 100000,
    };
    const event = await eventsApi.create({ ...base, lineupTemplateId: lineup.id });
    expect(event.lineupName).toBe('Lineup L');
    expect(
      event.costLines.map((l) => [l.type, l.description, l.budgetedCents, l.personId, l.joinsLoadIn]),
    ).toEqual([
      ['BASS', null, 20000, null, true],
      ['OTHER', 'Stage', 3000, null, null],
      ['SALES', null, 1500, partnerA().personId, null],
      ['PRODUCTION', null, 0, partnerB().personId, null],
    ]);

    await lineupsApi.update(lineup.id, { active: false });
    expect((await apiError(eventsApi.create({ ...base, lineupTemplateId: lineup.id }))).fields).toEqual({
      lineupTemplateId: 'UNKNOWN_REFERENCE',
    });
    expect((await lineupsApi.list()).find((l) => l.id === lineup.id)!.eventCount).toBe(1);
  });
});
