import type { Page } from '@playwright/test';
import { reference, suffix } from './gigs';
import {
  api,
  CURRENT_YEAR,
  editInline,
  expect,
  expectNoEditSaveButtons,
  expectNoHorizontalScroll,
  fiInput,
  fiMoney,
  goNav,
  isMobile,
  PARTNER_A,
  selectInline,
  signIn,
  tagOf,
  test,
  trackWrites,
} from './helpers';
import {
  br106,
  createClientViaApi,
  createOfferViaApi,
  DISPOSITION_FI,
  expectedStatus,
  fiDateWithWeekday,
  fiPercent,
  figure,
  helsinkiToday,
  offerList,
  offerRow,
  offerRows,
  offerTable,
  offerYear,
  openOfferList,
  rowEvents,
  setDisposition,
  STATUS_FI,
  type OfferDetail,
  type OfferSummary,
} from './offers';

// Offers (UC-028, UC-029, UC-031; BR-102…BR-106). Writes go to the project's own year
// (offerYear: 2038 / 2039), except the figures test, which needs past and future dates around
// "today" and therefore adds tagged offers to the current year; its expectations are computed
// from the API, so the other project's offers do not matter.

async function partnerId(page: Page, name: string): Promise<string> {
  const ref = await reference(page);
  const p = ref.partners.find((x) => x.name === name);
  if (!p) throw new Error(`No partner ${name}`);
  return p.id;
}

async function openOffer(page: Page, offer: Pick<OfferSummary, 'id' | 'eventName'>): Promise<void> {
  await page.goto(`/offers/${offer.id}`);
  await expect(page.getByRole('heading', { level: 1, name: offer.eventName })).toBeVisible();
}

/** Public endpoint status for a share path, from a request context without cookies. */
async function publicStatus(page: Page, sharePath: string): Promise<number> {
  const token = sharePath.replace(/^\/o\//, '');
  const res = await page.request.get(`/api/public/offers/${token}`, { headers: { cookie: '' } });
  return res.status();
}

test('new offer: required fields refused, defaults applied when "what\'s included" and Spotify are empty', async ({ page }, testInfo) => {
  const tag = tagOf(testInfo);
  const year = offerYear(testInfo);
  const me = await signIn(page, PARTNER_A, { selectedYear: year });
  const client = await createClientViaApi(page, `Client ${tag}-${suffix()}-offer`);
  const eventName = `Juhla ${tag}-${suffix()}`;

  // Offers is the first menu item; the selected year has no offers yet → empty state (E1).
  await page.goto('/');
  await goNav(page, 'Tarjoukset');
  await expect(page.getByRole('heading', { level: 1, name: `Tarjoukset ${year}` })).toBeVisible();
  const before = await offerList(page, year);
  if (before.offers.length === 0) {
    await expect(page.getByText(`Ei tarjouksia vuodelle ${year}.`)).toBeVisible();
    await expect(figure(page, 'Voittoprosentti').value).toHaveText('–');
  }
  await page.getByRole('main').getByRole('link', { name: 'Uusi tarjous' }).first().click();
  await expect(page.getByRole('heading', { level: 1, name: 'Uusi tarjous' })).toBeVisible();
  await expectNoHorizontalScroll(page, 'new offer');

  // E1: client, event, date and venue are required; nothing is sent.
  const writes = trackWrites(page);
  await page.getByRole('button', { name: 'Luo tarjous' }).click();
  for (const label of ['Asiakas', 'Tapahtuma', 'Tapahtumapäivä', 'Paikka']) {
    await expect(page.getByLabel(label, { exact: true }), label).toHaveAccessibleDescription(/Pakollinen tieto\./);
  }
  await page.waitForTimeout(300);
  expect(writes, 'an incomplete offer is not sent').toEqual([]);

  // Seller defaults to me.
  await expect(page.getByLabel('Myyjä', { exact: true }).locator('option:checked')).toHaveText(me.name);
  await page.getByLabel('Asiakas', { exact: true }).selectOption({ label: client.name });
  await page.getByLabel('Tapahtuma', { exact: true }).fill(eventName);
  await page.getByLabel('Tapahtumapäivä', { exact: true }).fill(`${year}-06-12`);
  await page.getByLabel('Paikka', { exact: true }).fill('Venue Q');
  await page.getByLabel('Kaupunki', { exact: true }).fill('City Q');
  await page.getByLabel('Täytä kokoonpanopohjasta').selectOption({ label: 'Template B' });
  await expect(page.getByLabel('Kokoonpano', { exact: true })).toHaveValue('Laulu\nKitara\nDJ');
  await page.getByLabel('Hinta', { exact: true }).fill(fiInput(300000));
  await page.getByLabel('Lähde', { exact: true }).selectOption({ label: 'Sähköposti' });
  await page.getByLabel('Tapahtumatyyppi', { exact: true }).selectOption({ label: 'Häät' });
  await page.getByRole('switch', { name: 'Näytä referenssit' }).check();

  const create = page.waitForResponse((r) => r.request().method() === 'POST' && r.url().endsWith('/api/offers'));
  await page.getByRole('button', { name: 'Luo tarjous' }).click();
  const res = await create;
  expect(res.status()).toBe(201);
  const body = res.request().postDataJSON();
  expect(body).toEqual({
    clientId: client.id,
    eventName,
    eventDate: `${year}-06-12`,
    venue: 'Venue Q',
    city: 'City Q',
    lineup: ['Laulu', 'Kitara', 'DJ'],
    showReferences: true,
    priceCents: 300000,
    sellerId: me.id,
    source: 'EMAIL',
    eventType: 'WEDDING',
  });
  const offer = (await res.json()) as OfferDetail;

  // Offer page; the server applied the setting defaults (seed: synthetic placeholders).
  await expect(page).toHaveURL(new RegExp(`/offers/${offer.id}$`));
  await expect(page.getByRole('heading', { level: 1, name: eventName })).toBeVisible();
  const saved = (await api(page).get(`/offers/${offer.id}`)) as OfferDetail;
  expect(saved.includesText).toBe('Placeholder: what is included in the offer.\nSecond placeholder line.');
  expect(saved.spotifyUrl).toBe('https://open.spotify.com/');
  expect(saved).toMatchObject({ disposition: 'PENDING', status: 'OPEN', expired: false, gigId: null, sellerId: me.id });
  expect(saved.sharePath).toMatch(/^\/o\/[A-Za-z0-9_-]{43,}$/); // ≥ 32 random bytes, URL-safe (BR-104)

  // The preview is the customer view: the default texts, no price.
  const preview = page.getByRole('article', { name: eventName });
  await expect(preview).toContainText('Placeholder: what is included in the offer.');
  await expect(preview).toContainText(fiDateWithWeekday(`${year}-06-12`));
  await expect(preview).toContainText('Esimerkkiteksti: referenssit.');
  await expect(preview).not.toContainText(fiMoney(300000));
  // Internal fields stay out of the customer view (event type "Häät", disposition "Odottaa").
  await expect(preview).not.toContainText('Häät');
  await expect(preview).not.toContainText(DISPOSITION_FI.PENDING);
  await expectNoEditSaveButtons(page.getByRole('main'), 'offer page');
  await expectNoHorizontalScroll(page, 'offer page');

  // API: the same rules (UC-029 E1), and a non-http Spotify link is refused.
  const bad = await page.request.post('/api/offers', { data: { eventName: '', eventDate: 'x', venue: '' } });
  expect(bad.status()).toBe(400);
  expect((await bad.json()).error.fields).toMatchObject({ clientId: 'REQUIRED', eventName: 'REQUIRED', venue: 'REQUIRED' });
  const spotify = await page.request.post('/api/offers', {
    data: { clientId: client.id, eventName, eventDate: `${year}-06-12`, venue: 'Venue Q', spotifyUrl: 'javascript:alert(1)' },
  });
  expect(spotify.status()).toBe(400);
  expect((await spotify.json()).error.fields).toEqual({ spotifyUrl: 'INVALID_VALUE' });

  // The list of the year shows it.
  await openOfferList(page);
  await expect(offerRow(page, eventName)).toHaveCount(1);
  await expect(offerRow(page, eventName)).toContainText(client.name);
  await expect(offerRow(page, eventName)).toContainText('Venue Q, City Q');
  await expect(offerRow(page, eventName)).toContainText(fiMoney(300000));
  await expect(offerRow(page, eventName)).toContainText('Avoin');
});

test('list: figures = BR-106 from the API; rows of the year; sorting; filters incl. Expired', async ({ page }, testInfo) => {
  const tag = tagOf(testInfo);
  await signIn(page); // current year: offers before and after today
  const sfx = `${tag}${suffix()}`;
  const client = await createClientViaApi(page, `Client ${sfx}-list`);
  const partnerB = await partnerId(page, 'Partner B');
  const today = helsinkiToday();
  test.skip(today >= `${CURRENT_YEAR}-12-20`, 'needs dates after today in the current year');
  type Spec = {
    key: string;
    date: string;
    price: number | null;
    disposition: OfferSummary['disposition'];
    source: OfferSummary['source'];
    eventType: OfferSummary['eventType'];
    seller?: string;
  };
  const specs: Spec[] = [
    { key: 'Delta', date: `${CURRENT_YEAR}-12-21`, price: 150000, disposition: 'PENDING', source: 'EMAIL', eventType: 'WEDDING' },
    { key: 'Alfa', date: `${CURRENT_YEAR}-01-14`, price: 250000, disposition: 'PENDING', source: 'WEBSITE', eventType: 'PRIVATE' },
    { key: 'Foxtrot', date: `${CURRENT_YEAR}-12-24`, price: 350000, disposition: 'WON', source: 'INSTAGRAM', eventType: 'CORPORATE', seller: partnerB },
    { key: 'Charlie', date: `${CURRENT_YEAR}-02-11`, price: 50000, disposition: 'LOST_PRICE', source: 'OTHER', eventType: null },
    { key: 'Bravo', date: `${CURRENT_YEAR}-12-22`, price: null, disposition: 'CANCELLED', source: null, eventType: 'WEDDING' },
    { key: 'Echo', date: `${CURRENT_YEAR}-12-23`, price: 90000, disposition: 'PENDING', source: null, eventType: null },
  ];
  const name = (key: string) => `${sfx} ${key}`;
  for (const s of specs) {
    const o = await createOfferViaApi(page, {
      clientId: client.id,
      eventName: name(s.key),
      eventDate: s.date,
      venue: 'Venue Q',
      priceCents: s.price,
      source: s.source,
      eventType: s.eventType,
      ...(s.seller ? { sellerId: s.seller } : {}),
    });
    if (s.disposition !== 'PENDING') await setDisposition(page, o.id, s.disposition);
  }

  // API: BR-102 status / expired on every offer of the year; BR-106 summary = the rows.
  const all = await offerList(page, CURRENT_YEAR);
  for (const o of all.offers) {
    expect({ status: o.status, expired: o.expired }, `${o.eventName}: BR-102`).toEqual(expectedStatus(o));
    expect(o.eventDate.startsWith(`${CURRENT_YEAR}-`)).toBe(true);
    expect(o.deletedAt).toBeNull();
  }
  const expected = br106(all.offers);
  expect(all.summary).toEqual(expected);

  // UI: figures and rows (= non-deleted offers whose event date is in the year).
  await page.goto('/');
  await goNav(page, 'Tarjoukset');
  await expect(page.getByRole('heading', { level: 1, name: `Tarjoukset ${CURRENT_YEAR}` })).toBeVisible();
  await expect(figure(page, 'Avoimet tarjoukset').value).toHaveText(fiMoney(expected.openValueCents));
  await expect(figure(page, 'Voittoprosentti').value).toHaveText(fiPercent(expected.winRatePct));
  await expect(figure(page, 'Voittoprosentti').caption).toContainText(
    `${expected.wonCount} / ${expected.decidedCount} ratkaistusta voitettu`,
  );
  await expect(offerRows(page)).toHaveCount(all.offers.length);
  await expectNoHorizontalScroll(page, 'offer list');

  // Only this test's offers from here on (search matches the event name).
  await page.getByLabel('Haku', { exact: true }).fill(sfx);
  await expect(page).toHaveURL(new RegExp(`[?&]q=${sfx}`));
  await expect(offerRows(page)).toHaveCount(specs.length);
  // Default sort: event date ascending.
  const byDate = [...specs].sort((a, b) => a.date.localeCompare(b.date)).map((s) => name(s.key));
  await expect.poll(() => rowEvents(page)).toEqual(byDate);
  // Status tags incl. Expired (AC-4): the open, past offer.
  await expect(offerRow(page, name('Alfa'))).toContainText(STATUS_FI.EXPIRED);
  await expect(offerRow(page, name('Delta'))).toContainText(STATUS_FI.OPEN);
  await expect(offerRow(page, name('Foxtrot'))).toContainText(STATUS_FI.ACCEPTED);
  await expect(offerRow(page, name('Charlie'))).toContainText(STATUS_FI.REJECTED);
  await expect(offerRow(page, name('Bravo'))).toContainText('–'); // no price

  // Sorting: price asc / desc (empty last), event name asc. Headers on desktop, URL on phones
  // (the table is laid out as cards there; the sort lives in ?sort=&dir=).
  const byPrice = specs.filter((s) => s.price !== null).sort((a, b) => a.price! - b.price!).map((s) => name(s.key));
  const sortBy = async (column: string, key: string, dir: 'asc' | 'desc') => {
    if (isMobile(testInfo)) {
      const url = new URL(page.url());
      url.searchParams.set('sort', key);
      url.searchParams.set('dir', dir);
      await page.goto(url.pathname + url.search);
    } else {
      await offerTable(page).getByRole('columnheader', { name: column, exact: true }).getByRole('button').click();
      await expect(offerTable(page).getByRole('columnheader', { name: column, exact: true })).toHaveAttribute(
        'aria-sort',
        dir === 'asc' ? 'ascending' : 'descending',
      );
      await expect(offerTable(page).getByRole('columnheader', { name: 'Tapahtumapäivä', exact: true })).toHaveAttribute('aria-sort', 'none');
    }
    await expect(page).toHaveURL(new RegExp(`sort=${key}&dir=${dir}`));
  };
  await sortBy('Hinta', 'price', 'asc');
  await expect.poll(() => rowEvents(page)).toEqual([...byPrice, name('Bravo')]);
  await sortBy('Hinta', 'price', 'desc');
  await expect.poll(() => rowEvents(page)).toEqual([...byPrice].reverse().concat(name('Bravo')));
  await sortBy('Tapahtuma', 'event', 'asc');
  await expect.poll(() => rowEvents(page)).toEqual(['Alfa', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot'].map(name));
  // Sort survives a reload.
  await page.reload();
  await expect.poll(() => rowEvents(page)).toEqual(['Alfa', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot'].map(name));

  // Filters (in the URL), each equal to the API with the same filter; figures ignore them.
  const filters: [label: string, option: string, query: string, keys: string[]][] = [
    ['Tila', STATUS_FI.EXPIRED, 'status=EXPIRED', ['Alfa']],
    ['Tila', STATUS_FI.OPEN, 'status=OPEN', ['Alfa', 'Delta', 'Echo']],
    ['Tila', STATUS_FI.ACCEPTED, 'status=ACCEPTED', ['Foxtrot']],
    ['Tila', STATUS_FI.REJECTED, 'status=REJECTED', ['Bravo', 'Charlie']],
    ['Myyjä', 'Partner B', `sellerId=${partnerB}`, ['Foxtrot']],
    ['Lopputulos', DISPOSITION_FI.LOST_PRICE, 'disposition=LOST_PRICE', ['Charlie']],
    ['Tapahtumatyyppi', 'Häät', 'eventType=WEDDING', ['Bravo', 'Delta']],
    ['Lähde', 'Verkkosivut', 'source=WEBSITE', ['Alfa']],
  ];
  for (const [label, option, query, keys] of filters) {
    const select = page.getByRole('main').getByLabel(label, { exact: true });
    await select.selectOption({ label: option });
    await expect.poll(() => rowEvents(page), `${label} = ${option}`).toEqual(keys.map(name));
    const viaApi = await offerList(page, CURRENT_YEAR, `&q=${sfx}&${query}`);
    expect(viaApi.offers.map((o) => o.eventName).sort(), `API ${query}`).toEqual(keys.map(name));
    expect(viaApi.summary, `API ${query}: summary ignores filters`).toEqual(expected);
    await expect(figure(page, 'Avoimet tarjoukset').value).toHaveText(fiMoney(expected.openValueCents));
    await expect(figure(page, 'Voittoprosentti').value).toHaveText(fiPercent(expected.winRatePct));
    await select.selectOption({ label: 'Kaikki' });
  }
  // Filters and search survive a reload.
  await page.getByRole('main').getByLabel('Tila', { exact: true }).selectOption({ label: STATUS_FI.EXPIRED });
  await page.reload();
  await expect(page.getByRole('main').getByLabel('Tila', { exact: true }).locator('option:checked')).toHaveText(STATUS_FI.EXPIRED);
  await expect.poll(() => rowEvents(page)).toEqual([name('Alfa')]);
  await expectNoHorizontalScroll(page, 'offer list filtered');
});

test('inline source, event type and disposition: saved on change, kept after reload, logged; status follows disposition', async ({ page }, testInfo) => {
  const tag = tagOf(testInfo);
  const year = offerYear(testInfo);
  await signIn(page, PARTNER_A, { selectedYear: year });
  const client = await createClientViaApi(page, `Client ${tag}-${suffix()}-inline`);
  const offer = await createOfferViaApi(page, {
    clientId: client.id,
    eventName: `Juhla ${tag}-${suffix()}-inline`,
    eventDate: `${year}-07-03`,
    venue: 'Venue Q',
    priceCents: 200000,
  });
  const ev = offer.eventName;

  await openOfferList(page, `?q=${encodeURIComponent(ev)}`);
  const row = offerRow(page, ev);
  await expect(row).toHaveCount(1);
  const source = row.getByLabel(`Lähde: ${ev}`, { exact: true });
  const eventType = row.getByLabel(`Tapahtumatyyppi: ${ev}`, { exact: true });
  const disposition = row.getByLabel(`Lopputulos: ${ev}`, { exact: true });

  expect(await selectInline(page, source, 'Instagram')).toEqual({ source: 'INSTAGRAM' });
  expect(await selectInline(page, eventType, 'Yritystilaisuus')).toEqual({ eventType: 'CORPORATE' });
  expect(await selectInline(page, disposition, DISPOSITION_FI.LOST_COMPETITOR)).toEqual({ disposition: 'LOST_COMPETITOR' });
  await expect(row).toContainText(STATUS_FI.REJECTED);

  await page.reload();
  await expect(source.locator('option:checked')).toHaveText('Instagram');
  await expect(eventType.locator('option:checked')).toHaveText('Yritystilaisuus');
  await expect(disposition.locator('option:checked')).toHaveText(DISPOSITION_FI.LOST_COMPETITOR);
  await expect(row).toContainText(STATUS_FI.REJECTED);

  // Back to pending → open; "–" clears the source.
  expect(await selectInline(page, disposition, DISPOSITION_FI.PENDING)).toEqual({ disposition: 'PENDING' });
  await expect(row).toContainText(STATUS_FI.OPEN);
  expect(await selectInline(page, source, '–')).toEqual({ source: null });
  await page.reload();
  await expect(source.locator('option:checked')).toHaveText('–');
  await expect(disposition.locator('option:checked')).toHaveText(DISPOSITION_FI.PENDING);
  const saved = (await api(page).get(`/offers/${offer.id}`)) as OfferDetail;
  expect(saved).toMatchObject({ source: null, eventType: 'CORPORATE', disposition: 'PENDING', status: 'OPEN' });

  // History (BR-103): every change, disposition changes with old → new.
  const history = (await api(page).get(`/offers/${offer.id}/history`)) as { type: string; details: Record<string, unknown> }[];
  const dispositions = history.filter((e) => e.type === 'DISPOSITION_CHANGED').map((e) => e.details);
  expect(dispositions).toEqual([
    { from: 'LOST_COMPETITOR', to: 'PENDING' },
    { from: 'PENDING', to: 'LOST_COMPETITOR' },
  ]);
  expect(history.at(-1)!.type).toBe('CREATED');
  expect(history.filter((e) => e.type === 'UPDATED')).toHaveLength(3);

  // Offer page: the same values in the internal panel and the history in words.
  await openOffer(page, offer);
  const log = page.getByRole('list', { name: 'Muutoshistoria' });
  await expect(log.getByText('Lopputulos muutettu')).toHaveCount(2);
  await expect(log).toContainText(`Lopputulos: Odottaa → ${DISPOSITION_FI.LOST_COMPETITOR}`);
  await expect(log).toContainText(`Lopputulos: ${DISPOSITION_FI.LOST_COMPETITOR} → Odottaa`);
  await expect(log).toContainText('Lähde: – → Instagram');
  await expect(log).toContainText('Tapahtumatyyppi: – → Yritystilaisuus');

  // Offer page fields edit in place too (NFR-8): price, event name, disposition.
  const internal = page.getByRole('main');
  expect(await editInline(page, internal.getByLabel('Hinta', { exact: true }), fiInput(400000))).toEqual({ priceCents: 400000 });
  const renamed = `${ev} B`;
  expect(await editInline(page, internal.getByLabel('Tapahtuma', { exact: true }), renamed, { commit: 'Enter' })).toEqual({
    eventName: renamed,
  });
  expect(await selectInline(page, internal.getByLabel('Lopputulos', { exact: true }), DISPOSITION_FI.NO_RESPONSE)).toEqual({
    disposition: 'NO_RESPONSE',
  });
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: renamed })).toBeVisible();
  await expect(internal.getByLabel('Hinta', { exact: true })).toHaveValue(fiInput(400000));
  await expect(internal.getByLabel('Lopputulos', { exact: true }).locator('option:checked')).toHaveText(DISPOSITION_FI.NO_RESPONSE);
  await expect(page.getByRole('article', { name: renamed })).toBeVisible(); // the preview follows
  await expect(log).toContainText(`Hinta: ${fiMoney(200000)} → ${fiMoney(400000)}`);
});

test('regenerate link, copy link, delete and restore; a deleted offer is read-only', async ({ page, context }, testInfo) => {
  const tag = tagOf(testInfo);
  const year = offerYear(testInfo);
  await signIn(page, PARTNER_A, { selectedYear: year });
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const client = await createClientViaApi(page, `Client ${tag}-${suffix()}-del`);
  const offer = await createOfferViaApi(page, {
    clientId: client.id,
    eventName: `Juhla ${tag}-${suffix()}-del`,
    eventDate: `${year}-08-08`,
    venue: 'Venue Q',
    priceCents: 100000,
  });
  const oldPath = offer.sharePath;
  expect(await publicStatus(page, oldPath)).toBe(200);

  // Copy public link: the absolute URL of sharePath.
  await openOffer(page, offer);
  const actions = page.getByRole('group', { name: 'Tarjouksen toiminnot' });
  await actions.getByRole('button', { name: 'Kopioi julkinen linkki' }).click();
  const copied = page.getByRole('status').filter({ hasText: /Julkinen linkki kopioitu leikepöydälle\.|Kopiointi ei onnistunut/ });
  await expect(copied).toBeVisible();
  const origin = new URL(page.url()).origin;
  if (await copied.getByText('Julkinen linkki kopioitu leikepöydälle.').isVisible()) {
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(`${origin}${oldPath}`);
  } else {
    await expect(copied.getByLabel('Julkinen linkki')).toHaveValue(`${origin}${oldPath}`);
  }

  // Regenerate (A1): confirm; old link 404, new link 200 (BR-104).
  await actions.getByRole('button', { name: 'Luo uusi linkki' }).click();
  const confirm = page.getByRole('dialog', { name: 'Luo uusi linkki' });
  await expect(confirm).toContainText('Nykyinen linkki lakkaa toimimasta heti.');
  // Cancel keeps the link.
  await confirm.getByRole('button', { name: 'Peruuta' }).click();
  expect(((await api(page).get(`/offers/${offer.id}`)) as OfferDetail).sharePath).toBe(oldPath);
  await actions.getByRole('button', { name: 'Luo uusi linkki' }).click();
  const regen = page.waitForResponse((r) => r.url().endsWith(`/api/offers/${offer.id}/regenerate-link`));
  await confirm.getByRole('button', { name: 'Luo uusi linkki' }).click();
  expect((await regen).status()).toBe(200);
  await expect(page.getByRole('status').filter({ hasText: 'Uusi linkki luotu. Vanha linkki ei enää toimi.' })).toBeVisible();
  const newPath = ((await api(page).get(`/offers/${offer.id}`)) as OfferDetail).sharePath;
  expect(newPath).not.toBe(oldPath);
  expect(await publicStatus(page, oldPath)).toBe(404);
  expect(await publicStatus(page, newPath)).toBe(200);
  const history = (await api(page).get(`/offers/${offer.id}/history`)) as { type: string }[];
  expect(history[0]!.type).toBe('LINK_REGENERATED');

  // Delete from the offer page (confirm) → list with a notice; gone from the active list.
  await actions.getByRole('button', { name: 'Poista tarjous' }).click();
  const del = page.getByRole('dialog', { name: 'Poista tarjous' });
  await expect(del).toContainText(`Poistetaanko tarjous ${offer.eventName}?`);
  await del.getByRole('button', { name: 'Poista tarjous' }).click();
  await expect(page).toHaveURL(/\/offers$/);
  await expect(page.getByRole('status').filter({ hasText: `Tarjous poistettu: ${offer.eventName}.` })).toBeVisible();
  await expect(offerRow(page, offer.eventName)).toHaveCount(0);
  expect(await publicStatus(page, newPath)).toBe(404);
  expect((await offerList(page, year)).offers.some((o) => o.id === offer.id)).toBe(false);

  // Deleted view lists it; its page is read-only with Restore only.
  await page.getByRole('main').getByRole('button', { name: 'Poistetut' }).click();
  const deletedTable = page.getByRole('table', { name: 'Poistetut' });
  await expect(deletedTable.getByRole('link', { name: offer.eventName })).toBeVisible();
  await deletedTable.getByRole('link', { name: offer.eventName }).click();
  await expect(page.getByRole('heading', { level: 1, name: offer.eventName })).toBeVisible();
  await expect(page.getByRole('note')).toContainText('Tarjous on poistettu.');
  await expect(page.getByRole('group', { name: 'Tarjouksen toiminnot' })).toHaveCount(0);
  for (const label of ['Tapahtuma', 'Paikka', 'Hinta', 'Lopputulos', 'Lähde', 'Asiakas']) {
    await expect(page.getByRole('main').getByLabel(label, { exact: true }), `${label} read-only`).toBeDisabled();
  }
  for (const name of ['Kopioi julkinen linkki', 'Luo uusi linkki', 'Muuta keikaksi', 'Poista tarjous']) {
    await expect(page.getByRole('main').getByRole('button', { name })).toHaveCount(0);
  }
  // API: a deleted offer can't be changed, regenerated or converted (409).
  for (const [method, path, data] of [
    ['patch', `/api/offers/${offer.id}`, { venue: 'Venue R' }],
    ['post', `/api/offers/${offer.id}/regenerate-link`, undefined],
    ['post', `/api/offers/${offer.id}/convert`, undefined],
    ['post', `/api/offers/${offer.id}/delete`, undefined],
  ] as const) {
    const res = await page.request[method](path, { data });
    expect(res.status(), `${method} ${path}`).toBe(409);
    expect((await res.json()).error.code).toBe('INVALID_STATUS_TRANSITION');
  }

  // Restore from the offer page → editable again, back in the list.
  await page.getByRole('button', { name: 'Palauta tarjous' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Tarjous palautettu.' })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Tarjouksen toiminnot' })).toBeVisible();
  await expect(page.getByRole('main').getByLabel('Tapahtuma', { exact: true })).toBeEnabled();
  expect((await offerList(page, year)).offers.some((o) => o.id === offer.id)).toBe(true);
  const again = await page.request.post(`/api/offers/${offer.id}/restore`);
  expect(again.status(), 'restore of a non-deleted offer').toBe(409);

  // Delete from the list row, restore from the Deleted view.
  await openOfferList(page, `?q=${encodeURIComponent(offer.eventName)}`);
  await offerRow(page, offer.eventName).getByRole('button', { name: `Poista tarjous: ${offer.eventName}` }).click();
  await page.getByRole('dialog', { name: 'Poista tarjous' }).getByRole('button', { name: 'Poista tarjous' }).click();
  await expect(page.getByRole('status').filter({ hasText: `Tarjous poistettu: ${offer.eventName}.` })).toBeVisible();
  await expect(offerRow(page, offer.eventName)).toHaveCount(0);
  await page.getByRole('main').getByRole('button', { name: 'Poistetut' }).click();
  await page.getByRole('button', { name: `Palauta: ${offer.eventName}` }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Tarjous palautettu:' })).toBeVisible();
  await page.getByRole('main').getByRole('button', { name: 'Tarjoukset', exact: true }).click();
  await expect(offerRow(page, offer.eventName)).toHaveCount(1);
  const history2 = (await api(page).get(`/offers/${offer.id}/history`)) as { type: string }[];
  expect(history2.filter((e) => e.type === 'DELETED')).toHaveLength(2);
  expect(history2.filter((e) => e.type === 'RESTORED')).toHaveLength(2);
});

test('convert to gig: confirm dialog → gig per BR-105, offer WON / ACCEPTED, links both ways, one request on a double click', async ({ page }, testInfo) => {
  const tag = tagOf(testInfo);
  const year = offerYear(testInfo);
  await signIn(page, PARTNER_A, { selectedYear: year });
  const partnerB = await partnerId(page, 'Partner B');
  const client = await createClientViaApi(page, `Client ${tag}-${suffix()}-conv`);
  const offer = await createOfferViaApi(page, {
    clientId: client.id,
    eventName: `Juhla ${tag}-${suffix()}-conv`,
    eventDate: `${year}-09-19`,
    venue: 'Venue Q',
    city: 'City Q',
    priceCents: 500000,
    sellerId: partnerB,
  });
  const ev = offer.eventName;
  const yearBefore = await api(page).get(`/years/${year}`);

  await openOfferList(page, `?q=${encodeURIComponent(ev)}`);
  const row = offerRow(page, ev);
  await row.getByRole('button', { name: `Muuta keikaksi: ${ev}` }).click();
  const dialog = page.getByRole('dialog', { name: 'Muuta keikaksi' });
  // A1: what will be created.
  const fact = (label: string) => dialog.locator('dl > div').filter({ has: page.locator('dt', { hasText: new RegExp(`^${label}$`) }) }).locator('dd');
  await expect(fact('Päivä')).toHaveText(fiDateWithWeekday(`${year}-09-19`));
  await expect(fact('Paikka')).toHaveText('Venue Q, City Q');
  await expect(fact('Asiakas')).toHaveText(client.name);
  await expect(fact('Kokoonpano')).toHaveText(ev);
  await expect(fact('Hinta')).toHaveText(fiMoney(500000));
  await expect(fact('Myyjä ja tuottaja')).toHaveText('Partner B');

  // AC-3: a human double click on "Luo keikka" (two clicks 50 ms apart) sends one request: the
  // button is disabled while the request runs. A zero-delay synthetic double click: F-007 test below.
  const converts: number[] = [];
  page.on('response', (r) => {
    if (r.request().method() === 'POST' && r.url().endsWith(`/api/offers/${offer.id}/convert`)) converts.push(r.status());
  });
  const done = page.waitForResponse((r) => r.url().endsWith(`/api/offers/${offer.id}/convert`));
  const confirmButton = dialog.getByRole('button', { name: 'Luo keikka' });
  await confirmButton.click();
  await page.waitForTimeout(50);
  await confirmButton.click({ timeout: 1000 }).catch(() => undefined); // disabled, or the dialog closed
  const res = await done;
  expect(res.status()).toBe(201);
  const { gig, offer: converted } = (await res.json()) as { gig: Record<string, unknown>; offer: OfferDetail };
  await expect(dialog).toBeHidden();
  await page.waitForTimeout(500);
  expect(converts, 'one convert request').toEqual([201]);
  await expect(page.getByRole('status').filter({ hasText: `Keikka luotu tarjouksesta ${ev}.` })).toBeVisible();

  // BR-105 fields; AC-2 offer WON / ACCEPTED.
  expect(gig).toMatchObject({
    startDate: `${year}-09-19`,
    endDate: null,
    venue: 'Venue Q, City Q',
    lineupName: ev,
    lineupTemplateId: null,
    clientId: client.id,
    clientName: client.name,
    priceCents: 500000,
    sellerId: partnerB,
    producerId: partnerB,
    offerId: offer.id,
    status: 'SOLD',
    year,
  });
  expect(converted).toMatchObject({ gigId: gig.id, disposition: 'WON', status: 'ACCEPTED' });
  const history = (await api(page).get(`/offers/${offer.id}/history`)) as { type: string; details: Record<string, unknown> }[];
  expect(history.find((e) => e.type === 'CONVERTED')?.details).toEqual({ gigId: gig.id });
  expect(history.find((e) => e.type === 'DISPOSITION_CHANGED')?.details).toEqual({ from: 'PENDING', to: 'WON' });
  const gigHistory = (await api(page).get(`/gigs/${gig.id}/history`)) as { type: string }[];
  expect(gigHistory.map((e) => e.type)).toContain('CREATED');
  // The gig counts in the year like any gig (AC-1).
  const yearAfter = await api(page).get(`/years/${year}`);
  expect(yearAfter.gigs.gigCount).toBe(yearBefore.gigs.gigCount + 1);
  expect(yearAfter.gigs.soldGigsSumCents).toBe(yearBefore.gigs.soldGigsSumCents + 500000);
  const gigsOfOffer = (await api(page).get(`/gigs?year=${year}&status=ALL`)).gigs.filter(
    (g: { offerId: string | null }) => g.offerId === offer.id,
  );
  expect(gigsOfOffer).toHaveLength(1);

  // The row: "Keikka →" instead of the button; disposition Voitettu, status Hyväksytty.
  const gigLink = row.getByRole('link', { name: `Keikka: ${ev}` });
  await expect(gigLink).toHaveText('Keikka →');
  await expect(row.getByRole('button', { name: `Muuta keikaksi: ${ev}` })).toHaveCount(0);
  await expect(row).toContainText(STATUS_FI.ACCEPTED);
  await expect(row.getByLabel(`Lopputulos: ${ev}`).locator('option:checked')).toHaveText(DISPOSITION_FI.WON);
  await page.reload();
  await expect(offerRow(page, ev).getByRole('link', { name: `Keikka: ${ev}` })).toBeVisible();

  // Gig page: "Tarjouksesta: <event>" links back.
  await offerRow(page, ev).getByRole('link', { name: `Keikka: ${ev}` }).click();
  await expect(page).toHaveURL(new RegExp(`/gigs/${gig.id}$`));
  await expect(page.getByRole('heading', { level: 1, name: `${ev} · Venue Q, City Q` })).toBeVisible();
  const fromOffer = page.getByRole('main').locator('p', { hasText: 'Tarjouksesta:' });
  await expect(fromOffer.getByRole('link', { name: ev })).toHaveAttribute('href', `/offers/${offer.id}`);
  await expect(page.getByRole('main').getByLabel('Asiakas', { exact: true }).locator('option:checked')).toHaveText(client.name);
  await fromOffer.getByRole('link', { name: ev }).click();
  await expect(page.getByRole('heading', { level: 1, name: ev })).toBeVisible();
  // Offer page: the action is the gig link now.
  await expect(page.getByRole('group', { name: 'Tarjouksen toiminnot' }).getByRole('link', { name: `Keikka: ${ev}` })).toBeVisible();

  // E1: a second convert (API) → 409 ALREADY_CONVERTED; still one gig.
  const second = await page.request.post(`/api/offers/${offer.id}/convert`);
  expect(second.status()).toBe(409);
  expect((await second.json()).error.code).toBe('ALREADY_CONVERTED');
  const stillOne = (await api(page).get(`/gigs?year=${year}&status=ALL`)).gigs.filter(
    (g: { offerId: string | null }) => g.offerId === offer.id,
  );
  expect(stillOne).toHaveLength(1);

  // The client page lists the gig and the offer.
  await page.goto(`/clients/${client.id}`);
  await expect(page.getByRole('table', { name: 'Asiakkaan keikat' })).toContainText('Venue Q, City Q');
  await expect(page.getByRole('table', { name: 'Asiakkaan tarjoukset' })).toContainText(STATUS_FI.ACCEPTED);
  await expectNoHorizontalScroll(page, 'client page after convert');
});

test('convert: an offer without a price gives a 0 € gig; a stale page shows the gig link (409); two parallel requests make one gig', async ({ page }, testInfo) => {
  const tag = tagOf(testInfo);
  const year = offerYear(testInfo);
  await signIn(page, PARTNER_A, { selectedYear: year });
  const client = await createClientViaApi(page, `Client ${tag}-${suffix()}-race`);
  const mk = (key: string, priceCents: number | null) =>
    createOfferViaApi(page, { clientId: client.id, eventName: `Juhla ${tag}-${suffix()}-${key}`, eventDate: `${year}-10-0${key.length}`, venue: 'Venue Q', priceCents });

  // No price → price 0, venue without a city (BR-105).
  const free = await mk('a', null);
  const { gig } = await api(page).post(`/offers/${free.id}/convert`);
  expect(gig).toMatchObject({ priceCents: 0, venue: 'Venue Q', lineupName: free.eventName });

  // Stale page: converted meanwhile → "already converted" notice and the gig link (E1).
  const stale = await mk('bb', 100000);
  await openOffer(page, stale);
  const other = await api(page).post(`/offers/${stale.id}/convert`);
  await page.getByRole('group', { name: 'Tarjouksen toiminnot' }).getByRole('button', { name: `Muuta keikaksi: ${stale.eventName}` }).click();
  const conflict = page.waitForResponse((r) => r.url().endsWith(`/api/offers/${stale.id}/convert`));
  await page.getByRole('dialog', { name: 'Muuta keikaksi' }).getByRole('button', { name: 'Luo keikka' }).click();
  expect((await conflict).status()).toBe(409);
  await expect(page.getByRole('status').filter({ hasText: 'Tarjouksesta on jo tehty keikka.' })).toBeVisible();
  await expect(page.getByRole('link', { name: `Keikka: ${stale.eventName}` })).toHaveAttribute('href', `/gigs/${other.gig.id}`);

  // AC-3 on the server: two requests at the same time → one 201, one 409, one gig.
  const race = await mk('ccc', 100000);
  const [r1, r2] = await Promise.all([
    page.request.post(`/api/offers/${race.id}/convert`),
    page.request.post(`/api/offers/${race.id}/convert`),
  ]);
  expect([r1.status(), r2.status()].sort()).toEqual([201, 409]);
  const gigs = (await api(page).get(`/gigs?year=${year}&status=ALL`)).gigs.filter(
    (g: { offerId: string | null }) => g.offerId === race.id,
  );
  expect(gigs).toHaveLength(1);
  expect(((await api(page).get(`/offers/${race.id}`)) as OfferDetail).gigId).toBe(gigs[0].id);
});

test('convert: a zero-delay double click on "Luo keikka" still makes one gig and shows success (AC-3)', async ({ page }, testInfo) => {
  const tag = tagOf(testInfo);
  const year = offerYear(testInfo);
  await signIn(page, PARTNER_A, { selectedYear: year });
  const client = await createClientViaApi(page, `Client ${tag}-${suffix()}-dbl`);
  const offer = await createOfferViaApi(page, {
    clientId: client.id,
    eventName: `Juhla ${tag}-${suffix()}-dbl`,
    eventDate: `${year}-11-21`,
    venue: 'Venue Q',
    priceCents: 100000,
  });
  await openOffer(page, offer);
  const actions = page.getByRole('group', { name: 'Tarjouksen toiminnot' });
  await actions.getByRole('button', { name: `Muuta keikaksi: ${offer.eventName}` }).click();
  const dialog = page.getByRole('dialog', { name: 'Muuta keikaksi' });
  await dialog.getByRole('button', { name: 'Luo keikka' }).dblclick();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('status').filter({ hasText: 'Keikka luotu.' })).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
  const gigs = (await api(page).get(`/gigs?year=${year}&status=ALL`)).gigs.filter(
    (g: { offerId: string | null }) => g.offerId === offer.id,
  );
  expect(gigs, 'one gig').toHaveLength(1);
  await expect(actions.getByRole('link', { name: `Keikka: ${offer.eventName}` })).toHaveAttribute('href', `/gigs/${gigs[0].id}`);
});

test('convert: a zero-delay double click sends only one request (F-007)', async ({ page }, testInfo) => {
  // F-007 (fixed in TASK-141): useMutation's isPending is published asynchronously, so a second
  // click in the same frame (Playwright dblclick) used to send a second POST /convert (409).
  // ConfirmDialog now guards with a ref set synchronously in the click handler.
  const tag = tagOf(testInfo);
  const year = offerYear(testInfo);
  await signIn(page, PARTNER_A, { selectedYear: year });
  const client = await createClientViaApi(page, `Client ${tag}-${suffix()}-dbl2`);
  const offer = await createOfferViaApi(page, {
    clientId: client.id,
    eventName: `Juhla ${tag}-${suffix()}-dbl2`,
    eventDate: `${year}-11-22`,
    venue: 'Venue Q',
  });
  const converts: number[] = [];
  page.on('response', (r) => {
    if (r.request().method() === 'POST' && r.url().endsWith(`/api/offers/${offer.id}/convert`)) converts.push(r.status());
  });
  await openOffer(page, offer);
  await page
    .getByRole('group', { name: 'Tarjouksen toiminnot' })
    .getByRole('button', { name: `Muuta keikaksi: ${offer.eventName}` })
    .click();
  const dialog = page.getByRole('dialog', { name: 'Muuta keikaksi' });
  await dialog.getByRole('button', { name: 'Luo keikka' }).dblclick();
  await expect(dialog).toBeHidden();
  await page.waitForTimeout(1000);
  expect(converts, 'one convert request').toEqual([201]);
});
