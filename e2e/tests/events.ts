import type { Locator, Page } from '@playwright/test';
import { api, SEED } from './helpers';

export interface Reference {
  partners: { id: string; name: string; email: string }[];
  lineupTemplates: { id: string; name: string }[];
}

export async function reference(page: Page): Promise<Reference> {
  return (await api(page).get('/reference')) as Reference;
}

export async function personByName(page: Page, name: string): Promise<{ id: string; name: string }> {
  const people = (await api(page).get('/people?active=all')) as { id: string; name: string }[];
  const person = people.find((p) => p.name === name);
  if (!person) throw new Error(`No person ${name}`);
  return person;
}

export type TechnicalSetup = 'HOUSE_TECH' | 'SET_A' | 'SET_B' | 'SET_C';
export type Logistics = 'OWN_VAN' | 'RENTAL_VAN' | 'TAXI' | 'OTHER';

/** Creates a Template B event through the API (setup for flows that are not about creating). */
export async function createEventViaApi(
  page: Page,
  opts: {
    startDate: string;
    venue: string;
    priceCents?: number;
    technicalSetup?: TechnicalSetup | null;
    logistics?: Logistics | null;
    houseTechnician?: boolean;
  },
): Promise<{
  id: string;
  lineupName: string;
  venue: string;
  technicalSetup: TechnicalSetup | null;
  logistics: Logistics | null;
  houseTechnician: boolean;
  costLines: { id: string; type: string }[];
}> {
  const ref = await reference(page);
  const me = (await api(page).get('/me')) as { id: string };
  const template = ref.lineupTemplates.find((t) => t.name === SEED.templateB.name);
  if (!template) throw new Error('Template B missing from the example seed');
  return api(page).post('/events', {
    startDate: opts.startDate,
    endDate: null,
    lineupTemplateId: template.id,
    lineupName: null,
    venue: opts.venue,
    // Contract 2026-10-05: one code or null (no longer an array).
    technicalSetup: opts.technicalSetup ?? null,
    logistics: opts.logistics ?? null,
    houseTechnician: opts.houseTechnician ?? false,
    sellerId: me.id,
    producerId: me.id,
    priceCents: opts.priceCents ?? 100000,
    additionalSalesCents: 0,
    additionalSalesDescription: null,
    notes: null,
  });
}

/** Random suffix so repeated runs on the same database don't collide. */
export function suffix(): string {
  return Math.random().toString(36).slice(2, 7);
}

// ---- Event page and event list locators (markup after the design restyle, TASK-110…116) ----

/** One cost line on the event page: each line is its own `<tbody aria-label="<type>">`. */
export function costLine(page: Page, label: string): Locator {
  return page.getByRole('table', { name: 'Kulut ja miehitys' }).getByRole('rowgroup', { name: label, exact: true });
}

/**
 * All cost lines on the event page: the named rowgroups. The column header row group, the group
 * heads ("Miehitys" / "Kulut") and the group totals rows are unnamed row groups.
 */
export function costLines(page: Page): Locator {
  return page
    .getByRole('table', { name: 'Kulut ja miehitys' })
    .getByRole('rowgroup', { name: /\S/ })
    .filter({ has: page.getByRole('cell') });
}

/**
 * Economics stat tile on the event page (`Kulut`, `Kate`, `Kate-%`): the big figure is the budget,
 * the secondary figure (caption "Toteuma") is the actual.
 */
export function econTile(page: Page, label: string): { budget: Locator; actual: Locator } {
  const tile = page.getByRole('region', { name: label, exact: true });
  return {
    budget: tile.locator('.stat-tile-value'),
    actual: tile
      .locator('.stat-tile-secondary')
      .filter({ hasText: 'Toteuma' })
      .locator('.stat-tile-secondary-value'),
  };
}

/** The live "Kokonaishinta: …" line under the price inputs of the new event form. */
export function totalPriceLine(page: Page): Locator {
  return page.getByRole('main').locator('p', { hasText: /^Kokonaishinta:/ });
}

/** Event page: the saved total price under the inline price fields (`role="group"`). */
export function totalPrice(page: Page): Locator {
  return page.getByRole('main').getByRole('group', { name: 'Kokonaishinta', exact: true });
}

/** Cost line field on the event page, e.g. `costField(page, 'Budjetti', 'Laulu')` → "Budjetti: Laulu". */
export function costField(page: Page, field: 'Budjetti' | 'Kuvaus' | 'Maksettu summa' | 'Henkilö', line: string): Locator {
  return page
    .getByRole('table', { name: 'Kulut ja miehitys' })
    .getByLabel(`${field}: ${line}`, { exact: true });
}

/**
 * The event list (TASK-144): one Excel-style table "Keikkalista" at every width; below 600 px the
 * same table is laid out as compact rows (CSS), so rows are always table rows.
 */
export function eventTable(page: Page): Locator {
  return page.getByRole('table', { name: 'Keikkalista', exact: true });
}

/** Data rows of the event list (the phone rows are the same rows). */
export function eventListRows(page: Page): Locator {
  return eventTable(page).getByRole('row').filter({ has: page.getByRole('cell') });
}
