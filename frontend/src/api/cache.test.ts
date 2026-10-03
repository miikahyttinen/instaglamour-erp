import { QueryClient, type QueryKey } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { budgetKey } from '../features/budget/queries';
import { gigKeys } from '../features/gigs/queries';
import { hoursKey } from '../features/hours/queries';
import { peopleKeys } from '../features/people/queries';
import { yearPageKey } from '../features/year/queries';
import { invalidateYearData, type YearDataChange } from './cache';

const YEAR = 2030;
const keys = {
  year: yearPageKey(YEAR),
  gigList: gigKeys.list({ year: YEAR }),
  gigDetail: gigKeys.detail('g1'),
  costLines: peopleKeys.costLines('p1', YEAR),
  peopleList: peopleKeys.list('all'),
  hourEntries: [...hoursKey, 'entries', YEAR, 'a'],
  hourTotals: [...hoursKey, 'totals', YEAR],
  budget: budgetKey(YEAR),
  tasks: ['tasks', {}],
} satisfies Record<string, QueryKey>;
type Name = keyof typeof keys;

function invalidatedAfter(change: YearDataChange): Name[] {
  const client = new QueryClient();
  for (const key of Object.values(keys)) client.setQueryData(key, {});
  void invalidateYearData(client, change);
  return (Object.keys(keys) as Name[]).filter((name) => client.getQueryState(keys[name])?.isInvalidated);
}

describe('invalidateYearData', () => {
  it('gig and cost line changes refresh the year page, gig lists and person cost lines', () => {
    expect(invalidatedAfter('gigs')).toEqual(['year', 'gigList', 'costLines']);
  });

  it('hours changes refresh the year page and every hours query', () => {
    expect(invalidatedAfter('hours')).toEqual(['year', 'hourEntries', 'hourTotals']);
  });

  it('budget changes refresh the year page and the budget', () => {
    expect(invalidatedAfter('budget')).toEqual(['year', 'budget']);
  });
});
