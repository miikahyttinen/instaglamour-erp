import type { Browser, BrowserContext, Page, Response, TestInfo } from '@playwright/test';
import { suffix } from './gigs';
import { api, CURRENT_YEAR, expect, expectNoHorizontalScroll, PARTNER_A, signIn, tagOf, test } from './helpers';
import { createClientViaApi, createOfferViaApi, fiDateWithWeekday, offerList, offerYear, type OfferDetail } from './offers';

// Public offer link (UC-030, BR-104), security-relevant. The customer side always runs in a
// **fresh browser context without cookies** (never the signed-in test context). It asserts that the
// price and internal fields are nowhere in the DOM or in any network response body, that the page
// makes no authenticated API call, and that unknown / regenerated / deleted tokens are not found.

// A distinctive synthetic price (multiple of 10000 cents) so any leak is easy to spot.
const PRICE_CENTS = 4560000;
const PRICE_FORMS = ['4560000', '45600', '45 600', '45 600', '45 600', '45,600', '45.600'];
const PUBLIC_KEYS = ['eventName', 'clientName', 'eventDate', 'venue', 'city', 'lineup', 'includesText', 'spotifyUrl', 'references', 'seller'];

interface Anonymous {
  context: BrowserContext;
  page: Page;
  requests: { method: string; path: string; cookie: string | undefined }[];
  responses: Response[];
  problems: string[];
}

/** A new context with the project's viewport and no storage state: no cookies, no localStorage. */
async function anonymous(browser: Browser, testInfo: TestInfo, baseURL: string, locale = 'fi-FI'): Promise<Anonymous> {
  const { viewport, isMobile, hasTouch } = testInfo.project.use;
  const context = await browser.newContext({ baseURL, locale, timezoneId: 'Europe/Helsinki', viewport, isMobile, hasTouch });
  expect(await context.cookies(), 'fresh context has no cookies').toEqual([]);
  const page = await context.newPage();
  const anon: Anonymous = { context, page, requests: [], responses: [], problems: [] };
  context.on('request', async (req) => {
    const headers = await req.allHeaders();
    anon.requests.push({ method: req.method(), path: new URL(req.url()).pathname, cookie: headers.cookie });
  });
  context.on('response', (res) => anon.responses.push(res));
  page.on('pageerror', (err) => anon.problems.push(`pageerror: ${err.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error' && !msg.text().startsWith('Failed to load resource')) anon.problems.push(msg.text());
  });
  return anon;
}

const apiCalls = (anon: Anonymous) => anon.requests.filter((r) => r.path.startsWith('/api/'));
const tokenOf = (sharePath: string) => sharePath.replace(/^\/o\//, '');

/** Every response body the anonymous context received (HTML, JS, CSS, JSON) as text. */
async function bodies(anon: Anonymous): Promise<{ url: string; text: string }[]> {
  const out: { url: string; text: string }[] = [];
  for (const res of anon.responses) {
    const body = await res.body().catch(() => null); // redirects / aborted have no body
    if (body) out.push({ url: res.url(), text: body.toString('utf8') });
  }
  return out;
}

async function expectNoPrice(anon: Anonymous, where: string): Promise<void> {
  const html = await anon.page.content();
  const text = await anon.page.evaluate(() => document.body.innerText);
  for (const form of PRICE_FORMS) {
    expect(html.includes(form), `${where}: price "${form}" in the DOM`).toBe(false);
  }
  expect(text.includes('€'), `${where}: no euro amount on the page`).toBe(false);
  expect(html.includes('priceCents')).toBe(false);
  for (const { url, text: body } of await bodies(anon)) {
    for (const form of PRICE_FORMS) expect(body.includes(form), `${where}: price "${form}" in ${url}`).toBe(false);
    if (new URL(url).pathname.startsWith('/api/')) expect(body.includes('priceCents'), `${where}: ${url}`).toBe(false);
  }
}

async function expectNotFound(anon: Anonymous, sharePath: string, heading = 'Tarjousta ei löytynyt'): Promise<void> {
  const res = anon.page.waitForResponse((r) => r.url().includes(`/api/public/offers/${tokenOf(sharePath)}`));
  await anon.page.goto(sharePath);
  const api404 = await res;
  expect(api404.status()).toBe(404);
  expect((await api404.json()).error.code).toBe('NOT_FOUND');
  await expect(anon.page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
  await expect(anon.page.getByRole('article')).toHaveCount(0);
}

test('public link without a session: only that offer, no price or internal field anywhere, FI/EN, noindex', async ({ page, browser, baseURL }, testInfo) => {
  const tag = tagOf(testInfo);
  const year = offerYear(testInfo);
  const me = await signIn(page, PARTNER_A, { selectedYear: year });
  const secretNote = `Internal note ${tag}-${suffix()}`;
  const client = await createClientViaApi(page, `Client ${tag}-${suffix()}-pub`, secretNote);
  const offer = await createOfferViaApi(page, {
    clientId: client.id,
    eventName: `Juhla ${tag}-${suffix()}-pub`,
    eventDate: `${year}-06-12`,
    venue: 'Venue Q',
    city: 'City Q',
    lineup: ['Vocals', 'Guitar', 'Drums'],
    priceCents: PRICE_CENTS,
    source: 'INSTAGRAM',
    eventType: 'CORPORATE',
    showReferences: true,
  });
  const others = [
    ...(await offerList(page, year)).offers,
    ...(await offerList(page, CURRENT_YEAR)).offers,
  ].filter((o) => o.id !== offer.id);
  expect(others.length).toBeGreaterThan(0);

  const anon = await anonymous(browser, testInfo, baseURL!);
  const p = anon.page;
  const publicRes = p.waitForResponse((r) => r.url().includes('/api/public/offers/'));
  await p.goto(offer.sharePath);
  const res = await publicRes;

  // The offer: event, client, date with weekday, venue, lineup, includes, references, seller.
  const article = p.getByRole('article', { name: offer.eventName });
  await expect(article).toBeVisible();
  await expect(p.getByRole('heading', { level: 1, name: offer.eventName })).toBeVisible();
  await expect(article).toContainText(client.name);
  await expect(article).toContainText(fiDateWithWeekday(`${year}-06-12`));
  await expect(article).toContainText('Venue Q, City Q');
  const lineup = article.getByRole('region', { name: 'Kokoonpano' });
  for (const item of ['Vocals', 'Guitar', 'Drums']) await expect(lineup).toContainText(item);
  await expect(article.getByRole('region', { name: 'Tarjoukseen sisältyy' })).toContainText('Placeholder: what is included in the offer.');
  // References: only presence when showReferences is on (contents / shape are being redesigned).
  await expect(article.getByRole('region', { name: 'Referenssit' })).toBeVisible();
  const contact = article.getByRole('region', { name: 'Yhteystiedot' });
  await expect(contact).toContainText(me.name);
  await expect(contact.getByRole('link', { name: 'partner.a@example.com' })).toHaveAttribute('href', 'mailto:partner.a@example.com');
  // No app shell: no navigation, no year, no sign-out.
  await expect(p.getByRole('navigation')).toHaveCount(0);
  await expect(p.getByRole('button', { name: /Kirjaudu ulos|Valikko/ })).toHaveCount(0);
  await expectNoHorizontalScroll(p, 'public offer');

  // The API answer: 200, noindex, no cookie set, exactly the public fields (AC-2).
  expect(res.status()).toBe(200);
  expect(res.headers()['x-robots-tag']).toMatch(/noindex/);
  expect(res.headers()['set-cookie']).toBeUndefined();
  const json = (await res.json()) as Record<string, unknown>;
  // The fixed Spotify link (contract 2026-10-15): always set, a web link, the same as in the JSON.
  expect(json.spotifyUrl).toMatch(/^https:\/\//);
  await expect(article.getByRole('link', { name: 'Kuuntele Spotifyssa (avautuu uuteen välilehteen)' })).toHaveAttribute(
    'href',
    json.spotifyUrl as string,
  );
  expect(Object.keys(json).sort()).toEqual([...PUBLIC_KEYS].sort());
  expect(Object.keys(json.seller as object).sort()).toEqual(['email', 'name', 'phone']);
  expect(json).toMatchObject({ eventName: offer.eventName, clientName: client.name, eventDate: `${year}-06-12`, venue: 'Venue Q', city: 'City Q' });
  await expect(p.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);

  // No price, no internal field, no other offer, no ids (DOM and every response body).
  await expectNoPrice(anon, 'FI');
  const html = await p.content();
  for (const [what, value] of [
    ['client notes', secretNote],
    ['offer id', offer.id],
    ['client id', client.id],
    ['seller id', me.id],
    ['share token in the content', 'sharePath'],
    ['source', 'Instagram'],
    ['event type', 'Yritystilaisuus'],
    ['disposition', 'Odottaa'],
  ] as const) {
    expect(html.includes(value), `${what} must not be on the public page`).toBe(false);
  }
  const all = await bodies(anon);
  expect(all.length, 'the scan sees the HTML, scripts and API answers').toBeGreaterThan(10);
  const apiBodies = all.filter((b) => new URL(b.url).pathname.startsWith('/api/'));
  expect(apiBodies.some((b) => b.text.includes(offer.eventName)), 'the scan includes the public JSON').toBe(true);
  for (const b of apiBodies) {
    for (const value of [secretNote, offer.id, client.id, me.id, 'INSTAGRAM', 'CORPORATE', 'PENDING', 'disposition']) {
      expect(b.text.includes(value), `${value} in ${b.url}`).toBe(false);
    }
  }
  for (const other of others) {
    expect(html.includes(other.eventName), `another offer (${other.eventName}) on the page`).toBe(false);
  }

  // No authenticated API call: every /api request is the GET of this public path, without a cookie.
  // (The dev server's React StrictMode mounts the page twice and the first fetch is aborted, so
  // the count is not fixed at 1.)
  const publicCall = { method: 'GET', path: `/api/public/offers/${tokenOf(offer.sharePath)}`, cookie: undefined };
  const calls = apiCalls(anon);
  expect(calls.length).toBeGreaterThanOrEqual(1);
  for (const call of calls) expect(call).toEqual(publicCall);
  expect(anon.requests.every((r) => r.cookie === undefined), 'no request carries a cookie').toBe(true);
  expect(await anon.context.cookies(), 'no cookie was set').toEqual([]);

  // FI/EN switch: changes the texts, not saved anywhere (no request), still no price.
  const languages = p.getByRole('group', { name: 'Kieli' });
  await expect(languages.getByRole('button', { name: 'Suomi' })).toHaveAttribute('aria-pressed', 'true');
  await languages.getByRole('button', { name: 'English' }).click();
  await expect(p.getByRole('group', { name: 'Language' }).getByRole('button', { name: 'English' })).toHaveAttribute('aria-pressed', 'true');
  await expect(article.getByRole('region', { name: 'Lineup' })).toBeVisible();
  await expect(article.getByRole('region', { name: 'References' })).toBeVisible();
  await expect(article.getByRole('region', { name: 'Contact' })).toBeVisible();
  await expect(article.getByRole('link', { name: 'Listen on Spotify (opens in a new tab)' })).toBeVisible();
  await expectNoPrice(anon, 'EN');
  await p.getByRole('group', { name: 'Language' }).getByRole('button', { name: 'Suomi' }).click();
  await expect(article.getByRole('region', { name: 'Kokoonpano' })).toBeVisible();
  expect(apiCalls(anon), 'switching the language sends nothing').toHaveLength(calls.length);

  // The anonymous context can't reach any other data.
  for (const path of ['/api/me', `/api/offers?year=${year}`, `/api/offers/${offer.id}`, `/api/clients/${client.id}`, `/api/gigs?year=${year}`]) {
    const r = await anon.context.request.get(path);
    expect(r.status(), `${path} without a session`).toBe(401);
  }
  expect(anon.problems, 'browser errors on the public page').toEqual([]);
  await anon.context.close();
});

test('public link: unknown token → not found; regenerated → old not found, new works; deleted → not found', async ({ page, browser, baseURL }, testInfo) => {
  const tag = tagOf(testInfo);
  const year = offerYear(testInfo);
  await signIn(page, PARTNER_A, { selectedYear: year });
  const client = await createClientViaApi(page, `Client ${tag}-${suffix()}-pub2`);
  const offer = await createOfferViaApi(page, {
    clientId: client.id,
    eventName: `Juhla ${tag}-${suffix()}-pub2`,
    eventDate: `${year}-06-13`,
    venue: 'Venue Q',
    priceCents: PRICE_CENTS,
  });

  const anon = await anonymous(browser, testInfo, baseURL!);
  const p = anon.page;

  // Unknown (well-formed and short) tokens: the same "not found" page, no details (E1).
  for (const token of ['A'.repeat(43), `${tokenOf(offer.sharePath).slice(0, -2)}xx`, 'x']) {
    await expectNotFound(anon, `/o/${token}`);
    await expect(p.getByText('Linkki ei ole voimassa. Pyydä uusi linkki yhteyshenkilöltäsi.')).toBeVisible();
    await expect(p.getByText(offer.eventName)).toHaveCount(0);
  }

  // The real link works; showReferences is off (default) → no references region.
  await p.goto(offer.sharePath);
  await expect(p.getByRole('article', { name: offer.eventName })).toBeVisible();
  await expect(p.getByRole('article', { name: offer.eventName }).getByRole('region', { name: 'Tarjoukseen sisältyy' })).toBeVisible();
  await expect(p.getByRole('region', { name: 'Referenssit' })).toHaveCount(0);

  // Regenerate (signed-in side) → the open page's link is dead after a reload; the new one works.
  const regenerated = (await api(page).post(`/offers/${offer.id}/regenerate-link`)) as OfferDetail;
  expect(regenerated.sharePath).not.toBe(offer.sharePath);
  await expectNotFound(anon, offer.sharePath);
  await p.goto(regenerated.sharePath);
  await expect(p.getByRole('article', { name: offer.eventName })).toBeVisible();
  await expectNoPrice(anon, 'regenerated link');

  // Deleted offer → 404, same page as an unknown token.
  await api(page).post(`/offers/${offer.id}/delete`);
  await expectNotFound(anon, regenerated.sharePath);

  // A browser in English gets the English page by default.
  const en = await anonymous(browser, testInfo, baseURL!, 'en-GB');
  await expectNotFound(en, regenerated.sharePath, 'Offer not found');
  await expect(en.page.getByText('This link is not valid. Ask your contact person for a new link.')).toBeVisible();

  for (const a of [anon, en]) {
    expect(a.requests.filter((r) => r.path.startsWith('/api/') && !r.path.startsWith('/api/public/offers/')), 'only the public endpoint').toEqual([]);
    expect(a.requests.every((r) => r.cookie === undefined)).toBe(true);
    expect(a.problems).toEqual([]);
    await a.context.close();
  }
});
