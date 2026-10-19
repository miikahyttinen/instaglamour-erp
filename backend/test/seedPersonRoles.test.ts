/**
 * Seed / import: optional `roles` on people and partners (TASK-027), filled only when the person
 * has no roles yet. Synthetic data only.
 */
import path from 'node:path';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { loadSeed, readSeedFile } from '../seed/load.js';
import { validateSeed } from '../seed/schema.js';
import { closeTestDb, resetDb, testDb } from './helpers.js';

type Doc = Record<string, unknown> & {
  partners: Record<string, unknown>[];
  people: Record<string, unknown>[];
};

const exampleSeedPath = path.resolve(import.meta.dirname, '../seed/seed.example.json');
const example = () => structuredClone(readSeedFile(exampleSeedPath)) as Doc;

const rolesOf = async (name: string) => (await testDb().person.findFirstOrThrow({ where: { name } })).roles;

beforeEach(resetDb);
afterAll(closeTestDb);

describe('seed roles validation', () => {
  it('accepts musician roles on people and partners, optional', () => {
    const data = example();
    data.partners[0]!.roles = ['VOC', 'KEYS'];
    data.people[0]!.roles = [];
    delete data.people[1]!.roles;
    const result = validateSeed(data);
    expect(result.ok ? [] : result.errors).toEqual([]);
  });

  it('rejects duplicates and non-musician codes with their path', () => {
    const data = example();
    data.partners[0]!.roles = ['VOC', 'VOC'];
    data.people[0]!.roles = ['OFFICE'];
    data.people[1]!.roles = 'GUITAR';
    const result = validateSeed(data);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.startsWith('partners.0.roles'))).toBe(true);
      expect(result.errors.some((e) => e.startsWith('people.0.roles'))).toBe(true);
      expect(result.errors.some((e) => e.startsWith('people.1.roles'))).toBe(true);
    }
  });
});

describe('loading roles', () => {
  it('sets roles on new people and partners in MUSICIAN_ROLES order', async () => {
    const data = example();
    data.partners[0]!.roles = ['KEYS', 'VOC'];
    data.people[0]!.roles = ['BACKING_VOC', 'VOC'];
    await loadSeed(testDb(), data);
    expect(await rolesOf(data.partners[0]!.name as string)).toEqual(['VOC', 'KEYS']);
    expect(await rolesOf(data.people[0]!.name as string)).toEqual(['VOC', 'BACKING_VOC']);
    expect(await rolesOf(data.partners[1]!.name as string)).toEqual([]);
  });

  it('fills only empty roles on a re-run (also for existing partners) and counts them as updated', async () => {
    const data = example();
    const partnerA = data.partners[0]!.name as string;
    const partnerB = data.partners[1]!.name as string;
    const person1 = data.people[0]!.name as string;
    const person2 = data.people[1]!.name as string;
    delete data.partners[0]!.roles;
    delete data.partners[1]!.roles;
    await loadSeed(testDb(), data);

    // App edits: Person 1 got other roles; Person 2's roles were cleared; Partner B got roles
    const db = testDb();
    await db.person.updateMany({ where: { name: person1 }, data: { roles: ['DRUMS'] } });
    await db.person.updateMany({ where: { name: person2 }, data: { roles: [] } });
    await db.person.updateMany({ where: { name: partnerB }, data: { roles: ['BASS'] } });

    data.partners[0]!.roles = ['VOC'];
    data.partners[1]!.roles = ['GUITAR'];
    const summary = await loadSeed(testDb(), data);

    expect(await rolesOf(person1)).toEqual(['DRUMS']); // never overwritten
    expect(await rolesOf(person2)).toEqual(['GUITAR']); // filled (example: ["GUITAR"])
    expect(await rolesOf(partnerA)).toEqual(['VOC']); // existing partner filled
    expect(await rolesOf(partnerB)).toEqual(['BASS']); // existing partner kept
    expect(summary.partners).toEqual({ created: 0, updated: 1, skipped: data.partners.length - 1 });
    expect(summary.people).toEqual({ created: 0, updated: 1, skipped: data.people.length - 1 });

    // Nothing left to fill: a third run changes nothing
    const again = await loadSeed(testDb(), data);
    expect(again.partners.updated).toBe(0);
    expect(again.people.updated).toBe(0);
  });

  it('never changes anything else about an existing partner when filling roles', async () => {
    const data = example();
    delete data.partners[0]!.roles;
    await loadSeed(testDb(), data);
    const db = testDb();
    const before = await db.partner.findFirstOrThrow({ where: { email: data.partners[0]!.email as string }, include: { person: true } });
    await db.partner.update({ where: { id: before.id }, data: { active: false } });

    data.partners[0]!.roles = ['VOC'];
    data.partners[0]!.language = before.language === 'fi' ? 'en' : 'fi';
    await loadSeed(testDb(), data);
    const after = await db.partner.findUniqueOrThrow({ where: { id: before.id }, include: { person: true } });
    expect(after.active).toBe(false);
    expect(after.language).toBe(before.language);
    expect(after.person.name).toBe(before.person.name);
    expect(after.person.active).toBe(before.person.active);
    expect(after.person.roles).toEqual(['VOC']);
  });

  it('a dry run counts the fill but saves nothing', async () => {
    const data = example();
    const person1 = data.people[0]!.name as string;
    await loadSeed(testDb(), data);
    await testDb().person.updateMany({ where: { name: person1 }, data: { roles: [] } });
    const summary = await loadSeed(testDb(), data, { dryRun: true });
    expect(summary.people.updated).toBe(1);
    expect(await rolesOf(person1)).toEqual([]);
  });
});
