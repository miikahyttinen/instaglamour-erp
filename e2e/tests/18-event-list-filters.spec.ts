import type { Page, TestInfo } from '@playwright/test';
import { api, expect, signIn, tagOf, test } from './helpers';
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
  await page.goto(`/events${query}`);
  await expect(page.getByRole('heading', { level: 1, name: `Tapahtumat ${year}` })).toBeVisible();
  await expect(page.getByText('Ladataan…')).toHaveCount(0);
}

test('event list: cancelled hidden by default, Tila filter shows them, Paikka filter AND search, URL state survives reload, "Tyhjennä suodattimet" resets', async ({ page }, testInfo) => {
  const { year, north, south, club } = await setup(page, testInfo);
  const venues = [north, south, club];
  const rows = eventListRows(page);
  const venuesOf = () => rowVenues(page, venues);

  // Default view: sold events only; the default Tila filter is not written to the URL.
  await openList(page, year);
  await expect(page.getByRole('table', { name: 'Tapahtumalista', exact: true })).toBeVisible();
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

  // The Tila form: default ticks (Myyty + Soitettu, not Peruttu),
  // "Valitse kaikki" / "Tyhjennä" / OK / "Peruuta"; nothing checked → OK disabled; Cancel changes nothing.
  let form = await openColumnFilter(page, 'Tila');
  if (hasHeaderFilters(page)) await expect(form).toHaveAccessibleName('Suodata: Tila');
  for (const name of ['Valitse kaikki', 'Tyhjennä', 'OK', 'Peruuta']) {
    await expect(form.getByRole('button', { name, exact: true })).toBeVisible();
  }
  await expect(filterValue(form, 'Myyty')).toBeChecked();
  await expect(filterValue(form, 'Peruttu')).not.toBeChecked();
  await form.getByRole('button', { name: 'Tyhjennä', exact: true }).click();
  await expect(filterValue(form, 'Myyty')).not.toBeChecked();
  await expect(form.getByRole('button', { name: 'OK', exact: true })).toBeDisabled();
  await form.getByRole('button', { name: 'Valitse kaikki', exact: true }).click();
  await expect(filterValue(form, 'Myyty')).toBeChecked();
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
  await expect(page.getByText('Ei suodattimia vastaavia tapahtumia.')).toBeVisible();
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

// Gig → Event rename (SaaS phase 1): old /gigs… links (bookmarks, e-mails) open the same page
// under /events…, with the query string kept.
test('old /gigs URLs redirect to /events and keep the query string', async ({ page }, testInfo) => {
  const { year, north, south, club } = await setup(page, testInfo);
  const venuesOf = () => rowVenues(page, [north, south, club]);
  const q = north.split(' ')[1]!;
  await page.goto(`/gigs?q=${encodeURIComponent(q)}&f.venue=${encodeURIComponent(north)}`);
  await expect(page).toHaveURL(/\/events\?q=/);
  expect(new URL(page.url()).searchParams.get('q')).toBe(q);
  expect(urlFilter(page, 'venue')).toEqual([north]);
  await expect(page.getByRole('heading', { level: 1, name: `Tapahtumat ${year}` })).toBeVisible();
  await expect.poll(venuesOf).toEqual([north]);

  const event = await createEventViaApi(page, { startDate: `${year}-07-01`, venue: club });
  await page.goto(`/gigs/${event.id}`);
  await expect(page).toHaveURL(new RegExp(`/events/${event.id}$`));
  await page.goto('/gigs/new');
  await expect(page).toHaveURL(/\/events\/new$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Uusi tapahtuma' })).toBeVisible();
});
