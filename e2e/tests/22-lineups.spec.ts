import type { Page } from '@playwright/test';
import { api, expect, expectNoHorizontalScroll, fiInput, fiMoney, goNav, signIn, tagOf, test } from './helpers';
import { costField, costLine, costLines, econTile, suffix } from './events';

// Settings → Lineups (TASK-186, contract "Lineups and settings page"): create a lineup with lines
// of any cost type, then create a gig from it. Synthetic names and amounts only (BR-090).

function linesTable(page: Page) {
  return page.getByRole('table', { name: 'Kokoonpanon rivit' });
}

/** Adds one line through the draft row; it saves when the focus leaves the row. */
async function addLine(page: Page, type: string, amountCents: number, description?: string) {
  await page.getByRole('button', { name: 'Lisää rivi' }).click();
  const draft = linesTable(page).getByRole('row', { name: 'Uusi rivi', exact: true });
  await draft.getByLabel('Tyyppi: Uusi rivi', { exact: true }).selectOption({ label: type });
  if (description) await draft.getByLabel('Kuvaus: Uusi rivi', { exact: true }).fill(description);
  await draft.getByLabel('Oletussumma: Uusi rivi', { exact: true }).fill(fiInput(amountCents));
  const saved = page.waitForResponse(
    (r) => r.request().method() === 'PATCH' && r.url().includes('/api/lineup-templates/') && r.ok(),
  );
  await page.getByRole('heading', { level: 1 }).click(); // focus leaves the row → saved
  await saved;
  await expect(draft).toHaveCount(0);
}

test('create a lineup in Settings, then a gig from it gets its lines and amounts', async ({ page }, testInfo) => {
  await signIn(page);
  const tag = tagOf(testInfo);
  const name = `Lineup ${tag}-${suffix()}`;
  const venue = `Venue ${tag}-${suffix()}`;

  // Menu → Settings opens the Lineups tab.
  await page.goto('/');
  await goNav(page, 'Asetukset');
  await expect(page).toHaveURL((url) => url.pathname === '/settings/lineups');
  await expect(page.getByRole('heading', { level: 1, name: 'Asetukset' })).toBeVisible();
  await expect(page.getByRole('table', { name: 'Kokoonpanot' })).toBeVisible();
  await expectNoHorizontalScroll(page, 'lineup list');

  // New lineup: name inline, created and opened.
  await page.getByRole('button', { name: 'Uusi kokoonpano' }).click();
  await page.getByLabel('Uuden kokoonpanon nimi').fill(name);
  await page.getByRole('button', { name: 'Luo', exact: true }).click();
  await expect(page.getByLabel('Nimi', { exact: true })).toHaveValue(name);
  await expect(page.getByText('Ei rivejä.')).toBeVisible();

  // Lines of any type, in the user's order.
  await addLine(page, 'Basso', 20000);
  await addLine(page, 'Muu kulu', 3000, 'Stage');
  await addLine(page, 'Myynti', 1500);
  const rows = linesTable(page).getByRole('row').filter({ has: page.getByRole('cell') });
  await expect(rows).toHaveCount(3);
  await expect(page.locator('.lineup-total dd')).toHaveText(fiMoney(24500));
  await expectNoHorizontalScroll(page, 'lineup editor');

  // Move Myynti up one: order follows the user.
  await linesTable(page).getByRole('button', { name: 'Siirrä ylös: Myynti' }).click();
  await expect(rows.nth(1)).toHaveAttribute('aria-label', 'Myynti');

  const lineups = (await api(page).get('/lineup-templates')) as { name: string; lines: { type: string }[] }[];
  expect(lineups.find((l) => l.name === name)!.lines.map((l) => l.type)).toEqual(['BASS', 'SALES', 'OTHER']);

  // New gig from the lineup: preview under the select; lines in order, PRODUCTION added at 0 €.
  await goNav(page, 'Keikat');
  await page.getByRole('link', { name: 'Uusi keikka' }).first().click();
  await page.getByLabel('Alkupäivä').fill(tag === 'M' ? '2026-12-14' : '2026-12-15');
  await page.getByLabel('Kokoonpano', { exact: true }).selectOption({ label: name });
  await expect(page.getByText(`3 riviä, oletussummat yhteensä ${fiMoney(24500)}`)).toBeVisible();
  await page.getByLabel('Paikka').fill(venue);
  await page.getByLabel('Hinta (alv 0 %)').fill(fiInput(100000));
  await page.getByRole('button', { name: 'Luo keikka' }).click();

  await expect(page.getByRole('heading', { level: 1, name: `${name} · ${venue}` })).toBeVisible();
  await expect(costLines(page)).toHaveCount(4);
  for (const label of ['Basso', 'Myynti', 'Muu kulu (Stage)', 'Tuotanto']) {
    await expect(costLine(page, label)).toBeVisible();
  }
  await expect(costField(page, 'Budjetti', 'Basso')).toHaveValue(fiInput(20000));
  await expect(costField(page, 'Budjetti', 'Myynti')).toHaveValue(fiInput(1500));
  await expect(costField(page, 'Budjetti', 'Tuotanto')).toHaveValue(fiInput(0));
  await expect(econTile(page, 'Kulut').budget).toHaveText(fiMoney(24500));

  // The lineup now has a gig: it can be deactivated but not deleted.
  await goNav(page, 'Asetukset');
  await page.getByRole('table', { name: 'Kokoonpanot' }).getByRole('link', { name, exact: true }).click();
  await expect(page.getByText('Keikkoja: 1')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Poista kokoonpano' })).toHaveCount(0);
  const active = page.getByRole('switch', { name: 'Käytössä' });
  await active.click();
  await expect(active).not.toBeChecked();
});

test('the old data import URL opens the Settings → Data import tab', async ({ page }) => {
  await signIn(page);
  await page.goto('/import');
  await expect(page).toHaveURL((url) => url.pathname === '/settings/import');
  await expect(page.getByRole('heading', { level: 1, name: 'Asetukset' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Tietojen tuonti' })).toHaveAttribute('aria-current', 'page');
});

test('references live in Settings → Referenssit; the Offers page has no References button', async ({ page }) => {
  await signIn(page);
  await page.goto('/offers');
  await expect(page.getByRole('heading', { level: 1, name: 'Tarjoukset' })).toBeVisible();
  await expect(page.getByRole('main').getByRole('link', { name: 'Referenssit' })).toHaveCount(0);

  // The old URL redirects to the settings tab.
  await page.goto('/offers/references');
  await expect(page).toHaveURL((url) => url.pathname === '/settings/references');
  await expect(page.getByRole('heading', { level: 1, name: 'Asetukset' })).toBeVisible();
  const tabs = page.getByRole('navigation', { name: 'Asetusten osiot' });
  await expect(tabs.getByRole('link', { name: 'Referenssit' })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('heading', { level: 2, name: 'Referenssit' })).toBeAttached();
  await expect(page.getByRole('heading', { level: 2, name: 'Uusi referenssi' })).toBeVisible();
});
