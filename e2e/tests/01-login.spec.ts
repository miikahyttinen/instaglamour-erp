import { CURRENT_YEAR, expect, expectNoHorizontalScroll, PARTNER_A, signIn, signOutFromHeader, test } from './helpers';

// Flow 1: dev login → the start page "Omat keikat" (UC-001; My gigs replaced the Year page on
// 2026-11-08). The page's list itself is checked in 25-my-gigs.
test('dev login opens My gigs (start page); sign out', async ({ page, context }) => {
  // Normalise Partner A's saved preferences, then start signed out.
  await signIn(page, PARTNER_A, { language: 'fi', selectedYear: CURRENT_YEAR });
  await context.clearCookies();

  await page.goto('/');
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByRole('heading', { name: 'Kirjaudu sisään' })).toBeVisible();
  await expectNoHorizontalScroll(page, 'login');

  await page.getByLabel('Sähköposti').fill(PARTNER_A);
  await page.getByRole('button', { name: 'Kirjaudu', exact: true }).click();

  await expect(page.getByRole('heading', { level: 1, name: 'Omat keikat' })).toBeVisible();
  await expect(page).toHaveURL(/\/my-gigs$/);
  await expect(page.getByRole('combobox', { name: 'Valittu vuosi' })).toHaveCount(0);

  // Old start page URLs land on My gigs too.
  for (const path of ['/', '/year']) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/my-gigs$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Omat keikat' })).toBeVisible();
  }

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
