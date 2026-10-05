import {
  api,
  CURRENT_YEAR,
  editInline,
  expect,
  expectEscReverts,
  expectInvalidNotSent,
  expectNoEditSaveButtons,
  expectNoHorizontalScroll,
  fiDate,
  fiHours,
  goNav,
  signIn,
  tagOf,
  test,
} from './helpers';
import { suffix } from './gigs';
import { partnerFilter, tableTotal, totalsTable } from './hours';

interface Totals {
  partners: { partnerId: string; months: number[]; total: number }[];
  grandTotal: number;
}

interface HourEntry {
  id: string;
  date: string;
  comment: string;
  hours: number;
}

// Flow 7: hours — add own entry; totals page shows it; year page hours updated (UC-018, UC-019, UC-022).
test('log own hours and see them in totals and on the year page', async ({ page }, testInfo) => {
  const me = await signIn(page);
  const comment = `Synthetic work ${tagOf(testInfo)}-${suffix()}`;
  const added = 1.5;

  const before = (await api(page).get(`/hours/totals?year=${CURRENT_YEAR}`)) as Totals;
  const mineBefore = before.partners.find((p) => p.partnerId === me.id)?.total ?? 0;
  const entriesBefore = (await api(page).get(`/hours?year=${CURRENT_YEAR}`)) as { hours: number }[];
  const ownBefore = entriesBefore.reduce((sum, e) => sum + e.hours, 0);

  await page.goto('/');
  await goNav(page, 'Tunnit');
  await expect(page.getByRole('heading', { level: 1, name: `Tunnit ${CURRENT_YEAR}` })).toBeVisible();
  await expect(page.getByTestId('hours-year-total')).toHaveText(fiHours(ownBefore));
  await expectNoHorizontalScroll(page, 'my hours');

  await page.getByRole('button', { name: 'Lisää tunnit' }).click();
  const dialog = page.getByRole('dialog', { name: 'Uusi tuntikirjaus' });
  // Date defaults to today (in the selected year for this suite).
  const dateField = dialog.getByLabel('Päivämäärä');
  await expect(dateField).toHaveValue(new RegExp(`^${CURRENT_YEAR}-`));
  const date = await dateField.inputValue();
  await dialog.getByLabel('Kommentti').fill(comment);
  await dialog.getByLabel('Tunnit', { exact: true }).fill('1,5');
  await dialog.getByRole('button', { name: 'Tallenna' }).click();
  await expect(dialog).toBeHidden();

  // Own entries are inline fields: the comment is the value of "Kommentti: <date> <comment>".
  await expect(page.getByLabel(`Kommentti: ${fiDate(date)} ${comment}`, { exact: true })).toHaveValue(comment);
  await expect(page.getByLabel(`Tunnit: ${fiDate(date)} ${comment}`, { exact: true })).toHaveValue('1,5');
  await expect(page.getByTestId('hours-year-total')).toHaveText(fiHours(ownBefore + added));

  // Totals page: the new entry is an own (editable) row; the total row = grand total; filtered by
  // me, the total row = my year hours.
  await page.getByRole('link', { name: 'Yhteenveto' }).click();
  const table = totalsTable(page);
  await expect(tableTotal(table)).toHaveText(fiHours(before.grandTotal + added));
  await expect(table.getByLabel(`Tunnit: ${fiDate(date)} ${comment}`, { exact: true })).toHaveValue('1,5');
  await partnerFilter(page).selectOption({ label: me.name });
  await expect(tableTotal(table)).toHaveText(fiHours(mineBefore + added));
  await expectNoHorizontalScroll(page, 'hours totals');

  // Year page.
  await goNav(page, 'Vuosi');
  const hours = page.getByRole('region', { name: 'Tunnit' });
  await expect(hours.getByRole('link', { name: `${me.name} ${fiHours(mineBefore + added)}` })).toBeVisible();
  await expect(hours.getByRole('link', { name: `Yhteensä ${fiHours(before.grandTotal + added)}` })).toBeVisible();
});

// Own hour entries are edited in place (NFR-8): hours and comment save on blur / Enter, the year
// total follows; Esc reverts; invalid hours (not a 0.25 step) are refused.
test('edit own hours in place; Esc and invalid hours are not saved', async ({ page }, testInfo) => {
  await signIn(page);
  const comment = `Synthetic edit ${tagOf(testInfo)}-${suffix()}`;
  const renamed = `${comment} B`;
  const date = tagOf(testInfo) === 'M' ? `${CURRENT_YEAR}-03-10` : `${CURRENT_YEAR}-03-11`;
  const entry = (await api(page).post('/hours', { date, comment, hours: 1 })) as HourEntry;
  const own = (await api(page).get(`/hours?year=${CURRENT_YEAR}`)) as HourEntry[];
  const total = own.reduce((sum, e) => sum + e.hours, 0); // includes the new entry

  await page.goto('/hours');
  await expect(page.getByRole('heading', { level: 1, name: `Tunnit ${CURRENT_YEAR}` })).toBeVisible();
  await expect(page.getByTestId('hours-year-total')).toHaveText(fiHours(total));
  await expectNoEditSaveButtons(page.getByRole('main'), 'my hours');

  const of = (field: string, c: string) => page.getByLabel(`${field}: ${fiDate(date)} ${c}`, { exact: true });

  // Hours: blur saves one PATCH with just the hours; the year total follows.
  await expect(of('Tunnit', comment)).toHaveValue('1');
  expect(await editInline(page, of('Tunnit', comment), '2,5')).toEqual({ hours: 2.5 });
  await expect(page.getByTestId('hours-year-total')).toHaveText(fiHours(total + 1.5));

  // Comment: Enter saves; the entry's fields are then named after the new comment.
  expect(await editInline(page, of('Kommentti', comment), renamed, { commit: 'Enter' })).toEqual({ comment: renamed });
  await expect(of('Kommentti', renamed)).toHaveValue(renamed);

  // Esc reverts; invalid hours and an empty comment show the translated error and are not sent.
  await expectEscReverts(page, of('Tunnit', renamed), '7', '2,5');
  await expectInvalidNotSent(page, of('Tunnit', renamed), '0,3', 'Tunnit 0,25–24 neljännestunnin tarkkuudella.');
  await expectInvalidNotSent(page, of('Kommentti', renamed), '', 'Pakollinen tieto.');
  await expect(page.getByTestId('hours-year-total')).toHaveText(fiHours(total + 1.5));
  // No-horizontal-scroll with the hours error shown: separate test below (F-004).

  // Reload: the saved values persisted, the invalid ones were never saved.
  await page.reload();
  await expect(of('Tunnit', renamed)).toHaveValue('2,5');
  await expect(of('Kommentti', renamed)).toHaveValue(renamed);
  await expect(page.getByTestId('hours-year-total')).toHaveText(fiHours(total + 1.5));
  const saved = ((await api(page).get(`/hours?year=${CURRENT_YEAR}`)) as HourEntry[]).find((e) => e.id === entry.id);
  expect(saved).toMatchObject({ comment: renamed, hours: 2.5, date });
});

// NFR-1 with an inline error: the hours error message must wrap inside its column.
// F-004 (fixed in TASK-124): the field error used to inherit `white-space: nowrap` from `.hour-amount`.
test('an invalid-hours error does not cause horizontal scrolling (F-004)', async ({ page }, testInfo) => {
  await signIn(page);
  const comment = `Synthetic wrap ${tagOf(testInfo)}-${suffix()}`;
  const date = tagOf(testInfo) === 'M' ? `${CURRENT_YEAR}-03-12` : `${CURRENT_YEAR}-03-13`;
  await api(page).post('/hours', { date, comment, hours: 1 });

  await page.goto('/hours');
  const hours = page.getByLabel(`Tunnit: ${fiDate(date)} ${comment}`, { exact: true });
  await expectInvalidNotSent(page, hours, '0,3', 'Tunnit 0,25–24 neljännestunnin tarkkuudella.');
  await expectNoHorizontalScroll(page, 'my hours with an hours error');
});
