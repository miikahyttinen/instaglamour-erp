import { api, CURRENT_YEAR, expect, expectNoHorizontalScroll, isMobile, signIn, test } from './helpers';

// NFR-1: no horizontal scroll on every main page (asserted in both projects; the 375 px run is
// the one that matters). Uses the busiest seed data: the fully staffed February gig and Person 1.
test.describe('no horizontal scroll on main pages', () => {
  let gigId = '';
  let personId = '';

  test.beforeEach(async ({ page }) => {
    await signIn(page);
    if (!gigId) {
      const list = await api(page).get(`/gigs?year=${CURRENT_YEAR}&status=ALL`);
      // The gig with the most cost lines (seed: Template A at Venue X, all paid).
      const details = await Promise.all(
        list.gigs.map((g: { id: string }) => api(page).get(`/gigs/${g.id}`)),
      );
      details.sort((a, b) => b.costLines.length - a.costLines.length);
      gigId = details[0].id;
      const people = (await api(page).get('/people')) as { id: string; name: string }[];
      personId = people.find((p) => p.name === 'Person 1')?.id ?? '';
    }
  });

  const pages: [string, () => string, string][] = [
    ['year page', () => '/', 'h1'],
    ['gig list', () => '/gigs', 'h1'],
    ['gig list, deleted view', () => '/gigs?view=deleted', 'h1'],
    ['new gig', () => '/gigs/new', 'h1'],
    ['gig page', () => `/gigs/${gigId}`, 'h1'],
    ['people', () => '/people', 'h1'],
    ['person page', () => `/people/${personId}`, 'h1'],
    ['tasks', () => '/tasks', 'h1'],
    ['my hours', () => '/hours', 'h1'],
    ['hours totals', () => '/hours/totals', 'h1'],
    ['budget', () => '/budget', 'h1'],
  ];

  for (const [name, path, ready] of pages) {
    test(name, async ({ page }) => {
      await page.goto(path());
      await expect(page.locator(ready).first()).toBeVisible();
      await expect(page.getByText('Ladataan…')).toHaveCount(0);
      await expectNoHorizontalScroll(page, name);
    });
  }

  test('gig list with economics expanded', async ({ page }, testInfo) => {
    test.skip(!isMobile(testInfo), 'Desktop shows the economics as columns, without a toggle.');
    await page.goto('/gigs?cancelled=1');
    const toggles = page.getByRole('button', { name: 'Näytä talous' });
    await expect(toggles.first()).toBeVisible();
    for (const toggle of await toggles.all()) {
      if (await toggle.isVisible()) await toggle.click();
    }
    await expectNoHorizontalScroll(page, 'gig list (economics open)');
  });

  test('hours totals with a month opened', async ({ page }) => {
    await page.goto('/hours/totals');
    await page.locator('.hours-month-cell').first().click();
    await expect(page.locator('.hours-month-detail')).toBeVisible();
    await expectNoHorizontalScroll(page, 'hours totals (month open)');
  });
});
