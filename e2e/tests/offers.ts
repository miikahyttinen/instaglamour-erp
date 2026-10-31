import type { Locator, Page, TestInfo } from '@playwright/test';
import { api, CURRENT_YEAR, expect, tagOf } from './helpers';

// Clients (UC-027) and offers (UC-028…UC-031): API setup helpers, BR-102 / BR-106 computed from
// API data, and locators for the offer and client screens. Synthetic data only (BR-090).

export interface Client {
  id: string;
  name: string;
  notes: string | null;
}

export type OfferDisposition =
  | 'PENDING'
  | 'WON'
  | 'CANCELLED'
  | 'NO_RESPONSE'
  | 'LOST_PRICE'
  | 'LOST_COMPETITOR'
  | 'LOST_OTHER'
  | 'NO_CAPACITY';
export type OfferSource = 'EMAIL' | 'WEBSITE' | 'INSTAGRAM' | 'OTHER';
export type OfferEventType = 'PRIVATE' | 'WEDDING' | 'CORPORATE';

export interface OfferSummary {
  id: string;
  clientId: string;
  clientName: string;
  eventName: string;
  eventDate: string;
  venue: string;
  city: string | null;
  priceCents: number | null;
  sellerId: string;
  source: OfferSource | null;
  eventType: OfferEventType | null;
  disposition: OfferDisposition;
  status: 'OPEN' | 'ACCEPTED' | 'REJECTED';
  expired: boolean;
  eventId: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface OfferDetail extends OfferSummary {
  lineup: string[];
  includesText: string | null;
  showReferences: boolean;
  sharePath: string;
  preview: Record<string, unknown>;
}

export interface OfferList {
  offers: OfferSummary[];
  summary: { openValueCents: number; winRatePct: number | null; wonCount: number; decidedCount: number };
}

/**
 * Years that only this suite's offer flows write to, per project, so the two viewport runs and the
 * older specs (which use 2026, 2027, 2030…2036) never see each other's data.
 */
export function offerYear(testInfo: TestInfo): number {
  return tagOf(testInfo) === 'M' ? 2038 : 2039;
}

/** FI labels of the codes (frontend i18n: offerDisposition, offerSource, offerEventType). */
export const DISPOSITION_FI: Record<OfferDisposition, string> = {
  PENDING: 'Odottaa',
  WON: 'Voitettu',
  CANCELLED: 'Peruttu',
  NO_RESPONSE: 'Ei vastausta',
  LOST_PRICE: 'Hävitty: hinta',
  LOST_COMPETITOR: 'Hävitty: kilpailija',
  LOST_OTHER: 'Hävitty: muu syy',
  NO_CAPACITY: 'Ei kapasiteettia',
};
export const SOURCE_FI: Record<OfferSource, string> = {
  EMAIL: 'Sähköposti',
  WEBSITE: 'Verkkosivut',
  INSTAGRAM: 'Instagram',
  OTHER: 'Muu',
};
export const EVENT_TYPE_FI: Record<OfferEventType, string> = {
  PRIVATE: 'Yksityisjuhla',
  WEDDING: 'Häät',
  CORPORATE: 'Yritystilaisuus',
};
export const STATUS_FI = { OPEN: 'Avoin', EXPIRED: 'Vanhentunut', ACCEPTED: 'Hyväksytty', REJECTED: 'Hylätty' };

export async function createClientViaApi(page: Page, name: string, notes: string | null = null): Promise<Client> {
  return api(page).post('/clients', { name, notes });
}

export async function clientByName(page: Page, name: string): Promise<Client & { eventCount: number; offerCount: number }> {
  const list = (await api(page).get(`/clients?q=${encodeURIComponent(name)}`)) as (Client & {
    eventCount: number;
    offerCount: number;
  })[];
  const client = list.find((c) => c.name === name);
  if (!client) throw new Error(`No client ${name}`);
  return client;
}

export async function createOfferViaApi(
  page: Page,
  body: {
    clientId: string;
    eventName: string;
    eventDate: string;
    venue: string;
    city?: string | null;
    lineup?: string[];
    priceCents?: number | null;
    sellerId?: string;
    source?: OfferSource | null;
    eventType?: OfferEventType | null;
    showReferences?: boolean;
  },
): Promise<OfferDetail> {
  return api(page).post('/offers', body);
}

export async function setDisposition(page: Page, id: string, disposition: OfferDisposition): Promise<OfferDetail> {
  return api(page).patch(`/offers/${id}`, { disposition });
}

/** `year` = that year only; `null` = every year (what the UI asks for, contract "Year is no longer global"). */
export async function offerList(page: Page, year: number | null, query = ''): Promise<OfferList> {
  if (year === null) return api(page).get(`/offers${query.replace(/^&/, '?')}`);
  return api(page).get(`/offers?year=${year}${query}`);
}

/** Today in Europe/Helsinki as YYYY-MM-DD (the contract's "today"). */
export function helsinkiToday(): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Helsinki' }).format(new Date());
}

/** BR-102: status from disposition; expired = OPEN and event date before today. */
export function expectedStatus(o: Pick<OfferSummary, 'disposition' | 'eventDate'>): {
  status: OfferSummary['status'];
  expired: boolean;
} {
  const status = o.disposition === 'PENDING' ? 'OPEN' : o.disposition === 'WON' ? 'ACCEPTED' : 'REJECTED';
  return { status, expired: status === 'OPEN' && o.eventDate < helsinkiToday() };
}

/** BR-106 from the offer rows: open value of OPEN, unexpired offers; win rate WON / decided. */
export function br106(offers: OfferSummary[]): OfferList['summary'] {
  const live = offers.filter((o) => o.deletedAt === null);
  const openValueCents = live
    .filter((o) => expectedStatus(o).status === 'OPEN' && !expectedStatus(o).expired)
    .reduce((sum, o) => sum + (o.priceCents ?? 0), 0);
  const decided = live.filter((o) => o.disposition !== 'PENDING' && o.disposition !== 'CANCELLED');
  const won = decided.filter((o) => o.disposition === 'WON');
  return {
    openValueCents,
    wonCount: won.length,
    decidedCount: decided.length,
    winRatePct: decided.length === 0 ? null : Math.round((won.length / decided.length) * 1000) / 10,
  };
}

/** FI percent as the UI formats it (`66,7 %`, no-break space). */
export function fiPercent(value: number | null): string {
  if (value === null) return '–';
  return `${new Intl.NumberFormat('fi-FI', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(value)} %`;
}

/** FI date with weekday as the offer preview / convert dialog shows it ("Lauantai 12.6.2038"). */
export function fiDateWithWeekday(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const weekday = new Intl.DateTimeFormat('fi-FI', { weekday: 'long', timeZone: 'UTC' }).format(
    new Date(Date.UTC(y!, m! - 1, d!)),
  );
  return `${weekday.charAt(0).toLocaleUpperCase('fi-FI')}${weekday.slice(1)} ${d}.${m}.${y}`;
}

// ---- Offer list (`/offers`) ----

/** The offer table "Tarjoukset" (on phones the same table is laid out as compact rows). */
export function offerTable(page: Page): Locator {
  return page.getByRole('table', { name: 'Tarjoukset', exact: true });
}

/** Data rows of the offer list. */
export function offerRows(page: Page): Locator {
  return offerTable(page).getByRole('row').filter({ has: page.getByRole('cell') });
}

/** One offer row, found by its event link. */
export function offerRow(page: Page, eventName: string): Locator {
  return offerRows(page).filter({ has: page.getByRole('link', { name: eventName, exact: true }) });
}

/** Event names of the visible rows, in order. */
export async function rowEvents(page: Page): Promise<string[]> {
  return offerRows(page).locator('a.offer-link').allTextContents();
}

/** `GET /api/offers/stats?year=` (contract "Offer statistics", BR-122). */
export interface OfferStats {
  createdByMonth: { month: string; count: number; valueCents: number }[];
  averageByCreatedYear: { year: number; averageCents: number | null; count: number }[];
  byEventYear: { year: number; count: number; valueCents: number }[];
  openValueByEventYear: { year: number; valueCents: number; count: number }[];
  openByEventType: { eventType: OfferEventType | null; count: number; valueCents: number }[];
  winRate: {
    pct: number | null;
    won: number;
    decided: number;
    byEventType: { eventType: OfferEventType; pct: number | null; won: number; decided: number }[];
  };
}

/** Without `year`: the default (current Helsinki year), like the UI. */
export async function offerStats(page: Page, year?: number): Promise<OfferStats> {
  return api(page).get(year === undefined ? '/offers/stats' : `/offers/stats?year=${year}`);
}

/** FI whole euros as the KPI cards format money ("1 500 €"). */
export function fiMoneyWhole(cents: number | null): string {
  if (cents === null) return '–';
  return new Intl.NumberFormat('fi-FI', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Math.round(cents / 100));
}

/** FI whole percent as the KPI cards show it ("33 %"). */
export function fiPercentWhole(value: number | null): string {
  if (value === null) return '–';
  return `${new Intl.NumberFormat('fi-FI', { maximumFractionDigits: 0 }).format(Math.round(value))}\u00a0%`;
}

/**
 * A KPI card on Tarjoukset (BR-122, TASK-157): a region named by its heading, e.g.
 * "Avoimet tarjoukset · 2026" or "Voittoprosentti". `value` = the big figure, `ring` = win rate %.
 */
export function kpiCard(page: Page, name: string | RegExp) {
  const card = page.getByRole('region', { name, exact: typeof name === 'string' });
  return {
    card,
    value: card.locator('.stat-tile-value').first(),
    ring: card.locator('.offer-kpi-ring-text'),
    bar: (label: string) => card.getByRole('button', { name: new RegExp(`^${label}:`) }),
  };
}

/** Opens the offer list (all years) and waits for the data. */
export async function openOfferList(page: Page, query = ''): Promise<void> {
  await page.goto(`/offers${query}`);
  await expect(page.getByRole('heading', { level: 1, name: 'Tarjoukset', exact: true })).toBeVisible();
  await expect(page.getByText('Ladataan…')).toHaveCount(0);
}

export { CURRENT_YEAR };
