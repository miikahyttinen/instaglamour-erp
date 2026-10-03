import type { Locator, Page } from '@playwright/test';
import { api, expect, expectNoHorizontalScroll, fiInput, fiMoney, goNav, SEED, signIn, tagOf, test } from './helpers';
import { suffix } from './gigs';

function costLine(page: Page, label: string): Locator {
  return page.getByRole('list', { name: 'Kulut ja miehitys' }).getByRole('listitem', { name: label, exact: true });
}

function econRow(page: Page, header: string): Locator {
  return page.locator('table.econ-table tr', { has: page.getByRole('rowheader', { name: header, exact: true }) });
}

// Flow 2: create gig from a template → cost lines → assign a person → load-in switch → mark paid →
// economics update (UC-002, UC-005).
test('create a gig from a template, staff it, switch load-in, mark paid', async ({ page }, testInfo) => {
  await signIn(page);
  const tag = tagOf(testInfo);
  const venue = `Venue ${tag}-${suffix()}`;
  const startDate = tag === 'M' ? '2026-12-01' : '2026-12-08';
  const priceCents = 100000;
  const fee = SEED.templateB.roleFeeCents;
  const internal = SEED.internalFeeCents;
  const budgeted = 3 * fee + 3 * internal;

  await page.goto('/');
  await goNav(page, 'Keikat');
  await page.getByRole('link', { name: 'Uusi keikka' }).first().click();
  await expect(page.getByRole('heading', { level: 1, name: 'Uusi keikka' })).toBeVisible();
  await expectNoHorizontalScroll(page, 'new gig');

  await page.getByLabel('Alkupäivä').fill(startDate);
  await page.getByLabel('Kokoonpano', { exact: true }).selectOption({ label: SEED.templateB.name });
  await page.getByLabel('Paikka').fill(venue);
  await page.getByLabel('Hinta (alv 0 %)').fill(fiInput(priceCents));
  await expect(page.locator('.total-line')).toContainText(fiMoney(priceCents));
  await page.getByRole('button', { name: 'Luo keikka' }).click();

  // Gig page with the template's cost lines (BR-020) plus office/sales/production (BR-021).
  await expect(page.getByRole('heading', { level: 1, name: `${SEED.templateB.name} · ${venue}` })).toBeVisible();
  const lines = page.getByRole('list', { name: 'Kulut ja miehitys' }).getByRole('listitem');
  await expect(lines).toHaveCount(6);
  for (const label of ['Laulu', 'Kitara', 'DJ', 'Toimisto', 'Myynti', 'Tuotanto']) {
    await expect(costLine(page, label)).toBeVisible();
  }
  await expect(econRow(page, 'Kulut').locator('td').nth(0)).toHaveText(fiMoney(budgeted));
  await expect(econRow(page, 'Kulut').locator('td').nth(1)).toHaveText(fiMoney(0));
  await expect(page.getByRole('note').filter({ hasText: 'Miehitys kesken' })).toBeVisible();
  await expectNoHorizontalScroll(page, 'gig page');

  // Assign a person to the vocals line.
  const voc = costLine(page, 'Laulu');
  await voc.getByLabel('Henkilö: Laulu').selectOption({ label: 'Person 8' });
  await expect(voc.getByLabel('Henkilö: Laulu')).toHaveValue(/.+/);
  await expect(voc.getByLabel('Henkilö: Laulu').locator('option:checked')).toHaveText('Person 8');

  // Load-in switch off: budget minus the load-in deduction (BR-026).
  const loadIn = voc.getByRole('switch', { name: 'Roudaus ja soundcheck' });
  await expect(loadIn).toBeChecked();
  // Controlled switch: it flips after the server answers, so click and wait (uncheck() would fail).
  await loadIn.click();
  await expect(loadIn).not.toBeChecked();
  const vocBudget = fee - SEED.loadInDeductionCents;
  await expect(voc.locator('.cost-budget strong')).toHaveText(fiMoney(vocBudget));
  await expect(econRow(page, 'Kulut').locator('td').nth(0)).toHaveText(
    fiMoney(budgeted - SEED.loadInDeductionCents),
  );

  // Mark paid with the default amount (= budgeted).
  await voc.getByRole('button', { name: 'Merkitse maksetuksi' }).click();
  await expect(voc.getByLabel('Maksettu summa')).toHaveValue(fiInput(vocBudget));
  await voc.getByRole('button', { name: 'Merkitse maksetuksi' }).click();
  await expect(voc.locator('.paid-info')).toContainText(`Maksettu ${fiMoney(vocBudget)}`);
  await expect(voc.locator('.paid-info')).toContainText('Partner A');

  // Economics update: actual costs and actual margin.
  await expect(econRow(page, 'Kulut').locator('td').nth(1)).toHaveText(fiMoney(vocBudget));
  await expect(econRow(page, 'Kate').locator('td').nth(0)).toHaveText(
    fiMoney(priceCents - (budgeted - SEED.loadInDeductionCents)),
  );
  await expect(econRow(page, 'Kate').locator('td').nth(1)).toHaveText(fiMoney(priceCents - vocBudget));

  // The backend agrees with what the page shows.
  const id = page.url().split('/').pop() ?? '';
  const gig = await api(page).get(`/gigs/${id}`);
  expect(gig.actualCostsCents).toBe(vocBudget);
  expect(gig.budgetedCostsCents).toBe(budgeted - SEED.loadInDeductionCents);
  const vocLine = gig.costLines.find((l: { type: string }) => l.type === 'VOC');
  expect(vocLine.joinsLoadIn).toBe(false);
  expect(vocLine.loadInDeductionAppliedCents).toBe(SEED.loadInDeductionCents);
  expect(vocLine.paidAt).not.toBeNull();

  // The history logged the cost events.
  const history = page.getByRole('list', { name: 'Muutoshistoria' });
  await expect(history.getByText('Merkitty maksetuksi')).toBeVisible();
  await expect(history.getByText('Kuluriviä muutettu').first()).toBeVisible();
  await expect(history.getByText('Keikka luotu')).toBeVisible();
  await expectNoHorizontalScroll(page, 'gig page after edits');
});
