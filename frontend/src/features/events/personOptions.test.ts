import { describe, expect, it } from 'vitest';
import type { MusicianRole } from '../../api/enums';
import type { Person } from '../../api/types';
import { roleFilterOf, selectablePeople } from './personOptions';

// Synthetic people only (BR-090).
const make = (name: string, roles: MusicianRole[], extra: Partial<Person> = {}): Person => ({
  id: name,
  name,
  active: true,
  partner: null,
  roles,
  eventCount: 0,
  ...extra,
});
const partnerA = make('Partner A', ['VOC'], { partner: { id: 'pa', email: 'a@example.com', active: true } });
const person1 = make('Person 1', ['GUITAR', 'BASS']);
const person2 = make('Person 2', ['DRUMS']);
const person3 = make('Person 3', []);
const inactiveGuitarist = make('Person 4', ['GUITAR'], { active: false });
const people = [partnerA, person1, person2, person3, inactiveGuitarist];
const names = (list: Person[]) => list.map((p) => p.name);

describe('selectablePeople (TASK-185)', () => {
  it('musician role: only active people with that role', () => {
    expect(names(selectablePeople(people, null, 'GUITAR'))).toEqual(['Person 1']);
    expect(names(selectablePeople(people, null, 'VOC'))).toEqual(['Partner A']);
  });

  it('nobody with the role: empty list', () => {
    expect(selectablePeople(people, null, 'VIOLIN')).toEqual([]);
  });

  it('OTHER_ROLE, other internal roles, expenses and no type: every active person', () => {
    const everyone = ['Partner A', 'Person 1', 'Person 2', 'Person 3'];
    for (const type of ['OTHER_ROLE', 'OFFICE', 'OTHER', '', null] as const) {
      expect(names(selectablePeople(people, null, type))).toEqual(everyone);
    }
    expect(names(selectablePeople(people, null))).toEqual(everyone);
  });

  it('SALES / PRODUCTION: only active partners (unchanged)', () => {
    expect(names(selectablePeople(people, null, 'SALES'))).toEqual(['Partner A']);
    expect(names(selectablePeople(people, null, 'PRODUCTION'))).toEqual(['Partner A']);
  });

  it("keeps the line's current person even without the role or when inactive", () => {
    expect(names(selectablePeople(people, person2.id, 'GUITAR'))).toEqual(['Person 1', 'Person 2']);
    expect(names(selectablePeople(people, inactiveGuitarist.id, 'GUITAR'))).toEqual(['Person 1', 'Person 4']);
    expect(names(selectablePeople(people, person3.id, 'SALES'))).toEqual(['Partner A', 'Person 3']);
  });

  it('roleFilterOf: musician roles except OTHER_ROLE', () => {
    expect(roleFilterOf('DRUMS')).toBe('DRUMS');
    expect(roleFilterOf('OTHER_ROLE')).toBeNull();
    expect(roleFilterOf('SALES')).toBeNull();
    expect(roleFilterOf('OTHER')).toBeNull();
    expect(roleFilterOf('')).toBeNull();
  });
});
