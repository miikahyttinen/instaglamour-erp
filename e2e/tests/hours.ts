import type { Locator, Page } from '@playwright/test';
import { api, CURRENT_YEAR, expect } from './helpers';

/**
 * Hours pages after TASK-136 (UC-018, UC-019): one flat spreadsheet-style table per page.
 * - Totals (`/hours/totals`): table "Tuntikirjaukset <year>" — Päivä | Osakas | Kommentti | Tunnit,
 *   partner filter combobox "Osakas" (`?partner=`), total row "Yhteensä" (`hours-table-total`).
 * - My hours (`/hours`): table "Omat tunnit <year>" — Päivä | Kommentti | Tunnit, total row, year
 *   total figure above (`hours-year-total`).
 * Own rows are inline fields named "<Field>: <d.m.yyyy> <comment>"; others' rows are plain text.
 */

export interface HourEntry {
  id: string;
  partnerId: string;
  date: string;
  comment: string;
  hours: number;
}

export interface Partner {
  id: string;
  name: string;
}

export interface HoursTotals {
  partners: { partnerId: string; months: number[]; total: number }[];
  grandTotal: number;
}

/** One table row as the user sees it (own rows: the input values). */
export interface ShownRow {
  date: string; // ISO
  partner: string | null; // null on My hours (no partner column)
  comment: string;
  hours: number;
  /** Inputs, selects, textareas and buttons in the row. */
  controls: number;
}

export const totalsTable = (page: Page, year = CURRENT_YEAR): Locator =>
  page.getByRole('table', { name: `Tuntikirjaukset ${year}`, exact: true });

export const myHoursTable = (page: Page, year = CURRENT_YEAR): Locator =>
  page.getByRole('table', { name: `Omat tunnit ${year}`, exact: true });

export const partnerFilter = (page: Page): Locator => page.getByRole('combobox', { name: 'Osakas', exact: true });

export const tableTotal = (table: Locator): Locator => table.getByTestId('hours-table-total');

/** Hours shown as `1,5 h` (read-only) or `1,5` (input) → 1.5. */
export function parseFiHours(text: string): number {
  return Number(text.replace(/\s| /g, '').replace(/h$/, '').replace(',', '.'));
}

/** Header labels of the table (the hidden actions header included). */
export async function headerLabels(table: Locator): Promise<string[]> {
  return table.locator('thead th').evaluateAll((ths) => ths.map((th) => (th.textContent ?? '').trim()));
}

/** Every body row of an hours table, read like a user: input values for own rows, text otherwise. */
export async function readRows(table: Locator): Promise<ShownRow[]> {
  const raw = await table.evaluate((el) => {
    const t = el as HTMLTableElement;
    const labels = [...t.tHead!.rows[0].cells].map((c) => (c.textContent ?? '').trim());
    const tbody = t.tBodies[0];
    return [...(tbody?.rows ?? [])].map((tr) => {
      const cell = (label: string) => {
        const i = labels.indexOf(label);
        if (i < 0) return null;
        const td = tr.cells[i];
        const field = td.querySelector('input, textarea, select') as HTMLInputElement | null;
        return field ? field.value : (td.textContent ?? '').trim();
      };
      return {
        date: cell('Päivä') ?? '',
        partner: cell('Osakas'),
        comment: cell('Kommentti') ?? '',
        hours: cell('Tunnit') ?? '',
        controls: tr.querySelectorAll('input, textarea, select, button').length,
      };
    });
  });
  return raw.map((r) => ({
    ...r,
    date: /^\d{2}\.\d{2}\.\d{4}$/.test(r.date) ? r.date.split('.').reverse().join('-') : r.date,
    hours: parseFiHours(r.hours),
  }));
}

export async function partners(page: Page): Promise<Partner[]> {
  return ((await api(page).get('/reference')) as { partners: Partner[] }).partners;
}

/** All entries of the year for every partner, via the API (cross-check only). */
export async function allEntries(page: Page, list: Partner[], year = CURRENT_YEAR): Promise<(HourEntry & { partner: string })[]> {
  const per = await Promise.all(
    list.map(async (p) =>
      ((await api(page).get(`/hours?year=${year}&partnerId=${p.id}`)) as HourEntry[]).map((e) => ({ ...e, partner: p.name })),
    ),
  );
  return per.flat();
}

export const sum = (values: number[]): number => values.reduce((s, v) => s + v, 0);

/** Order key of a shown row for a column; text columns compare like the UI (fi, base sensitivity). */
export type SortColumn = 'Päivä' | 'Osakas' | 'Kommentti' | 'Tunnit';

export function compareBy(column: SortColumn): (a: ShownRow, b: ShownRow) => number {
  const text = (a: string, b: string) => a.localeCompare(b, 'fi-FI', { sensitivity: 'base' });
  switch (column) {
    case 'Päivä':
      return (a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
    case 'Osakas':
      return (a, b) => text(a.partner ?? '', b.partner ?? '');
    case 'Kommentti':
      return (a, b) => text(a.comment, b.comment);
    case 'Tunnit':
      return (a, b) => a.hours - b.hours;
  }
}

/** The rows are ordered by the column in the direction (ties may be in any order). */
export function expectOrdered(rows: ShownRow[], column: SortColumn, dir: 'asc' | 'desc', where: string): void {
  const cmp = compareBy(column);
  for (let i = 1; i < rows.length; i++) {
    const c = cmp(rows[i - 1], rows[i]);
    expect(
      dir === 'asc' ? c <= 0 : c >= 0,
      `${where}: rows ${i - 1} and ${i} not ${dir} by ${column}: ${JSON.stringify(rows[i - 1])} / ${JSON.stringify(rows[i])}`,
    ).toBeTruthy();
  }
}

/** No collapsing, no month grouping and no charts in the page's main area (UC-018, UC-019). */
export async function expectFlatNoCharts(page: Page, where: string): Promise<void> {
  const main = page.getByRole('main');
  await expect(main.locator('[aria-expanded]'), `${where}: nothing expands or collapses`).toHaveCount(0);
  await expect(main.locator('details, summary'), `${where}: no disclosure widgets`).toHaveCount(0);
  await expect(main.getByRole('region', { name: /kirjaukset/ }), `${where}: no expanded partner region`).toHaveCount(0);
  await expect(main.getByRole('table'), `${where}: exactly one table`).toHaveCount(1);
  await expect(main.locator('tbody'), `${where}: one row group (no month groups)`).toHaveCount(1);
  const months = /^(tammikuu|helmikuu|maaliskuu|huhtikuu|toukokuu|kesäkuu|heinäkuu|elokuu|syyskuu|lokakuu|marraskuu|joulukuu)/i;
  await expect(main.getByRole('heading', { name: months }), `${where}: no month headings`).toHaveCount(0);
  await expect(main.getByRole('rowheader', { name: months }), `${where}: no month rows`).toHaveCount(0);
  await expect(
    main.locator('canvas, [role="img"], [role="meter"], [role="progressbar"], meter, progress, svg:not([aria-hidden="true"])'),
    `${where}: no charts or bars`,
  ).toHaveCount(0);
  await expect(main.locator('[class*="chart"], [class*="hours-bar"], [class*="bar-"]'), `${where}: no chart markup`).toHaveCount(0);
}
