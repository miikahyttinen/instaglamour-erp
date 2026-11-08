import type { Locator, Page } from '@playwright/test';
import { api, expect, expectNoHorizontalScroll, goNav, signIn, tagOf, test } from './helpers';
import { createEventViaApi, suffix } from './events';

// My gigs (owner request 2026-11-08, TASK-194 / TASK-056): the start page lists the signed-in
// partner's upcoming SOLD gigs where they are the producer or have a musician-role line, soonest
// first, with their roles and the "Miehitys kesken" tag. Each project uses its own far-future
// year so the rows are easy to find. Synthetic data only.

interface MyEvent {
  eventId: string;
  startDate: string;
  lineupName: string;
  venue: string;
  roles: ({ kind: 'PRODUCER' } | { kind: 'MUSICIAN'; type: string; description: string | null })[];
  notFullyStaffed: boolean;
}

const table = (page: Page): Locator => page.getByRole('table', { name: 'Omat keikat' });
/** A row by its venue (also works on phones, where rows are compact flex rows). */
const rowOf = (page: Page, venue: string): Locator => table(page).locator('tbody tr').filter({ hasText: venue });

async function partnerId(page: Page, name: string): Promise<string> {
  const ref = (await api(page).get('/reference')) as { partners: { id: string; name: string }[] };
  const partner = ref.partners.find((p) => p.name === name);
  if (!partner) throw new Error(`${name} missing from the example seed`);
  return partner.id;
}

test('My gigs lists my upcoming gigs with roles and the staffing tag, soonest first', async ({ page }, testInfo) => {
  const me = await signIn(page);
  const year = tagOf(testInfo) === 'M' ? 2048 : 2049;
  const tag = `${tagOf(testInfo)}-${suffix()}`;
  const partnerB = await partnerId(page, 'Partner B');

  // 1) I produce it and also play a custom role; the template's musician lines are unstaffed.
  const produced = await createEventViaApi(page, { startDate: `${year}-03-14`, venue: `Venue P ${tag}` });
  await api(page).post(`/events/${produced.id}/cost-lines`, {
    type: 'OTHER_ROLE',
    personId: me.personId,
    description: 'Role X',
    budgetedCents: 1000,
  });
  // 2) Someone else produces; I play keys; fully staffed (custom lineup without template lines).
  const played = (await api(page).post('/events', {
    startDate: `${year}-03-07`,
    endDate: `${year}-03-08`,
    lineupTemplateId: null,
    lineupName: `Lineup ${tag}`,
    venue: `Venue M ${tag}`,
    technicalSetup: null,
    logistics: null,
    houseTechnician: false,
    sellerId: partnerB,
    producerId: partnerB,
    priceCents: 100000,
    additionalSalesCents: 0,
    additionalSalesDescription: null,
    notes: null,
  })) as { id: string };
  await api(page).post(`/events/${played.id}/cost-lines`, { type: 'KEYS', personId: me.personId, budgetedCents: 1000 });
  // 3) Not mine: another producer, no own line.
  const other = (await api(page).post('/events', {
    startDate: `${year}-03-01`,
    endDate: null,
    lineupTemplateId: null,
    lineupName: `Lineup ${tag} other`,
    venue: `Venue O ${tag}`,
    technicalSetup: null,
    logistics: null,
    houseTechnician: false,
    sellerId: partnerB,
    producerId: partnerB,
    priceCents: 100000,
    additionalSalesCents: 0,
    additionalSalesDescription: null,
    notes: null,
  })) as { id: string };

  // API (contract): roles, tag and order.
  const mine = (await api(page).get('/me/events')) as MyEvent[];
  const byId = new Map(mine.map((e) => [e.eventId, e]));
  expect(byId.get(produced.id)?.roles).toEqual([
    { kind: 'PRODUCER' },
    { kind: 'MUSICIAN', type: 'OTHER_ROLE', description: 'Role X' },
  ]);
  expect(byId.get(produced.id)?.notFullyStaffed).toBe(true);
  expect(byId.get(played.id)?.roles).toEqual([{ kind: 'MUSICIAN', type: 'KEYS', description: null }]);
  expect(byId.get(played.id)?.notFullyStaffed).toBe(false);
  expect(byId.has(other.id)).toBe(false);

  // UI: the start page, same rows in the same order as the API.
  await page.goto('/');
  await expect(page).toHaveURL(/\/my-gigs$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Omat keikat' })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Valittu vuosi' })).toHaveCount(0);
  const links = table(page).locator('tbody tr td.cell-primary a');
  await expect(links).toHaveCount(mine.length);
  expect(await links.evaluateAll((as) => as.map((a) => a.getAttribute('href')))).toEqual(
    mine.map((e) => `/gigs/${e.eventId}`),
  );

  const playedRow = rowOf(page, `Venue M ${tag}`);
  await expect(playedRow).toContainText(`${weekdayFi(`${year}-03-07`)} 7.3.${year}–8.3.${year}`);
  await expect(playedRow.locator('.my-events-role')).toHaveText(['Koskettimet']);
  await expect(playedRow.getByText('Miehitys kesken')).toHaveCount(0);

  const producedRow = rowOf(page, `Venue P ${tag}`);
  await expect(producedRow.getByRole('link', { name: produced.lineupName })).toHaveAttribute('href', `/gigs/${produced.id}`);
  await expect(producedRow.locator('.my-events-role')).toHaveText(['Tuottaja', 'Role X']);
  await expect(producedRow.getByText('Miehitys kesken')).toBeVisible();
  await expect(rowOf(page, `Venue O ${tag}`)).toHaveCount(0);
  await expectNoHorizontalScroll(page, 'my gigs');

  // The row opens the gig page.
  await producedRow.getByRole('link', { name: produced.lineupName }).click();
  await expect(page).toHaveURL(new RegExp(`/gigs/${produced.id}$`));

  // A deleted gig is gone from the list the next time the page opens.
  await api(page).post(`/events/${played.id}/delete`, { reason: 'Synthetic e2e' });
  await goNav(page, 'Omat keikat');
  await expect(page.getByRole('heading', { level: 1, name: 'Omat keikat' })).toBeVisible();
  await expect(rowOf(page, `Venue M ${tag}`)).toHaveCount(0);
  await expect(rowOf(page, `Venue P ${tag}`)).toHaveCount(1);
});

/** Finnish weekday, capitalised, for a `YYYY-MM-DD` date (as the UI shows it). */
function weekdayFi(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const name = new Intl.DateTimeFormat('fi-FI', { weekday: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(y!, m! - 1, d!)));
  return name.charAt(0).toLocaleUpperCase('fi-FI') + name.slice(1);
}
