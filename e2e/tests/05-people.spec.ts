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

/** The people list is read-only (TASK-169): no inputs, switches or role pickers in rows. */
async function expectReadOnlyList(list: Locator): Promise<void> {
  await expect(list.getByRole('textbox'), 'list: no name fields').toHaveCount(0);
  await expect(list.getByRole('switch'), 'list: no active switches').toHaveCount(0);
  await expect(list.getByRole('checkbox'), 'list: no role checkboxes').toHaveCount(0);
  await expect(list.getByRole('combobox'), 'list: no role pickers').toHaveCount(0);
}

// Flow 5: people — add, rename, deactivate; the person page shows their lines (UC-014).
// The list is read-only (TASK-169): the name links to the person page, where name and active are
// edited in place (NFR-8): no rename dialog, no Rename/Activate buttons.
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
  const link = (n: string) => list.getByRole('link', { name: n, exact: true });
  await expect(link(name)).toBeVisible();
  await expectReadOnlyList(list);
  await expectNoPersonButtons(page.getByRole('main'), 'people list');

  // Give the person a line on an event (setup through the API), then open the person page.
  const person = ((await api(page).get('/people?active=all')) as ApiPerson[]).find((p) => p.name === name);
  expect(person, 'new person is returned by the API').toBeTruthy();
  const venue = `Venue ${tag}-${s}`;
  const event = await createEventViaApi(page, { startDate: tag === 'M' ? '2026-12-12' : '2026-12-19', venue });
  const guitar = event.costLines.find((l) => l.type === 'GUITAR');
  await api(page).patch(`/cost-lines/${guitar?.id}`, { personId: person?.id });

  // The name link is keyboard accessible: focus + Enter opens the person page.
  await link(name).focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(new RegExp(`/people/${person?.id}$`));
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
  const lines = page.getByRole('table', { name: 'Kulurivit 2026' });
  await expect(lines.getByRole('row', { name: new RegExp(venue) })).toContainText('Kitara');
  await expect(lines.getByRole('row', { name: new RegExp(venue) })).toContainText(fiMoney(SEED.templateB.roleFeeCents));
  // The person page has visible "Nimi" and "Aktiivinen" inline fields.
  const pageName = page.getByLabel('Nimi', { exact: true });
  const active = page.getByRole('switch', { name: 'Aktiivinen', exact: true });
  await expect(pageName).toBeVisible();
  await expect(pageName).toHaveValue(name);
  await expect(active).toBeVisible();
  await expect(active).toBeChecked();
  await expectNoPersonButtons(page.getByRole('main'), 'person page');
  await expectNoHorizontalScroll(page, 'person page');

  // Esc reverts; an empty name shows the translated error and is not sent (UC-014 E1).
  await expectEscReverts(page, pageName, 'Person Z', name);
  await expectInvalidNotSent(page, pageName, '', 'Pakollinen tieto.');
  await page.reload();
  await expect(pageName).toHaveValue(name);

  // Rename in place: Enter saves one PATCH with just the name.
  expect(await editInline(page, pageName, renamed, { commit: 'Enter' })).toEqual({ name: renamed });
  await expect(page.getByRole('heading', { level: 1, name: renamed })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0); // no rename dialog
  await page.reload();
  await expect(pageName).toHaveValue(renamed);

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

  // Back on the list: renamed, hidden from active; under "Ei käytössä" with the inactive tag.
  await page.getByRole('link', { name: '← Henkilöt' }).click();
  await expect(link(renamed)).toHaveCount(0);
  await expect(link(name)).toHaveCount(0);
  await page.getByRole('button', { name: 'Ei käytössä', exact: true }).click();
  await expect(link(renamed)).toBeVisible();
  // `has` is resolved inside the row, so the inner locator must not start from the table.
  const renamedRow = list.getByRole('row').filter({ has: page.getByRole('link', { name: renamed, exact: true }) });
  await expect(renamedRow).toContainText('Ei käytössä');
  await expectReadOnlyList(list);
  const saved = ((await api(page).get('/people?active=all')) as ApiPerson[]).find((p) => p.id === person?.id);
  expect(saved).toMatchObject({ name: renamed, active: false });
});

// Reactivate: the list has no switch, so it is done on the person page opened from the name link.
test('an inactive person is reactivated on the person page opened from the list', async ({ page }, testInfo) => {
  await signIn(page);
  const name = `Person ${tagOf(testInfo)}3-${suffix()}`;
  const created = (await api(page).post('/people', { name })) as { person: ApiPerson };
  await api(page).patch(`/people/${created.person.id}`, { active: false });

  await page.goto('/people?active=false');
  const list = page.getByRole('table', { name: 'Henkilöt' });
  await expectReadOnlyList(list);
  await list.getByRole('link', { name, exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
  const sw = page.getByRole('switch', { name: 'Aktiivinen', exact: true });
  await expect(sw).not.toBeChecked();
  const writes = page.waitForResponse((r) => r.request().method() === 'PATCH' && r.url().includes('/api/people/'));
  await sw.click();
  expect((await writes).request().postDataJSON()).toEqual({ active: true });
  await expect(page.getByRole('status').filter({ hasText: `${name} otettu käyttöön.` })).toBeVisible();
  const saved = ((await api(page).get('/people?active=all')) as ApiPerson[]).find((p) => p.id === created.person.id);
  expect(saved?.active).toBe(true);
});
