import type { Locator } from '@playwright/test';
import {
  api,
  editInline,
  expect,
  expectEscReverts,
  expectInvalidNotSent,
  expectNoEditSaveButtons,
  expectNoHorizontalScroll,
  fiMoney,
  goNav,
  pageHead,
  SEED,
  signIn,
  tagOf,
  test,
} from './helpers';
import { createEventViaApi, suffix } from './events';

interface ApiPerson {
  id: string;
  name: string;
  active: boolean;
}

/** Buttons the inline people pages must no longer have (TASK-123). */
async function expectNoPersonButtons(scope: Locator, where: string): Promise<void> {
  await expectNoEditSaveButtons(scope, where);
  await expect(
    scope.getByRole('button', { name: /^(Poista käytöstä|Ota käyttöön)/ }),
    `${where}: no Activate/Deactivate buttons`,
  ).toHaveCount(0);
}

// Flow 5: people — add, rename, deactivate; the person page shows their lines (UC-014).
// Name and active are edited in place (NFR-8): no rename dialog, no Rename/Activate buttons.
test('add, rename and deactivate a person; person page lists their lines', async ({ page }, testInfo) => {
  await signIn(page);
  const tag = tagOf(testInfo);
  const s = suffix();
  const name = `Person ${tag}1-${s}`;
  const renamed = `Person ${tag}2-${s}`;

  await page.goto('/');
  await goNav(page, 'Henkilöt');
  await expect(page.getByRole('heading', { level: 1, name: 'Henkilöt' })).toBeVisible();
  await expectNoHorizontalScroll(page, 'people');

  // Add (a new item keeps its form + Add button).
  await page.getByLabel('Nimi', { exact: true }).fill(name);
  await page.getByRole('button', { name: 'Lisää', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: `Henkilö lisätty: ${name}.` })).toBeVisible();
  const list = page.getByRole('table', { name: 'Henkilöt' });
  const nameField = list.getByLabel(`Nimi: ${name}`, { exact: true });
  await expect(nameField).toHaveValue(name);
  await expect(list.getByRole('link', { name: `Avaa: ${name}`, exact: true })).toBeVisible();
  await expect(list.getByRole('switch', { name: `Aktiivinen: ${name}`, exact: true })).toBeChecked();
  await expectNoPersonButtons(page.getByRole('main'), 'people list');

  // Esc reverts; an empty name shows the translated error and is not sent (UC-014 E1).
  await expectEscReverts(page, nameField, 'Person Z', name);
  await expectInvalidNotSent(page, nameField, '', 'Pakollinen tieto.');
  await page.reload();
  await expect(nameField).toHaveValue(name);

  // Rename in place: Enter saves one PATCH with just the name; the row is then named after it.
  expect(await editInline(page, nameField, renamed, { commit: 'Enter' })).toEqual({ name: renamed });
  await expect(list.getByLabel(`Nimi: ${renamed}`, { exact: true })).toHaveValue(renamed);
  await expect(list.getByRole('link', { name: `Avaa: ${renamed}`, exact: true })).toBeVisible();
  await expect(list.getByRole('link', { name: `Avaa: ${name}`, exact: true })).toHaveCount(0);
  await expect(page.getByRole('dialog')).toHaveCount(0); // no rename dialog
  await page.reload();
  await expect(list.getByLabel(`Nimi: ${renamed}`, { exact: true })).toHaveValue(renamed);

  // Give the person a line on an event (setup through the API), then open the person page.
  const person = ((await api(page).get('/people?active=all')) as ApiPerson[]).find((p) => p.name === renamed);
  expect(person, 'renamed person is returned by the API').toBeTruthy();
  const venue = `Venue ${tag}-${s}`;
  const event = await createEventViaApi(page, { startDate: tag === 'M' ? '2026-12-12' : '2026-12-19', venue });
  const guitar = event.costLines.find((l) => l.type === 'GUITAR');
  await api(page).patch(`/cost-lines/${guitar?.id}`, { personId: person?.id });

  await list.getByRole('link', { name: `Avaa: ${renamed}`, exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: renamed })).toBeVisible();
  const lines = page.getByRole('table', { name: 'Kulurivit 2026' });
  await expect(lines.getByRole('row', { name: new RegExp(venue) })).toContainText('Kitara');
  await expect(lines.getByRole('row', { name: new RegExp(venue) })).toContainText(fiMoney(SEED.templateB.roleFeeCents));
  // The person page has visible "Nimi" and "Aktiivinen" inline fields.
  const pageName = page.getByLabel('Nimi', { exact: true });
  const active = page.getByRole('switch', { name: 'Aktiivinen', exact: true });
  await expect(pageName).toBeVisible();
  await expect(pageName).toHaveValue(renamed);
  await expect(active).toBeVisible();
  await expect(active).toBeChecked();
  await expectNoPersonButtons(page.getByRole('main'), 'person page');
  await expectNoHorizontalScroll(page, 'person page');

  // Deactivate on the person page: the switch saves on change and a notice stays.
  const writes = page.waitForResponse((r) => r.request().method() === 'PATCH' && r.url().includes('/api/people/'));
  await active.click();
  const res = await writes;
  expect(res.ok()).toBeTruthy();
  expect(res.request().postDataJSON()).toEqual({ active: false });
  await expect(active).not.toBeChecked();
  const notice = page.getByRole('status').filter({ hasText: `${renamed} poistettu käytöstä.` });
  await expect(notice).toBeVisible();
  await page.waitForTimeout(2000); // longer than the inline "saved" state: the notice stays
  await expect(notice).toBeVisible();
  // The "inactive" tag sits in the page head next to the name.
  await expect(page.getByRole('heading', { level: 1, name: renamed })).toBeVisible();
  await expect(pageHead(page).locator('.page-subtitle .tag')).toHaveText('Ei käytössä');
  // The line on the event is kept.
  await expect(lines.getByRole('row', { name: new RegExp(venue) })).toBeVisible();
  await page.reload();
  await expect(active).not.toBeChecked();

  await page.getByRole('link', { name: '← Henkilöt' }).click();
  await expect(list.getByRole('link', { name: `Avaa: ${renamed}`, exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Ei käytössä', exact: true }).click();
  await expect(list.getByRole('link', { name: `Avaa: ${renamed}`, exact: true })).toBeVisible();
  await expect(list.getByRole('switch', { name: `Aktiivinen: ${renamed}`, exact: true })).not.toBeChecked();
  const saved = ((await api(page).get('/people?active=all')) as ApiPerson[]).find((p) => p.id === person?.id);
  expect(saved).toMatchObject({ name: renamed, active: false });
});

// Activate from the list: the switch in the row saves on change; the notice names the person.
test('a person is reactivated from the list with the row switch', async ({ page }, testInfo) => {
  await signIn(page);
  const name = `Person ${tagOf(testInfo)}3-${suffix()}`;
  const created = (await api(page).post('/people', { name })) as { person: ApiPerson };
  await api(page).patch(`/people/${created.person.id}`, { active: false });

  await page.goto('/people?active=false');
  const list = page.getByRole('table', { name: 'Henkilöt' });
  const sw = list.getByRole('switch', { name: `Aktiivinen: ${name}`, exact: true });
  await expect(sw).not.toBeChecked();
  const writes = page.waitForResponse((r) => r.request().method() === 'PATCH' && r.url().includes('/api/people/'));
  await sw.click();
  expect((await writes).request().postDataJSON()).toEqual({ active: true });
  await expect(page.getByRole('status').filter({ hasText: `${name} otettu käyttöön.` })).toBeVisible();
  const saved = ((await api(page).get('/people?active=all')) as ApiPerson[]).find((p) => p.id === created.person.id);
  expect(saved?.active).toBe(true);
});
