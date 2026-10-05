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
  pageHead,
  signIn,
  tagOf,
  test,
} from './helpers';

// Flow 8: budget — edit a row; year page budget / year result updated; copy to next year (UC-020, UC-022).
// Each viewport uses its own empty years so the copy target is always empty (409 otherwise).
test('edit a budget row, see it on the year page, copy it to the next year', async ({ page }, testInfo) => {
  const year = tagOf(testInfo) === 'M' ? 2030 : 2032;
  await signIn(page, undefined, { selectedYear: year });
  const rentExpense = 120000;
  const rentActual = 100000;

  const before = await api(page).get(`/years/${year}`);

  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: `Vuosi ${year}` })).toBeVisible();
  await goNav(page, 'Budjetti');
  await expect(page.getByRole('heading', { level: 1, name: `Budjetti ${year}` })).toBeVisible();
  await expectNoHorizontalScroll(page, 'budget');

  // Every money cell is an inline field: no per-row Save/Cancel, no actions column (NFR-8).
  const table = page.getByRole('table', { name: `Budjetti ${year}` });
  await expectNoEditSaveButtons(page.getByRole('main'), 'budget');
  await expect(table.getByRole('button')).toHaveCount(0);
  const rentRow = page.getByRole('row').filter({ has: page.getByRole('rowheader', { name: 'Vuokra' }) });
  const budgetCell = page.getByLabel('Budjetti, kulut, Vuokra', { exact: true });
  const actualCell = page.getByLabel('Toteuma, kulut, Vuokra', { exact: true });
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

  // Year page: budget table and year result (BR-063).
  await goNav(page, 'Vuosi');
  const budget = page.getByRole('region', { name: 'Budjetti' });
  const expenseRow = budget.getByRole('row', { name: /^Kulut/ });
  await expect(expenseRow.getByRole('cell').nth(0)).toHaveText(fiMoney(before.budget.budgetExpenseCents + rentExpense));
  await expect(expenseRow.getByRole('cell').nth(1)).toHaveText(fiMoney(before.budget.actualExpenseCents + rentActual));
  // The year result is emphasised in the page head (TASK-113) and links to the budget.
  await expect(
    pageHead(page).getByRole('link', { name: `Vuoden tulos ${fiMoney(before.yearResultCents - rentActual)}` }),
  ).toBeVisible();

  // Next year, copy from the previous one: budget fields copied, actuals untouched.
  await page.getByRole('button', { name: 'Seuraava vuosi' }).click();
  await expect(page.getByRole('heading', { level: 1, name: `Vuosi ${year + 1}` })).toBeVisible();
  await goNav(page, 'Budjetti');
  await expect(page.getByRole('heading', { level: 1, name: `Budjetti ${year + 1}` })).toBeVisible();
  await expect(page.getByLabel('Budjetti, kulut, Vuokra')).toHaveValue(fiInput(0));
  await page.getByRole('button', { name: 'Kopioi budjetti edellisestä vuodesta' }).click();
  await expect(page.getByRole('status').filter({ hasText: `Budjetti kopioitu vuodesta ${year}.` })).toBeVisible();
  await expect(page.getByLabel('Budjetti, kulut, Vuokra')).toHaveValue(fiInput(rentExpense));
  await expect(page.getByLabel('Toteuma, kulut, Vuokra')).toHaveValue(fiInput(0));

  // Copying again is refused: the year already has budget numbers.
  await page.getByRole('button', { name: 'Kopioi budjetti edellisestä vuodesta' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Vuodelle on jo budjettilukuja.' })).toBeVisible();

  const next = await api(page).get(`/budget?year=${year + 1}`);
  expect(next.totals.budgetExpenseCents).toBe(before.budget.budgetExpenseCents + rentExpense);
  expect(next.totals.actualExpenseCents).toBe(0);
});
