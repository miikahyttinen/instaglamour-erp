import { expect, test as base, type APIRequestContext, type Locator, type Page, type TestInfo } from '@playwright/test';

// Synthetic data only (BR-090): partners/people/venues from seed.example.json, @example.com.
export const PARTNER_A = 'partner.a@example.com';
export const PARTNER_B = 'partner.b@example.com';
export const PARTNER_C = 'partner.c@example.com';

// Values from backend/seed/seed.example.json (all synthetic).
export const SEED = {
  templateB: { name: 'Template B', roleFeeCents: 20000, roles: ['VOC', 'GUITAR', 'DJ'] },
  internalFeeCents: 10000, // office / sales / production defaults
  loadInDeductionCents: 1000,
};

export const CURRENT_YEAR = 2026; // "today" is in 2026 for this suite's seed data

/** FI money exactly as the UI formats it (Intl, fi-FI, EUR, 2 decimals). */
export function fiMoney(cents: number): string {
  return new Intl.NumberFormat('fi-FI', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

/** EN money as the UI formats it. */
export function enMoney(cents: number): string {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

/** Money as typed into a FI input (`1000,00`). */
export function fiInput(cents: number): string {
  return (cents / 100).toFixed(2).replace('.', ',');
}

/** FI hours as the UI formats them (`1,5 h`). */
export function fiHours(hours: number): string {
  return `${new Intl.NumberFormat('fi-FI', { maximumFractionDigits: 2 }).format(hours)} h`;
}

/** FI date `1.5.2026` from `2026-05-01`. */
export function fiDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return `${d}.${m}.${y}`;
}

/** Short tag per project so the two viewport runs never collide in the shared database. */
export function tagOf(testInfo: TestInfo): string {
  return testInfo.project.name.startsWith('mobile') ? 'M' : 'D';
}

export function isMobile(testInfo: TestInfo): boolean {
  return testInfo.project.name.startsWith('mobile');
}

/** Signs in through the dev-login API (shares cookies with the page) and resets prefs. */
export async function signIn(
  page: Page,
  email = PARTNER_A,
  prefs: { language?: 'fi' | 'en'; selectedYear?: number } = {},
): Promise<{ id: string; personId: string; name: string }> {
  const res = await page.request.post('/api/auth/dev-login', { data: { email } });
  expect(res.status(), 'dev login').toBe(200);
  const patch = await page.request.patch('/api/me', {
    data: { language: prefs.language ?? 'fi', selectedYear: prefs.selectedYear ?? CURRENT_YEAR },
  });
  expect(patch.status(), 'PATCH /api/me').toBe(200);
  return (await patch.json()) as { id: string; personId: string; name: string };
}

/**
 * The app switches layout at 900 px (frontend `DESKTOP_QUERY`): from there the header shows
 * language / theme / sign-out as icon buttons (no menu) and the gig list is a table, not cards.
 */
export const DESKTOP_MIN_WIDTH = 900;

export function isWide(page: Page): boolean {
  return (page.viewportSize()?.width ?? 0) >= DESKTOP_MIN_WIDTH;
}

/** The page head (title, subtitle with status tags, actions) — one per page. */
export function pageHead(page: Page): Locator {
  return page.getByRole('main').locator('header.page-head');
}

/** Signs out from the header: the menu on phones, the sign-out icon button on desktop. */
export async function signOutFromHeader(page: Page): Promise<void> {
  if (!isWide(page)) await page.getByRole('button', { name: 'Valikko' }).click();
  await page.getByRole('button', { name: 'Kirjaudu ulos', exact: true }).click();
}

/** Clicks a main-navigation link (bottom bar on phones, header on desktop). */
export async function goNav(page: Page, label: string): Promise<void> {
  await page
    .getByRole('navigation', { name: /Päävalikko|Main menu/ })
    .getByRole('link', { name: label, exact: true })
    .click();
}

/** NFR-1: no horizontal scrolling on the page. */
export async function expectNoHorizontalScroll(page: Page, where: string): Promise<void> {
  // Let layout settle (fonts, late data) before measuring.
  await page.waitForLoadState('networkidle');
  const m = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
    body: document.body.scrollWidth,
  }));
  expect(
    Math.max(m.scroll, m.body),
    `${where}: page is ${Math.max(m.scroll, m.body)} px wide in a ${m.client} px viewport`,
  ).toBeLessThanOrEqual(m.client);
}

// ---- Inline editing (NFR-8, docs/design.md → Inline editing) ----

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const isApiWrite = (method: string, url: string) =>
  WRITE_METHODS.has(method) && new URL(url).pathname.startsWith('/api/');

/**
 * Records every API write the page sends (POST/PUT/PATCH/DELETE). Used to prove that Esc and an
 * invalid value send nothing.
 */
export function trackWrites(page: Page): string[] {
  const list: string[] = [];
  page.on('request', (req) => {
    if (isApiWrite(req.method(), req.url())) list.push(`${req.method()} ${new URL(req.url()).pathname}`);
  });
  return list;
}

/**
 * Edits an inline field like a user: focus it, type the value, leave it (blur) or press Enter.
 * Waits for the write request this causes and expects a 2xx answer (the value reached the
 * backend). Returns the request body.
 */
export async function editInline(
  page: Page,
  field: Locator,
  value: string,
  opts: { commit?: 'blur' | 'Enter'; method?: 'PATCH' | 'PUT' | 'POST' } = {},
): Promise<unknown> {
  await field.click();
  await expect(field).toBeFocused();
  await field.fill(value);
  const response = page.waitForResponse(
    (res) =>
      isApiWrite(res.request().method(), res.url()) && (!opts.method || res.request().method() === opts.method),
  );
  if (opts.commit === 'Enter') await field.press('Enter');
  else await field.blur();
  const res = await response;
  expect(res.ok(), `${res.request().method()} ${res.url()} → ${res.status()}`).toBeTruthy();
  return res.request().postDataJSON();
}

/** Inline select: saves on change (no blur needed). Waits for the write and returns its body. */
export async function selectInline(page: Page, select: Locator, label: string): Promise<unknown> {
  const response = page.waitForResponse((res) => isApiWrite(res.request().method(), res.url()));
  await select.selectOption({ label });
  const res = await response;
  expect(res.ok(), `${res.request().method()} ${res.url()} → ${res.status()}`).toBeTruthy();
  return res.request().postDataJSON();
}

/**
 * Esc: type a new value, press Esc → the last saved value is back; leaving the field then sends
 * nothing. The caller reloads to prove the saved value is unchanged.
 */
export async function expectEscReverts(page: Page, field: Locator, typed: string, saved: string): Promise<void> {
  const writes = trackWrites(page);
  await field.click();
  await field.fill(typed);
  await expect(field).toHaveValue(typed);
  await field.press('Escape');
  await expect(field).toHaveValue(saved);
  await field.blur();
  await page.waitForTimeout(300); // a save would leave right away on blur
  expect(writes, 'Esc and leaving the field send nothing').toEqual([]);
}

/**
 * Invalid value: leaving the field shows the translated error under it (the typed value stays,
 * the field is marked invalid) and nothing is sent. The caller reloads to prove it wasn't saved.
 */
export async function expectInvalidNotSent(page: Page, field: Locator, typed: string, message: string): Promise<void> {
  const writes = trackWrites(page);
  await field.click();
  await field.fill(typed);
  await field.blur();
  await expect(field).toHaveAttribute('aria-invalid', 'true');
  await expect(field).toHaveAccessibleDescription(new RegExp(escapeRegExp(message)));
  await expect(field).toHaveValue(typed);
  await page.waitForTimeout(300);
  expect(writes, 'an invalid value is not sent').toEqual([]);
}

/** NFR-8: existing items have no Edit / Save buttons (creating a new item keeps its own form). */
export async function expectNoEditSaveButtons(scope: Locator, where: string): Promise<void> {
  await expect(
    scope.getByRole('button', { name: /^(Muokkaa|Tallenna|Muuta nimeä)/ }),
    `${where}: no Edit/Save buttons`,
  ).toHaveCount(0);
}

export function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Thin JSON API helper on the page's cookie jar (for setup and cross-checks only). */
export function api(page: Page) {
  const req: APIRequestContext = page.request;
  const json = async (res: Awaited<ReturnType<APIRequestContext['get']>>, what: string) => {
    expect(res.ok(), `${what} → ${res.status()} ${await res.text()}`).toBeTruthy();
    return res.status() === 204 ? null : res.json();
  };
  return {
    get: async (path: string) => json(await req.get(`/api${path}`), `GET ${path}`),
    post: async (path: string, data?: unknown) => json(await req.post(`/api${path}`, { data }), `POST ${path}`),
    patch: async (path: string, data?: unknown) => json(await req.patch(`/api${path}`, { data }), `PATCH ${path}`),
    put: async (path: string, data?: unknown) => json(await req.put(`/api${path}`, { data }), `PUT ${path}`),
    delete: async (path: string) => json(await req.delete(`/api${path}`), `DELETE ${path}`),
    raw: req,
  };
}

/**
 * Every test fails on uncaught page errors and console errors (React warnings, failed renders).
 * "Failed to load resource" lines are skipped: they are the browser's log of expected 4xx answers
 * (401 after sign-out, 415 for a refused upload…), which the tests assert explicitly.
 */
export const test = base.extend<{ consoleGuard: void }>({
  consoleGuard: [
    async ({ page }, use) => {
      const problems: string[] = [];
      page.on('pageerror', (err) => problems.push(`pageerror: ${err.message}`));
      page.on('console', (msg) => {
        if (msg.type() === 'error' && !msg.text().startsWith('Failed to load resource')) {
          problems.push(`console.error: ${msg.text()}`);
        }
      });
      await use();
      expect(problems, 'browser errors during the test').toEqual([]);
    },
    { auto: true },
  ],
});
export { expect };
