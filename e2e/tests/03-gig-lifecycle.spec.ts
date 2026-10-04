import { api, expect, expectNoHorizontalScroll, fiDate, fiInput, fiMoney, pageHead, signIn, tagOf, test } from './helpers';
import { createGigViaApi, gigListRows, infoValue as priceValue, suffix, totalPriceLine } from './gigs';

// Flow 3: edit price and additional sales; move; cancel (adjust price); uncancel; delete and
// restore; history shows the events (UC-007, UC-009, UC-010, UC-012, UC-013, UC-025).
test('edit price, move, cancel, uncancel, delete, restore — all in history', async ({ page }, testInfo) => {
  await signIn(page);
  const tag = tagOf(testInfo);
  const venue = `Venue ${tag}-${suffix()}`;
  const startDate = tag === 'M' ? '2026-11-02' : '2026-11-09';
  const movedTo = tag === 'M' ? '2026-11-03' : '2026-11-10';
  const gig = await createGigViaApi(page, { startDate, venue, priceCents: 100000 });
  const title = `${gig.lineupName} · ${venue}`;

  await page.goto(`/gigs/${gig.id}`);
  await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();

  // Edit price and additional sales (UC-007).
  await page.getByRole('button', { name: 'Muokkaa hintaa ja lisämyyntiä' }).click();
  await page.getByLabel('Hinta (alv 0 %)').fill(fiInput(200000));
  await page.getByLabel('Lisämyynti', { exact: true }).fill(fiInput(10000));
  await page.getByLabel('Lisämyynnin kuvaus').fill('Extra set');
  await expect(totalPriceLine(page)).toContainText(fiMoney(210000));
  await page.getByRole('button', { name: 'Tallenna' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Muutokset tallennettu.' })).toBeVisible();
  await expect(priceValue(page, 'Hinta (alv 0 %)')).toHaveText(fiMoney(200000));
  await expect(priceValue(page, 'Lisämyynti')).toHaveText(fiMoney(10000));
  await expect(priceValue(page, 'Kokonaishinta')).toHaveText(fiMoney(210000));

  // Move (UC-009).
  await page.getByRole('group', { name: 'Toiminnot' }).getByRole('button', { name: 'Siirrä' }).click();
  const moveDialog = page.getByRole('dialog', { name: 'Siirrä keikka' });
  await moveDialog.getByLabel('Uusi alkupäivä').fill(movedTo);
  await moveDialog.getByLabel('Syy (valinnainen)').fill('Synthetic reason');
  await moveDialog.getByRole('button', { name: 'Siirrä' }).click();
  await expect(moveDialog).toBeHidden();
  await expect(page.locator('.gig-header-date')).toHaveText(fiDate(movedTo));
  await expect(page.getByRole('status').filter({ hasText: 'Keikka siirretty.' })).toBeVisible();

  // Cancel, then adjust the price as the reminder suggests (UC-010).
  await page.getByRole('group', { name: 'Toiminnot' }).getByRole('button', { name: 'Peru keikka' }).click();
  const cancelDialog = page.getByRole('dialog', { name: 'Peru keikka' });
  await expect(cancelDialog.getByRole('button', { name: 'Peru keikka' })).toBeDisabled();
  await cancelDialog.getByLabel('Syy').fill('Synthetic reason');
  await cancelDialog.getByRole('button', { name: 'Peru keikka' }).click();
  await expect(cancelDialog).toBeHidden();
  await expect(pageHead(page)).toContainText('Peruttu');
  await page.getByRole('button', { name: 'Muokkaa hintaa', exact: true }).click();
  await page.getByLabel('Hinta (alv 0 %)').fill(fiInput(10000));
  await page.getByLabel('Lisämyynti', { exact: true }).fill(fiInput(0));
  await page.getByRole('button', { name: 'Tallenna' }).click();
  await expect(priceValue(page, 'Kokonaishinta')).toHaveText(fiMoney(10000));
  await expectNoHorizontalScroll(page, 'cancelled gig');

  // Uncancel (UC-012).
  await page.getByRole('group', { name: 'Toiminnot' }).getByRole('button', { name: 'Palauta myydyksi' }).click();
  const uncancelDialog = page.getByRole('dialog', { name: 'Palauta keikka myydyksi' });
  await uncancelDialog.getByLabel('Syy').fill('Synthetic reason');
  await uncancelDialog.getByRole('button', { name: 'Palauta myydyksi' }).click();
  await expect(uncancelDialog).toBeHidden();
  await expect(page.getByRole('status').filter({ hasText: 'Keikka palautettu myydyksi.' })).toBeVisible();
  await expect(pageHead(page)).toContainText('Myyty');
  await expect(pageHead(page)).not.toContainText('Peruttu');

  // Delete (UC-025) → lands on the gig list with a notice; the gig is in the deleted view.
  await page.getByRole('group', { name: 'Toiminnot' }).getByRole('button', { name: 'Poista keikka' }).click();
  const deleteDialog = page.getByRole('dialog', { name: 'Poista keikka' });
  await deleteDialog.getByLabel('Syy').fill('Synthetic reason');
  await deleteDialog.getByRole('button', { name: 'Poista keikka' }).click();
  await expect(page).toHaveURL(/\/gigs$/);
  await expect(page.getByRole('status').filter({ hasText: 'Keikka poistettu.' })).toBeVisible();
  await expect(gigListRows(page).first()).toBeVisible(); // the list has loaded (table or cards)
  await expect(page.getByRole('link', { name: title })).toHaveCount(0);

  await page.getByRole('button', { name: 'Poistetut' }).click();
  const deletedList = page.getByRole('list', { name: 'Poistetut' });
  await expect(deletedList.getByRole('link', { name: title })).toBeVisible();
  await expectNoHorizontalScroll(page, 'deleted gigs view');
  await deletedList.getByRole('button', { name: `Palauta: ${title}` }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Keikka palautettu:' })).toBeVisible();
  await expect(deletedList.getByRole('link', { name: title })).toHaveCount(0);

  // Back in the active list, then the history shows every event, newest first (UC-013).
  await page.getByRole('button', { name: 'Keikat', exact: true }).click();
  await page.getByRole('link', { name: title }).click();
  await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
  const history = page.getByRole('list', { name: 'Muutoshistoria' }).locator('.history-title strong');
  await expect(history).toHaveText([
    'Palautettu poistosta',
    'Poistettu',
    'Palautettu myydyksi',
    'Tietoja muutettu',
    'Peruttu',
    'Siirretty',
    'Tietoja muutettu',
    'Keikka luotu',
  ]);
  const events = await api(page).get(`/gigs/${gig.id}/history`);
  expect(events.map((e: { type: string }) => e.type)).toEqual([
    'RESTORED',
    'DELETED',
    'UNCANCELLED',
    'UPDATED',
    'CANCELLED',
    'MOVED',
    'UPDATED',
    'CREATED',
  ]);
  await expect(page.getByRole('list', { name: 'Muutoshistoria' })).toContainText('Syy: Synthetic reason');
  await expectNoHorizontalScroll(page, 'gig history');
});
