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

  // Sign out (UC-001 A2): back to the sign-in page, and the API refuses without a session.
  await page.getByRole('button', { name: 'Valikko' }).click();
  await page.getByRole('button', { name: 'Kirjaudu ulos' }).click();
  await expect(page).toHaveURL(/\/login/);
  expect((await page.request.get('/api/me')).status()).toBe(401);
});

// An expired session while using the app leads to the sign-in page with a notice.
test('an ended session sends the user to sign in', async ({ page, context }) => {
  await signIn(page, PARTNER_A);
  await page.goto('/tasks');
  await expect(page.getByRole('heading', { level: 1, name: 'Tehtävät' })).toBeVisible();
  await context.clearCookies();
  await page.getByRole('button', { name: 'Tehdyt', exact: true }).click(); // triggers GET /api/tasks → 401
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByRole('status').filter({ hasText: 'Istunto on päättynyt. Kirjaudu uudelleen.' })).toBeVisible();
  // Signing in again returns to where the user was.
  await page.getByLabel('Sähköposti').fill(PARTNER_A);
  await page.getByRole('button', { name: 'Kirjaudu', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Tehtävät' })).toBeVisible();
});

test('dev login with an unknown email is refused', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Sähköposti').fill('someone@example.com');
  await page.getByRole('button', { name: 'Kirjaudu', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('Sinulla ei ole käyttöoikeutta.');
  await expect(page).toHaveURL(/\/login/);
});
