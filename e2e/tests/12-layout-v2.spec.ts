import type { Locator, Page } from '@playwright/test';
import { costLines, gigListRows } from './gigs';
import {
  CURRENT_YEAR,
  expect,
  expectNoHorizontalScroll,
  GIG_TABLE_MIN_WIDTH,
  isMobile,
  languageButton,
  menuButton,
  NAV_NAME,
  navDrawer,
  openDrawer,
  signIn,
  signOutButton,
  test,
  themeButton,
} from './helpers';
import { busyIds, MAIN_PAGE_NAMES, mainPages, openLoaded, type BusyIds } from './pages';

// Layout v2 (docs/design.md → Layout v2, TASK-125…130): collapsible sidebar on desktop, ☰ drawer
// on phones, the gig list as a table only from 1200 px, compact cost rows by container width.
// Read-only flows: nothing here changes the shared database.

// Eight items since TASK-015…139, Asiakkaat after Keikat; Vuosi first, then Tarjoukset (TASK-142).
const NAV: { label: string; path: string }[] = [
  { label: 'Vuosi', path: '/' },
  { label: 'Tarjoukset', path: '/offers' },
  { label: 'Keikat', path: '/gigs' },
  { label: 'Asiakkaat', path: '/clients' },
  { label: 'Henkilöt', path: '/people' },
  { label: 'Tehtävät', path: '/tasks' },
  { label: 'Tunnit', path: '/hours' },
  { label: 'Budjetti', path: '/budget' },
];
const SIDEBAR_KEY = 'ig-sidebar'; // frontend/src/layout/sidebarState.ts
/** Gig list table columns (FI), the client column since TASK-137. */
const GIG_COLUMNS = [
  'Päivä',
  'Keikka',
  'Asiakas',
  'Myyjä / tuottaja',
  'Kokonaishinta',
  'Kulut, budjetti',
  'Kulut, toteuma',
  'Kate-%',
];

function sidebarNav(page: Page): Locator {
  return page.getByRole('navigation', { name: NAV_NAME });
}
/** The desktop rail (`<aside class="sidebar">`), used only to measure its width. */
function rail(page: Page): Locator {
  return page.locator('aside.sidebar');
}
const width = (el: Locator) => el.evaluate((e) => e.getBoundingClientRect().width);
const collapseButton = (page: Page) => page.getByRole('button', { name: 'Pienennä valikko', exact: true });
const expandButton = (page: Page) => page.getByRole('button', { name: 'Laajenna valikko', exact: true });

async function expectExpanded(page: Page): Promise<void> {
  await expect(collapseButton(page)).toBeVisible();
  await expect(expandButton(page)).toHaveCount(0);
  await expect.poll(() => width(rail(page)), 'expanded sidebar ≈ 232 px').toBeGreaterThanOrEqual(200);
}
async function expectCollapsed(page: Page): Promise<void> {
  await expect(expandButton(page)).toBeVisible();
  await expect(collapseButton(page)).toHaveCount(0);
  await expect.poll(() => width(rail(page)), 'collapsed sidebar ≈ 64 px').toBeLessThanOrEqual(80);
}
const storedMode = (page: Page) => page.evaluate((key) => window.localStorage.getItem(key), SIDEBAR_KEY);

/** Is the element the one that has focus, or inside it? */
const containsFocus = (el: Locator) => el.evaluate((e) => e.contains(document.activeElement));

test.describe('desktop sidebar', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(isMobile(testInfo), 'The sidebar is desktop only (≥ 900 px); phones use the drawer.');
    await signIn(page);
  });

  test('collapse and expand; the state persists across reload and in a new tab', async ({ page, context }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1, name: `Vuosi ${CURRENT_YEAR}` })).toBeVisible();
    // Default: expanded, labels visible; no phone controls.
    await expectExpanded(page);
    await expect(sidebarNav(page).getByText('Keikat', { exact: true })).toBeVisible();
    await expect(menuButton(page)).toHaveCount(0);
    await expect(navDrawer(page)).toHaveCount(0);

    await collapseButton(page).click();
    await expectCollapsed(page);
    expect(await storedMode(page)).toBe('collapsed');

    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: `Vuosi ${CURRENT_YEAR}` })).toBeVisible();
    await expectCollapsed(page);

    // Same browser, another tab: also collapsed.
    const other = await context.newPage();
    await other.goto('/gigs');
    await expect(other.getByRole('heading', { level: 1, name: `Keikat ${CURRENT_YEAR}` })).toBeVisible();
    await expectCollapsed(other);
    await other.close();

    // Keyboard works too: focus the toggle and press Enter.
    await expandButton(page).focus();
    await page.keyboard.press('Enter');
    await expectExpanded(page);
    expect(await storedMode(page)).toBe('expanded');
    await page.reload();
    await expectExpanded(page);
  });

  test('collapsed: every nav item and account control is reachable by its accessible name', async ({ page }) => {
    await page.goto('/');
    await collapseButton(page).click();
    await expectCollapsed(page);

    const nav = sidebarNav(page);
    await expect(nav.getByRole('link')).toHaveCount(NAV.length);
    // In menu order (pointer away from the rail: a visible tooltip changes the name, F-005).
    await page.mouse.move(700, 500);
    for (const [i, { label }] of NAV.entries()) {
      await expect(nav.getByRole('link').nth(i), `item ${i + 1}`).toHaveAccessibleName(label);
    }
    for (const { label, path } of NAV) {
      const link = nav.getByRole('link', { name: label, exact: true });
      await expect(link, `${label}: in the collapsed rail`).toBeInViewport();
      expect(await width(link), `${label}: icon only`).toBeLessThanOrEqual(64);
      await expect(link, `${label}: tooltip text`).toHaveAttribute('data-tooltip', label);
      await link.click();
      await expect(page).toHaveURL((url) => url.pathname === path);
      // Move the pointer away: while the tooltip shows, the name changes (F-005, own test below).
      await page.mouse.move(700, 500);
      await expect(link).toHaveAttribute('aria-current', 'page');
      await expect(page.locator('h1').first()).toBeVisible();
    }
    // Navigating does not expand the rail.
    await expectCollapsed(page);

    // Keyboard: a nav link is focusable and opens its page with Enter.
    const people = nav.getByRole('link', { name: 'Henkilöt', exact: true });
    await people.focus();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/people$/);

    // Language, theme and sign-out keep their names (wherever they are placed, see TASK-132).
    await expect(await languageButton(page, 'Vaihda kieleksi English')).toBeVisible();
    await expect(await themeButton(page)).toBeVisible();
    await expect(await signOutButton(page)).toBeVisible();
    await expect(await signOutButton(page)).toHaveCount(1);
  });

  test.fixme('collapsed: the hover / focus tooltip shows the label and keeps the accessible name (F-005)', async ({ page }) => {
    // F-005: the tooltip is CSS `::after { content: attr(data-tooltip) }`; Chromium adds generated
    // content to the accessible name while it is visible ("Vuosi Vuosi").
    await page.goto('/');
    await collapseButton(page).click();
    await expectCollapsed(page);
    const links = sidebarNav(page).getByRole('link');
    const tooltip = (el: Locator) =>
      el.evaluate((e) => {
        const after = getComputedStyle(e, '::after');
        return `${after.visibility} ${after.content}`;
      });
    for (const [i, { label }] of NAV.entries()) {
      const link = links.nth(i); // by position, so the locator holds while the name is checked
      await link.hover();
      await expect.poll(() => tooltip(link), `${label}: tooltip on hover`).toBe(`visible "${label}"`);
      await expect(link, `${label}: name unchanged while the tooltip shows`).toHaveAccessibleName(label);
    }
    // Keyboard focus (:focus-visible) shows the tooltip too.
    await page.mouse.move(700, 500);
    await links.nth(1).focus();
    await page.keyboard.press('Tab');
    const third = links.nth(2);
    await expect(third).toBeFocused();
    await expect.poll(() => tooltip(third), 'tooltip on keyboard focus').toBe(`visible "${NAV[2]!.label}"`);
    await expect(third).toHaveAccessibleName(NAV[2]!.label);
  });

  test('gig list: cards below 1200 px, a table from 1200 px (also at 1440 px)', async ({ page }) => {
    for (const w of [GIG_TABLE_MIN_WIDTH - 1, GIG_TABLE_MIN_WIDTH, 1440]) {
      await page.setViewportSize({ width: w, height: 800 });
      await openLoaded(page, '/gigs');
      const table = page.getByRole('table', { name: 'Keikkalista' });
      const cards = page.getByRole('list', { name: 'Keikkalista' });
      if (w < GIG_TABLE_MIN_WIDTH) {
        await expect(cards, `${w} px: cards`).toBeVisible();
        await expect(table, `${w} px: no table`).toHaveCount(0);
      } else {
        await expect(table, `${w} px: table`).toBeVisible();
        await expect(cards, `${w} px: no cards`).toHaveCount(0);
        // Eight columns since the client column (TASK-137).
        await expect(table.getByRole('columnheader')).toHaveText(GIG_COLUMNS);
      }
      await expect(gigListRows(page).first()).toBeVisible();
      await expectNoHorizontalScroll(page, `gig list at ${w} px`);
    }
  });

  test('gig list: the 8-column table fits next to the expanded sidebar from 1200 px, no sideways scroll inside the table (F-006)', async ({ page }) => {
    // F-006 (fixed in TASK-141): the page itself does not scroll (`.table-wrap` has overflow-x: auto),
    // so the check above could not see that the table was ~950 px in an ~886 px box at 1200 px. Now
    // the inner column gutters are narrower and a date range wraps after its dash below 1280 px.
    for (const mode of ['expanded', 'collapsed'] as const) {
      await page.addInitScript(([key, value]) => window.localStorage.setItem(key, value), [SIDEBAR_KEY, mode]);
      for (const w of [GIG_TABLE_MIN_WIDTH, 1280, 1440]) {
        await page.setViewportSize({ width: w, height: 800 });
        await openLoaded(page, '/gigs?status=ALL');
        const table = page.getByRole('table', { name: 'Keikkalista' });
        await expect(table).toBeVisible();
        await expect(table.getByRole('columnheader')).toHaveText(GIG_COLUMNS);
        const box = await table.evaluate((t) => {
          const wrap = t.parentElement!;
          return { scroll: wrap.scrollWidth, client: wrap.clientWidth };
        });
        expect(box.scroll, `sidebar ${mode}, ${w} px: table ${box.scroll} px in a ${box.client} px box`).toBeLessThanOrEqual(box.client);
        // Every column header lies fully inside the table's box, and the box inside the viewport,
        // horizontally. Measured as geometry, not `toBeInViewport()`: the gig list scrolls today's
        // row to the centre on load (GigListPage), so the header row may be above the viewport
        // vertically, which says nothing about the width (TASK-019).
        await table.locator('thead').scrollIntoViewIfNeeded();
        const fit = await table.evaluate((t) => {
          const wrap = t.parentElement!.getBoundingClientRect();
          const ths = [...t.querySelectorAll('thead th')].map((th) => {
            const r = th.getBoundingClientRect();
            return { name: th.textContent?.trim() ?? '', left: r.left, right: r.right };
          });
          return { wrapLeft: wrap.left, wrapRight: wrap.right, viewport: document.documentElement.clientWidth, ths };
        });
        expect(fit.ths, `sidebar ${mode}, ${w} px: column headers`).toHaveLength(GIG_COLUMNS.length);
        expect(fit.wrapLeft, `sidebar ${mode}, ${w} px: table box starts in the viewport`).toBeGreaterThanOrEqual(0);
        expect(fit.wrapRight, `sidebar ${mode}, ${w} px: table box ends in the viewport`).toBeLessThanOrEqual(fit.viewport + 0.5);
        for (const th of fit.ths) {
          expect(th.left, `sidebar ${mode}, ${w} px: "${th.name}" starts inside the table box`).toBeGreaterThanOrEqual(fit.wrapLeft - 0.5);
          expect(th.right, `sidebar ${mode}, ${w} px: "${th.name}" ends inside the table box`).toBeLessThanOrEqual(fit.wrapRight + 0.5);
        }
        await expectNoHorizontalScroll(page, `gig list, sidebar ${mode}, ${w} px`);
      }
    }
  });

  test('gig page cost list: compact rows next to the expanded sidebar at 1280 px, full table at 1440 px', async ({ page }) => {
    const { gigId } = await busyIds(page);
    const table = page.getByRole('table', { name: 'Kulut ja miehitys' });
    // Compact rows keep the table semantics; the header row group is only visually hidden (1 px clip).
    const headerHeight = () => table.locator('thead').evaluate((e) => e.getBoundingClientRect().height);

    for (const [w, compact] of [
      [1280, true],
      [1440, false],
    ] as const) {
      await page.setViewportSize({ width: w, height: 800 });
      await openLoaded(page, `/gigs/${gigId}`);
      await expectExpanded(page);
      await expect(table).toBeVisible();
      expect(await costLines(page).count(), `${w} px: cost lines are named rowgroups`).toBeGreaterThan(0);
      if (compact) expect(await headerHeight(), `${w} px: compact rows`).toBeLessThanOrEqual(1);
      else expect(await headerHeight(), `${w} px: full table with column headers`).toBeGreaterThan(1);
      await expectNoHorizontalScroll(page, `gig page at ${w} px`);
    }
  });

  test.describe('no horizontal scroll in both sidebar states', () => {
    let ids: BusyIds | undefined;
    test.beforeEach(async ({ page }) => {
      ids ??= await busyIds(page);
    });

    // 900 px is the narrowest desktop width (the most cramped next to the expanded rail).
    for (const name of MAIN_PAGE_NAMES) {
      test(name, async ({ page }) => {
        const path = new Map(mainPages(ids!)).get(name)!;
        for (const mode of ['expanded', 'collapsed'] as const) {
          await page.addInitScript(([key, value]) => window.localStorage.setItem(key, value), [SIDEBAR_KEY, mode]);
          for (const w of [900, 1280, 1440]) {
            await page.setViewportSize({ width: w, height: 800 });
            await openLoaded(page, path);
            if (mode === 'collapsed') await expectCollapsed(page);
            else await expectExpanded(page);
            await expectNoHorizontalScroll(page, `${name}, sidebar ${mode}, ${w} px`);
          }
        }
      });
    }
  });
});

test.describe('phone drawer', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(!isMobile(testInfo), 'The ☰ drawer is for phones (< 900 px).');
    await signIn(page);
  });

  test('☰ opens the drawer; focus is trapped; Esc, backdrop, close and navigation close it', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1, name: `Vuosi ${CURRENT_YEAR}` })).toBeVisible();
    // No bottom nav, no header nav, no rail: the only navigation is behind ☰.
    await expect(sidebarNav(page)).toHaveCount(0);
    await expect(rail(page)).toHaveCount(0);
    const menu = menuButton(page);
    await expect(menu).toHaveAttribute('aria-expanded', 'false');

    // Open: modal dialog with the nav, focus on the close button.
    await menu.click();
    const drawer = navDrawer(page);
    await expect(drawer).toBeVisible();
    await expect(drawer).toHaveAttribute('aria-modal', 'true');
    await expect(menu).toHaveAttribute('aria-expanded', 'true');
    await expect(drawer.getByRole('button', { name: 'Sulje valikko' })).toBeFocused();
    const links = drawer.getByRole('navigation', { name: NAV_NAME }).getByRole('link');
    await expect(links).toHaveCount(NAV.length);
    await expect(links).toHaveText(NAV.map(({ label }) => label)); // menu order
    for (const { label } of NAV) await expect(drawer.getByRole('link', { name: label, exact: true })).toBeVisible();
    await expect(drawer.getByRole('link', { name: 'Vuosi', exact: true })).toHaveAttribute('aria-current', 'page');
    await expect(drawer.getByRole('button', { name: 'Vaihda kieleksi English' })).toBeVisible();
    await expect(drawer.getByRole('button', { name: /^Vaihda (tummaan|vaaleaan) teemaan$/ })).toBeVisible();
    await expect(drawer.getByRole('button', { name: 'Kirjaudu ulos', exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.body.style.overflow), 'page behind does not scroll').toBe('hidden');

    // Focus trap: Tab and Shift+Tab never leave the drawer, also when wrapping around.
    const focusables = await drawer.locator('a[href], button:not([disabled])').count();
    for (let i = 0; i < focusables + 2; i++) {
      await page.keyboard.press('Tab');
      expect(await containsFocus(drawer), `Tab ${i + 1}: focus stays in the drawer`).toBe(true);
    }
    for (let i = 0; i < focusables + 2; i++) {
      await page.keyboard.press('Shift+Tab');
      expect(await containsFocus(drawer), `Shift+Tab ${i + 1}: focus stays in the drawer`).toBe(true);
    }

    // Esc closes and gives focus back to ☰.
    await page.keyboard.press('Escape');
    await expect(drawer).toBeHidden();
    await expect(menu).toBeFocused();
    await expect(menu).toHaveAttribute('aria-expanded', 'false');
    expect(await page.evaluate(() => document.body.style.overflow)).toBe('');

    // Backdrop click (right of the drawer) closes, the page stays.
    await openDrawer(page);
    const vw = page.viewportSize()!.width;
    await page.getByTestId('drawer-backdrop').click({ position: { x: vw - 10, y: 400 } });
    await expect(drawer).toBeHidden();
    await expect(page).toHaveURL((url) => url.pathname === '/');

    // The close button closes.
    await openDrawer(page);
    await drawer.getByRole('button', { name: 'Sulje valikko' }).click();
    await expect(drawer).toBeHidden();

    // Navigation closes it, also a link to the page that is already open.
    await openDrawer(page);
    await drawer.getByRole('link', { name: 'Tehtävät', exact: true }).click();
    await expect(page).toHaveURL(/\/tasks$/);
    await expect(drawer).toBeHidden();
    expect(await page.evaluate(() => document.body.style.overflow)).toBe('');
    await openDrawer(page);
    await expect(drawer.getByRole('link', { name: 'Tehtävät', exact: true })).toHaveAttribute('aria-current', 'page');
    await drawer.getByRole('link', { name: 'Tehtävät', exact: true }).click();
    await expect(drawer).toBeHidden();
    await expect(page).toHaveURL(/\/tasks$/);

    // Browser back closes it too (the drawer belongs to the page it was opened on).
    await openDrawer(page);
    await page.goBack();
    await expect(page).toHaveURL((url) => url.pathname === '/');
    await expect(drawer).toBeHidden();
  });

  test.describe('no horizontal scroll with the drawer open', () => {
    let ids: BusyIds | undefined;
    test.beforeEach(async ({ page }) => {
      ids ??= await busyIds(page);
    });

    for (const name of MAIN_PAGE_NAMES) {
      test(name, async ({ page }) => {
        await openLoaded(page, new Map(mainPages(ids!)).get(name)!);
        await expectNoHorizontalScroll(page, `${name}, drawer closed`);
        await openDrawer(page);
        await expectNoHorizontalScroll(page, `${name}, drawer open`);
      });
    }
  });
});

test('one theme toggle switches the theme and the choice survives a reload', async ({ page }) => {
  await signIn(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: `Vuosi ${CURRENT_YEAR}` })).toBeVisible();
  const theme = () => page.evaluate(() => document.documentElement.getAttribute('data-theme'));
  const before = await theme();
  expect(before === 'dark' || before === 'light', `data-theme is set (${before})`).toBe(true);
  const after = before === 'dark' ? 'light' : 'dark';

  const toggle = await themeButton(page);
  await expect(toggle).toHaveCount(1);
  await expect(toggle).toHaveAccessibleName(after === 'dark' ? 'Vaihda tummaan teemaan' : 'Vaihda vaaleaan teemaan');
  await toggle.click();
  await expect.poll(theme).toBe(after);

  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: `Vuosi ${CURRENT_YEAR}` })).toBeVisible();
  await expect.poll(theme).toBe(after);
  await expect(await themeButton(page)).toHaveAccessibleName(
    before === 'dark' ? 'Vaihda tummaan teemaan' : 'Vaihda vaaleaan teemaan',
  );
});
