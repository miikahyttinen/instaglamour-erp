import { suffix } from './gigs';
import {
  api,
  CURRENT_YEAR,
  editInline,
  expect,
  expectNoEditSaveButtons,
  expectNoHorizontalScroll,
  fiDate,
  fiHours,
  goNav,
  PARTNER_B,
  signIn,
  tagOf,
  test,
} from './helpers';
import {
  allEntries,
  expectFlatNoCharts,
  expectOrdered,
  headerLabels,
  myHoursTable,
  partnerFilter,
  partners,
  readRows,
  sum,
  tableTotal,
  totalsTable,
  type HourEntry,
  type HoursTotals,
  type SortColumn,
} from './hours';

// TASK-014 (revised for TASK-136): hours as flat spreadsheet-style tables (UC-018, UC-019).

const keyOf = (r: { date: string; partner: string | null; comment: string; hours: number }) =>
  `${r.date}|${r.partner ?? ''}|${r.comment}|${r.hours}`;

// UC-019 AC-1, AC-2: every entry of the year once; total row = Σ shown rows = year page hours;
// partner filter → that partner's year hours (0 h partners: their empty message); `?partner=` survives reload.
test('totals: every entry once, total = year page, partner filter kept in the URL', async ({ page }) => {
  await signIn(page);
  const list = await partners(page);
  const entries = await allEntries(page, list);
  const totals = (await api(page).get(`/hours/totals?year=${CURRENT_YEAR}`)) as HoursTotals;
  expect(sum(entries.map((e) => e.hours)), 'API: entries sum = grandTotal').toBeCloseTo(totals.grandTotal, 6);

  await page.goto('/hours/totals');
  const table = totalsTable(page);
  await expect(table).toBeVisible();
  expect((await headerLabels(table)).slice(0, 4)).toEqual(['Päivä', 'Osakas', 'Kommentti', 'Tunnit']);

  // Every entry once (as a multiset), default order date ascending.
  const rows = await readRows(table);
  expect(rows.map(keyOf).sort()).toEqual(entries.map((e) => keyOf({ ...e, partner: e.partner })).sort());
  await expect(table.getByRole('columnheader', { name: 'Päivä' })).toHaveAttribute('aria-sort', 'ascending');
  expectOrdered(rows, 'Päivä', 'asc', 'default order');

  // Total row = Σ shown rows = grand total.
  await expect(table.getByRole('rowheader', { name: 'Yhteensä', exact: true })).toBeVisible();
  await expect(tableTotal(table)).toHaveText(fiHours(sum(rows.map((r) => r.hours))));
  await expect(tableTotal(table)).toHaveText(fiHours(totals.grandTotal));
  const shownTotal = await tableTotal(table).textContent();

  // Filter: "Kaikki" + every partner by name.
  const filter = partnerFilter(page);
  await expect(filter).toHaveValue('');
  const options = await filter.locator('option').allTextContents();
  expect(options[0]).toBe('Kaikki');
  expect([...options.slice(1)].sort()).toEqual(list.map((p) => p.name).sort());

  for (const p of list) {
    await filter.selectOption({ label: p.name });
    await expect(page).toHaveURL(new RegExp(`[?&]partner=${p.id}(&|$)`));
    const expected = totals.partners.find((t) => t.partnerId === p.id)?.total ?? 0;
    const own = entries.filter((e) => e.partnerId === p.id);
    if (own.length === 0) {
      await expect(page.getByText(`${p.name}: ei tuntikirjauksia vuonna ${CURRENT_YEAR}.`)).toBeVisible();
      continue;
    }
    await expect(tableTotal(table)).toHaveText(fiHours(expected));
    const shown = await readRows(table);
    expect(shown.map(keyOf).sort(), `rows of ${p.name}`).toEqual(own.map((e) => keyOf(e)).sort());
    expect(new Set(shown.map((r) => r.partner))).toEqual(new Set([p.name]));
  }

  // The filter survives a reload.
  const b = list.find((p) => p.name === 'Partner B')!;
  await filter.selectOption({ label: 'Partner B' });
  await page.reload();
  await expect(partnerFilter(page)).toHaveValue(b.id);
  await expect(page).toHaveURL(new RegExp(`[?&]partner=${b.id}(&|$)`));
  await expect(tableTotal(totalsTable(page))).toHaveText(
    fiHours(totals.partners.find((t) => t.partnerId === b.id)!.total),
  );

  // Back to all: the parameter is removed and the grand total is back.
  await partnerFilter(page).selectOption({ label: 'Kaikki' });
  await expect(page).not.toHaveURL(/[?&]partner=/);
  await expect(tableTotal(totalsTable(page))).toHaveText(shownTotal!);

  // Year page shows the same hours total.
  await goNav(page, 'Vuosi');
  await expect(
    page.getByRole('region', { name: 'Tunnit' }).getByRole('link', { name: `Yhteensä ${shownTotal}` }),
  ).toBeVisible();
});

// UC-019 AC-2: a partner with no hours in the year shows their empty message, not a table.
test('totals: a partner with 0 h in the year shows the empty message', async ({ page }) => {
  const year = CURRENT_YEAR - 1;
  await signIn(page, undefined, { selectedYear: year });
  const list = await partners(page);
  const totals = (await api(page).get(`/hours/totals?year=${year}`)) as HoursTotals;
  const zero = list.find((p) => (totals.partners.find((t) => t.partnerId === p.id)?.total ?? 0) === 0);
  test.skip(!zero, `every partner has hours in ${year}`);

  await page.goto(`/hours/totals?partner=${zero!.id}`);
  await expect(partnerFilter(page)).toHaveValue(zero!.id);
  await expect(page.getByText(`${zero!.name}: ei tuntikirjauksia vuonna ${year}.`)).toBeVisible();
  await expect(totalsTable(page, year)).toHaveCount(0);
});

// UC-019 AC-3: sorting by each column, ascending and descending (aria-sort follows).
test('totals: sort by each column asc / desc', async ({ page }) => {
  await signIn(page);
  await page.goto('/hours/totals');
  const table = totalsTable(page);
  await expect(table).toBeVisible();
  const columns: SortColumn[] = ['Päivä', 'Osakas', 'Kommentti', 'Tunnit'];
  const header = (c: SortColumn) => table.getByRole('columnheader', { name: c, exact: true });

  for (const c of columns) {
    const button = header(c).getByRole('button', { name: c, exact: true });
    const before = await header(c).getAttribute('aria-sort');
    await button.click();
    // Another column starts ascending; the sorted column flips.
    const first = before === 'ascending' ? 'descending' : 'ascending';
    for (const dir of [first, first === 'ascending' ? 'descending' : 'ascending'] as const) {
      if (dir !== first) await button.click();
      await expect(header(c)).toHaveAttribute('aria-sort', dir);
      for (const other of columns.filter((o) => o !== c)) {
        await expect(header(other)).toHaveAttribute('aria-sort', 'none');
      }
      const rows = await readRows(table);
      expect(rows.length).toBeGreaterThan(1);
      expectOrdered(rows, c, dir === 'ascending' ? 'asc' : 'desc', `sorted by ${c} ${dir}`);
    }
  }
  // Sorting never changes the total.
  const rows = await readRows(table);
  await expect(tableTotal(table)).toHaveText(fiHours(sum(rows.map((r) => r.hours))));
});

// UC-019 AC-4, UC-018 AC-2: own rows are inline fields (date, comment, hours, delete); others'
// rows are plain text. An inline edit updates the total row and persists after reload.
test('totals: own rows editable inline, others read-only; edit updates totals', async ({ page }, testInfo) => {
  const me = await signIn(page);
  const tag = tagOf(testInfo);
  const comment = `Synthetic table ${tag}-${suffix()}`;
  const date = tag === 'M' ? `${CURRENT_YEAR}-05-14` : `${CURRENT_YEAR}-05-15`;
  const moved = tag === 'M' ? `${CURRENT_YEAR}-06-14` : `${CURRENT_YEAR}-06-15`;
  const entry = (await api(page).post('/hours', { date, comment, hours: 1 })) as HourEntry;
  const grand = ((await api(page).get(`/hours/totals?year=${CURRENT_YEAR}`)) as HoursTotals).grandTotal;

  await page.goto('/hours/totals');
  const table = totalsTable(page);
  await expect(tableTotal(table)).toHaveText(fiHours(grand));
  await expectNoEditSaveButtons(page.getByRole('main'), 'hours totals');

  const rows = await readRows(table);
  const others = rows.filter((r) => r.partner !== me.name);
  const mine = rows.filter((r) => r.partner === me.name);
  expect(others.length, 'seed has other partners’ entries').toBeGreaterThan(0);
  for (const r of others) expect(r.controls, `read-only row ${keyOf(r)}`).toBe(0);
  for (const r of mine) expect(r.controls, `own row ${keyOf(r)}: date, comment, hours, delete`).toBe(4);
  const otherRow = table.locator('tbody tr').filter({ hasText: 'Partner B' }).first();
  await expect(otherRow.getByRole('textbox')).toHaveCount(0);
  await expect(otherRow.getByRole('button')).toHaveCount(0);

  const of = (field: string, d: string, c: string) =>
    table.getByLabel(`${field}: ${fiDate(d)} ${c}`, { exact: true });
  await expect(of('Päivämäärä', date, comment)).toHaveValue(date);
  await expect(of('Kommentti', date, comment)).toHaveValue(comment);
  await expect(of('Tunnit', date, comment)).toHaveValue('1');
  await expect(table.getByRole('button', { name: `Poista: ${fiDate(date)} ${comment}`, exact: true })).toBeVisible();

  // Hours: one PATCH with just the hours, the total row follows.
  expect(await editInline(page, of('Tunnit', date, comment), '3')).toEqual({ hours: 3 });
  await expect(tableTotal(table)).toHaveText(fiHours(grand + 2));

  // Comment and date: the field names follow the saved values.
  const renamed = `${comment} B`;
  expect(await editInline(page, of('Kommentti', date, comment), renamed, { commit: 'Enter' })).toEqual({
    comment: renamed,
  });
  expect(await editInline(page, of('Päivämäärä', date, renamed), moved)).toEqual({ date: moved });
  await expect(of('Tunnit', moved, renamed)).toHaveValue('3');

  // Reload: everything persisted; the total row and the year page agree.
  await page.reload();
  await expect(of('Päivämäärä', moved, renamed)).toHaveValue(moved);
  await expect(of('Kommentti', moved, renamed)).toHaveValue(renamed);
  await expect(of('Tunnit', moved, renamed)).toHaveValue('3');
  await expect(tableTotal(totalsTable(page))).toHaveText(fiHours(grand + 2));
  const saved = ((await api(page).get(`/hours?year=${CURRENT_YEAR}`)) as HourEntry[]).find((e) => e.id === entry.id);
  expect(saved).toMatchObject({ date: moved, comment: renamed, hours: 3 });
  await goNav(page, 'Vuosi');
  await expect(
    page.getByRole('region', { name: 'Tunnit' }).getByRole('link', { name: `Yhteensä ${fiHours(grand + 2)}` }),
  ).toBeVisible();
});

// UC-018 AC-2 (API side): another partner's entry can't be changed or deleted.
test('API: another partner’s hour entry → 403 on PATCH and DELETE', async ({ page }) => {
  const me = await signIn(page);
  const b = (await partners(page)).find((p) => p.name === 'Partner B')!;
  expect(b.id).not.toBe(me.id);
  const theirs = (await api(page).get(`/hours?year=${CURRENT_YEAR}&partnerId=${b.id}`)) as HourEntry[];
  expect(theirs.length).toBeGreaterThan(0);
  expect((await api(page).raw.patch(`/api/hours/${theirs[0].id}`, { data: { hours: 2 } })).status()).toBe(403);
  expect((await api(page).raw.delete(`/api/hours/${theirs[0].id}`)).status()).toBe(403);
  const after = (await api(page).get(`/hours?year=${CURRENT_YEAR}&partnerId=${b.id}`)) as HourEntry[];
  expect(after.find((e) => e.id === theirs[0].id)).toEqual(theirs[0]);
  // Partner B still sees it as their own (sanity: the entry exists and is theirs).
  await signIn(page, PARTNER_B);
  expect(((await api(page).get(`/hours?year=${CURRENT_YEAR}`)) as HourEntry[]).map((e) => e.id)).toContain(theirs[0].id);
});

// UC-018: My hours = own entries only (Päivä | Kommentti | Tunnit), total row = year total,
// sortable; delete asks first (Cancel keeps the entry).
test('my hours: own table with total row, sorting and delete with confirmation', async ({ page }, testInfo) => {
  await signIn(page);
  const tag = tagOf(testInfo);
  const keep = `Synthetic mine ${tag}-${suffix()}`;
  const drop = `Synthetic drop ${tag}-${suffix()}`;
  const date = tag === 'M' ? `${CURRENT_YEAR}-07-14` : `${CURRENT_YEAR}-07-15`;
  await api(page).post('/hours', { date, comment: keep, hours: 0.25 });
  const dropped = (await api(page).post('/hours', { date, comment: drop, hours: 2 })) as HourEntry;
  const own = (await api(page).get(`/hours?year=${CURRENT_YEAR}`)) as HourEntry[];
  const total = sum(own.map((e) => e.hours));

  await page.goto('/hours');
  const table = myHoursTable(page);
  await expect(table).toBeVisible();
  const headers = await headerLabels(table);
  expect(headers.slice(0, 3)).toEqual(['Päivä', 'Kommentti', 'Tunnit']);
  expect(headers).not.toContain('Osakas');

  const rows = await readRows(table);
  expect(rows.map(keyOf).sort()).toEqual(own.map((e) => keyOf({ ...e, partner: null })).sort());
  for (const r of rows) expect(r.controls, `own row ${keyOf(r)}`).toBe(4);
  expectOrdered(rows, 'Päivä', 'asc', 'my hours default order');
  await expect(table.getByRole('rowheader', { name: 'Yhteensä', exact: true })).toBeVisible();
  await expect(tableTotal(table)).toHaveText(fiHours(total));
  await expect(page.getByTestId('hours-year-total')).toHaveText(fiHours(total));

  // Sorting: hours and comment, both directions.
  for (const c of ['Tunnit', 'Kommentti'] as SortColumn[]) {
    const header = table.getByRole('columnheader', { name: c, exact: true });
    const button = header.getByRole('button', { name: c, exact: true });
    await button.click();
    await expect(header).toHaveAttribute('aria-sort', 'ascending');
    expectOrdered(await readRows(table), c, 'asc', `my hours by ${c} asc`);
    await button.click();
    await expect(header).toHaveAttribute('aria-sort', 'descending');
    expectOrdered(await readRows(table), c, 'desc', `my hours by ${c} desc`);
  }

  // Delete: Cancel keeps the entry; Poista removes it and both totals follow.
  const del = table.getByRole('button', { name: `Poista: ${fiDate(date)} ${drop}`, exact: true });
  await del.click();
  let dialog = page.getByRole('dialog', { name: 'Poistetaanko tuntikirjaus?' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Peruuta' }).click();
  await expect(dialog).toBeHidden();
  await expect(table.getByLabel(`Kommentti: ${fiDate(date)} ${drop}`, { exact: true })).toHaveValue(drop);

  await del.click();
  dialog = page.getByRole('dialog', { name: 'Poistetaanko tuntikirjaus?' });
  const deleted = page.waitForResponse((r) => r.request().method() === 'DELETE' && r.url().includes(`/api/hours/${dropped.id}`));
  await dialog.getByRole('button', { name: 'Poista', exact: true }).click();
  expect((await deleted).status()).toBe(204);
  await expect(dialog).toBeHidden();
  await expect(table.getByLabel(`Kommentti: ${fiDate(date)} ${drop}`, { exact: true })).toHaveCount(0);
  await expect(tableTotal(table)).toHaveText(fiHours(total - 2));
  await expect(page.getByTestId('hours-year-total')).toHaveText(fiHours(total - 2));

  await page.reload();
  await expect(tableTotal(myHoursTable(page))).toHaveText(fiHours(total - 2));
  await expect(myHoursTable(page).getByLabel(`Kommentti: ${fiDate(date)} ${keep}`, { exact: true })).toHaveValue(keep);
  const after = (await api(page).get(`/hours?year=${CURRENT_YEAR}`)) as HourEntry[];
  expect(after.map((e) => e.id)).not.toContain(dropped.id);
});

// UC-018, UC-019: flat tables only — nothing expands, no month groups, no charts; no page-level
// horizontal scroll (NFR-1; the 375 px run is the one that matters), also filtered and sorted.
test('both hours pages: no collapsing, no month groups, no charts, no horizontal scroll', async ({ page }) => {
  await signIn(page);
  const b = (await partners(page)).find((p) => p.name === 'Partner B')!;

  await page.goto('/hours');
  await expect(myHoursTable(page)).toBeVisible();
  await expectFlatNoCharts(page, 'my hours');
  await expectNoHorizontalScroll(page, 'my hours');

  await page.goto('/hours/totals');
  await expect(totalsTable(page)).toBeVisible();
  await expectFlatNoCharts(page, 'hours totals');
  await expectNoHorizontalScroll(page, 'hours totals');

  await totalsTable(page).getByRole('button', { name: 'Kommentti', exact: true }).click();
  await partnerFilter(page).selectOption({ label: b.name });
  await expect(page).toHaveURL(new RegExp(`partner=${b.id}`));
  await expectFlatNoCharts(page, 'hours totals (filtered)');
  await expectNoHorizontalScroll(page, 'hours totals (filtered, sorted by comment)');
});

