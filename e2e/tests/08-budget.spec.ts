import {
  api,
  editInline,
  expect,
  expectEscReverts,
  expectInvalidNotSent,
  expectNoEditSaveButtons,
  expectNoHorizontalScroll,
  fiInput,
  fiMoney,
  goNav,
  signIn,
  tagOf,
  test,
  trackWrites,
} from './helpers';
import { suffix } from './events';
import type { Locator, Page } from '@playwright/test';

// Seed rows of backend/seed/seed.example.json (synthetic), in seed order.
const SEED_ROWS = ['Category A', 'Category B', 'Category C', 'Category D', 'Category E', 'Category F', 'Category G', 'Category H', 'Category I'];
const ROW = 'Category A';
const MONEY_FIELDS_FI = ['Budjetti, kulut', 'Budjetti, tulot', 'Toteuma, kulut', 'Toteuma, tulot'];

/** The table row (phone: card) of a budget row, found by its inline name field. */
function budgetRow(page: Page, nameLabel: string, name: string): Locator {
  return page.getByRole('row').filter({ has: page.getByRole('textbox', { name: `${nameLabel}, ${name}`, exact: true }) });
}

// Flow 8: budget — edit a row; totals updated; copy to next year (UC-020). (The Year page with its
// budget figures was replaced by My gigs on 2026-11-08.)
// Each viewport uses its own empty years so the copy target is always empty (409 otherwise).
test('edit a budget row, copy it to the next year', async ({ page }, testInfo) => {
  const year = tagOf(testInfo) === 'M' ? 2030 : 2032;
  await signIn(page, undefined, { selectedYear: year });
  const rentExpense = 120000;
  const rentActual = 100000;

  const before = await api(page).get(`/years/${year}`);

  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'Omat keikat' })).toBeVisible();
  await goNav(page, 'Budjetti');
  await expect(page.getByRole('heading', { level: 1, name: `Budjetti ${year}` })).toBeVisible();
  await expectNoHorizontalScroll(page, 'budget');

  // Every name and money cell is an inline field: no per-row Edit/Save/Cancel (NFR-8). The only
  // buttons in the table are the per-row "Poista rivi <name>" buttons (UC-020 A4).
  const table = page.getByRole('table', { name: `Budjetti ${year}` });
  await expectNoEditSaveButtons(page.getByRole('main'), 'budget');
  const rowNames = table.getByRole('textbox', { name: /^Rivin nimi, / });
  const rowCount = await rowNames.count();
  expect(rowCount).toBeGreaterThanOrEqual(SEED_ROWS.length);
  await expect(table.getByRole('button')).toHaveCount(rowCount);
  await expect(table.getByRole('button', { name: /^Poista rivi / })).toHaveCount(rowCount);
  // Seed rows in seed order, every one with budget and actual cells (no actuals-only rows, AC-4).
  await expect(rowNames.first()).toHaveValue(SEED_ROWS[0]);
  for (const name of SEED_ROWS) {
    await expect(table.getByRole('textbox', { name: `Rivin nimi, ${name}`, exact: true })).toHaveValue(name);
    for (const field of MONEY_FIELDS_FI) {
      await expect(table.getByLabel(`${field}, ${name}`, { exact: true })).toBeEditable();
    }
  }
  const rentRow = budgetRow(page, 'Rivin nimi', ROW);
  const budgetCell = page.getByLabel(`Budjetti, kulut, ${ROW}`, { exact: true });
  const actualCell = page.getByLabel(`Toteuma, kulut, ${ROW}`, { exact: true });
  const totals = page.locator('tfoot .budget-totals');

  // Blur PUTs the whole row; Enter too. Totals and variance follow each save.
  expect(await editInline(page, budgetCell, fiInput(rentExpense), { method: 'PUT' })).toEqual({
    budgetExpenseCents: rentExpense,
    budgetIncomeCents: 0,
    actualExpenseCents: 0,
    actualIncomeCents: 0,
  });
  await expect(rentRow.locator('.budget-variance').first()).toHaveText(fiMoney(rentExpense));
  await expect(totals.locator('td').nth(0)).toHaveText(fiMoney(before.budget.budgetExpenseCents + rentExpense));
  expect(await editInline(page, actualCell, fiInput(rentActual), { commit: 'Enter', method: 'PUT' })).toEqual({
    budgetExpenseCents: rentExpense,
    budgetIncomeCents: 0,
    actualExpenseCents: rentActual,
    actualIncomeCents: 0,
  });
  await expect(rentRow.locator('.budget-variance').first()).toHaveText(fiMoney(rentExpense - rentActual));
  await expect(totals.locator('td').nth(0)).toHaveText(fiMoney(before.budget.budgetExpenseCents + rentExpense));
  await expect(totals.locator('td').nth(2)).toHaveText(fiMoney(before.budget.actualExpenseCents + rentActual));

  // Esc reverts; a negative amount shows the translated error and is not sent.
  await expectEscReverts(page, budgetCell, fiInput(990000), fiInput(rentExpense));
  await expectInvalidNotSent(page, actualCell, '-10', 'Summa ei voi olla negatiivinen.');
  await expectNoHorizontalScroll(page, 'budget with a field error');

  // Reload: the saved cells persisted, the invalid one was never sent.
  await page.reload();
  await expect(budgetCell).toHaveValue(fiInput(rentExpense));
  await expect(actualCell).toHaveValue(fiInput(rentActual));
  await expect(rentRow.locator('.budget-variance').first()).toHaveText(fiMoney(rentExpense - rentActual));
  await expect(totals.locator('td').nth(2)).toHaveText(fiMoney(before.budget.actualExpenseCents + rentActual));

  // The year figures (GET /api/years, still used by the backend) follow: year result (BR-063).
  const after = await api(page).get(`/years/${year}`);
  expect(after.budget.budgetExpenseCents).toBe(before.budget.budgetExpenseCents + rentExpense);
  expect(after.budget.actualExpenseCents).toBe(before.budget.actualExpenseCents + rentActual);
  expect(after.yearResultCents).toBe(before.yearResultCents - rentActual);

  // Next year, copy from the previous one: budget fields copied, actuals untouched.
  await page.getByRole('button', { name: 'Seuraava vuosi' }).click();
  await expect(page.getByRole('heading', { level: 1, name: `Budjetti ${year + 1}` })).toBeVisible();
  await expect(page.getByLabel(`Budjetti, kulut, ${ROW}`, { exact: true })).toHaveValue(fiInput(0));
  await page.getByRole('button', { name: 'Kopioi budjetti edellisestä vuodesta' }).click();
  await expect(page.getByRole('status').filter({ hasText: `Budjetti kopioitu vuodesta ${year}.` })).toBeVisible();
  await expect(page.getByLabel(`Budjetti, kulut, ${ROW}`, { exact: true })).toHaveValue(fiInput(rentExpense));
  await expect(page.getByLabel(`Toteuma, kulut, ${ROW}`, { exact: true })).toHaveValue(fiInput(0));

  // Copying again is refused: the year already has budget numbers.
  await page.getByRole('button', { name: 'Kopioi budjetti edellisestä vuodesta' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Vuodelle on jo budjettilukuja.' })).toBeVisible();

  const next = await api(page).get(`/budget?year=${year + 1}`);
  expect(next.totals.budgetExpenseCents).toBe(before.budget.budgetExpenseCents + rentExpense);
  expect(next.totals.actualExpenseCents).toBe(0);
});

// UC-020 A2–A4, E2: partners add, rename and remove budget rows. Each viewport uses its own empty
// years (M: 2044/2045, D: 2046/2047) and its own row names, so the runs never collide.
test('add, rename and remove a budget row; it follows in every year, the totals and the year figures', async ({
  page,
}, testInfo) => {
  const year = tagOf(testInfo) === 'M' ? 2044 : 2046;
  const tag = `${tagOf(testInfo)}-${suffix()}`;
  const name = `Row ${tag}`;
  const renamed = `Row ${tag} renamed`;
  const final = `Row ${tag} final`;
  const expense = 20000;
  const actual = 10000;
  await signIn(page, undefined, { selectedYear: year });
  const beforeYear = await api(page).get(`/years/${year}`);
  const beforeBudget = await api(page).get(`/budget?year=${year}`);
  const seedRowCount = beforeBudget.rows.length;

  await page.goto('/budget');
  await expect(page.getByRole('heading', { level: 1, name: `Budjetti ${year}` })).toBeVisible();
  const addField = page.getByRole('textbox', { name: 'Rivin nimi', exact: true });
  const addButton = page.getByRole('button', { name: 'Lisää rivi', exact: true });
  const nameField = (n: string) => page.getByRole('textbox', { name: `Rivin nimi, ${n}`, exact: true });
  const money = (field: string, n: string) => page.getByLabel(`${field}, ${n}`, { exact: true });
  const totals = page.locator('tfoot .budget-totals');
  const isAddRequest = (res: { request(): { method(): string }; url(): string }) =>
    res.request().method() === 'POST' && new URL(res.url()).pathname === '/api/budget-categories';

  // E2: empty name → REQUIRED under the field, nothing sent.
  {
    const writes = trackWrites(page);
    await addField.fill('   ');
    await addButton.click();
    await expect(addField).toHaveAttribute('aria-invalid', 'true');
    await expect(addField).toHaveAccessibleDescription('Pakollinen tieto.');
    await page.waitForTimeout(300);
    expect(writes, 'an empty name is not sent').toEqual([]);
  }

  // A2: add → POST 201 {id, name}; the row appears with zeros; the form clears.
  await addField.fill(name);
  const created = page.waitForResponse(isAddRequest);
  await addButton.click();
  const createdRes = await created;
  expect(createdRes.status()).toBe(201);
  const row = (await createdRes.json()) as { id: string; name: string };
  expect(row).toEqual({ id: expect.any(String), name });
  await expect(page.getByRole('status').filter({ hasText: `Rivi ${name} lisätty.` })).toBeVisible();
  await expect(addField).toHaveValue('');
  await expect(addField).not.toHaveAttribute('aria-invalid', 'true');
  await expect(nameField(name)).toHaveValue(name);
  for (const field of MONEY_FIELDS_FI) await expect(money(field, name)).toHaveValue(fiInput(0));
  await expect(page.getByRole('button', { name: `Poista rivi ${name}`, exact: true })).toBeVisible();
  await expectNoHorizontalScroll(page, 'budget with an added row');

  // E2: duplicate, case-insensitive and trimmed → "Nimi on jo käytössä.", nothing created.
  await addField.fill(`  ${name.toUpperCase()}  `);
  const duplicate = page.waitForResponse(isAddRequest);
  await addButton.click();
  const dupRes = await duplicate;
  expect(dupRes.status()).toBe(400);
  expect((await dupRes.json()).error.fields).toEqual({ name: 'DUPLICATE' });
  await expect(addField).toHaveAttribute('aria-invalid', 'true');
  await expect(addField).toHaveAccessibleDescription('Nimi on jo käytössä.');
  await expect(addField).toHaveValue(`  ${name.toUpperCase()}  `);
  const afterDup = await api(page).get('/reference');
  expect(
    afterDup.budgetCategories.filter((c: { name: string }) => c.name.toLowerCase() === name.toLowerCase()),
  ).toEqual([{ id: row.id, name }]);
  expect((await api(page).get(`/budget?year=${year}`)).rows).toHaveLength(seedRowCount + 1);
  await addField.fill('');

  // The new row is in every year, with zeros: the next year via the year selector.
  await page.getByRole('button', { name: 'Seuraava vuosi' }).click();
  await expect(page.getByRole('heading', { level: 1, name: `Budjetti ${year + 1}` })).toBeVisible();
  await expect(nameField(name)).toHaveValue(name);
  for (const field of MONEY_FIELDS_FI) await expect(money(field, name)).toHaveValue(fiInput(0));
  await page.getByRole('button', { name: 'Edellinen vuosi' }).click();
  await expect(page.getByRole('heading', { level: 1, name: `Budjetti ${year}` })).toBeVisible();

  // A3: rename in place. Blur → PATCH {name}; the money cell labels follow the new name.
  expect(await editInline(page, nameField(name), renamed, { method: 'PATCH' })).toEqual({ name: renamed });
  await expect(nameField(renamed)).toHaveValue(renamed);
  await expect(nameField(name)).toHaveCount(0);
  await expect(money('Budjetti, kulut', renamed)).toHaveValue(fiInput(0));
  await expect(money('Budjetti, kulut', name)).toHaveCount(0);
  await expect(page.getByRole('button', { name: `Poista rivi ${renamed}`, exact: true })).toBeVisible();
  // Esc reverts; an empty name is refused and not sent.
  await expectEscReverts(page, nameField(renamed), 'Something else', renamed);
  await expectInvalidNotSent(page, nameField(renamed), '', 'Pakollinen tieto.');
  // Renaming to another row's name (case-insensitive) is refused by the server: nothing changes.
  {
    const field = nameField(renamed);
    await field.click();
    await field.fill('category a');
    const res = page.waitForResponse((r) => r.request().method() === 'PATCH');
    await field.press('Enter');
    expect((await res).status()).toBe(400);
    await expect(field).toHaveAttribute('aria-invalid', 'true');
    await expect(field).toHaveAccessibleDescription(/Nimi on jo käytössä\./);
  }
  await page.reload();
  await expect(nameField(renamed)).toHaveValue(renamed);
  await expect(nameField('Category A')).toHaveValue('Category A');
  // Enter saves too; reload proves it persisted.
  expect(await editInline(page, nameField(renamed), final, { commit: 'Enter', method: 'PATCH' })).toEqual({
    name: final,
  });
  await page.reload();
  await expect(nameField(final)).toHaveValue(final);
  await expect(nameField(renamed)).toHaveCount(0);
  await expect(money('Toteuma, tulot', final)).toHaveValue(fiInput(0));
  expect((await api(page).get('/reference')).budgetCategories).toContainEqual({ id: row.id, name: final });

  // Values on the new row count in the totals (every row has budget and actual cells, AC-4).
  await editInline(page, money('Budjetti, kulut', final), fiInput(expense), { method: 'PUT' });
  expect(await editInline(page, money('Toteuma, kulut', final), fiInput(actual), { method: 'PUT' })).toEqual({
    budgetExpenseCents: expense,
    budgetIncomeCents: 0,
    actualExpenseCents: actual,
    actualIncomeCents: 0,
  });
  await expect(totals.locator('td').nth(0)).toHaveText(fiMoney(beforeBudget.totals.budgetExpenseCents + expense));
  await expect(totals.locator('td').nth(2)).toHaveText(fiMoney(beforeBudget.totals.actualExpenseCents + actual));

  // A4, Cancel: the dialog closes and the row stays; nothing is sent.
  const removeButton = page.getByRole('button', { name: `Poista rivi ${final}`, exact: true });
  const dialog = page.getByRole('dialog', { name: 'Poistetaanko rivi?' });
  {
    const writes = trackWrites(page);
    await removeButton.click();
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(`Rivi ${final} poistuu kaikilta vuosilta ja summista.`);
    await dialog.getByRole('button', { name: 'Peruuta', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await page.waitForTimeout(300);
    expect(writes, 'Cancel sends nothing').toEqual([]);
  }
  await expect(nameField(final)).toHaveValue(final);
  await expect(money('Budjetti, kulut', final)).toHaveValue(fiInput(expense));

  // A4, confirm: DELETE 204; the row is gone and the totals drop back.
  await removeButton.click();
  await expect(dialog).toBeVisible();
  const removed = page.waitForResponse((res) => res.request().method() === 'DELETE');
  await dialog.getByRole('button', { name: 'Poista', exact: true }).click();
  const removedRes = await removed;
  expect(new URL(removedRes.url()).pathname).toBe(`/api/budget-categories/${row.id}`);
  expect(removedRes.status()).toBe(204);
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('status').filter({ hasText: `Rivi ${final} poistettu.` })).toBeVisible();
  await expect(nameField(final)).toHaveCount(0);
  await expect(removeButton).toHaveCount(0);
  await expect(totals.locator('td').nth(0)).toHaveText(fiMoney(beforeBudget.totals.budgetExpenseCents));
  await expect(totals.locator('td').nth(2)).toHaveText(fiMoney(beforeBudget.totals.actualExpenseCents));
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: `Budjetti ${year}` })).toBeVisible();
  await expect(nameField('Category A')).toHaveValue('Category A');
  await expect(nameField(final)).toHaveCount(0);

  // Gone from the other year as well.
  await page.getByRole('button', { name: 'Seuraava vuosi' }).click();
  await expect(page.getByRole('heading', { level: 1, name: `Budjetti ${year + 1}` })).toBeVisible();
  await expect(nameField('Category A')).toHaveValue('Category A');
  await expect(nameField(final)).toHaveCount(0);
  await page.getByRole('button', { name: 'Edellinen vuosi' }).click();
  await expect(page.getByRole('heading', { level: 1, name: `Budjetti ${year}` })).toBeVisible();

  // API: excluded from reference, budget and year; its PUT / PATCH answer 404 NOT_FOUND.
  const ref = await api(page).get('/reference');
  expect(ref.budgetCategories.map((c: { id: string }) => c.id)).not.toContain(row.id);
  for (const y of [year, year + 1]) {
    const b = await api(page).get(`/budget?year=${y}`);
    expect(b.rows.map((r: { categoryId: string }) => r.categoryId)).not.toContain(row.id);
    expect(b.rows).toHaveLength(seedRowCount);
  }
  expect((await api(page).get(`/budget?year=${year}`)).totals).toEqual(beforeBudget.totals);
  const afterYear = await api(page).get(`/years/${year}`);
  expect(afterYear.budget).toEqual(beforeYear.budget);
  expect(afterYear.yearResultCents).toBe(beforeYear.yearResultCents);
  const put = await api(page).raw.put(`/api/budget/${year}/${row.id}`, {
    data: { budgetExpenseCents: 10000, budgetIncomeCents: 0, actualExpenseCents: 0, actualIncomeCents: 0 },
  });
  expect(put.status()).toBe(404);
  expect((await put.json()).error.code).toBe('NOT_FOUND');
  const patch = await api(page).raw.patch(`/api/budget-categories/${row.id}`, { data: { name: `Row ${tag} again` } });
  expect(patch.status()).toBe(404);
  expect((await patch.json()).error.code).toBe('NOT_FOUND');
});
