import {
  api,
  CURRENT_YEAR,
  editInline,
  enMoney,
  expect,
  expectNoEditSaveButtons,
  fiHours,
  PARTNER_B,
  selectInline,
  signIn,
  tagOf,
  test,
} from './helpers';
import { costField, costLine, createEventViaApi, eventListRows, reference, suffix } from './events';
import { clearFiltersButton, tickColumnValues } from './excel';

// Extra integration checks beyond the nine smoke flows: places where the UI depends on
// cross-endpoint behaviour of the backend.

test('changing the seller moves the unpaid Sales line and the UI names it (BR-027)', async ({ page }, testInfo) => {
  await signIn(page);
  const venue = `Venue ${tagOf(testInfo)}-${suffix()}`;
  const event = await createEventViaApi(page, { startDate: '2026-12-05', venue });
  const ref = await reference(page);
  const partnerB = ref.partners.find((p) => p.name === 'Partner B');

  await page.goto(`/gigs/${event.id}`);
  await expectNoEditSaveButtons(page.getByRole('main'), 'event page');
  // The hint is shown next to the seller / producer selects before anything is changed.
  await expect(page.getByText('Vanhan myyjän / tuottajan maksamattomat')).toBeVisible();
  // The select saves on change: one PATCH with just the seller.
  const seller = page.getByLabel('Myyjä', { exact: true });
  expect(await selectInline(page, seller, 'Partner B')).toEqual({ sellerId: partnerB?.id });

  const notice = page.getByRole('status').filter({ hasText: 'Muutokset tallennettu.' });
  await expect(notice).toContainText('Rivit siirtyivät uudelle henkilölle:');
  await expect(notice).toContainText('Myynti: Partner A → Partner B');
  const sales = costLine(page, 'Myynti');
  await expect(sales.getByLabel('Henkilö: Myynti').locator('option:checked')).toHaveText('Partner B');

  const after = await api(page).get(`/events/${event.id}`);
  expect(after.sellerId).toBe(partnerB?.id);
  await page.reload();
  await expect(seller.locator('option:checked')).toHaveText('Partner B');
  await expect(costField(page, 'Henkilö', 'Myynti').locator('option:checked')).toHaveText('Partner B');
});

test('English amounts are parsed and shown in EN format (budget)', async ({ page }, testInfo) => {
  const year = tagOf(testInfo) === 'M' ? 2034 : 2036;
  await signIn(page, PARTNER_B, { language: 'en', selectedYear: year });
  await page.goto('/budget');
  await expect(page.getByRole('heading', { level: 1, name: `Budget ${year}` })).toBeVisible();
  // Seed row "Category B" (synthetic); its name field is "Row name, Category B".
  await expect(page.getByRole('textbox', { name: 'Row name, Category B', exact: true })).toHaveValue('Category B');
  const cell = page.getByLabel('Budget, expense, Category B', { exact: true });
  // Inline cell: blur PUTs the whole row with the parsed EN amount.
  const body = await editInline(page, cell, '1,200.00', { method: 'PUT' });
  expect(body).toMatchObject({ budgetExpenseCents: 120000 });
  await expect(page.getByRole('status').filter({ hasText: 'Budget, expense, Category B: saved' })).toHaveCount(1);
  await expect(cell).toHaveValue('1200.00');
  await expect(page.locator('tfoot .budget-totals td').first()).toHaveText(enMoney(120000));
  await page.reload();
  await expect(cell).toHaveValue('1200.00');
  const budget = await api(page).get(`/budget?year=${year}`);
  expect(budget.totals.budgetExpenseCents).toBe(120000);
});

test('year page of an empty year still lists upcoming events (contract: regardless of year)', async ({ page }) => {
  await signIn(page, undefined, { selectedYear: 2040 });
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'Vuosi 2040' })).toBeVisible();
  const data = await api(page).get('/years/2040');
  expect(data.events.eventCount).toBe(0);
  expect(data.upcomingEvents.length).toBeGreaterThan(0);
  const upcoming = page.getByRole('region', { name: 'Tulevat keikat' });
  await expect(upcoming.getByRole('link')).toHaveCount(data.upcomingEvents.length + 1); // + section heading link
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
  // The page has a polite live region per inline field, so pick the notice by its text.
  await expect(page.getByRole('status').filter({ hasText: 'Tallennettu vuodelle' })).toHaveText(
    `Tallennettu vuodelle ${CURRENT_YEAR + 1}. Vaihda vuotta nähdäksesi kirjauksen.`,
  );
  await expect(page.getByTestId('hours-year-total')).toHaveText(fiHours(total));
  const next = (await api(page).get(`/hours?year=${CURRENT_YEAR + 1}&partnerId=${me.id}`)) as { comment: string }[];
  expect(next.some((e) => e.comment === comment)).toBe(true);
});

test('event list search and the Tila filter: cancelled events only after ticking "Peruttu"', async ({ page }) => {
  await signIn(page);
  await page.goto('/gigs');
  const rows = eventListRows(page); // one table "Keikkalista"; compact rows below 600 px
  // "Näytä myös perutut" is gone: the Tila column filter replaces it (TASK-144).
  await expect(page.getByLabel('Näytä myös perutut')).toHaveCount(0);
  await tickColumnValues(page, 'Tila', ['Peruttu']);
  await page.getByLabel('Haku').fill('venue z');
  await expect(page).toHaveURL(/[?&]q=venue(\+|%20)z/);
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('Venue Z');
  await expect(rows.first()).toContainText('Peruttu');
  // The search goes to the API (q), the Tila filter is client-side over the returned events.
  const viaApi = await api(page).get(`/events?year=${CURRENT_YEAR}&status=ALL&q=venue%20z`);
  expect(viaApi.events.map((g: { venue: string; status: string }) => [g.venue, g.status])).toEqual([['Venue Z', 'CANCELLED']]);

  // A fresh visit with the same search: the default Tila filter (Tuleva + Soitettu) hides it.
  await page.goto('/gigs?q=venue%20z');
  await expect(page.getByText('Ei suodattimia vastaavia keikkoja.')).toBeVisible();
  await expect(rows).toHaveCount(0);
  await clearFiltersButton(page).click();
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('Venue Z');
});
