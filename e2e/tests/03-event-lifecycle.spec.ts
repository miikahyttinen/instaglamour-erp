import {
  api,
  editInline,
  expect,
  expectEscReverts,
  expectInvalidNotSent,
  expectNoEditSaveButtons,
  expectNoHorizontalScroll,
  fiDate,
  fiInput,
  fiMoney,
  pageHead,
  signIn,
  tagOf,
  test,
} from './helpers';
import { createEventViaApi, eventListRows, suffix, totalPrice } from './events';

// Event info and price are edited in place (NFR-8): no Edit/Save buttons; blur or Enter saves one
// PATCH per field; Esc reverts; invalid values are not sent.
test('event basic info and price are edited in place; Esc and invalid values are not saved', async ({
  page,
}, testInfo) => {
  await signIn(page);
  const venue = `Venue ${tagOf(testInfo)}-${suffix()}`;
  const renamedVenue = `${venue} B`;
  const event = await createEventViaApi(page, { startDate: '2026-11-21', venue, priceCents: 100000 });

  await page.goto(`/gigs/${event.id}`);
  await expect(page.getByRole('heading', { level: 1, name: `${event.lineupName} · ${venue}` })).toBeVisible();
  await expectNoEditSaveButtons(page.getByRole('main'), 'event page');

  const venueField = page.getByLabel('Paikka', { exact: true });
  const lineupField = page.getByLabel('Kokoonpanon nimi', { exact: true });
  const price = page.getByLabel('Hinta (alv 0 %)', { exact: true });
  await expect(venueField).toHaveValue(venue);
  await expect(lineupField).toHaveValue(event.lineupName);
  await expect(price).toHaveValue(fiInput(100000));

  // Text field, Enter saves: one PATCH with just that field; the heading follows.
  const body = await editInline(page, venueField, renamedVenue, { commit: 'Enter' });
  expect(body).toEqual({ venue: renamedVenue });
  await expect(page.getByRole('heading', { level: 1, name: `${event.lineupName} · ${renamedVenue}` })).toBeVisible();

  // Esc reverts without saving (text and money field).
  await expectEscReverts(page, lineupField, 'Synthetic lineup', event.lineupName);
  await expectEscReverts(page, price, fiInput(900000), fiInput(100000));

  // Invalid values show the translated error under the field and are not sent.
  await expectInvalidNotSent(page, price, '-100', 'Summa ei voi olla negatiivinen.');
  await expectInvalidNotSent(page, lineupField, '', 'Pakollinen tieto.');
  await expectNoHorizontalScroll(page, 'event page with field errors');

  // Reload: the saved venue persisted; the reverted and invalid values never reached the backend.
  await page.reload();
  await expect(venueField).toHaveValue(renamedVenue);
  await expect(lineupField).toHaveValue(event.lineupName);
  await expect(price).toHaveValue(fiInput(100000));
  await expect(price).not.toHaveAttribute('aria-invalid', 'true');
  const saved = await api(page).get(`/events/${event.id}`);
  expect(saved.venue).toBe(renamedVenue);
  expect(saved.lineupName).toBe(event.lineupName);
  expect(saved.priceCents).toBe(100000);
});

// Flow 3: edit price and additional sales; move; cancel (adjust price); uncancel; delete and
// restore; history shows the events (UC-007, UC-009, UC-010, UC-012, UC-013, UC-025).
test('edit price, move, cancel, uncancel, delete, restore — all in history', async ({ page }, testInfo) => {
  await signIn(page);
  const tag = tagOf(testInfo);
  const venue = `Venue ${tag}-${suffix()}`;
  const startDate = tag === 'M' ? '2026-11-02' : '2026-11-09';
  const movedTo = tag === 'M' ? '2026-11-03' : '2026-11-10';
  const event = await createEventViaApi(page, { startDate, venue, priceCents: 100000 });
  const title = `${event.lineupName} · ${venue}`;

  await page.goto(`/gigs/${event.id}`);
  await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();

  // Edit price and additional sales in place (UC-007): each field saves on its own.
  const price = page.getByLabel('Hinta (alv 0 %)', { exact: true });
  const extra = page.getByLabel('Lisämyynti', { exact: true });
  const extraDescription = page.getByLabel('Lisämyynnin kuvaus', { exact: true });
  expect(await editInline(page, price, fiInput(200000))).toEqual({ priceCents: 200000 });
  await expect(totalPrice(page)).toContainText(fiMoney(200000));
  expect(await editInline(page, extra, fiInput(10000), { commit: 'Enter' })).toEqual({ additionalSalesCents: 10000 });
  expect(await editInline(page, extraDescription, 'Extra set')).toEqual({ additionalSalesDescription: 'Extra set' });
  await expect(totalPrice(page)).toContainText(fiMoney(210000));
  await page.reload();
  await expect(price).toHaveValue(fiInput(200000));
  await expect(extra).toHaveValue(fiInput(10000));
  await expect(extraDescription).toHaveValue('Extra set');
  await expect(totalPrice(page)).toContainText(fiMoney(210000));

  // Move (UC-009).
  await page.getByRole('group', { name: 'Toiminnot' }).getByRole('button', { name: 'Siirrä' }).click();
  const moveDialog = page.getByRole('dialog', { name: 'Siirrä keikka' });
  await moveDialog.getByLabel('Uusi alkupäivä').fill(movedTo);
  await moveDialog.getByLabel('Syy (valinnainen)').fill('Synthetic reason');
  await moveDialog.getByRole('button', { name: 'Siirrä' }).click();
  await expect(moveDialog).toBeHidden();
  await expect(page.locator('.event-header-date')).toHaveText(fiDate(movedTo));
  await expect(page.getByRole('status').filter({ hasText: 'Keikka siirretty.' })).toBeVisible();

  // Cancel, then adjust the price as the reminder suggests (UC-010).
  await page.getByRole('group', { name: 'Toiminnot' }).getByRole('button', { name: 'Peru keikka' }).click();
  const cancelDialog = page.getByRole('dialog', { name: 'Peru keikka' });
  await expect(cancelDialog.getByRole('button', { name: 'Peru keikka' })).toBeDisabled();
  await cancelDialog.getByLabel('Syy').fill('Synthetic reason');
  await cancelDialog.getByRole('button', { name: 'Peru keikka' }).click();
  await expect(cancelDialog).toBeHidden();
  await expect(pageHead(page)).toContainText('Peruttu');
  await expect(page.getByRole('status').filter({ hasText: 'Keikka on peruttu.' })).toBeVisible();
  // Price stays editable in place on a cancelled event (UC-010).
  await expectNoEditSaveButtons(page.getByRole('main'), 'cancelled event');
  await editInline(page, price, fiInput(10000));
  await editInline(page, extra, fiInput(0));
  await expect(totalPrice(page)).toContainText(fiMoney(10000));
  await page.reload();
  await expect(price).toHaveValue(fiInput(10000));
  await expect(extra).toHaveValue(fiInput(0));
  await expect(totalPrice(page)).toContainText(fiMoney(10000));
  await expectNoHorizontalScroll(page, 'cancelled event');

  // Uncancel (UC-012).
  await page.getByRole('group', { name: 'Toiminnot' }).getByRole('button', { name: 'Palauta myydyksi' }).click();
  const uncancelDialog = page.getByRole('dialog', { name: 'Palauta keikka myydyksi' });
  await uncancelDialog.getByLabel('Syy').fill('Synthetic reason');
  await uncancelDialog.getByRole('button', { name: 'Palauta myydyksi' }).click();
  await expect(uncancelDialog).toBeHidden();
  await expect(page.getByRole('status').filter({ hasText: 'Keikka palautettu myydyksi.' })).toBeVisible();
  await expect(pageHead(page)).toContainText('Myyty');
  await expect(pageHead(page)).not.toContainText('Peruttu');

  // Delete (UC-025) → lands on the event list with a notice; the event is in the deleted view.
  await page.getByRole('group', { name: 'Toiminnot' }).getByRole('button', { name: 'Poista keikka' }).click();
  const deleteDialog = page.getByRole('dialog', { name: 'Poista keikka' });
  await deleteDialog.getByLabel('Syy').fill('Synthetic reason');
  await deleteDialog.getByRole('button', { name: 'Poista keikka' }).click();
  await expect(page).toHaveURL(/\/gigs$/);
  await expect(page.getByRole('status').filter({ hasText: 'Keikka poistettu.' })).toBeVisible();
  await expect(eventListRows(page).first()).toBeVisible(); // the list has loaded (table or cards)
  await expect(page.getByRole('link', { name: title })).toHaveCount(0);

  await page.getByRole('button', { name: 'Poistetut' }).click();
  const deletedList = page.getByRole('list', { name: 'Poistetut' });
  await expect(deletedList.getByRole('link', { name: title })).toBeVisible();
  await expectNoHorizontalScroll(page, 'deleted events view');
  await deletedList.getByRole('button', { name: `Palauta: ${title}` }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Keikka palautettu:' })).toBeVisible();
  await expect(deletedList.getByRole('link', { name: title })).toHaveCount(0);

  // Back in the active list, then the history shows every event, newest first (UC-013).
  await page.getByRole('button', { name: 'Keikat', exact: true }).click();
  await page.getByRole('link', { name: title }).click();
  await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
  // Inline editing sends one PATCH per field, so each saved field is its own "updated" event:
  // 3 before the move (price, additional sales, description), 2 after cancelling (price, sales).
  const history = page.getByRole('list', { name: 'Muutoshistoria' }).locator('.history-title strong');
  await expect(history).toHaveText([
    'Palautettu poistosta',
    'Poistettu',
    'Palautettu myydyksi',
    'Tietoja muutettu',
    'Tietoja muutettu',
    'Peruttu',
    'Siirretty',
    'Tietoja muutettu',
    'Tietoja muutettu',
    'Tietoja muutettu',
    'Keikka luotu',
  ]);
  const events = await api(page).get(`/events/${event.id}/history`);
  expect(events.map((e: { type: string }) => e.type)).toEqual([
    'RESTORED',
    'DELETED',
    'UNCANCELLED',
    'UPDATED',
    'UPDATED',
    'CANCELLED',
    'MOVED',
    'UPDATED',
    'UPDATED',
    'UPDATED',
    'CREATED',
  ]);
  await expect(page.getByRole('list', { name: 'Muutoshistoria' })).toContainText('Syy: Synthetic reason');
  await expectNoHorizontalScroll(page, 'event history');
});
