import { api, expect, expectNoHorizontalScroll, goNav, signIn, tagOf, test } from './helpers';
import { suffix } from './gigs';

// Flow 6: tasks — add, mark done, reopen (UC-017).
test('add a task, mark it done and reopen it', async ({ page }, testInfo) => {
  await signIn(page);
  const title = `Synthetic task ${tagOf(testInfo)}-${suffix()}`;

  await page.goto('/');
  await goNav(page, 'Tehtävät');
  await expect(page.getByRole('heading', { level: 1, name: 'Tehtävät' })).toBeVisible();

  await page.getByRole('button', { name: 'Lisää tehtävä' }).click();
  const dialog = page.getByRole('dialog', { name: 'Uusi tehtävä' });
  await dialog.getByLabel('Otsikko').fill(title);
  await expect(dialog.getByLabel('Vastuuhenkilö')).toHaveValue(/.+/);
  await dialog.getByLabel('Eräpäivä').fill('2026-12-31');
  await dialog.getByRole('button', { name: 'Tallenna' }).click();
  await expect(dialog).toBeHidden();

  const item = page.getByTestId('task-item').filter({ hasText: title });
  await expect(item).toBeVisible();
  await expect(item).toContainText('Partner A');
  await expect(item).toContainText('Eräpäivä 31.12.2026');
  await expectNoHorizontalScroll(page, 'tasks');

  // Mark done → leaves the open list, shows under "done".
  await item.getByRole('button', { name: `Merkitse tehdyksi: ${title}` }).click();
  await expect(item).toHaveCount(0);
  await page.getByRole('button', { name: 'Tehdyt', exact: true }).click();
  await expect(item).toBeVisible();
  await expect(item).toContainText('Tehty ');
  const done = ((await api(page).get('/tasks?status=DONE')) as { title: string; completedAt: string | null }[]).find(
    (t) => t.title === title,
  );
  expect(done?.completedAt).not.toBeNull();

  // Reopen → back in the open list.
  await item.getByRole('button', { name: `Avaa uudelleen: ${title}` }).click();
  await expect(item).toHaveCount(0);
  await page.getByRole('button', { name: 'Avoimet', exact: true }).click();
  await expect(item).toBeVisible();
  await expect(item.getByRole('button', { name: `Merkitse tehdyksi: ${title}` })).toHaveAttribute('aria-pressed', 'false');
  const open = ((await api(page).get('/tasks?status=OPEN')) as { title: string; completedAt: string | null }[]).find(
    (t) => t.title === title,
  );
  expect(open?.completedAt).toBeNull();
});
