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

  test('hours totals filtered by a partner and sorted by comment', async ({ page }) => {
    await page.goto('/hours/totals');
    const table = page.getByRole('table', { name: /^Tuntikirjaukset \d{4}$/ });
    await expect(table).toBeVisible();
    await table.getByRole('button', { name: 'Kommentti', exact: true }).click();
    await expect(table.getByRole('columnheader', { name: 'Kommentti' })).toHaveAttribute('aria-sort', 'ascending');
    await page.getByRole('combobox', { name: 'Osakas', exact: true }).selectOption({ label: 'Partner C' });
    await expect(page).toHaveURL(/[?&]partner=/);
    await expectNoHorizontalScroll(page, 'hours totals (filtered, sorted)');
  });
});
