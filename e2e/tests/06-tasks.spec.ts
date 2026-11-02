import type { Page } from '@playwright/test';
import {
  api,
  editInline,
  expect,
  expectEscReverts,
  expectInvalidNotSent,
  expectNoEditSaveButtons,
  expectNoHorizontalScroll,
  goNav,
  selectInline,
  signIn,
  tagOf,
  test,
} from './helpers';
import { suffix } from './events';

interface ApiTask {
  id: string;
  title: string;
  description: string | null;
  dueDate: string | null;
  ownerId: string;
  completedAt: string | null;
}

/**
 * One task in the list. The title is an input value (not text), so the row is found by its
 * delete button, which is named after the saved title.
 */
function taskItem(page: Page, title: string) {
  return page
    .getByTestId('task-item')
    .filter({ has: page.getByRole('button', { name: `Poista: ${title}`, exact: true }) });
}

/** Opens a task row (owner / due date on phones, description and tags everywhere). */
async function openTask(page: Page, title: string) {
  const item = taskItem(page, title);
  await item.getByRole('button', { name: `Näytä tiedot: ${title}`, exact: true }).click();
  await expect(item.getByRole('button', { name: `Piilota tiedot: ${title}`, exact: true })).toHaveAttribute(
    'aria-expanded',
    'true',
  );
  return item;
}

/**
 * One line per task (owner request 2026-11-02): a closed row is no taller than a people-list
 * row — 36 px from 600 px, the 40 px touch height on phones.
 */
async function expectOneLine(page: Page, title: string) {
  const item = taskItem(page, title);
  const box = await item.boundingBox();
  const max = (page.viewportSize()?.width ?? 0) >= 600 ? 36 : 40;
  expect(box?.height, `task row height (≤ ${max} px)`).toBeLessThanOrEqual(max + 0.5);
  await expect(item.getByLabel('Kuvaus', { exact: true })).toHaveCount(0);
  await expect(item.locator('.task-title')).toHaveAttribute('title', title);
}

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

  const item = taskItem(page, title);
  await expect(item).toBeVisible();
  await expectOneLine(page, title);
  await expect(item.getByLabel('Otsikko', { exact: true })).toHaveValue(title);
  await openTask(page, title);
  await expect(item.getByLabel('Vastuuhenkilö', { exact: true }).locator('option:checked')).toHaveText('Partner A');
  await expect(item.getByLabel('Eräpäivä', { exact: true })).toHaveValue('2026-12-31');
  await expectNoHorizontalScroll(page, 'tasks');

  // Mark done → leaves the open list, shows under "done".
  await item.getByRole('button', { name: `Merkitse tehdyksi: ${title}` }).click();
  await expect(item).toHaveCount(0);
  await page.getByRole('button', { name: 'Tehdyt', exact: true }).click();
  await expect(item).toBeVisible();
  await openTask(page, title);
  await expect(item).toContainText('Tehty ');
  const done = ((await api(page).get('/tasks?status=DONE')) as ApiTask[]).find((t) => t.title === title);
  expect(done?.completedAt).not.toBeNull();

  // Reopen → back in the open list.
  await item.getByRole('button', { name: `Avaa uudelleen: ${title}` }).click();
  await expect(item).toHaveCount(0);
  await page.getByRole('button', { name: 'Avoimet', exact: true }).click();
  await expect(item).toBeVisible();
  await expect(item.getByRole('button', { name: `Merkitse tehdyksi: ${title}` })).toHaveAttribute('aria-pressed', 'false');
  const open = ((await api(page).get('/tasks?status=OPEN')) as ApiTask[]).find((t) => t.title === title);
  expect(open?.completedAt).toBeNull();
});

// Tasks are edited in place (NFR-8): title, description, owner and due date save on blur /
// Enter / change; Esc reverts; an empty title is refused; delete asks first. The description
// (and on phones owner + due date) are edited in the opened row.
test('edit a task in place, Esc and an empty title are not saved, then delete it', async ({ page }, testInfo) => {
  await signIn(page);
  const s = `${tagOf(testInfo)}-${suffix()}`;
  const title = `Synthetic task ${s}`;
  const renamed = `Synthetic task ${s} B`;
  const created = (await api(page).post('/tasks', { title, dueDate: '2026-12-30' })) as ApiTask;

  await page.goto('/tasks');
  await expect(page.getByRole('heading', { level: 1, name: 'Tehtävät' })).toBeVisible();
  const item = taskItem(page, title);
  await expect(item).toBeVisible();
  await expectNoEditSaveButtons(page.getByRole('main'), 'tasks');

  // Title: Enter saves one PATCH with just the title; the row is then named after it.
  const titleField = item.getByLabel('Otsikko', { exact: true });
  expect(await editInline(page, titleField, renamed, { commit: 'Enter' })).toEqual({ title: renamed });
  const row = taskItem(page, renamed);
  await expect(row).toBeVisible();
  await expectOneLine(page, renamed);
  await openTask(page, renamed);

  // Description (textarea) and due date: blur saves; owner: saves on change.
  expect(await editInline(page, row.getByLabel('Kuvaus', { exact: true }), 'Synthetic details')).toEqual({
    description: 'Synthetic details',
  });
  expect(await editInline(page, row.getByLabel('Eräpäivä', { exact: true }), '2026-12-15')).toEqual({
    dueDate: '2026-12-15',
  });
  const owner = row.getByLabel('Vastuuhenkilö', { exact: true });
  const partnerB = ((await api(page).get('/reference')) as { partners: { id: string; name: string }[] }).partners.find(
    (p) => p.name === 'Partner B',
  );
  expect(await selectInline(page, owner, 'Partner B')).toEqual({ ownerId: partnerB?.id });

  // Esc reverts; an empty title shows the translated error and is not sent.
  const renamedField = row.getByLabel('Otsikko', { exact: true });
  await expectEscReverts(page, renamedField, 'Synthetic other title', renamed);
  await expectInvalidNotSent(page, renamedField, '', 'Pakollinen tieto.');
  await expectNoHorizontalScroll(page, 'tasks with a field error');

  // Reload: every saved field persisted, the empty title was never saved.
  await page.reload();
  await expect(row.getByLabel('Otsikko', { exact: true })).toHaveValue(renamed);
  await openTask(page, renamed);
  await expect(row.getByLabel('Kuvaus', { exact: true })).toHaveValue('Synthetic details');
  await expect(row.getByLabel('Eräpäivä', { exact: true })).toHaveValue('2026-12-15');
  await expect(row.getByLabel('Vastuuhenkilö', { exact: true }).locator('option:checked')).toHaveText('Partner B');
  const saved = ((await api(page).get('/tasks?status=ALL')) as ApiTask[]).find((t) => t.id === created.id);
  expect(saved).toMatchObject({
    title: renamed,
    description: 'Synthetic details',
    dueDate: '2026-12-15',
    ownerId: partnerB?.id,
  });

  // Delete: a confirmation dialog, then the task is gone.
  await row.getByRole('button', { name: `Poista: ${renamed}`, exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Poista tehtävä' });
  await expect(dialog).toContainText(`Poistetaanko tehtävä ”${renamed}”?`);
  await dialog.getByRole('button', { name: 'Kyllä, poista' }).click();
  await expect(dialog).toBeHidden();
  await expect(row).toHaveCount(0);
  const after = (await api(page).get('/tasks?status=ALL')) as ApiTask[];
  expect(after.some((t) => t.id === created.id)).toBe(false);
});
