import type { Locator, Page } from '@playwright/test';
import { api, isWide, SEED } from './helpers';

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

/** Creates a Template B gig through the API (setup for flows that are not about creating). */
export async function createGigViaApi(
  page: Page,
  opts: { startDate: string; venue: string; priceCents?: number },
): Promise<{ id: string; lineupName: string; venue: string; costLines: { id: string; type: string }[] }> {
  const ref = await reference(page);
  const me = (await api(page).get('/me')) as { id: string };
  const template = ref.lineupTemplates.find((t) => t.name === SEED.templateB.name);
  if (!template) throw new Error('Template B missing from the example seed');
  return api(page).post('/gigs', {
    startDate: opts.startDate,
    endDate: null,
    lineupTemplateId: template.id,
    lineupName: null,
    venue: opts.venue,
    technicalSetup: [],
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

// ---- Gig page and gig list locators (markup after the design restyle, TASK-110…116) ----

/** One cost line on the gig page: each line is its own `<tbody aria-label="<type>">`. */
export function costLine(page: Page, label: string): Locator {
  return page.getByRole('table', { name: 'Kulut ja miehitys' }).getByRole('rowgroup', { name: label, exact: true });
}

/** All cost lines on the gig page (the header rowgroup has column headers, no cells). */
export function costLines(page: Page): Locator {
  return page
    .getByRole('table', { name: 'Kulut ja miehitys' })
    .getByRole('rowgroup')
    .filter({ has: page.getByRole('cell') });
}

/**
 * Economics stat tile on the gig page (`Kulut`, `Kate`, `Kate-%`): the big figure is the budget,
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

/** The live "Kokonaishinta: …" line under the price inputs of the new gig form. */
export function totalPriceLine(page: Page): Locator {
  return page.getByRole('main').locator('p', { hasText: /^Kokonaishinta:/ });
}

/** Gig page: the saved total price under the inline price fields (`role="group"`). */
export function totalPrice(page: Page): Locator {
  return page.getByRole('main').getByRole('group', { name: 'Kokonaishinta', exact: true });
}

/** Cost line field on the gig page, e.g. `costField(page, 'Budjetti', 'Laulu')` → "Budjetti: Laulu". */
export function costField(page: Page, field: 'Budjetti' | 'Kuvaus' | 'Maksettu summa' | 'Henkilö', line: string): Locator {
  return page
    .getByRole('table', { name: 'Kulut ja miehitys' })
    .getByLabel(`${field}: ${line}`, { exact: true });
}

/** Rows of the gig list: a table from 900 px, cards (list items) below that. */
export function gigListRows(page: Page): Locator {
  return isWide(page)
    ? page.getByRole('table', { name: 'Keikkalista' }).getByRole('row').filter({ has: page.getByRole('cell') })
    : page.getByRole('list', { name: 'Keikkalista' }).getByRole('listitem');
}
