/**
 * Seed / import lineup format (2026-11-06, TASK-051): `lines` of any cost type; the legacy `roles`
 * converted like the migration (roles, then OFFICE/SALES/PRODUCTION with the file's old
 * `fees.*_default` values, else 0); the old fee keys are optional and never stored; re-run sets an
 * existing lineup's lines only when it has none. Synthetic data only.
 */
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { loadSeed } from '../seed/load.js';
import { validateSeed } from '../seed/schema.js';
import { closeTestDb, resetDb, testDb } from './helpers.js';

type Doc = Record<string, unknown> & { lineupTemplates: Record<string, unknown>[]; settings: Record<string, unknown>; events: Record<string, unknown>[] };

function doc(): Doc {
  return {
    partners: [
      { name: 'Partner A', email: 'partner.a@example.com' },
      { name: 'Partner B', email: 'partner.b@example.com' },
    ],
    lineupTemplates: [
      {
        name: 'Template A',
        lines: [
          { type: 'VOC', defaultCents: 30000 },
          { type: 'OTHER', description: 'Stage rental', defaultCents: 10000 },
          { type: 'SALES', defaultCents: 1000 },
        ],
      },
    ],
    settings: { 'fees.load_in_deduction': 1000 },
    events: [
      {
        startDate: '2026-06-01',
        lineupTemplate: 'Template A',
        venue: 'Venue X',
        seller: 'partner.a@example.com',
        producer: 'partner.b@example.com',
        priceCents: 100000,
      },
    ],
  };
}

const linesOf = async (name: string) =>
  (
    await testDb().lineupTemplate.findFirstOrThrow({ where: { name }, include: { lines: { orderBy: { position: 'asc' } } } })
  ).lines.map((l) => [l.type, l.description, l.defaultCents]);

beforeEach(resetDb);
afterAll(closeTestDb);

describe('seed lineups: lines format', () => {
  it('stores the lines and generates event cost lines from them (missing PRODUCTION added at 0)', async () => {
    await loadSeed(testDb(), doc());
    expect(await linesOf('Template A')).toEqual([
      ['VOC', null, 30000],
      ['OTHER', 'Stage rental', 10000],
      ['SALES', null, 1000],
    ]);
    const a = await testDb().partner.findFirstOrThrow({ where: { email: 'partner.a@example.com' } });
    const b = await testDb().partner.findFirstOrThrow({ where: { email: 'partner.b@example.com' } });
    const lines = await testDb().costLine.findMany({ orderBy: { createdAt: 'asc' } });
    expect(lines.map((l) => [l.type, l.personId, l.description, l.budgetedCents, l.joinsLoadIn])).toEqual([
      ['VOC', null, null, 30000, true],
      ['OTHER', null, 'Stage rental', 10000, null],
      ['SALES', a.personId, null, 1000, null],
      ['PRODUCTION', b.personId, null, 0, null],
    ]);
    expect(await testDb().lineupTemplate.findFirstOrThrow()).toMatchObject({ active: true });
  });

  it('a custom-lineup event gets OFFICE / SALES / PRODUCTION at 0', async () => {
    const d = doc();
    d.events[0] = { ...d.events[0], lineupTemplate: undefined, lineupName: 'Custom' };
    delete d.events[0].lineupTemplate;
    await loadSeed(testDb(), d);
    const lines = await testDb().costLine.findMany({ orderBy: { createdAt: 'asc' } });
    expect(lines.map((l) => [l.type, l.budgetedCents])).toEqual([
      ['OFFICE', 0],
      ['SALES', 0],
      ['PRODUCTION', 0],
    ]);
  });

  it('validates lines: description for OTHER/OTHER_ROLE, amounts, ≤ 100, not both lines and roles', () => {
    // Structural errors (reported first, by the schema)
    const d = doc();
    d.lineupTemplates.push(
      { name: 'Template C', lines: [{ type: 'VOC', defaultCents: -1 }] },
      { name: 'Template D', lines: Array.from({ length: 101 }, () => ({ type: 'VOC', defaultCents: 0 })) },
    );
    let result = validateSeed(d);
    const errors = result.ok ? '' : result.errors.join('\n');
    expect(errors).toMatch(/lineupTemplates\.1\.lines\.0\.defaultCents/);
    expect(errors).toMatch(/lineupTemplates\.2\.lines/);

    // Rules
    const noDescription = doc();
    noDescription.lineupTemplates.push({ name: 'Template B', lines: [{ type: 'OTHER_ROLE', defaultCents: 0 }] });
    result = validateSeed(noDescription);
    expect(result.ok ? '' : result.errors.join('\n')).toMatch(/lineupTemplates\.1\.lines\.0\.description: required for OTHER_ROLE/);

    const both = doc();
    both.lineupTemplates[0]!.roles = [{ role: 'VOC', defaultFeeCents: 0 }];
    result = validateSeed(both);
    expect(result.ok ? '' : result.errors.join('\n')).toMatch(/lineupTemplates\.0: use either lines or the legacy roles/);
  });

  it('an event may refer to a lineup in another letter case', async () => {
    const d = doc();
    d.events[0]!.lineupTemplate = 'template a';
    await loadSeed(testDb(), d);
    expect((await testDb().event.findFirstOrThrow()).lineupTemplateId).not.toBeNull();
  });
});

describe('seed lineups: legacy roles format', () => {
  function legacy(): Doc {
    const d = doc();
    d.lineupTemplates = [{ name: 'Template A', roles: [{ role: 'VOC', defaultFeeCents: 30000 }, { role: 'BASS', defaultFeeCents: 20000 }] }];
    return d;
  }

  it('converts roles + the old fee settings to lines; the old keys are not stored', async () => {
    const d = legacy();
    d.settings = { ...d.settings, 'fees.office_default': 11000, 'fees.sales_default': 12000, 'fees.production_default': 13000 };
    const result = validateSeed(d);
    expect(result.ok ? [] : result.errors).toEqual([]);
    await loadSeed(testDb(), d);
    expect(await linesOf('Template A')).toEqual([
      ['VOC', null, 30000],
      ['BASS', null, 20000],
      ['OFFICE', null, 11000],
      ['SALES', null, 12000],
      ['PRODUCTION', null, 13000],
    ]);
    expect((await testDb().setting.findMany()).map((s) => s.key)).toEqual(['fees.load_in_deduction']);
    const lines = await testDb().costLine.findMany({ orderBy: { createdAt: 'asc' } });
    expect(lines.map((l) => [l.type, l.budgetedCents])).toEqual([
      ['VOC', 30000],
      ['BASS', 20000],
      ['OFFICE', 11000],
      ['SALES', 12000],
      ['PRODUCTION', 13000],
    ]);
  });

  it('without the old fee settings the internal lines are 0', async () => {
    await loadSeed(testDb(), legacy());
    expect(await linesOf('Template A')).toEqual([
      ['VOC', null, 30000],
      ['BASS', null, 20000],
      ['OFFICE', null, 0],
      ['SALES', null, 0],
      ['PRODUCTION', null, 0],
    ]);
  });

  it('the old fee keys must be amounts in cents when given', () => {
    const d = legacy();
    d.settings = { ...d.settings, 'fees.office_default': 'x' };
    const result = validateSeed(d);
    expect(result.ok ? [] : result.errors).toContain('settings.fees.office_default: must be an amount in cents');
  });
});

describe('seed lineups: re-run', () => {
  it('never changes lines of a lineup that has lines; fills an empty one; matches names case-insensitively', async () => {
    await loadSeed(testDb(), doc());
    const changed = doc();
    changed.lineupTemplates[0] = { name: 'TEMPLATE A', lines: [{ type: 'DJ', defaultCents: 1000 }] };
    changed.events = [];
    let summary = await loadSeed(testDb(), changed);
    expect(summary.lineupTemplates).toEqual({ created: 0, updated: 0, skipped: 1 });
    expect(await testDb().lineupTemplate.count()).toBe(1);
    expect((await linesOf('Template A'))[0]).toEqual(['VOC', null, 30000]);

    await testDb().lineupLine.deleteMany();
    summary = await loadSeed(testDb(), changed);
    expect(summary.lineupTemplates).toEqual({ created: 0, updated: 1, skipped: 0 });
    expect(await linesOf('Template A')).toEqual([['DJ', null, 1000]]);
  });

  it('keeps an inactive lineup inactive', async () => {
    await loadSeed(testDb(), doc());
    await testDb().lineupTemplate.updateMany({ data: { active: false } });
    const again = doc();
    again.events = [];
    await loadSeed(testDb(), again);
    expect((await testDb().lineupTemplate.findFirstOrThrow()).active).toBe(false);
  });
});
