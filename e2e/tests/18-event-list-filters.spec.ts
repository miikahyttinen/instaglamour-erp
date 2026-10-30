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
    // Phones: cards, no header buttons; one "Suodattimet" button opens the sheet.
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

// Kate-%: the actual percentage ("tot. x %") is always on its own line under the budget one
// (wide table, narrow table and phone cards); each percentage stays on one line.
test('Kate-%: the actual percentage is always on a second line', async ({ page }, testInfo) => {
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
    expect(actual.top, `${w} px: actual under the budget`).toBeGreaterThanOrEqual(budget.bottom - 1);
    for (const part of parts) expect(part.oneLine, `${w} px: "${part.text}" on one line`).toBe(true);
  }
});

// Gig statuses (owner decision 2026-10-31): Tuleva = blue (info), Soitettu = green (ok), Peruttu =
// red (danger). Invoice rows (TASK-173): the "Laskutus" card under the price card lists invoice
// rows (inline description / amount / status, who / when, remove with confirm; row status
// "Valmis laskutukseen" blue, "Lähetetty" amber, "Maksettu" dark green), an add form, and
// Laskutettu / Avoimet / Maksettu / Saldo (= total − paid; warning when negative). Invoicing state
// (api-contract "Invoicing: one label"): ONE tag = the next action, first match wins — Maksettu
// (dark green) · Laskutettavia rivejä (blue) · Avoimia laskuja (amber) · Laskuttamatta (gray) · "–";
// on the gig card and in the list "Laskutus" cell (one line), with one filter (f.invoiceState).
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
  const stateTag = card.getByRole('group', { name: 'Laskutuksen tila' }).locator('.tag');
  await expect(stateTag).toHaveCount(1);
  await expect(stateTag).toHaveText('Laskuttamatta');
  await expect(stateTag).toHaveClass(/tag-muted/);
  expect((await apiGig()).invoiceState).toBe('NEEDS_INVOICES');

  // Add a row: status defaults to "Valmis laskutukseen" (blue), who / when shown → "Laskutettavia rivejä".
  await card.getByRole('button', { name: '+ Lisää laskurivi' }).click();
  const form = card.getByRole('form', { name: 'Lisää laskurivi' });
  await form.getByRole('textbox', { name: 'Kuvaus' }).fill('Invoice 1');
  await form.getByRole('textbox', { name: 'Summa' }).fill(String(total / 100 + 10));
  await form.getByRole('button', { name: 'Lisää laskurivi' }).click();
  const row = card.locator('tr.invoice-row', { hasText: 'Invoice 1' });
  const status = row.getByRole('combobox', { name: 'Tila: Invoice 1' });
  await expect(status).toHaveValue('READY');
  await expect(row.locator('.invoice-row-status')).toHaveClass(/tone-info(\s|$)/);
  await expect(row.locator('.invoice-row-changed')).toContainText(/Partner A \d+\.\d+\.\d{4} klo /);
  await expect(stateTag).toHaveText('Laskutettavia rivejä');
  await expect(stateTag).toHaveClass(/tag-info/);
  await expect.poll(async () => (await apiGig()).invoiceState).toBe('ROWS_TO_INVOICE');
  expect((await apiGig()).readyCents).toBe(total + 1000);
  await openList(page, year, '?f.invoiceState=ROWS_TO_INVOICE');
  await expect(eventListRows(page)).toHaveCount(1);
  const readyTag = eventListRows(page).first().locator('td.event-col-invoice .tag');
  await expect(readyTag).toHaveCount(1);
  await expect(readyTag).toHaveText('Laskutettavia rivejä');
  await expect(readyTag).toHaveClass(/tag-info/);
  await page.goto(`/gigs/${gig.id}`);

  // Sent (amber row) → "Avoimia laskuja" (amber); Avoimet = the row.
  await status.selectOption({ label: 'Lähetetty' });
  await expect(row.locator('.invoice-row-status')).toHaveClass(/tone-warn/);
  await expect(stateTag).toHaveText('Avoimia laskuja');
  await expect(stateTag).toHaveClass(/tag-warn/);
  await expect(card.locator('dt', { hasText: 'Avoimet' }).locator('xpath=following-sibling::dd')).not.toHaveText(/^0,00/);
  await expect.poll(async () => (await apiGig()).invoiceState).toBe('OPEN_INVOICES');
  expect((await apiGig()).openCents).toBe(total + 1000);

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
  await expect(listTag).toHaveClass(/tag-warn/);
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

  // Paid above the total → dark green "Maksettu", negative balance with a warning; then remove the row.
  await page.goto(`/gigs/${gig.id}`);
  await status.selectOption({ label: 'Maksettu' });
  await expect(row.locator('.invoice-row-status')).toHaveClass(/tone-ok-strong/);
  await expect(stateTag).toHaveText('Maksettu');
  await expect(stateTag).toHaveClass(/tag-ok-strong/);
  await expect(card.getByRole('note')).toHaveText('Maksettu enemmän kuin kokonaishinta.');
  await expect(card.locator('.event-balance')).toHaveClass(/event-balance-negative/);
  await expect.poll(async () => (await apiGig()).balanceCents).toBe(-1000);
  await row.getByRole('button', { name: 'Poista: Invoice 1' }).click();
  await page.getByRole('dialog', { name: 'Poista laskurivi' }).getByRole('button', { name: 'Poista' }).click();
  await expect(card.getByText('Ei laskurivejä.')).toBeVisible();
  await expect(card.getByRole('note')).toHaveCount(0);
  await expect.poll(async () => (await apiGig()).balanceCents).toBe(total);
  await expect(stateTag).toHaveText('Laskuttamatta');

  // Cancelled = red "Peruttu".
  await openList(page, year, '?f.status=CANCELLED');
  await expect(eventListRows(page).first().getByText('Peruttu', { exact: true })).toHaveClass(/tag-danger/);

  // Part paid, nothing open → still "Laskuttamatta" (gray).
  const half = Math.floor(total / 2);
  await api(page).post(`/events/${gig.id}/invoice-rows`, { description: 'Invoice 2', amountCents: half, status: 'PAID' });
  await page.goto(`/gigs/${gig.id}`);
  await expect(stateTag).toHaveText('Laskuttamatta');
  await expect(stateTag).toHaveClass(/tag-muted/);
  expect((await apiGig()).invoiceState).toBe('NEEDS_INVOICES');

  // Fully paid = solid dark green "Maksettu"; the columns fit without sideways scroll
  // (table rows from 600 px; phones are cards).
  await api(page).post(`/events/${gig.id}/invoice-rows`, { description: 'Invoice 3', amountCents: total - half, status: 'PAID' });
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
  const paidTag = eventListRows(page).filter({ hasText: venue }).locator('td.event-col-invoice .tag');
  await expect(paidTag).toHaveCount(1);
  await expect(paidTag).toHaveText('Maksettu');
  await expect(paidTag).toHaveClass(/tag-ok-strong/);
});
