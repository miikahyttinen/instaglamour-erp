import type { Page } from '@playwright/test';
import { api, CURRENT_YEAR, expect } from './helpers';

/** Ids of the busiest seed records: the gig with the most cost lines and Person 1. */
export interface BusyIds {
  gigId: string;
  personId: string;
}

export async function busyIds(page: Page): Promise<BusyIds> {
  const list = await api(page).get(`/gigs?year=${CURRENT_YEAR}&status=ALL`);
  // The gig with the most cost lines (seed: Template A at Venue X, all paid).
  const details = await Promise.all(list.gigs.map((g: { id: string }) => api(page).get(`/gigs/${g.id}`)));
  details.sort((a, b) => b.costLines.length - a.costLines.length);
  const people = (await api(page).get('/people')) as { id: string; name: string }[];
  return { gigId: details[0].id, personId: people.find((p) => p.name === 'Person 1')?.id ?? '' };
}

/** Every main page of the app: [name, path]. */
export function mainPages(ids: BusyIds): [string, string][] {
  return [
    ['year page', '/'],
    ['gig list', '/gigs'],
    ['gig list, deleted view', '/gigs?view=deleted'],
    ['new gig', '/gigs/new'],
    ['gig page', `/gigs/${ids.gigId}`],
    ['people', '/people'],
    ['person page', `/people/${ids.personId}`],
    ['tasks', '/tasks'],
    ['my hours', '/hours'],
    ['hours totals', '/hours/totals'],
    ['budget', '/budget'],
  ];
}

export const MAIN_PAGE_NAMES = mainPages({ gigId: '', personId: '' }).map(([name]) => name);

/** Opens a page and waits until its data has loaded. */
export async function openLoaded(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await expect(page.locator('h1').first()).toBeVisible();
  await expect(page.getByText('Ladataan…')).toHaveCount(0);
}
