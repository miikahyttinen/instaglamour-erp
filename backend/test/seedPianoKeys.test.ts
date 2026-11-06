/**
 * Seed / import (TASK-052): files may still use PIANO (merged into KEYS) and OTHER_ROLE as a person
 * role. PIANO becomes KEYS in person roles, lineup roles/lines and cost line types; OTHER_ROLE is
 * silently dropped from person roles (it stays a cost line type). Synthetic data only.
 */
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { loadSeed } from '../seed/load.js';
import { validateSeed } from '../seed/schema.js';
import { closeTestDb, resetDb, testDb } from './helpers.js';

const line = (type: string, person?: string, description?: string) => ({
  type,
  ...(person ? { person } : {}),
  ...(description ? { description } : {}),
  budgetedCents: 10000,
});

function doc() {
  return {
    partners: [{ name: 'Partner A', email: 'partner.a@example.com', roles: ['OTHER_ROLE', 'PIANO'] }],
    people: [
      { name: 'Person 1', roles: ['PIANO', 'KEYS'] },
      { name: 'Person 2', roles: ['OTHER_ROLE'] },
      { name: 'Person 3', roles: ['DJ', 'OTHER_ROLE', 'PIANO', 'VOC'] },
      { name: 'Person 4', roles: ['BASS'] },
    ],
    lineupTemplates: [
      {
        name: 'Template A',
        lines: [
          { type: 'VOC', defaultCents: 10000 },
          { type: 'PIANO', defaultCents: 10000 },
          { type: 'OTHER_ROLE', description: 'Role 1', defaultCents: 10000 },
        ],
      },
      { name: 'Template B', roles: [{ role: 'PIANO', defaultFeeCents: 10000 }] },
    ],
    settings: { 'fees.load_in_deduction': 1000 },
    events: [
      {
        startDate: '2026-06-01',
        lineupName: 'Lineup A',
        venue: 'Venue X',
        seller: 'partner.a@example.com',
        producer: 'partner.a@example.com',
        priceCents: 100000,
        costLines: [line('PIANO', 'Person 1'), line('PIANO'), line('OTHER_ROLE', 'Person 2', 'Role 1'), line('VOC', 'Person 3')],
      },
    ],
  };
}

beforeEach(resetDb);
afterAll(closeTestDb);

describe('validateSeed with PIANO and OTHER_ROLE', () => {
  it('converts PIANO to KEYS and drops OTHER_ROLE from person roles', () => {
    const result = validateSeed(doc());
    expect(result.ok ? [] : result.errors).toEqual([]);
    if (!result.ok) return;
    const { data } = result;
    expect(data.partners[0]!.roles).toEqual(['KEYS']);
    expect(data.people.map((p) => p.roles)).toEqual([['KEYS'], [], ['DJ', 'KEYS', 'VOC'], ['BASS']]);
    expect(data.lineupTemplates[0]!.lines.map((l) => l.type)).toEqual(['VOC', 'KEYS', 'OTHER_ROLE']);
    expect(data.lineupTemplates[1]!.lines.map((l) => l.type)).toEqual(['KEYS', 'OFFICE', 'SALES', 'PRODUCTION']);
    expect(data.events[0]!.costLines!.map((c) => c.type)).toEqual(['KEYS', 'KEYS', 'OTHER_ROLE', 'VOC']);
  });

  it('still rejects a roles list that repeats a code', () => {
    const d = doc();
    d.people[0]!.roles = ['PIANO', 'PIANO'];
    const result = validateSeed(d);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.some((e) => e.startsWith('people.0.roles'))).toBe(true);
  });
});

describe('loading a file with PIANO and OTHER_ROLE', () => {
  it('stores KEYS, never OTHER_ROLE as a person role, roles in MUSICIAN_ROLES order', async () => {
    await loadSeed(testDb(), doc());
    const db = testDb();
    const roles = async (name: string) => (await db.person.findFirstOrThrow({ where: { name } })).roles;
    expect(await roles('Partner A')).toEqual(['KEYS']);
    expect(await roles('Person 1')).toEqual(['KEYS']);
    expect(await roles('Person 2')).toEqual([]);
    expect(await roles('Person 3')).toEqual(['VOC', 'KEYS', 'DJ']);
    const lines = await db.costLine.findMany({ orderBy: { createdAt: 'asc' }, include: { person: true } });
    expect(lines.map((l) => [l.type, l.person?.name ?? null])).toEqual([
      ['KEYS', 'Person 1'],
      ['KEYS', null],
      ['OTHER_ROLE', 'Person 2'],
      ['VOC', 'Person 3'],
    ]);
  });
});
