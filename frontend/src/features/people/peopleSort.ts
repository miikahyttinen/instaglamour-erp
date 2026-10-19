// Client-side sort of the people list (TASK-156): name, played gig count, partnership.
import type { Person } from '../../api/types';
import type { SortDir, TableSort } from '../../components/excelTableState';
import { isPartner } from './partnerRules';

export const PEOPLE_SORT_KEYS = ['name', 'gigCount', 'partner'] as const;
export type PeopleSortKey = (typeof PEOPLE_SORT_KEYS)[number];

export interface PeopleSort {
  key: PeopleSortKey;
  dir: SortDir;
}

export const DEFAULT_PEOPLE_SORT: PeopleSort = { key: 'name', dir: 'asc' };

/** Finnish collation (å, ä, ö after z), case-insensitive, numbers in natural order. */
const collator = new Intl.Collator('fi', { numeric: true, sensitivity: 'base' });

const byName = (a: Person, b: Person) => collator.compare(a.name, b.name);

/** Unknown keys from the URL fall back to the default (name ascending). */
export function parsePeopleSort(sort: TableSort | null): PeopleSort {
  if (!sort || !(PEOPLE_SORT_KEYS as readonly string[]).includes(sort.key)) return DEFAULT_PEOPLE_SORT;
  return { key: sort.key as PeopleSortKey, dir: sort.dir };
}

function compareBy(key: PeopleSortKey, a: Person, b: Person): number {
  switch (key) {
    case 'name':
      return byName(a, b);
    case 'gigCount':
      return a.gigCount - b.gigCount;
    case 'partner':
      // Ascending = active partners first.
      return Number(isPartner(b)) - Number(isPartner(a));
  }
}

/**
 * Sorted copy. `name`: alphabetical. `gigCount`: by number. `partner`: ascending = active partners
 * first, then the others. Ties are always by name ascending (then the API order).
 */
export function sortPeople(people: readonly Person[], sort: PeopleSort): Person[] {
  const sign = sort.dir === 'asc' ? 1 : -1;
  return people
    .map((person, index) => ({ person, index }))
    .sort(
      (a, b) =>
        compareBy(sort.key, a.person, b.person) * sign ||
        byName(a.person, b.person) ||
        a.index - b.index,
    )
    .map((x) => x.person);
}
