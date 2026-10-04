import { api, expect, expectNoHorizontalScroll, fiInput, fiMoney, goNav, pageHead, signIn, tagOf, test } from './helpers';

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

  await page.getByLabel('Budjetti, kulut, Vuokra').fill(fiInput(rentExpense));
  await page.getByLabel('Toteuma, kulut, Vuokra').fill(fiInput(rentActual));
  await page.getByRole('button', { name: 'Tallenna Vuokra' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Tallennettu: Vuokra.' })).toBeVisible();
  const rentRow = page.getByRole('row').filter({ has: page.getByRole('rowheader', { name: 'Vuokra' }) });
  await expect(rentRow.locator('.budget-variance').first()).toHaveText(fiMoney(rentExpense - rentActual));
  const totals = page.locator('tfoot .budget-totals');
  await expect(totals.locator('td').nth(0)).toHaveText(fiMoney(before.budget.budgetExpenseCents + rentExpense));
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
