import type { Page } from '@playwright/test';
import { suffix } from './events';
import { api, expect, expectNoHorizontalScroll, signIn, tagOf, test } from './helpers';
import { createClientViaApi, type Client } from './offers';

// TASK-193: list tables are paged client-side (100 rows on Asiakkaat). 101 synthetic clients,
// tagged per project (M / D) with a random suffix and searched for, so the other data does not
// matter; they are deleted again at the end so later specs see the usual client list.

const clientsTable = (page: Page) => page.getByRole('table', { name: 'Asiakkaat', exact: true });
const clientRows = (page: Page) => clientsTable(page).getByRole('row').filter({ has: page.getByRole('cell') });
const pager = (page: Page) => page.getByRole('navigation', { name: 'Sivutus' });

test('client list pages 100 rows at a time; page in the URL; a new search goes back to page 1', async ({
  page,
}, testInfo) => {
  test.setTimeout(180_000);
  await signIn(page);
  const prefix = `Paged ${tagOf(testInfo)}-${suffix()}`;
  const clients: Client[] = [];
  try {
    for (let i = 1; i <= 101; i++) {
      clients.push(await createClientViaApi(page, `${prefix} ${String(i).padStart(3, '0')}`));
    }

    await page.goto(`/clients?q=${encodeURIComponent(prefix)}`);
    await expect(page.getByRole('searchbox', { name: 'Haku' })).toHaveValue(prefix);
    await expect(clientRows(page)).toHaveCount(100);
    await expect(clientRows(page).first()).toContainText(`${prefix} 001`);
    await expect(pager(page)).toContainText('Sivu 1 / 2');
    await expect(pager(page)).toContainText('1–100 / 101');
    await expect(pager(page).getByRole('button', { name: 'Edellinen' })).toBeDisabled();
    for (const button of await pager(page).getByRole('button').all()) {
      const box = (await button.boundingBox())!;
      expect(box.height, 'pager buttons are at least 32 px high').toBeGreaterThanOrEqual(32);
    }
    await expectNoHorizontalScroll(page, 'clients with pager');

    // Next from the bottom: page 2 in the URL, the top of the table in view.
    await pager(page).getByRole('button', { name: 'Seuraava' }).click();
    await expect(clientRows(page)).toHaveCount(1);
    await expect(clientRows(page).first()).toContainText(`${prefix} 101`);
    await expect(page).toHaveURL(/[?&]page=2(&|$)/);
    await expect(pager(page)).toContainText('101–101 / 101');
    await expect
      .poll(async () => (await clientsTable(page).boundingBox())!.y, { message: 'table top scrolled into view' })
      .toBeGreaterThanOrEqual(0);

    // Reload keeps the search and the page.
    await page.reload();
    await expect(page.getByRole('searchbox', { name: 'Haku' })).toHaveValue(prefix);
    await expect(clientRows(page)).toHaveCount(1);
    await expect(clientRows(page).first()).toContainText(`${prefix} 101`);

    // A new search goes back to page 1; two hits fit on one page → no pager.
    await page.getByRole('searchbox', { name: 'Haku' }).fill(`${prefix} 10`);
    await expect(page).not.toHaveURL(/[?&]page=/);
    await expect(clientRows(page)).toHaveCount(2);
    await expect(pager(page)).toHaveCount(0);

    // Previous back on the full list.
    await page.goto(`/clients?q=${encodeURIComponent(prefix)}&page=2`);
    await expect(clientRows(page)).toHaveCount(1);
    await pager(page).getByRole('button', { name: 'Edellinen' }).click();
    await expect(clientRows(page)).toHaveCount(100);
    await expect(page).not.toHaveURL(/[?&]page=/);
  } finally {
    for (const c of clients) await api(page).delete(`/clients/${c.id}`);
  }
});
