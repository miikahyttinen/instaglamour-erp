import { expect, test as base, type APIRequestContext, type Page, type TestInfo } from '@playwright/test';

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

export const test = base;
export { expect };
