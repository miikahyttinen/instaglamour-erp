import { isGigTable } from './gigs';
import { expect, expectNoHorizontalScroll, signIn, test } from './helpers';
import { busyIds, MAIN_PAGE_NAMES, mainPages, openLoaded, type BusyIds } from './pages';

// NFR-1: no horizontal scroll on every main page (asserted in both projects; the 375 px run is
// the one that matters). Uses the busiest seed data: the fully staffed February gig and Person 1.
// Both sidebar states (desktop) and the open drawer (phone) are covered in 12-layout-v2.
test.describe('no horizontal scroll on main pages', () => {
  let ids: BusyIds | undefined;

  test.beforeEach(async ({ page }) => {
    await signIn(page);
    ids ??= await busyIds(page);
  });

  for (const name of MAIN_PAGE_NAMES) {
    test(name, async ({ page }) => {
      const path = new Map(mainPages(ids!)).get(name)!;
      await openLoaded(page, path);
      await expectNoHorizontalScroll(page, name);
    });
  }

  test('gig list with economics expanded', async ({ page }) => {
    test.skip(isGigTable(page), 'From 1200 px the gig list is a table with economics columns, without a toggle.');
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
