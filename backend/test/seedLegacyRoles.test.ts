/**
 * Seed / import (TASK-041): files written before the role cleanup may still use HORN_1, HORN_2 and
 * TECHNICIAN. They are converted like the migration: HORN_1 → TRUMPET, TECHNICIAN → MIX, HORN_2 →
 * SAX when the person's roles in the file have SAX but not TROMBONE, else TROMBONE. Synthetic data only.
 */
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { loadSeed } from '../seed/load.js';
import { validateSeed } from '../seed/schema.js';
import { closeTestDb, resetDb, testDb } from './helpers.js';

const line = (type: string, person?: string) => ({ type, ...(person ? { person } : {}), budgetedCents: 10000 });

/** A minimal old-style seed file (before 2026-10-30). */
function oldStyleDoc() {
  return {
    partners: [{ name: 'Partner A', email: 'partner.a@example.com', roles: ['VOC', 'HORN_1'] }],
    people: [
      { name: 'Person 1', roles: ['SAX', 'HORN_2'] },
      { name: 'Person 2', roles: ['TROMBONE'] },
      { name: 'Person 3', roles: ['SAX', 'TROMBONE'] },
      { name: 'Person 4' },
      { name: 'Person 5', roles: ['TECHNICIAN', 'HORN_1', 'MIX', 'TRUMPET', 'VOC'] },
      { name: 'Person 6', roles: ['HORN_2'] },
    ],
    lineupTemplates: [
      {
        name: 'Template A',
        roles: [
          { role: 'VOC', defaultFeeCents: 10000 },
          { role: 'HORN_1', defaultFeeCents: 10000 },
          { role: 'HORN_2', defaultFeeCents: 10000 },
          { role: 'TECHNICIAN', defaultFeeCents: 10000 },
        ],
      },
    ],
    settings: {
      'fees.office_default': 10000,
      'fees.sales_default': 10000,
      'fees.production_default': 10000,
      'fees.load_in_deduction': 1000,
    },
    events: [
      {
        startDate: '2026-06-01',
        lineupName: 'Lineup A',
        venue: 'Venue X',
        seller: 'partner.a@example.com',
        producer: 'partner.a@example.com',
        priceCents: 100000,
        costLines: [
          line('HORN_2', 'Person 1'), // SAX, not TROMBONE → SAX
          line('HORN_2', 'Person 2'), // TROMBONE → TROMBONE
          line('HORN_2', 'Person 3'), // both → TROMBONE
          line('HORN_2', 'Person 4'), // no roles → TROMBONE
          line('HORN_2'), // no person → TROMBONE
          line('HORN_1', 'Partner A'),
          line('TECHNICIAN', 'Person 5'),
          line('VOC', 'Person 5'),
        ],
      },
    ],
  };
}

beforeEach(resetDb);
afterAll(closeTestDb);

describe('validateSeed with removed role codes', () => {
  it('converts person roles, template roles and cost line types', () => {
    const result = validateSeed(oldStyleDoc());
    expect(result.ok ? [] : result.errors).toEqual([]);
    if (!result.ok) return;
    const { data } = result;
    expect(data.partners[0]!.roles).toEqual(['VOC', 'TRUMPET']);
    expect(data.people.map((p) => p.roles)).toEqual([
      ['SAX'], // HORN_2 → SAX, de-duplicated
      ['TROMBONE'],
      ['SAX', 'TROMBONE'],
      undefined,
      ['MIX', 'TRUMPET', 'VOC'], // de-duplicated; stored in MUSICIAN_ROLES order on load
      ['TROMBONE'],
    ]);
    expect(data.lineupTemplates[0]!.roles.map((r) => r.role)).toEqual(['VOC', 'TRUMPET', 'TROMBONE', 'MIX']);
    expect(data.events[0]!.costLines!.map((c) => c.type)).toEqual([
      'SAX',
      'TROMBONE',
      'TROMBONE',
      'TROMBONE',
      'TROMBONE',
      'TRUMPET',
      'MIX',
      'VOC',
    ]);
  });

  it('HORN_2 on a line follows the person roles in the file, also for partners', () => {
    const doc = oldStyleDoc();
    doc.partners[0]!.roles = ['SAX'];
    doc.events[0]!.costLines = [line('HORN_2', 'Partner A'), line('HORN_2', 'Person 6')];
    const result = validateSeed(doc);
    expect(result.ok && result.data.events[0]!.costLines!.map((c) => c.type)).toEqual(['SAX', 'TROMBONE']);
  });

  it('still rejects a roles list that repeats a code, and unknown codes', () => {
    const doc = oldStyleDoc();
    doc.people[0]!.roles = ['HORN_2', 'HORN_2'];
    doc.people[1]!.roles = ['HORN_3'];
    const result = validateSeed(doc);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.startsWith('people.0.roles'))).toBe(true);
      expect(result.errors.some((e) => e.startsWith('people.1.roles'))).toBe(true);
    }
  });

  it('accepts the legacy `gigs` key with old codes too', () => {
    const { events, ...rest } = oldStyleDoc();
    const result = validateSeed({ ...rest, gigs: events });
    expect(result.ok && result.data.events[0]!.costLines![0]!.type).toBe('SAX');
  });
});

describe('loading an old-style file', () => {
  it('stores only current codes, person roles in MUSICIAN_ROLES order', async () => {
    await loadSeed(testDb(), oldStyleDoc());
    const db = testDb();
    const roles = async (name: string) => (await db.person.findFirstOrThrow({ where: { name } })).roles;
    expect(await roles('Partner A')).toEqual(['VOC', 'TRUMPET']);
    expect(await roles('Person 1')).toEqual(['SAX']);
    expect(await roles('Person 5')).toEqual(['VOC', 'MIX', 'TRUMPET']);
    const template = await db.lineupTemplate.findFirstOrThrow({ include: { roles: { orderBy: { position: 'asc' } } } });
    expect(template.roles.map((r) => r.role)).toEqual(['VOC', 'TRUMPET', 'TROMBONE', 'MIX']);
    const lines = await db.costLine.findMany({ orderBy: { createdAt: 'asc' }, include: { person: true } });
    expect(lines.map((l) => [l.type, l.person?.name ?? null])).toEqual([
      ['SAX', 'Person 1'],
      ['TROMBONE', 'Person 2'],
      ['TROMBONE', 'Person 3'],
      ['TROMBONE', 'Person 4'],
      ['TROMBONE', null],
      ['TRUMPET', 'Partner A'],
      ['MIX', 'Person 5'],
      ['VOC', 'Person 5'],
    ]);
  });

  it('a re-run of the old file next to the converted data changes nothing', async () => {
    await loadSeed(testDb(), oldStyleDoc());
    const summary = await loadSeed(testDb(), oldStyleDoc());
    expect(summary.lineupTemplates).toEqual({ created: 0, updated: 0, skipped: 1 });
    expect(summary.events).toEqual({ created: 0, updated: 0, skipped: 1 });
  });
});
