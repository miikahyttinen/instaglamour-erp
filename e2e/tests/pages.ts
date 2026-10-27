import type { Page } from '@playwright/test';
import { api, CURRENT_YEAR, expect } from './helpers';

/**
 * Ids of the busiest seed records: the event with the most cost lines, Person 1, the offer with the
 * most content (seed "Event 1": city, references, five lineup items) and Client A Oy.
 */
export interface BusyIds {
  eventId: string;
  personId: string;
  offerId: string;
  clientId: string;
}

export async function busyIds(page: Page): Promise<BusyIds> {
  const list = await api(page).get(`/events?year=${CURRENT_YEAR}&status=ALL`);
  // The event with the most cost lines (seed: Template A at Venue X, all paid).
  const details = await Promise.all(list.events.map((g: { id: string }) => api(page).get(`/events/${g.id}`)));
  details.sort((a, b) => b.costLines.length - a.costLines.length);
  const people = (await api(page).get('/people')) as { id: string; name: string }[];
  const offers = (await api(page).get(`/offers?year=${CURRENT_YEAR}`)) as { offers: { id: string; eventName: string }[] };
  const clients = (await api(page).get('/clients')) as { id: string; name: string }[];
  return {
    eventId: details[0].id,
    personId: people.find((p) => p.name === 'Person 1')?.id ?? '',
    offerId: offers.offers.find((o) => o.eventName === 'Event 1')?.id ?? '',
    clientId: clients.find((c) => c.name === 'Client A Oy')?.id ?? '',
  };
}

/** Every main page of the app: [name, path]. */
export function mainPages(ids: BusyIds): [string, string][] {
  return [
    ['offers', '/offers'],
    ['offers, deleted view', '/offers?view=deleted'],
    ['new offer', '/offers/new'],
    ['offer page', `/offers/${ids.offerId}`],
    ['year page', '/'],
    ['event list', '/events'],
    ['event list, deleted view', '/events?view=deleted'],
    ['new event', '/events/new'],
    ['event page', `/events/${ids.eventId}`],
    ['purchase orders', '/purchase-orders'],
    ['clients', '/clients'],
    ['client page', `/clients/${ids.clientId}`],
    ['people', '/people'],
    ['person page', `/people/${ids.personId}`],
    ['tasks', '/tasks'],
    ['my hours', '/hours'],
    ['hours totals', '/hours/totals'],
    ['budget', '/budget'],
    ['data import', '/import'],
  ];
}

export const MAIN_PAGE_NAMES = mainPages({ eventId: '', personId: '', offerId: '', clientId: '' }).map(([name]) => name);

/** Opens a page and waits until its data has loaded. */
export async function openLoaded(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await expect(page.locator('h1').first()).toBeVisible();
  await expect(page.getByText('Ladataan…')).toHaveCount(0);
}
