import { api, expect, expectNoHorizontalScroll, fiMoney, goNav, SEED, signIn, tagOf, test } from './helpers';
import { createGigViaApi, suffix } from './gigs';

// Flow 5: people — add, rename, deactivate; the person page shows their lines (UC-014).
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

  // Add.
  await page.getByLabel('Nimi', { exact: true }).fill(name);
  await page.getByRole('button', { name: 'Lisää', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: `Henkilö lisätty: ${name}.` })).toBeVisible();
  const list = page.getByRole('list', { name: 'Henkilöt' });
  await expect(list.getByRole('link', { name, exact: true })).toBeVisible();

  // Rename.
  await list.getByRole('button', { name: `Muuta nimeä: ${name}` }).click();
  const dialog = page.getByRole('dialog', { name: `Muuta nimeä: ${name}` });
  await dialog.getByLabel('Uusi nimi').fill(renamed);
  await dialog.getByRole('button', { name: 'Tallenna' }).click();
  await expect(dialog).toBeHidden();
  await expect(list.getByRole('link', { name: renamed, exact: true })).toBeVisible();
  await expect(list.getByRole('link', { name, exact: true })).toHaveCount(0);

  // Give the person a line on a gig (setup through the API), then open the person page.
  const person = ((await api(page).get('/people?active=all')) as { id: string; name: string }[]).find(
    (p) => p.name === renamed,
  );
  expect(person, 'renamed person is returned by the API').toBeTruthy();
  const venue = `Venue ${tag}-${s}`;
  const gig = await createGigViaApi(page, { startDate: tag === 'M' ? '2026-12-12' : '2026-12-19', venue });
  const guitar = gig.costLines.find((l) => l.type === 'GUITAR');
  await api(page).patch(`/cost-lines/${guitar?.id}`, { personId: person?.id });

  await list.getByRole('link', { name: renamed, exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: renamed })).toBeVisible();
  const lines = page.getByRole('table', { name: 'Kulurivit 2026' });
  await expect(lines.getByRole('row', { name: new RegExp(venue) })).toContainText('Kitara');
  await expect(lines.getByRole('row', { name: new RegExp(venue) })).toContainText(fiMoney(SEED.templateB.roleFeeCents));
  await expectNoHorizontalScroll(page, 'person page');

  // Deactivate on the person page; the person leaves the active list but stays under "inactive".
  await page.getByRole('button', { name: `Poista käytöstä: ${renamed}` }).click();
  await expect(page.getByRole('status').filter({ hasText: `${renamed} poistettu käytöstä.` })).toBeVisible();
  await expect(page.getByRole('heading', { level: 1, name: renamed })).toContainText('Ei käytössä');
  // The line on the gig is kept.
  await expect(lines.getByRole('row', { name: new RegExp(venue) })).toBeVisible();

  await page.getByRole('link', { name: '← Henkilöt' }).click();
  await expect(list.getByRole('link', { name: renamed, exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Ei käytössä', exact: true }).click();
  await expect(list.getByRole('link', { name: renamed, exact: true })).toBeVisible();
});
