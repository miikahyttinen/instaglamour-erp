import type { Locator, Page } from '@playwright/test';
import { api, expect, expectNoHorizontalScroll, goNav, isMobile, signIn, tagOf, test } from './helpers';
import { createEventViaApi, suffix } from './events';
import { createClientViaApi } from './offers';

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

// Phone rows (TASK-199, owner request 2026-11-10): line 1 = gig name + "Miehitys kesken" right
// after it (the name truncates with … first), the role chips in the top-right corner (wrapping
// there, never over the name); line 2 = date · client · venue. No sideways scroll at 375 / 414.
test('phone rows: staffing tag after the gig name, roles top right, date · client · venue below', async ({ page }, testInfo) => {
  test.skip(!isMobile(testInfo), 'phone layout only');
  const me = await signIn(page);
  const tag = `${tagOf(testInfo)}-${suffix()}`;
  const client = await createClientViaApi(page, `Client ${tag}-ph`);
  const gig = await createEventViaApi(page, { startDate: '2048-04-04', venue: `Venue PH ${tag}` });
  const longName = `Lineup ${tag} with a very long synthetic name that cannot fit`;
  await api(page).patch(`/events/${gig.id}`, { lineupName: longName, clientId: client.id });
  await api(page).post(`/events/${gig.id}/cost-lines`, { type: 'KEYS', personId: me.personId, budgetedCents: 1000 });
  await api(page).post(`/events/${gig.id}/cost-lines`, {
    type: 'OTHER_ROLE',
    personId: me.personId,
    description: 'Role X',
    budgetedCents: 1000,
  });

  for (const w of [375, 414]) {
    await page.setViewportSize({ width: w, height: 812 });
    await page.goto('/my-gigs');
    const row = rowOf(page, `Venue PH ${tag}`);
    await expect(row).toHaveCount(1);
    await expect(row.locator('.my-events-role')).toHaveText(['Tuottaja', 'Koskettimet', 'Role X']);
    await expect(row.getByText('Miehitys kesken')).toBeVisible();
    await expect(row.getByRole('link', { name: longName })).toHaveAttribute('title', longName);

    const m = await row.evaluate((tr) => {
      const rect = (el: Element) => {
        const b = el.getBoundingClientRect();
        return { left: b.left, right: b.right, top: b.top, bottom: b.bottom, h: b.height, mid: (b.top + b.bottom) / 2 };
      };
      const title = tr.querySelector<HTMLElement>('td.cell-primary')!;
      const trBox = tr.getBoundingClientRect();
      const cs = getComputedStyle(tr);
      return {
        title: rect(title),
        staffing: rect(tr.querySelector('td.cell-inline .tag')!),
        roles: rect(tr.querySelector('td.my-events-roles-cell')!),
        chips: [...tr.querySelectorAll('.my-events-role')].map(rect),
        date: rect(tr.querySelector('td.my-events-date')!),
        client: rect(tr.querySelector('.my-events-client')!),
        venue: rect(tr.querySelector('.my-events-venue')!),
        rowTop: trBox.top + parseFloat(cs.paddingTop),
        rowRight: trBox.right - parseFloat(cs.paddingRight),
        rowH: trBox.height,
        lineH: parseFloat(getComputedStyle(title).lineHeight) || 24,
        truncated: title.scrollWidth > title.clientWidth,
      };
    });
    // Line 1: the staffing tag right after the (truncated) name.
    expect(m.truncated, `${w} px: long name truncated`).toBe(true);
    expect(m.staffing.mid, `${w} px: staffing tag on line 1`).toBeGreaterThan(m.title.top);
    expect(m.staffing.mid, `${w} px: staffing tag on line 1`).toBeLessThan(m.title.bottom);
    expect(m.staffing.left, `${w} px: staffing tag after the name`).toBeGreaterThanOrEqual(m.title.right - 1);
    expect(m.staffing.left - m.title.right, `${w} px: staffing tag hugs the name`).toBeLessThanOrEqual(9);
    // Roles: top-right corner, right of the tag, every chip inside that area.
    expect(Math.abs(m.roles.right - m.rowRight), `${w} px: roles at the right edge`).toBeLessThanOrEqual(1);
    expect(m.roles.top - m.rowTop, `${w} px: roles at the top`).toBeLessThanOrEqual(4);
    expect(m.roles.left, `${w} px: roles right of the staffing tag`).toBeGreaterThanOrEqual(m.staffing.right - 1);
    for (const chip of m.chips) {
      expect(chip.left, `${w} px: chip inside the roles area`).toBeGreaterThanOrEqual(m.roles.left - 1);
      expect(chip.right, `${w} px: chip inside the roles area`).toBeLessThanOrEqual(m.rowRight + 1);
    }
    // Line 2 below line 1: date · client · venue.
    expect(m.date.top, `${w} px: date on line 2`).toBeGreaterThanOrEqual(Math.max(m.title.bottom, m.roles.bottom) - 1);
    const clientFirst =
      m.client.top < m.venue.top - 1 || (Math.abs(m.client.top - m.venue.top) <= 1 && m.client.right <= m.venue.left);
    expect(clientFirst, `${w} px: client before venue`).toBe(true);
    const afterDate = m.client.top > m.date.top + 1 || m.client.left >= m.date.right - 1;
    expect(afterDate, `${w} px: client after the date`).toBe(true);
    // Compact: at most two chip rows plus line 2.
    expect(m.rowH, `${w} px: compact row`).toBeLessThan(m.lineH * 4 + 16);
    await expectNoHorizontalScroll(page, `my gigs at ${w} px`);
  }
});

/** Finnish weekday, capitalised, for a `YYYY-MM-DD` date (as the UI shows it). */
function weekdayFi(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const name = new Intl.DateTimeFormat('fi-FI', { weekday: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(y!, m! - 1, d!)));
  return name.charAt(0).toLocaleUpperCase('fi-FI') + name.slice(1);
}
