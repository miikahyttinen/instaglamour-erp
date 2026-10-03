import { api, CURRENT_YEAR, expect, expectNoHorizontalScroll, fiHours, goNav, signIn, tagOf, test } from './helpers';
import { suffix } from './gigs';

interface Totals {
  partners: { partnerId: string; months: number[]; total: number }[];
  grandTotal: number;
}

// Flow 7: hours — add own entry; totals page shows it; year page hours updated (UC-018, UC-019, UC-022).
test('log own hours and see them in totals and on the year page', async ({ page }, testInfo) => {
  const me = await signIn(page);
  const comment = `Synthetic work ${tagOf(testInfo)}-${suffix()}`;
  const added = 1.5;

  const before = (await api(page).get(`/hours/totals?year=${CURRENT_YEAR}`)) as Totals;
  const mineBefore = before.partners.find((p) => p.partnerId === me.id)?.total ?? 0;
  const entriesBefore = (await api(page).get(`/hours?year=${CURRENT_YEAR}`)) as { hours: number }[];
  const ownBefore = entriesBefore.reduce((sum, e) => sum + e.hours, 0);

  await page.goto('/');
  await goNav(page, 'Tunnit');
  await expect(page.getByRole('heading', { level: 1, name: `Tunnit ${CURRENT_YEAR}` })).toBeVisible();
  await expect(page.getByTestId('hours-year-total')).toHaveText(fiHours(ownBefore));
  await expectNoHorizontalScroll(page, 'my hours');

  await page.getByRole('button', { name: 'Lisää tunnit' }).click();
  const dialog = page.getByRole('dialog', { name: 'Uusi tuntikirjaus' });
  // Date defaults to today (in the selected year for this suite).
  await expect(dialog.getByLabel('Päivämäärä')).toHaveValue(new RegExp(`^${CURRENT_YEAR}-`));
  await dialog.getByLabel('Kommentti').fill(comment);
  await dialog.getByLabel('Tunnit', { exact: true }).fill('1,5');
  await dialog.getByRole('button', { name: 'Tallenna' }).click();
  await expect(dialog).toBeHidden();

  await expect(page.getByText(comment)).toBeVisible();
  await expect(page.getByTestId('hours-year-total')).toHaveText(fiHours(ownBefore + added));

  // Totals page.
  await page.getByRole('link', { name: 'Yhteenveto' }).click();
  await expect(page.getByTestId('hours-grand-total')).toHaveText(fiHours(before.grandTotal + added));
  await expect(page.getByLabel(`Yhteensä ${me.name}`, { exact: true })).toHaveText(fiHours(mineBefore + added));
  await expectNoHorizontalScroll(page, 'hours totals');

  // Year page.
  await goNav(page, 'Vuosi');
  const hours = page.getByRole('region', { name: 'Tunnit' });
  await expect(hours.getByRole('link', { name: `${me.name} ${fiHours(mineBefore + added)}` })).toBeVisible();
  await expect(hours.getByRole('link', { name: `Yhteensä ${fiHours(before.grandTotal + added)}` })).toBeVisible();
});
