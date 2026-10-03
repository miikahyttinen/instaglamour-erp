import { api, CURRENT_YEAR, expect, expectNoHorizontalScroll, fiMoney, PARTNER_A, signIn, test } from './helpers';

// Flow 1: dev login → year page shows figures (UC-001, UC-022).
test('dev login shows the year page with figures from the backend', async ({ page, context }) => {
  // Normalise Partner A's saved preferences, then start signed out.
  await signIn(page, PARTNER_A, { language: 'fi', selectedYear: CURRENT_YEAR });
  await context.clearCookies();

  await page.goto('/');
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByRole('heading', { name: 'Kirjaudu sisään' })).toBeVisible();
  await expectNoHorizontalScroll(page, 'login');

  await page.getByLabel('Sähköposti').fill(PARTNER_A);
  await page.getByRole('button', { name: 'Kirjaudu', exact: true }).click();

  await expect(page.getByRole('heading', { level: 1, name: `Vuosi ${CURRENT_YEAR}` })).toBeVisible();

  const year = await api(page).get(`/years/${CURRENT_YEAR}`);
  const gigs = page.getByRole('region', { name: 'Keikat' });
  await expect(gigs.getByRole('link', { name: `Keikkoja ${year.gigs.gigCount}` })).toBeVisible();
  await expect(gigs.getByRole('link', { name: `Peruttuja ${year.gigs.cancelledCount}` })).toBeVisible();
  await expect(gigs.getByRole('link', { name: `Myytyjen keikkojen summa ${fiMoney(year.gigs.soldGigsSumCents)}` })).toBeVisible();
  await expect(gigs.getByRole('link', { name: `Kulut, budjetti ${fiMoney(year.gigs.budgetedCostsCents)}` })).toBeVisible();
  // The seed has sold gigs in the current year, so the figures are not all zero.
  expect(year.gigs.gigCount).toBeGreaterThan(0);

  const budget = page.getByRole('region', { name: 'Budjetti' });
  await expect(budget.getByRole('link', { name: `Vuoden tulos ${fiMoney(year.yearResultCents)}` })).toBeVisible();

  await expectNoHorizontalScroll(page, 'year page');
});
