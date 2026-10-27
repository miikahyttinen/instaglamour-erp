import type { Locator, Page } from '@playwright/test';
import { expect } from './helpers';

// Excel-style tables (docs/design.md → "Excel-style tables"; frontend `ExcelTable`), used by the
// event list (Tapahtumat) and the offer list (Tarjoukset). From 600 px each filterable column header has
// a filter button "Suodata: <column>" that opens a non-modal popover dialog with the same name;
// below 600 px the table is laid out as cards and a "Suodattimet" button opens the same filter
// form per column in a sheet. Filters live in the URL as `f.<key>=<value>` (repeated per value).

/** Same breakpoint as the frontend `TABLET_QUERY`: header filters from here, the sheet below. */
export const TABLE_HEADER_FILTERS_MIN_WIDTH = 600;

export function hasHeaderFilters(page: Page): boolean {
  return (page.viewportSize()?.width ?? 0) >= TABLE_HEADER_FILTERS_MIN_WIDTH;
}

/** Header filter button of a column ("Suodata: Tila"). Only from 600 px. */
export function filterButton(page: Page, column: string): Locator {
  return page.getByRole('main').getByRole('button', { name: `Suodata: ${column}`, exact: true });
}

/** The header popover of a column: a dialog named like its button. */
export function filterPopover(page: Page, column: string): Locator {
  return page.getByRole('dialog', { name: `Suodata: ${column}`, exact: true });
}

/** Phones: the "Suodattimet" sheet (modal dialog). */
export function filterSheet(page: Page): Locator {
  return page.getByRole('dialog', { name: 'Suodattimet', exact: true });
}

/** "Tyhjennä suodattimet" above the table (a second one sits in the "no rows" box). */
export function clearFiltersButton(page: Page): Locator {
  return page.getByRole('main').getByRole('button', { name: 'Tyhjennä suodattimet', exact: true }).first();
}

/** A value checkbox in an open filter form (label = the value as shown, e.g. "Peruttu"). */
export function filterValue(form: Locator, label: string): Locator {
  return form.getByRole('checkbox', { name: label, exact: true });
}

/**
 * Opens a column's filter form like a user: the header button from 600 px, otherwise
 * "Suodattimet" → the column in the sheet. Returns the dialog that holds the form.
 */
export async function openColumnFilter(page: Page, column: string): Promise<Locator> {
  if (hasHeaderFilters(page)) {
    const button = filterButton(page, column);
    await button.click();
    const popover = filterPopover(page, column);
    await expect(popover).toBeVisible();
    await expect(button).toHaveAttribute('aria-expanded', 'true');
    return popover;
  }
  await page.getByRole('main').getByRole('button', { name: 'Suodattimet', exact: true }).click();
  const sheet = filterSheet(page);
  await expect(sheet).toBeVisible();
  await sheet.getByRole('button', { name: column, exact: true }).click();
  await expect(sheet.getByRole('heading', { name: column, exact: true })).toBeVisible();
  return sheet;
}

/** OK in an open filter form; closes the popover, or the sheet with "Valmis" on phones. */
export async function applyColumnFilter(page: Page, form: Locator): Promise<void> {
  await form.getByRole('button', { name: 'OK', exact: true }).click();
  if (!hasHeaderFilters(page)) await form.getByRole('button', { name: 'Valmis', exact: true }).click();
  await expect(form).toBeHidden();
}

/** Cancel in an open filter form (nothing changes); closes the sheet too on phones. */
export async function cancelColumnFilter(page: Page, form: Locator): Promise<void> {
  await form.getByRole('button', { name: 'Peruuta', exact: true }).click();
  if (!hasHeaderFilters(page)) await form.getByRole('button', { name: 'Valmis', exact: true }).click();
  await expect(form).toBeHidden();
}

/** Filters a column to exactly `values`: open, "Tyhjennä", tick each value, OK. */
export async function filterColumn(page: Page, column: string, values: string[]): Promise<void> {
  const form = await openColumnFilter(page, column);
  await form.getByRole('button', { name: 'Tyhjennä', exact: true }).click();
  for (const v of values) await filterValue(form, v).check();
  await applyColumnFilter(page, form);
}

/** Ticks `values` on top of the column's current selection, then OK. */
export async function tickColumnValues(page: Page, column: string, values: string[]): Promise<void> {
  const form = await openColumnFilter(page, column);
  for (const v of values) await filterValue(form, v).check();
  await applyColumnFilter(page, form);
}

/** The `f.<key>` values in the page URL, in order. */
export function urlFilter(page: Page, key: string): string[] {
  return new URL(page.url()).searchParams.getAll(`f.${key}`);
}
