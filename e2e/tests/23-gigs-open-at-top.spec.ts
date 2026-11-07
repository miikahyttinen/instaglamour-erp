import { expect, goNav, signIn, test } from './helpers';

// TASK-191: the gig list (Keikat) opens at the top (no scroll to the first upcoming gig; since
// TASK-192 the default order is newest first), and no page carries the previous page's scroll position over.
test.describe('pages open at the top', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test('gig list opens at the top', async ({ page }) => {
    // A tall body makes the window scrollable, so an auto-scroll would show.
    await page.goto('/');
    await page.evaluate(() => {
      document.body.style.minHeight = '5000px';
    });
    await goNav(page, 'Keikat');
    await expect(page.getByRole('heading', { name: /^Keikat \d{4}$/ })).toBeVisible();
    await page.waitForLoadState('networkidle');
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
  });

  test('navigating from a scrolled page starts the next page at the top', async ({ page }) => {
    await page.goto('/budget');
    await expect(page.getByRole('heading', { name: /^Budjetti \d{4}$/ })).toBeVisible();
    await page.evaluate(() => {
      document.body.style.minHeight = '5000px';
      window.scrollTo(0, 2000);
    });
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
    await goNav(page, 'Keikat');
    await expect(page.getByRole('heading', { name: /^Keikat \d{4}$/ })).toBeVisible();
    await page.waitForLoadState('networkidle');
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
  });
});
