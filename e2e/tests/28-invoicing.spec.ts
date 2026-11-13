import type { Locator, Page } from '@playwright/test';
import { createEventViaApi, suffix } from './events';
import {
  api,
  CURRENT_YEAR,
  escapeRegExp,
  expect,
  expectNoHorizontalScroll,
  fiDate,
  fiMoney,
  goNav,
  isMobile,
  pageHead,
  signIn,
  tagOf,
  test,
} from './helpers';
import { createClientViaApi } from './offers';

// TASK-202 / TASK-061 (api-contract "Laskutus page: all invoice rows"): menu item "Laskutus"
// (/invoicing) lists every invoice row of every non-deleted gig in API order (NOT_SENT first, then
// SENT; newest first), 100 rows per page. Rows are tagged per project (M / D) with a random suffix;
// the spec's gigs are deleted at the end (their rows then drop out of the list).

interface ListRow {
  id: string;
  description: string;
  status: 'NOT_SENT' | 'SENT';
}

const table = (page: Page) => page.getByRole('table', { name: 'Laskurivit', exact: true });
const bodyRows = (page: Page) => table(page).locator('tbody tr');
const pager = (page: Page) => page.getByRole('navigation', { name: 'Sivutus' });
const PAGE_SIZE = 100;

async function box(locator: Locator) {
  const b = await locator.boundingBox();
  expect(b, 'element is rendered').not.toBeNull();
  return b!;
}

test('Laskutus: rows of two gigs in API order, status tags, gig link, pager only when needed, refresh after a change', async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  await signIn(page);
  const tag = `${tagOf(testInfo)}${suffix()}`;
  const client = await createClientViaApi(page, `Invoicing Client ${tag}`);
  const g1 = await createEventViaApi(page, { startDate: `${CURRENT_YEAR}-03-10`, venue: `Inv Hall ${tag} 1` });
  const g2 = await createEventViaApi(page, { startDate: `${CURRENT_YEAR + 1}-04-11`, venue: `Inv Hall ${tag} 2` });
  const details = ['Reference 1', 'Order 2', 'Contact 3', 'Street 4', 'City 5'].map((l) => `${l} ${tag}`).join('\n');
  await api(page).patch(`/events/${g1.id}`, { clientId: client.id, invoicingDetails: details });

  const sent = `Sent ${tag}`;
  const older = `Open old ${tag}`;
  const newer = `Open new ${tag}`;
  try {
    await api(page).post(`/events/${g1.id}/invoice-rows`, { description: sent, amountCents: 10000, status: 'SENT' });
    await api(page).post(`/events/${g2.id}/invoice-rows`, { description: older, amountCents: 20000 });
    await api(page).post(`/events/${g1.id}/invoice-rows`, { description: newer, amountCents: 30000 });

    // API order: the newest not-sent rows first; the sent row is the first SENT row.
    const list = (await api(page).get('/invoice-rows')) as ListRow[];
    const index = (d: string) => list.findIndex((r) => r.description === d);
    expect(index(newer)).toBe(0);
    expect(index(older)).toBe(1);
    expect(index(sent)).toBe(list.filter((r) => r.status === 'NOT_SENT').length);

    // Menu item right after Keikat.
    await page.goto('/my-gigs');
    await goNav(page, 'Laskutus');
    await expect(page).toHaveURL(/\/invoicing$/);
    await expect(pageHead(page).getByRole('heading', { name: 'Laskutus', level: 1 })).toBeVisible();
    await expect(table(page)).toBeVisible();

    // Rows from the two gigs in API order.
    const first = bodyRows(page).nth(0);
    const second = bodyRows(page).nth(1);
    await expect(first).toContainText(newer);
    await expect(second).toContainText(older);
    await expect(first.locator('.tag')).toHaveText('Lähettämättä');
    await expect(first.locator('.tag')).toHaveClass(/tag-yellow/);
    await expect(first.locator('td.inv-col-client')).toHaveText(client.name);
    await expect(second.locator('td.inv-col-client')).toHaveText('–');
    await expect(first.locator('td.inv-col-amount')).toHaveText(fiMoney(30000));
    const g1Link = first.getByRole('link', {
      name: new RegExp(`^${escapeRegExp(fiDate(`${CURRENT_YEAR}-03-10`))} ${escapeRegExp(g1.lineupName)}$`),
    });
    await expect(g1Link).toHaveAttribute('href', `/gigs/${g1.id}`);
    await expect(second.getByRole('link')).toHaveAttribute('href', `/gigs/${g2.id}`);

    // Laskutustiedot: clamped, full text in the title, "Näytä kaikki" opens it.
    const text = first.locator('.inv-details-text');
    await expect(text).toHaveAttribute('title', details);
    const clamped = (await box(text)).height;
    await first.getByRole('button', { name: 'Näytä kaikki' }).click();
    await expect(text).toHaveClass(/is-open/);
    expect((await box(text)).height, 'open text is taller than the clamped one').toBeGreaterThan(clamped + 10);
    await first.getByRole('button', { name: 'Näytä vähemmän' }).click();
    await expect(text).not.toHaveClass(/is-open/);

    // The sent row: on the page the API order puts it, with the green tag.
    const sentIndex = index(sent);
    const sentPage = Math.floor(sentIndex / PAGE_SIZE) + 1;
    if (list.length <= PAGE_SIZE) {
      await expect(pager(page), 'no pager for few rows').toHaveCount(0);
    } else {
      await expect(pager(page)).toContainText(`1–${PAGE_SIZE} / ${list.length}`);
    }
    if (sentPage > 1) await page.goto(`/invoicing?page=${sentPage}`);
    const sentRow = bodyRows(page).nth(sentIndex % PAGE_SIZE);
    await expect(sentRow).toContainText(sent);
    await expect(sentRow.locator('.tag')).toHaveText('Lähetetty');
    await expect(sentRow.locator('.tag')).toHaveClass(/tag-ok(\s|$)/);
    if (sentPage > 1) await page.goto('/invoicing');

    if (isMobile(testInfo)) {
      // Phone rows: line 1 = client + status tag; line 2 = gig date · description · amount;
      // Laskutustiedot below them.
      const client1 = await box(first.locator('td.inv-col-client'));
      const status1 = await box(first.locator('td.inv-col-status'));
      const gig = await box(first.locator('td.inv-col-gig'));
      const description = await box(first.locator('td.inv-col-description'));
      const amount = await box(first.locator('td.inv-col-amount'));
      const detailsCell = await box(first.locator('td.inv-col-details'));
      expect(Math.abs(client1.y - status1.y), 'client and status on line 1').toBeLessThan(8);
      expect(status1.x, 'status tag right of the client').toBeGreaterThan(client1.x);
      expect(gig.y, 'line 2 below line 1').toBeGreaterThan(client1.y + 8);
      expect(Math.abs(description.y - gig.y), 'description on line 2').toBeLessThan(8);
      expect(Math.abs(amount.y - gig.y), 'amount on line 2').toBeLessThan(8);
      expect(detailsCell.y, 'Laskutustiedot under line 2').toBeGreaterThan(gig.y + 8);
      await expect(first.locator('td.inv-col-created')).toBeHidden();
      await expectNoHorizontalScroll(page, 'invoicing, phone');
    } else {
      for (const w of [600, 900, 1280, 1920]) {
        await page.setViewportSize({ width: w, height: 800 });
        await expect(table(page)).toBeVisible();
        await expectNoHorizontalScroll(page, `invoicing, ${w} px`);
        const wrap = await page.locator('main .table-wrap').first().evaluate((el) => ({ scroll: el.scrollWidth, client: el.clientWidth }));
        expect(wrap.scroll, `invoicing table scrolls sideways at ${w} px`).toBeLessThanOrEqual(wrap.client);
      }
      await page.setViewportSize({ width: 1280, height: 800 });
    }

    // The link opens the gig; a status change there shows on the Laskutus page (cache refresh).
    await first.getByRole('link', { name: new RegExp(escapeRegExp(fiDate(`${CURRENT_YEAR}-03-10`))) }).click();
    await expect(page).toHaveURL(new RegExp(`/gigs/${g1.id}$`));
    await expect(pageHead(page)).toContainText(g1.venue);
    const status = page.getByRole('combobox', { name: `Tila: ${newer}` });
    await status.selectOption({ label: 'Lähetetty' });
    await expect.poll(async () => ((await api(page).get('/invoice-rows')) as ListRow[]).find((r) => r.description === newer)?.status).toBe('SENT');
    await goNav(page, 'Laskutus');
    await expect(bodyRows(page).nth(0)).toContainText(older);
  } finally {
    // Deleted gigs' rows drop out of the list.
    await api(page).post(`/events/${g1.id}/delete`, { reason: 'Synthetic cleanup' });
    await api(page).post(`/events/${g2.id}/delete`, { reason: 'Synthetic cleanup' });
  }
  const after = (await api(page).get('/invoice-rows')) as ListRow[];
  expect(after.filter((r) => r.description.endsWith(tag))).toEqual([]);
});
