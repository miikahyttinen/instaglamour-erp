import type { Page, TestInfo } from '@playwright/test';
import { api, expect, expectNoHorizontalScroll, pageHead, signIn, tagOf, test } from './helpers';
import { createEventViaApi, eventListRows, suffix } from './events';
import {
  applyColumnFilter,
  cancelColumnFilter,
  clearFiltersButton,
  filterButton,
  filterColumn,
  filterValue,
  hasHeaderFilters,
  openColumnFilter,
  tickColumnValues,
  urlFilter,
} from './excel';

// Event list as an Excel-style table (UC-003 change 2026-10-14, TASK-144; docs/design.md →
// "Excel-style tables"): the list opens without cancelled events (default Tila filter, not in the
// URL), the Tila filter shows them, column filters combine with the search (AND), the state is in
// the URL (?q=&f.<key>=) and survives a reload, "Tyhjennä suodattimet" resets the filters.
// Each project writes to its own empty year (M 2041, D 2042), so the rows are only this test's.
// Filters use always-shown columns (Tila, Paikka; TASK-147 hides low-priority columns).

function listYear(testInfo: TestInfo): number {
  return tagOf(testInfo) === 'M' ? 2041 : 2042;
}

interface Setup {
  year: number;
  north: string; // "Hall … North": a (sold) and c (cancelled)
  south: string; // "Hall … South": b (sold)
  club: string; // "Club … North": d (sold)
}

/** Four events in the project's year: three sold, one cancelled. */
async function setup(page: Page, testInfo: TestInfo): Promise<Setup> {
  const year = listYear(testInfo);
  await signIn(page, undefined, { selectedYear: year });
  const s = `${tagOf(testInfo)}${suffix()}`;
  const north = `Hall ${s} North`;
  const south = `Hall ${s} South`;
  const club = `Club ${s} North`;
  await createEventViaApi(page, { startDate: `${year}-03-01`, venue: north });
  await createEventViaApi(page, { startDate: `${year}-04-01`, venue: south });
  const cancelled = await createEventViaApi(page, { startDate: `${year}-05-01`, venue: north });
  await api(page).post(`/events/${cancelled.id}/cancel`, { reason: 'Synthetic cancel' });
  await createEventViaApi(page, { startDate: `${year}-06-01`, venue: club });
  return { year, north, south, club };
}

/** Venues of the visible rows, in order (the default sort is by date). */
async function rowVenues(page: Page, venues: string[]): Promise<string[]> {
  const texts = await eventListRows(page).allTextContents();
  return texts.map((t) => venues.find((v) => t.includes(v)) ?? `? ${t}`);
}

async function openList(page: Page, year: number, query = ''): Promise<void> {
  await page.goto(`/gigs${query}`);
  await expect(page.getByRole('heading', { level: 1, name: `Keikat ${year}` })).toBeVisible();
  await expect(page.getByText('Ladataan…')).toHaveCount(0);
}

test('event list: cancelled hidden by default, Tila filter shows them, Paikka filter AND search, URL state survives reload, "Tyhjennä suodattimet" resets', async ({ page }, testInfo) => {
  const { year, north, south, club } = await setup(page, testInfo);
  const venues = [north, south, club];
  const rows = eventListRows(page);
  const venuesOf = () => rowVenues(page, venues);

  // Default view: sold events only; the default Tila filter is not written to the URL.
  await openList(page, year);
  await expect(page.getByRole('table', { name: 'Keikkalista', exact: true })).toBeVisible();
  await expect.poll(venuesOf).toEqual([north, south, club]);
  await expect(rows.filter({ hasText: 'Peruttu' })).toHaveCount(0);
  expect(urlFilter(page, 'status')).toEqual([]);
  await expect(page.getByLabel('Näytä myös perutut')).toHaveCount(0);
  for (const old of ['Tulevat', 'Menneet']) await expect(page.getByRole('button', { name: old, exact: true })).toHaveCount(0);

  if (hasHeaderFilters(page)) {
    // Accessible names: "Suodata: <column>" buttons that open a dialog; the default status
    // filter shows as active on the Tila button.
    for (const column of ['Kokoonpano', 'Paikka', 'Tila']) {
      const button = filterButton(page, column);
      await expect(button).toBeVisible();
      await expect(button).toHaveAttribute('aria-haspopup', 'dialog');
      await expect(button).toHaveAttribute('aria-expanded', 'false');
    }
    await expect(filterButton(page, 'Tila')).toHaveAccessibleDescription('Suodatin käytössä');
    await expect(filterButton(page, 'Paikka')).not.toHaveAccessibleDescription('Suodatin käytössä');
  } else {
    // Phones: compact rows, no header buttons; one "Suodattimet" button opens the sheet.
    await expect(page.getByRole('button', { name: /^Suodata: / })).toHaveCount(0);
    await expect(page.getByRole('main').getByRole('button', { name: 'Suodattimet', exact: true })).toBeVisible();
  }

  // The Tila form: default ticks (Tuleva + Soitettu, not Peruttu),
  // "Valitse kaikki" / "Tyhjennä" / OK / "Peruuta"; nothing checked → OK disabled; Cancel changes nothing.
  let form = await openColumnFilter(page, 'Tila');
  if (hasHeaderFilters(page)) await expect(form).toHaveAccessibleName('Suodata: Tila');
  for (const name of ['Valitse kaikki', 'Tyhjennä', 'OK', 'Peruuta']) {
    await expect(form.getByRole('button', { name, exact: true })).toBeVisible();
  }
  await expect(filterValue(form, 'Tuleva')).toBeChecked();
  await expect(filterValue(form, 'Peruttu')).not.toBeChecked();
  await form.getByRole('button', { name: 'Tyhjennä', exact: true }).click();
  await expect(filterValue(form, 'Tuleva')).not.toBeChecked();
  await expect(form.getByRole('button', { name: 'OK', exact: true })).toBeDisabled();
  await form.getByRole('button', { name: 'Valitse kaikki', exact: true }).click();
  await expect(filterValue(form, 'Tuleva')).toBeChecked();
  await expect(filterValue(form, 'Peruttu')).toBeChecked();
  await cancelColumnFilter(page, form);
  if (hasHeaderFilters(page)) await expect(filterButton(page, 'Tila')).toBeFocused();
  await expect.poll(venuesOf).toEqual([north, south, club]);

  // Tila: tick "Peruttu" → the cancelled event appears.
  await tickColumnValues(page, 'Tila', ['Peruttu']);
  await expect.poll(venuesOf).toEqual([north, south, north, club]);
  await expect(rows.filter({ hasText: 'Peruttu' })).toHaveCount(1);

  // Search (API q) AND the Paikka filter (client-side).
  await page.getByLabel('Haku').fill('North');
  await expect(page).toHaveURL(/[?&]q=North/);
  await expect.poll(venuesOf).toEqual([north, north, club]);
  await filterColumn(page, 'Paikka', [north]);
  expect(urlFilter(page, 'venue')).toEqual([north]);
  await expect.poll(venuesOf).toEqual([north, north]);
  await expect(page.getByRole('status').filter({ hasText: 'Näytetään 2 / 3' })).toBeVisible();
  // A search that matches only another venue: nothing passes both.
  await page.getByLabel('Haku').fill('South');
  await expect(page).toHaveURL(/[?&]q=South/);
  await expect(page.getByText('Ei suodattimia vastaavia keikkoja.')).toBeVisible();
  await expect(rows).toHaveCount(0);
  await page.getByLabel('Haku').fill('North');
  await expect.poll(venuesOf).toEqual([north, north]);

  // Tila = only "Peruttu", then reload: search, both filters and the rows come back from the URL.
  await filterColumn(page, 'Tila', ['Peruttu']);
  expect(urlFilter(page, 'status')).toEqual(['CANCELLED']);
  await expect.poll(venuesOf).toEqual([north]);
  await expect(rows.first()).toContainText('Peruttu');
  const url = page.url();
  await page.reload();
  await expect(page.getByLabel('Haku')).toHaveValue('North');
  expect(page.url()).toBe(url);
  await expect.poll(venuesOf).toEqual([north]);
  await expect(rows.first()).toContainText('Peruttu');
  if (hasHeaderFilters(page)) {
    await expect(filterButton(page, 'Tila')).toHaveAccessibleDescription('Suodatin käytössä');
    await expect(filterButton(page, 'Paikka')).toHaveAccessibleDescription('Suodatin käytössä');
  }

  // "Tyhjennä suodattimet": every column filter is removed (all statuses), the search stays.
  await clearFiltersButton(page).click();
  await expect.poll(() => urlFilter(page, 'status')).toEqual([]);
  expect(urlFilter(page, 'venue')).toEqual([]);
  await expect(page).toHaveURL(/[?&]q=North/);
  await expect.poll(venuesOf).toEqual([north, north, club]);
  await expect(clearFiltersButton(page)).toHaveCount(0);
  if (hasHeaderFilters(page)) await expect(filterButton(page, 'Paikka')).not.toHaveAccessibleDescription('Suodatin käytössä');
});

// F-008 (fixed): ticking "Peruttu" checks every status; the explicit choice is kept in the URL
// (`f.allStatuses=1`), so a reload shows the cancelled event again instead of the default filter.
test('event list: a Tila filter that shows every status (cancelled included) survives a reload (F-008)', async ({ page }, testInfo) => {
  const { year, north, south, club } = await setup(page, testInfo);
  const venuesOf = () => rowVenues(page, [north, south, club]);
  await openList(page, year, `?q=${encodeURIComponent(north.split(' ')[1]!)}`);
  await expect.poll(venuesOf).toEqual([north, south, club]);
  // The user ticks "Peruttu" (all values checked) and sees the cancelled event ...
  const form = await openColumnFilter(page, 'Tila');
  await filterValue(form, 'Peruttu').check();
  await applyColumnFilter(page, form);
  await expect.poll(venuesOf).toEqual([north, south, north, club]);
  // ... and after a reload (or a shared link) expects the same rows.
  await page.reload();
  await expect.poll(venuesOf).toEqual([north, south, north, club]);
});

// UI back to "Gigs" (API and code still say `event`): old /events… links (bookmarks, e-mails)
// open the same page under /gigs…, with the query string kept.
test('old /events URLs redirect to /gigs and keep the query string', async ({ page }, testInfo) => {
  const { year, north, south, club } = await setup(page, testInfo);
  const venuesOf = () => rowVenues(page, [north, south, club]);
  const q = north.split(' ')[1]!;
  await page.goto(`/events?q=${encodeURIComponent(q)}&f.venue=${encodeURIComponent(north)}`);
  await expect(page).toHaveURL(/\/gigs\?q=/);
  expect(new URL(page.url()).searchParams.get('q')).toBe(q);
  expect(urlFilter(page, 'venue')).toEqual([north]);
  await expect(page.getByRole('heading', { level: 1, name: `Keikat ${year}` })).toBeVisible();
  await expect.poll(venuesOf).toEqual([north]);

  const event = await createEventViaApi(page, { startDate: `${year}-07-01`, venue: club });
  await page.goto(`/events/${event.id}`);
  await expect(page).toHaveURL(new RegExp(`/gigs/${event.id}$`));
  await page.goto('/events/new');
  await expect(page).toHaveURL(/\/gigs\/new$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Uusi keikka' })).toBeVisible();
});

// Kate-%: the actual percentage ("tot. x %") is on its own line under the budget one in the
// table (wide and narrow); on phone rows (TASK-175) it follows the budget one on the same line,
// without the "Kate-%" label (owner request 2026-10-31). Each percentage stays on one line.
test('Kate-%: the actual percentage is on a second line in the table, beside it on phone rows', async ({ page }, testInfo) => {
  const { year } = await setup(page, testInfo);
  const widths = tagOf(testInfo) === 'M' ? [375] : [900, 1440];
  for (const w of widths) {
    await page.setViewportSize({ width: w, height: 800 });
    await openList(page, year);
    const cell = eventListRows(page).first().locator('td.event-col-margin');
    await expect(cell).toBeVisible();
    const parts = await cell.evaluate((td) => {
      const lineHeight = parseFloat(getComputedStyle(td).fontSize) * 1.8;
      return ['.event-margin-budget', '.event-margin-actual'].map((sel) => {
        const el = td.querySelector<HTMLElement>(sel)!;
        const r = el.getBoundingClientRect();
        return { top: r.top, bottom: r.bottom, oneLine: r.height < lineHeight, text: el.textContent ?? '' };
      });
    });
    const [budget, actual] = parts as [(typeof parts)[0], (typeof parts)[0]];
    expect(actual.text.trim(), `${w} px: actual text`).toMatch(/^tot\. /);
    if (w < 600) expect(actual.top, `${w} px: actual beside the budget`).toBeLessThan(budget.bottom);
    else expect(actual.top, `${w} px: actual under the budget`).toBeGreaterThanOrEqual(budget.bottom - 1);
    for (const part of parts) expect(part.oneLine, `${w} px: "${part.text}" on one line`).toBe(true);
    if (w < 600) {
      const label = await cell.evaluate((td) => getComputedStyle(td, '::before').content);
      expect(label, `${w} px: no "Kate-%" label`).toBe('none');
      await expect(cell).not.toContainText('KATE');
    }
  }
});

// Gig statuses (owner decision 2026-10-31): Tuleva = blue (info), Soitettu = green (ok), Peruttu =
// red (danger). Invoice rows (TASK-173, Invoicing v3): the "Laskutus" card under the price card
// lists invoice rows (inline description / amount / status, who / when, remove with confirm; row
// status "Lähettämättä" yellow, "Lähetetty" green), an add form, and Lähetetty / Lähettämättä /
// Laskuttamatta (= total − sent; warning when negative). No payments. Invoicing state (api-contract
// "Invoicing v3"): ONE tag, first match wins — Avoimia laskuja (yellow, any row not sent) ·
// Laskutettu (solid dark green, sent ≥ total) · "–" (no rows — also a played gig before its first
// invoice, owner decision 2026-11-07 —, upcoming, total 0) · Osittain laskutettu (blue, played or
// cancelled with ≥ 1 row, sent < total); on the gig card and in the list "Laskutus" cell (one
// line), with one filter (f.invoiceState).
test('gig statuses and "Laskutus": invoice rows, one invoicing state tag on the gig page and in the list, one filter', async ({ page }, testInfo) => {
  const { year, north } = await setup(page, testInfo);
  const venue = `Hall ${tagOf(testInfo)}${suffix()} Ready`;
  const gig = await createEventViaApi(page, { startDate: `${year}-08-01`, venue });
  const total = (await api(page).get(`/events/${gig.id}`)).totalPriceCents as number;
  expect(total).toBeGreaterThan(0);
  const apiGig = async () => (await api(page).get(`/events/${gig.id}`)) as Record<string, unknown>;

  await page.goto(`/gigs/${gig.id}`);
  await expect(pageHead(page).getByText('Tuleva', { exact: true })).toHaveClass(/tag-info/);
  const card = page.locator('details.event-section-invoicing');
  await expect(card.getByRole('heading', { name: 'Laskutus', level: 2 })).toBeVisible();
  await expect(card.getByText('Ei laskurivejä.')).toBeVisible();
  const stateGroup = card.getByRole('group', { name: 'Laskutuksen tila' });
  const stateTag = stateGroup.locator('.tag');
  const figure = (label: string) => card.locator('dt', { hasText: new RegExp(`^${label}$`) }).locator('xpath=following-sibling::dd');
  // Upcoming gig, no rows → "–" (Osittain laskutettu is for played gigs only).
  await expect(stateTag).toHaveCount(0);
  await expect(stateGroup).toHaveText('–');
  expect((await apiGig()).invoiceState).toBe('NONE');
  // No payment figures any more.
  await expect(card.locator('dt', { hasText: 'Maksettu' })).toHaveCount(0);

  // Add a row: status defaults to "Lähettämättä" (yellow), who / when shown → "Avoimia laskuja" (yellow).
  await card.getByRole('button', { name: '+ Lisää laskurivi' }).click();
  const form = card.getByRole('form', { name: 'Lisää laskurivi' });
  await expect(form.getByRole('combobox', { name: 'Tila' })).toHaveValue('NOT_SENT');
  await form.getByRole('textbox', { name: 'Kuvaus' }).fill('Invoice 1');
  await form.getByRole('textbox', { name: 'Summa' }).fill(String(total / 100 + 10));
  await form.getByRole('button', { name: 'Lisää laskurivi' }).click();
  const row = card.locator('tr.invoice-row', { hasText: 'Invoice 1' });
  const status = row.getByRole('combobox', { name: 'Tila: Invoice 1' });
  await expect(status).toHaveValue('NOT_SENT');
  await expect(status.locator('option')).toHaveText(['Lähettämättä', 'Lähetetty']);
  await expect(row.locator('.invoice-row-status')).toHaveClass(/tone-yellow(\s|$)/);
  await expect(row.locator('.invoice-row-changed')).toContainText(/Partner A \d+\.\d+\.\d{4} klo /);
  // Added by hand: no "automaattinen" hint.
  await expect(row.locator('.invoice-row-auto')).toHaveCount(0);
  await expect(stateTag).toHaveText('Avoimia laskuja');
  await expect(stateTag).toHaveClass(/tag-yellow/);
  await expect(figure('Lähettämättä')).not.toHaveText(/^0,00/);
  await expect(figure('Lähetetty')).toHaveText(/^0,00/);
  await expect.poll(async () => (await apiGig()).invoiceState).toBe('OPEN_INVOICES');
  expect((await apiGig()).notSentCents).toBe(total + 1000);
  expect(((await apiGig()).invoiceRows as { auto: boolean }[])[0]!.auto).toBe(false);

  // List: one tag on one line; f.invoiceState=NONE hides the gig; the "Laskutus" filter (user flow)
  // shows it again. No separate "Maksut" filter.
  if (tagOf(testInfo) === 'D') await page.setViewportSize({ width: 1440, height: 800 });
  await openList(page, year, '?f.invoiceState=OPEN_INVOICES');
  await expect(eventListRows(page)).toHaveCount(1);
  const listRow = eventListRows(page).first();
  await expect(listRow).toContainText(venue);
  const listTag = listRow.locator('td.event-col-invoice .tag');
  await expect(listTag).toHaveCount(1);
  await expect(listTag).toHaveText('Avoimia laskuja');
  await expect(listTag).toHaveClass(/tag-yellow/);
  const oneLine = await listTag.evaluate((el) => el.getClientRects().length === 1 && el.getBoundingClientRect().height < 40);
  expect(oneLine, 'invoicing tag on one line').toBe(true);
  await expect(listRow.getByText('Tuleva', { exact: true })).toHaveClass(/tag-info/);
  await openList(page, year, '?f.invoiceState=NONE');
  await expect.poll(() => rowVenues(page, [north, venue])).not.toContain(venue);
  if (tagOf(testInfo) === 'D') {
    await expect(page.getByRole('button', { name: 'Suodata: Maksut' })).toHaveCount(0);
  }
  await filterColumn(page, 'Laskutus', ['Avoimia laskuja']);
  expect(urlFilter(page, 'invoiceState')).toEqual(['OPEN_INVOICES']);
  await expect.poll(() => rowVenues(page, [north, venue])).toEqual([venue]);
  await page.setViewportSize(tagOf(testInfo) === 'M' ? { width: 375, height: 812 } : { width: 1280, height: 800 });

  // Sent above the total → dark green "Laskutettu", negative "Laskuttamatta" with a warning; then remove the row.
  await page.goto(`/gigs/${gig.id}`);
  await status.selectOption({ label: 'Lähetetty' });
  await expect(row.locator('.invoice-row-status')).toHaveClass(/tone-ok(\s|$)/);
  await expect(stateTag).toHaveText('Laskutettu');
  await expect(stateTag).toHaveClass(/tag-ok-strong/);
  await expect(figure('Lähettämättä')).toHaveText(/^0,00/);
  await expect(figure('Lähetetty')).not.toHaveText(/^0,00/);
  await expect(card.getByRole('note')).toHaveText('Laskutettu enemmän kuin kokonaishinta.');
  await expect(card.getByRole('group', { name: 'Laskuttamatta' })).toHaveClass(/event-balance-negative/);
  await expect.poll(async () => (await apiGig()).balanceCents).toBe(-1000);
  expect((await apiGig()).sentCents).toBe(total + 1000);
  await row.getByRole('button', { name: 'Poista: Invoice 1' }).click();
  await page.getByRole('dialog', { name: 'Poista laskurivi' }).getByRole('button', { name: 'Poista' }).click();
  await expect(card.getByText('Ei laskurivejä.')).toBeVisible();
  await expect(card.getByRole('note')).toHaveCount(0);
  await expect.poll(async () => (await apiGig()).balanceCents).toBe(total);
  await expect(stateTag).toHaveCount(0);
  await expect(stateGroup).toHaveText('–');

  // The old row statuses are rejected.
  for (const old of ['READY', 'PAID']) {
    const res = await api(page).raw.post(`/api/events/${gig.id}/invoice-rows`, { data: { description: 'Old', amountCents: 100, status: old } });
    expect(res.status(), `status ${old}`).toBe(400);
  }

  // Cancelled = red "Peruttu".
  await openList(page, year, '?f.status=CANCELLED');
  await expect(eventListRows(page).first().getByText('Peruttu', { exact: true })).toHaveClass(/tag-danger/);

  // Upcoming gig, part sent, nothing open → still "–".
  const half = Math.floor(total / 2);
  await api(page).post(`/events/${gig.id}/invoice-rows`, { description: 'Invoice 2', amountCents: half, status: 'SENT' });
  await page.goto(`/gigs/${gig.id}`);
  await expect(stateTag).toHaveCount(0);
  await expect(stateGroup).toHaveText('–');
  expect((await apiGig()).invoiceState).toBe('NONE');

  // Played gig: no rows → "–" (no label before the first invoice); part sent → blue "Osittain
  // laskutettu"; a cancelled past gig → "–". The
  // played gig is from yesterday (organisation time zone), so the automatic final invoice (48 h
  // after the gig) cannot appear during the test — and the job is off in the e2e backend anyway
  // (INVOICE_JOB_ENABLED=false, scripts/env.mjs).
  const yesterday = new Date(Date.now() - 24 * 3600 * 1000).toLocaleDateString('sv-SE', { timeZone: 'Europe/Helsinki' });
  const played = await createEventViaApi(page, { startDate: yesterday, venue: `${venue} Played` });
  const playedGig = async () => (await api(page).get(`/events/${played.id}`)) as Record<string, unknown>;
  expect((await playedGig()).invoiceState).toBe('NONE');
  await page.goto(`/gigs/${played.id}`);
  await expect(pageHead(page).getByText('Soitettu', { exact: true })).toHaveClass(/tag-ok/);
  await expect(stateTag).toHaveCount(0);
  await expect(stateGroup).toHaveText('–');
  await api(page).post(`/events/${played.id}/invoice-rows`, { description: 'Part', amountCents: 1000, status: 'SENT' });
  await page.goto(`/gigs/${played.id}`);
  await expect(pageHead(page).getByText('Soitettu', { exact: true })).toHaveClass(/tag-ok/);
  await expect(stateTag).toHaveCount(1);
  await expect(stateTag).toHaveText('Osittain laskutettu');
  await expect(stateTag).toHaveClass(/tag-info/);
  expect((await playedGig()).invoiceState).toBe('PARTLY_INVOICED');
  const pastDay = `2021-0${tagOf(testInfo) === 'M' ? 2 : 3}-01`;
  const pastCancelled = await createEventViaApi(page, { startDate: pastDay, venue: `${venue} Called off` });
  await api(page).post(`/events/${pastCancelled.id}/cancel`, { reason: 'Synthetic cancel' });
  expect(((await api(page).get(`/events/${pastCancelled.id}`)) as Record<string, unknown>).invoiceState).toBe('NONE');
  // A cancelled gig with rows and sent < total → "Osittain laskutettu".
  await api(page).post(`/events/${pastCancelled.id}/invoice-rows`, { description: 'Fee', amountCents: 1000, status: 'SENT' });
  expect(((await api(page).get(`/events/${pastCancelled.id}`)) as Record<string, unknown>).invoiceState).toBe('PARTLY_INVOICED');
  await page.goto(`/gigs/${gig.id}`);

  // Fully sent = solid dark green "Laskutettu"; the columns fit without sideways scroll
  // (table rows from 600 px; compact rows on phones).
  await api(page).post(`/events/${gig.id}/invoice-rows`, { description: 'Invoice 3', amountCents: total - half, status: 'SENT' });
  const widths = tagOf(testInfo) === 'M' ? [375] : [600, 900, 1100, 1280, 1440, 1600, 1920];
  for (const w of widths) {
    await page.setViewportSize({ width: w, height: 800 });
    await openList(page, year, '?f.allStatuses=1');
    await expectNoHorizontalScroll(page, `event list at ${w} px`);
    const overflow = await page
      .getByRole('table', { name: 'Keikkalista', exact: true })
      .evaluate((table) => table.scrollWidth - table.parentElement!.clientWidth);
    expect(overflow, `${w} px: table wider than its container`).toBeLessThanOrEqual(1);
  }
  const fullTag = eventListRows(page).filter({ hasText: venue }).locator('td.event-col-invoice .tag');
  await expect(fullTag).toHaveCount(1);
  await expect(fullTag).toHaveText('Laskutettu');
  await expect(fullTag).toHaveClass(/tag-ok-strong/);
});

// Phone rows (owner requests 2026-10-31): line 1 = "Lineup STATUS ——— INVOICING total": the status
// tag directly after the lineup name, a flexible gap, then the invoicing tag and the total together
// at the right edge, the total last (without an invoicing tag the total is at the right edge). The
// name truncates first; the gap shrinks to the minimum (8 px) before it does. At 320–430 px the
// tags and the total never wrap; a long lineup name truncates with an ellipsis and keeps its full text in the link's accessible name and title. Worst case
// here: an invoicing tag ("Avoimia laskuja") and a six-figure total; only at 320 px,
// once the name is down to its minimum, may that tag truncate too.
test('phone rows: line 1 = lineup name + status tag on the left, invoicing tag + total at the right edge', async ({ page }, testInfo) => {
  test.skip(tagOf(testInfo) !== 'M', 'phone layout only');
  const { year } = await setup(page, testInfo);
  const venue = `Hall ${tagOf(testInfo)}${suffix()} Line1`;
  const gig = await createEventViaApi(page, { startDate: `${year}-09-01`, venue, priceCents: 12345600 });
  const longName = `Lineup ${suffix()} with a very long synthetic name that cannot fit`;
  await api(page).patch(`/events/${gig.id}`, { lineupName: longName });
  await api(page).post(`/events/${gig.id}/invoice-rows`, { description: 'Invoice', amountCents: 1000, status: 'NOT_SENT' });
  const plainVenue = `Hall ${tagOf(testInfo)}${suffix()} NoInvoice`;
  await createEventViaApi(page, { startDate: `${year}-10-01`, venue: plainVenue, priceCents: 12345600 });

  for (const w of [320, 375, 430]) {
    await page.setViewportSize({ width: w, height: 800 });
    await openList(page, year);
    const row = eventListRows(page).filter({ hasText: venue });
    await expect(row).toHaveCount(1);
    await expect(row.getByRole('link', { name: new RegExp(`^${longName}`) })).toHaveAttribute('title', longName);
    await expect(row.getByText('Tuleva', { exact: true })).toBeVisible();
    await expect(row.getByText('Avoimia laskuja', { exact: true })).toBeVisible();

    const m = await row.evaluate((tr) => {
      const rect = (el: Element) => {
        const b = el.getBoundingClientRect();
        return { left: b.left, right: b.right, top: b.top, bottom: b.bottom, h: b.height, mid: (b.top + b.bottom) / 2 };
      };
      const title = tr.querySelector<HTMLElement>('td.cell-primary')!;
      const total = tr.querySelector('td.cell-main')!;
      const parts = [title, tr.querySelector('td.cell-inline .tag')!, tr.querySelector('td.event-col-invoice .tag')!, total];
      return {
        boxes: parts.map(rect),
        dateTop: rect(tr.querySelector('td.event-col-date')!).top,
        lineH: parseFloat(getComputedStyle(total).lineHeight) || 24,
        rowRight: tr.getBoundingClientRect().right - parseFloat(getComputedStyle(tr).paddingRight),
        truncated: title.scrollWidth > title.clientWidth,
        tagsCut: [...tr.querySelectorAll<HTMLElement>('td:is(.cell-inline, .cell-end) .tag')].some((t) => t.scrollWidth > t.clientWidth),
        ellipsis: getComputedStyle(title).textOverflow,
      };
    });
    const [title, status, invoice, total] = m.boxes as [Box, Box, Box, Box];
    // One line: every line-1 part sits beside the title, and line 2 starts below them.
    for (const [name, b] of [['status', status], ['invoicing', invoice], ['total', total]] as const) {
      expect(b.mid, `${w} px: ${name} on line 1`).toBeGreaterThan(title.top);
      expect(b.mid, `${w} px: ${name} on line 1`).toBeLessThan(title.bottom);
      expect(b.h, `${w} px: ${name} on one line`).toBeLessThan(m.lineH * 1.5);
      expect(m.dateTop, `${w} px: line 2 under the ${name}`).toBeGreaterThanOrEqual(b.bottom - 1);
    }
    // Order: title, status … invoicing, total; the total last at the right edge. Long name: it is
    // truncated, so every gap is down to the minimum.
    expect(status.left, `${w} px: status after the title`).toBeGreaterThanOrEqual(title.right - 1);
    expect(status.left - title.right, `${w} px: status hugs the title`).toBeLessThanOrEqual(MIN_GAP);
    expect(invoice.left, `${w} px: invoicing after the status`).toBeGreaterThanOrEqual(status.right - 1);
    expect(invoice.left - status.right, `${w} px: gap at its minimum (name truncated)`).toBeLessThanOrEqual(MIN_GAP);
    expect(total.left, `${w} px: total after the invoicing`).toBeGreaterThanOrEqual(invoice.right - 1);
    expect(total.left - invoice.right, `${w} px: total hugs the invoicing tag`).toBeLessThanOrEqual(MIN_GAP);
    expect(Math.abs(total.right - m.rowRight), `${w} px: total last, at the right edge`).toBeLessThanOrEqual(1);
    expect(title.h, `${w} px: title on one line`).toBeLessThan(m.lineH * 1.5);
    expect(m.truncated, `${w} px: long name truncated`).toBe(true);
    expect(m.ellipsis).toBe('ellipsis');
    if (w >= 375) expect(m.tagsCut, `${w} px: tags shown in full`).toBe(false);

    // No invoicing tag ("–" is left out on phones): the total is the last item, right-aligned.
    const plain = eventListRows(page).filter({ hasText: plainVenue });
    await expect(plain.locator('td.event-col-invoice')).toBeHidden();
    const p = await plain.evaluate((tr) => {
      const title = tr.querySelector('td.cell-primary')!.getBoundingClientRect();
      const status = tr.querySelector('td.cell-inline .tag')!.getBoundingClientRect();
      const total = tr.querySelector('td.cell-main')!.getBoundingClientRect();
      const rowRight = tr.getBoundingClientRect().right - parseFloat(getComputedStyle(tr).paddingRight);
      return { titleRight: title.right, titleTop: title.top, titleBottom: title.bottom, status: status.left, statusRight: status.right, totalLeft: total.left, totalRight: total.right, totalMid: (total.top + total.bottom) / 2, rowRight };
    });
    // Short name ("Template B"): status right after it, then a wide flexible gap before the total.
    expect(p.status, `${w} px: status after the title (no invoicing)`).toBeGreaterThanOrEqual(p.titleRight - 1);
    expect(p.status - p.titleRight, `${w} px: status hugs the title (no invoicing)`).toBeLessThanOrEqual(MIN_GAP);
    expect(p.totalLeft - p.statusRight, `${w} px: flexible gap before the total`).toBeGreaterThan(MIN_GAP * 3);
    expect(p.totalMid, `${w} px: total on line 1 (no invoicing)`).toBeLessThan(p.titleBottom);
    expect(Math.abs(p.totalRight - p.rowRight), `${w} px: total last, right-aligned`).toBeLessThanOrEqual(1);
    await expectNoHorizontalScroll(page, `gig list ${w} px`);
  }
});

/** Minimum gap between line-1 items on phone rows (`--space-2`) + rounding. */
const MIN_GAP = 9;

interface Box {
  left: number;
  right: number;
  top: number;
  bottom: number;
  h: number;
  mid: number;
}
