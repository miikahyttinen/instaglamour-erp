import { execFileSync } from 'node:child_process';
import type { APIRequestContext, Browser, BrowserContext, Locator, Page, Response, TestInfo } from '@playwright/test';
// Shared e2e configuration (database name, repo root) — the same module playwright.config.ts uses.
import { e2eDbName, repoRoot } from '../scripts/env.mjs';
import { createGigViaApi, suffix } from './gigs';
import { api, expect, tagOf } from './helpers';

// Purchase orders (UC-033, UC-034, BR-113…BR-119): API setup and locators. Synthetic data only.

/** Played gigs go to a past year of their own per project so no other spec's figures move. */
export function poPastYear(testInfo: TestInfo): number {
  return tagOf(testInfo) === 'M' ? 2023 : 2024;
}
/** Upcoming gigs: far in the future (last in "upcoming gigs"), one year per project. */
export function poFutureYear(testInfo: TestInfo): number {
  return tagOf(testInfo) === 'M' ? 2046 : 2047;
}

export interface Person {
  id: string;
  name: string;
  active: boolean;
}

export async function createPersonViaApi(page: Page, name: string): Promise<Person> {
  const res = (await api(page).post('/people', { name })) as { person: Person };
  return res.person;
}

/** BR-116 slug: accents removed, upper case, everything but letters / digits → `-`. */
export function nameSlug(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

interface CostLine {
  id: string;
  type: string;
  personId: string | null;
  budgetedCents: number;
  actualCents: number | null;
  paidAt: string | null;
  purchaseOrder: { id: string; number: string; status: string } | null;
}

/** Adds a cost line for a person and returns its id. */
export async function addLine(page: Page, gigId: string, personId: string, type: string, budgetedCents: number): Promise<string> {
  const before = (await api(page).get(`/gigs/${gigId}`)) as { costLines: CostLine[] };
  const known = new Set(before.costLines.map((l) => l.id));
  const res = (await api(page).post(`/gigs/${gigId}/cost-lines`, { type, personId, budgetedCents })) as {
    gig: { costLines: CostLine[] };
  };
  const line = res.gig.costLines.find((l) => !known.has(l.id));
  if (!line) throw new Error('new cost line not returned');
  return line.id;
}

export async function costLineOf(page: Page, gigId: string, lineId: string): Promise<CostLine> {
  const gig = (await api(page).get(`/gigs/${gigId}`)) as { costLines: CostLine[] };
  const line = gig.costLines.find((l) => l.id === lineId);
  if (!line) throw new Error(`cost line ${lineId} not on gig ${gigId}`);
  return line;
}

export async function freelancerPath(page: Page, personId: string): Promise<string> {
  const res = (await api(page).get(`/people/${personId}/freelancer-link`)) as { sharePath: string };
  expect(res.sharePath).toMatch(/^\/f\/[A-Za-z0-9_-]{43,}$/);
  return res.sharePath;
}

export const tokenOf = (sharePath: string) => sharePath.replace(/^\/f\//, '');

export interface PublicPurchaseOrder {
  number: string;
  status: 'OPEN' | 'PAID' | 'CANCELLED';
  totalCents: number;
  createdAt: string;
  paidAt: string | null;
}

/**
 * Creates a PO through the public endpoint. Pass the `request` fixture: its own context, without
 * the signed-in page's cookies.
 */
export async function createPoPublic(request: APIRequestContext, sharePath: string, costLineIds: string[]): Promise<PublicPurchaseOrder> {
  const res = await request.post(`/api/public/freelancers/${tokenOf(sharePath)}/purchase-orders`, { data: { costLineIds } });
  expect(res.status(), `create PO → ${await res.text()}`).toBe(201);
  return res.json();
}

export interface PurchaseOrder {
  id: string;
  number: string;
  personId: string;
  status: 'OPEN' | 'PAID' | 'CANCELLED';
  totalCents: number;
  createdAt: string;
  paidAt: string | null;
  lines: { costLineId: string; gigId: string; amountCents: number }[];
}

export async function poByNumber(page: Page, number: string): Promise<PurchaseOrder> {
  const res = (await api(page).get(`/purchase-orders?q=${encodeURIComponent(number)}`)) as { purchaseOrders: PurchaseOrder[] };
  const po = res.purchaseOrders.find((p) => p.number === number);
  if (!po) throw new Error(`No PO ${number}`);
  return po;
}

/**
 * Test-only: moves a PO's creation time back by whole years, straight in the e2e database (the API
 * always creates POs "now", but the list year = year of creation, BR-119).
 */
export function backdatePo(number: string, years: number): void {
  if (!/^[A-Z0-9-]+$/.test(number)) throw new Error(`unexpected PO number ${number}`);
  execFileSync(
    'docker',
    [
      'compose', 'exec', '-T', 'db-test', 'psql', '-v', 'ON_ERROR_STOP=1', '-U', 'instaglamour', '-d', e2eDbName,
      '-c', `UPDATE purchase_order SET created_at = created_at - interval '${years} years' WHERE number = '${number}'`,
    ],
    { cwd: repoRoot, stdio: 'pipe' },
  );
}

/**
 * Small setup: a tagged person with one fee line on a played gig and its freelancer link.
 * `name` gets a random suffix.
 */
export async function personWithPlayedFee(
  page: Page,
  testInfo: TestInfo,
  label: string,
  opts: { type?: string; budgetedCents?: number; month?: string } = {},
): Promise<{ person: Person; gigId: string; venue: string; lineId: string; sharePath: string }> {
  const tag = tagOf(testInfo);
  const s = suffix();
  const person = await createPersonViaApi(page, `${label} ${tag}-${s}`);
  const venue = `Venue ${label} ${tag}-${s}`;
  const gig = await createGigViaApi(page, { startDate: `${poPastYear(testInfo)}-${opts.month ?? '06'}-15`, venue });
  const lineId = await addLine(page, gig.id, person.id, opts.type ?? 'DRUMS', opts.budgetedCents ?? 30000);
  return { person, gigId: gig.id, venue, lineId, sharePath: await freelancerPath(page, person.id) };
}

// ---- Anonymous (freelancer) browser ----

export interface Anonymous {
  context: BrowserContext;
  page: Page;
  responses: Response[];
  problems: string[];
}

/** A new context with the project's viewport and no storage state: no cookies, no session. */
export async function anonymous(browser: Browser, testInfo: TestInfo, baseURL: string): Promise<Anonymous> {
  const { viewport, isMobile, hasTouch } = testInfo.project.use;
  const context = await browser.newContext({ baseURL, locale: 'fi-FI', timezoneId: 'Europe/Helsinki', viewport, isMobile, hasTouch });
  expect(await context.cookies(), 'fresh context has no cookies').toEqual([]);
  const page = await context.newPage();
  const anon: Anonymous = { context, page, responses: [], problems: [] };
  context.on('response', (res) => anon.responses.push(res));
  page.on('pageerror', (err) => anon.problems.push(`pageerror: ${err.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error' && !msg.text().startsWith('Failed to load resource')) anon.problems.push(msg.text());
  });
  return anon;
}

/** Opens the freelancer page and waits for its data; returns the JSON response. */
export async function openFreelancer(anon: Anonymous, sharePath: string): Promise<Response> {
  const res = anon.page.waitForResponse(
    (r) => new URL(r.url()).pathname === `/api/public/freelancers/${tokenOf(sharePath)}` && r.request().method() === 'GET' && r.status() !== 0,
  );
  await anon.page.goto(sharePath);
  const response = await res;
  await expect(anon.page.getByText('Ladataan…')).toHaveCount(0);
  return response;
}

/** The fee table on the freelancer page ("Palkkiot"). */
export function feeTable(page: Page): Locator {
  return page.getByRole('table', { name: 'Palkkiot', exact: true });
}
export function feeRows(page: Page): Locator {
  return feeTable(page).getByRole('row').filter({ has: page.getByRole('cell') });
}
/** The fee row of a gig venue and role, e.g. ("Venue X", "Rummut"). */
export function feeRow(page: Page, venue: string, role: string): Locator {
  return feeRows(page).filter({ hasText: venue }).filter({ hasText: role });
}

// ---- Partner screens ----

export function poTable(page: Page): Locator {
  return page.getByRole('table', { name: 'Ostotilaukset', exact: true });
}
export function poRow(page: Page, number: string): Locator {
  return poTable(page)
    .getByRole('row')
    .filter({ has: page.getByRole('link', { name: number, exact: true }) });
}

/** FI "Maksettu 16.10.2026 klo 14.32" of a timestamp, in the suite's time zone (Helsinki). */
export function fiPaidLabel(iso: string): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Helsinki',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(new Date(iso))
      .map((p) => [p.type, p.value]),
  );
  return `Maksettu ${Number(parts.day)}.${Number(parts.month)}.${parts.year} klo ${parts.hour}.${parts.minute}`;
}
