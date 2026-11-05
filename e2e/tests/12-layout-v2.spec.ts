import type { Locator, Page } from '@playwright/test';
import { costLines, eventListRows, eventTable } from './events';
import {
  CURRENT_YEAR,
  expect,
  expectNoHorizontalScroll,
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
// on phones, the event list as one Excel-style table (TASK-144), compact cost rows by container width.
// Read-only flows: nothing here changes the shared database.

// Ten items: Asiakkaat after Keikat (TASK-015…139); Vuosi first, then Tarjoukset (TASK-142);
// Ostotilaukset after Keikat (TASK-152); Tietojen tuonti last (TASK-154).
const NAV: { label: string; path: string }[] = [
  { label: 'Vuosi', path: '/' },
  { label: 'Tarjoukset', path: '/offers' },
  { label: 'Keikat', path: '/gigs' },
  { label: 'Ostotilaukset', path: '/purchase-orders' },
  { label: 'Asiakkaat', path: '/clients' },
  { label: 'Henkilöt', path: '/people' },
  { label: 'Tehtävät', path: '/tasks' },
  { label: 'Tunnit', path: '/hours' },
  { label: 'Budjetti', path: '/budget' },
  { label: 'Tietojen tuonti', path: '/import' },
];
const SIDEBAR_KEY = 'ig-sidebar'; // frontend/src/layout/sidebarState.ts
/**
 * Event list columns that are always shown (TASK-144 ExcelTable; priority 1 in TASK-147, which hides
 * lower-priority columns on narrower tables). Found by their sort buttons in the header.
 */
const EVENT_ALWAYS_COLUMNS = ['Kokoonpano', 'Päivä', 'Paikka', 'Tila', 'Kokonaishinta', 'Kate-%'];

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

  test('event list: one Excel-style table "Keikkalista" at every desktop width (1199, 1200, 1440 px)', async ({ page }) => {
    // TASK-144: no separate card list any more; below 600 px the same table is laid out as compact rows.
    for (const w of [1199, 1200, 1440]) {
      await page.setViewportSize({ width: w, height: 800 });
      await openLoaded(page, '/gigs');
      const table = eventTable(page);
      await expect(table, `${w} px: table`).toBeVisible();
      await expect(page.getByRole('list', { name: 'Keikkalista' }), `${w} px: no card list`).toHaveCount(0);
      for (const column of EVENT_ALWAYS_COLUMNS) {
        await expect(table.getByRole('button', { name: column, exact: true }), `${w} px: "${column}" header`).toBeVisible();
      }
      for (const column of ['Kokoonpano', 'Paikka', 'Tila']) {
        await expect(table.getByRole('button', { name: `Suodata: ${column}`, exact: true }), `${w} px: filter ${column}`).toBeVisible();
      }
      await expect(eventListRows(page).first()).toBeVisible();
      await expectNoHorizontalScroll(page, `event list at ${w} px`);
    }
  });

  // Gig page columns (owner request): "Kulut ja miehitys" alone on the left (~60 %), the other
  // sections on the right, the log full width below; one column (costs first) on a narrower page.
  // The cost list keeps its own compact rows / full table switch inside the left column.
  test('event page: costs left / other sections right on a wide page, one column otherwise; cost list compact or full', async ({ page }) => {
    const { eventId } = await busyIds(page);
    const table = page.getByRole('table', { name: 'Kulut ja miehitys' });
    // Compact rows keep the table semantics; the header row group is only visually hidden (1 px clip).
    const headerHeight = () => table.locator('thead').evaluate((e) => e.getBoundingClientRect().height);
    const box = async (name: string) => {
      const b = await page.locator('details.event-section').filter({ has: page.getByRole('heading', { name, level: 2 }) }).boundingBox();
      return b!;
    };

    for (const [mode, w, twoColumns, compact] of [
      // TASK-182: the trimmed full table fits a 680 px list (e.g. 1280 px with either sidebar state).
      ['expanded', 900, false, true],
      ['expanded', 1200, false, false],
      ['expanded', 1280, false, false],
      ['collapsed', 1280, true, false],
      ['expanded', 1440, true, false],
      ['collapsed', 1200, true, true],
      ['collapsed', 1920, true, false],
    ] as const) {
      await page.addInitScript(([key, value]) => window.localStorage.setItem(key, value), [SIDEBAR_KEY, mode]);
      await page.setViewportSize({ width: w, height: 800 });
      await openLoaded(page, `/gigs/${eventId}`);
      if (mode === 'collapsed') await expectCollapsed(page);
      else await expectExpanded(page);
      const where = `sidebar ${mode}, ${w} px`;
      await expect(table).toBeVisible();
      expect(await costLines(page).count(), `${where}: cost lines are named rowgroups`).toBeGreaterThan(0);
      if (compact) expect(await headerHeight(), `${where}: compact rows`).toBeLessThanOrEqual(1);
      else expect(await headerHeight(), `${where}: full table with column headers`).toBeGreaterThan(1);

      const costs = await box('Kulut ja miehitys');
      const basic = await box('Perustiedot');
      const economics = await box('Talous');
      const history = await box('Muutoshistoria');
      if (twoColumns) {
        expect(basic.x, `${where}: other sections right of the costs`).toBeGreaterThanOrEqual(costs.x + costs.width);
        expect(Math.abs(basic.y - costs.y), `${where}: both columns start at the top`).toBeLessThanOrEqual(1);
        expect(costs.width / (costs.width + basic.width), `${where}: costs column ~60 %`).toBeGreaterThan(0.55);
        expect(costs.width, `${where}: costs column not too narrow`).toBeGreaterThanOrEqual(600);
        expect(basic.width, `${where}: right column not too narrow`).toBeGreaterThanOrEqual(440);
      } else {
        expect(Math.abs(basic.x - costs.x), `${where}: one column`).toBeLessThanOrEqual(1);
        expect(basic.y, `${where}: costs first`).toBeGreaterThan(costs.y + costs.height - 1);
      }
      // The log is below both columns, full width.
      expect(history.y, `${where}: log below the costs`).toBeGreaterThanOrEqual(costs.y + costs.height - 1);
      expect(history.y, `${where}: log below the right column`).toBeGreaterThanOrEqual(economics.y + economics.height - 1);
      expect(Math.abs(history.x - costs.x), `${where}: log starts at the left edge`).toBeLessThanOrEqual(1);
      expect(history.width, `${where}: log is full width`).toBeGreaterThanOrEqual(
        twoColumns ? basic.x + basic.width - costs.x - 1 : costs.width - 1,
      );
      await expectNoHorizontalScroll(page, `event page, ${where}`);
    }
  });

  // F-006-style check after TASK-147 (responsive Excel tables): Keikat and Tarjoukset use the full
  // content width and never scroll sideways; lower-priority columns are hidden instead.
  test('Keikat and Tarjoukset: no page or table horizontal overflow at 1200 / 1440 / 1920 px, the table fills the width', async ({ page }) => {
    const tableBox = () =>
      page.evaluate(() => {
        const wrap = document.querySelector<HTMLElement>('main .table-wrap');
        const table = wrap?.querySelector('table');
        const container = document.querySelector<HTMLElement>('main .page-container');
        if (!wrap || !table || !container) return null;
        const pad = parseFloat(getComputedStyle(container).paddingLeft) + parseFloat(getComputedStyle(container).paddingRight);
        return {
          wrapScroll: wrap.scrollWidth,
          wrapClient: wrap.clientWidth,
          table: table.getBoundingClientRect().width,
          wrap: wrap.getBoundingClientRect().width,
          content: container.clientWidth - pad,
        };
      });
    for (const mode of ['expanded', 'collapsed'] as const) {
      await page.addInitScript(([key, value]) => window.localStorage.setItem(key, value), [SIDEBAR_KEY, mode]);
      for (const [name, path] of [
        ['Keikat', '/gigs?f.allStatuses=1'],
        ['Tarjoukset', '/offers'],
      ] as const) {
        for (const w of [1200, 1440, 1920]) {
          const where = `${name}, sidebar ${mode}, ${w} px`;
          await page.setViewportSize({ width: w, height: 800 });
          await openLoaded(page, path);
          if (mode === 'collapsed') await expectCollapsed(page);
          else await expectExpanded(page);
          await expect(page.locator('main table').first(), `${where}: table`).toBeVisible();
          await expectNoHorizontalScroll(page, where);
          const box = await tableBox();
          expect(box, `${where}: table measured`).not.toBeNull();
          expect(box!.wrapScroll, `${where}: table scrolls sideways`).toBeLessThanOrEqual(box!.wrapClient);
          expect(box!.table, `${where}: table wider than its frame`).toBeLessThanOrEqual(box!.wrap + 1);
          // Full content width (no --content-max cap on these pages).
          expect(Math.abs(box!.wrap - box!.content), `${where}: table uses the content width`).toBeLessThanOrEqual(2);
        }
      }
    }
  });

  // TASK-148: every app page is full width (no --content-max cap on .page-container or the top
  // bar), and the DataTable pages fill it without scrolling sideways at any desktop/tablet width.
  test('full-width pages: tables fill the content width, no sideways scroll at 600–1920 px', async ({ page }) => {
    const { clientId, personId } = await busyIds(page);
    const measure = () =>
      page.evaluate(() => {
        const main = document.querySelector<HTMLElement>('main')!;
        const container = document.querySelector<HTMLElement>('main .page-container')!;
        const inner = document.querySelector<HTMLElement>('.topbar-inner')!;
        const cs = getComputedStyle(container);
        const pad = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
        return {
          main: main.clientWidth,
          container: container.getBoundingClientRect().width,
          topbar: inner.getBoundingClientRect().right,
          viewport: document.documentElement.clientWidth,
          content: container.clientWidth - pad,
          tables: [...document.querySelectorAll<HTMLElement>('main .table-wrap')]
            .filter((wrap) => wrap.offsetParent !== null)
            .map((wrap) => ({
              name: wrap.querySelector('caption')?.textContent ?? '?',
              scroll: wrap.scrollWidth,
              client: wrap.clientWidth,
              wrap: wrap.getBoundingClientRect().width,
              table: wrap.querySelector('table')!.getBoundingClientRect().width,
            })),
        };
      });
    const pages: [string, string][] = [
      ['year page', '/'],
      ['clients', '/clients'],
      ['client page', `/clients/${clientId}`],
      ['people', '/people'],
      ['person page', `/people/${personId}`],
      ['tasks', '/tasks'],
    ];
    for (const mode of ['expanded', 'collapsed'] as const) {
      await page.addInitScript(([key, value]) => window.localStorage.setItem(key, value), [SIDEBAR_KEY, mode]);
      for (const [name, path] of pages) {
        for (const w of [600, 900, 1200, 1440, 1920]) {
          const where = `${name}, sidebar ${mode}, ${w} px`;
          await page.setViewportSize({ width: w, height: 800 });
          await openLoaded(page, path);
          await expectNoHorizontalScroll(page, where);
          const m = await measure();
          // No cap: the container spans the whole main column and the top bar reaches the window edge.
          expect(Math.abs(m.container - m.main), `${where}: page container uses the full width`).toBeLessThanOrEqual(1);
          expect(Math.abs(m.topbar - m.viewport), `${where}: top bar reaches the window edge`).toBeLessThanOrEqual(1);
          for (const t of m.tables) {
            expect(t.scroll, `${where}: "${t.name}" scrolls sideways`).toBeLessThanOrEqual(t.client);
            expect(t.table, `${where}: "${t.name}" wider than its frame`).toBeLessThanOrEqual(t.wrap + 1);
            expect(t.table, `${where}: "${t.name}" fills its frame`).toBeGreaterThanOrEqual(t.wrap - 4);
          }
        }
      }
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
