import type { Page } from '@playwright/test';
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
