import { api, CURRENT_YEAR, enMoney, expect, fiHours, PARTNER_B, signIn, tagOf, test } from './helpers';
import { createGigViaApi, reference, suffix } from './gigs';

// Extra integration checks beyond the nine smoke flows: places where the UI depends on
// cross-endpoint behaviour of the backend.

test('changing the seller moves the unpaid Sales line and the UI names it (BR-027)', async ({ page }, testInfo) => {
  await signIn(page);
  const venue = `Venue ${tagOf(testInfo)}-${suffix()}`;
  const gig = await createGigViaApi(page, { startDate: '2026-12-05', venue });
  const ref = await reference(page);
  const partnerB = ref.partners.find((p) => p.name === 'Partner B');

  await page.goto(`/gigs/${gig.id}`);
  await page.getByRole('button', { name: 'Muokkaa perustietoja' }).click();
  await page.getByLabel('Myyjä').selectOption({ label: 'Partner B' });
  await expect(page.getByText('Vanhan myyjän / tuottajan maksamattomat')).toBeVisible();
  await page.getByRole('button', { name: 'Tallenna' }).click();

  const notice = page.getByRole('status').filter({ hasText: 'Muutokset tallennettu.' });
  await expect(notice).toContainText('Rivit siirtyivät uudelle henkilölle:');
  await expect(notice).toContainText('Myynti: Partner A → Partner B');
  const sales = page.getByRole('list', { name: 'Kulut ja miehitys' }).getByRole('listitem', { name: 'Myynti', exact: true });
  await expect(sales.getByLabel('Henkilö: Myynti').locator('option:checked')).toHaveText('Partner B');

  const after = await api(page).get(`/gigs/${gig.id}`);
  expect(after.sellerId).toBe(partnerB?.id);
});

test('English amounts are parsed and shown in EN format (budget)', async ({ page }, testInfo) => {
  const year = tagOf(testInfo) === 'M' ? 2034 : 2036;
  await signIn(page, PARTNER_B, { language: 'en', selectedYear: year });
  await page.goto('/budget');
  await expect(page.getByRole('heading', { level: 1, name: `Budget ${year}` })).toBeVisible();
  await page.getByLabel('Budget, expense, Insurance').fill('1,200.00');
  await page.getByRole('button', { name: 'Save Insurance' }).click();
  await expect(page.getByRole('status')).toContainText('Insurance');
  await expect(page.getByLabel('Budget, expense, Insurance')).toHaveValue('1200.00');
  await expect(page.locator('tfoot .budget-totals td').first()).toHaveText(enMoney(120000));
  const budget = await api(page).get(`/budget?year=${year}`);
  expect(budget.totals.budgetExpenseCents).toBe(120000);
});

test('year page of an empty year still lists upcoming gigs (contract: regardless of year)', async ({ page }) => {
  await signIn(page, undefined, { selectedYear: 2040 });
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'Vuosi 2040' })).toBeVisible();
  const data = await api(page).get('/years/2040');
  expect(data.gigs.gigCount).toBe(0);
  expect(data.upcomingGigs.length).toBeGreaterThan(0);
  const upcoming = page.getByRole('region', { name: 'Tulevat keikat' });
  await expect(upcoming.getByRole('link')).toHaveCount(data.upcomingGigs.length + 1); // + section heading link
});

test('hours saved for another year show a notice and are not added to this year', async ({ page }, testInfo) => {
  const me = await signIn(page);
  const comment = `Synthetic other year ${tagOf(testInfo)}-${suffix()}`;
  const before = await api(page).get(`/hours?year=${CURRENT_YEAR}`);
  const total = (before as { hours: number }[]).reduce((s, e) => s + e.hours, 0);
  await page.goto('/hours');
  await page.getByRole('button', { name: 'Lisää tunnit' }).click();
  const dialog = page.getByRole('dialog', { name: 'Uusi tuntikirjaus' });
  await dialog.getByLabel('Päivämäärä').fill(`${CURRENT_YEAR + 1}-01-15`);
  await dialog.getByLabel('Kommentti').fill(comment);
  await dialog.getByLabel('Tunnit', { exact: true }).fill('2');
  await dialog.getByRole('button', { name: 'Tallenna' }).click();
  await expect(page.getByRole('status')).toHaveText(
    `Tallennettu vuodelle ${CURRENT_YEAR + 1}. Vaihda vuotta nähdäksesi kirjauksen.`,
  );
  await expect(page.getByTestId('hours-year-total')).toHaveText(fiHours(total));
  const next = (await api(page).get(`/hours?year=${CURRENT_YEAR + 1}&partnerId=${me.id}`)) as { comment: string }[];
  expect(next.some((e) => e.comment === comment)).toBe(true);
});

test('gig list search and the cancelled filter use the backend query', async ({ page }) => {
  await signIn(page);
  await page.goto('/gigs');
  const rows = page.getByRole('list', { name: 'Keikkalista' }).getByRole('listitem');
  await page.getByLabel('Haku').fill('venue z');
  // Venue Z (seed) is cancelled: hidden until "show cancelled" is on.
  await expect(page.getByText('Ei hakuehtoja vastaavia keikkoja.')).toBeVisible();
  const showCancelled = page.getByLabel('Näytä myös perutut');
  await showCancelled.click(); // URL-driven checkbox: it flips after navigation, so no check()
  await expect(showCancelled).toBeChecked();
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('Venue Z');
  await expect(rows.first()).toContainText('Peruttu');
});
