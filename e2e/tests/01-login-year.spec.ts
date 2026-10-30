import {
  api,
  CURRENT_YEAR,
  expect,
  expectNoHorizontalScroll,
  fiMoney,
  pageHead,
  PARTNER_A,
  signIn,
  signOutFromHeader,
  test,
} from './helpers';
import { yearFigure } from './year';

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
  const events = page.getByRole('region', { name: 'Keikat' });
  await expect(events.getByRole('link', { name: `Keikkoja ${year.events.eventCount}` })).toBeVisible();
  // The cancelled count is the secondary figure inside the event-count tile (a link to the list).
  await expect(yearFigure(events.getByRole('link', { name: /^Keikkoja / }), 'Peruttuja')).toHaveText(
    String(year.events.cancelledCount),
  );
  await expect(events.getByRole('link', { name: `Myytyjen keikkojen summa ${fiMoney(year.events.soldEventsSumCents)}` })).toBeVisible();
  // Costs: one tile with the budget and the actual as labelled figures.
  const costs = events.getByRole('link', {
    name: `Kulut Budjetti ${fiMoney(year.events.budgetedCostsCents)} Toteuma ${fiMoney(year.events.actualCostsCents)}`,
  });
  await expect(costs).toBeVisible();
  await expect(yearFigure(costs, 'Budjetti')).toHaveText(fiMoney(year.events.budgetedCostsCents));
  await expect(yearFigure(costs, 'Toteuma')).toHaveText(fiMoney(year.events.actualCostsCents));
  // The seed has sold events in the current year, so the figures are not all zero.
  expect(year.events.eventCount).toBeGreaterThan(0);

  // The year result is emphasised in the page head and opens the budget (UC-022 step 2).
  const yearResult = pageHead(page).getByRole('link', { name: `Vuoden tulos ${fiMoney(year.yearResultCents)}` });
  await expect(yearResult).toBeVisible();
  await expect(yearResult).toHaveAttribute('href', '/budget');

  await expectNoHorizontalScroll(page, 'year page');

  // Sign out (UC-001 A2): back to the sign-in page, and the API refuses without a session.
  await signOutFromHeader(page);
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
