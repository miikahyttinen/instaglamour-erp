import { createEventViaApi, costLine, suffix } from './events';
import { api, CURRENT_YEAR, expect, expectNoHorizontalScroll, fiMoney, isMobile, PARTNER_A, signIn, tagOf, test } from './helpers';
import { costLineOf, createPersonViaApi, poByNumber, poFutureYear, poRow, poTable } from './po';

// Purchase orders created by partners (TASK-043 / TASK-171): gig page "Luo ostotilaus" → one
// person's open fees on this gig (upcoming gig: no "played" rule) → PO listed on Ostotilaukset,
// lines tagged "PO <number>", log "Luotu käsin" by the partner. Synthetic, tagged data only; the
// gig lives in a far-future year of its own per project.

test('gig page → create PO for one person → PO listed, lines tagged, log shows the partner', async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const tag = tagOf(testInfo);
  const s = suffix();
  const me = await signIn(page, PARTNER_A, { selectedYear: CURRENT_YEAR });

  const person = await createPersonViaApi(page, `Manual PO ${tag}-${s}`);
  const other = await createPersonViaApi(page, `Manual Other ${tag}-${s}`);
  const event = await createEventViaApi(page, { startDate: `${poFutureYear(testInfo)}-08-14`, venue: `Venue MPO ${tag}-${s}` });
  const add = async (personId: string, type: string, budgetedCents: number, description: string) => {
    const before = (await api(page).get(`/events/${event.id}`)) as { costLines: { id: string }[] };
    const known = new Set(before.costLines.map((l) => l.id));
    const res = (await api(page).post(`/events/${event.id}/cost-lines`, { type, personId, budgetedCents, description })) as {
      event: { costLines: { id: string }[] };
    };
    return res.event.costLines.find((l) => !known.has(l.id))!.id;
  };
  const drumsDesc = `D ${tag}-${s}`;
  const bassDesc = `B ${tag}-${s}`;
  const drums = await add(person.id, 'DRUMS', 30000, drumsDesc);
  const bass = await add(person.id, 'BASS', 20000, bassDesc);
  const otherLine = await add(other.id, 'BASS', 50000, `O ${tag}-${s}`);

  await page.goto(`/gigs/${event.id}`);
  await expect(page.getByRole('table', { name: 'Kulut ja miehitys' })).toBeVisible();
  await page.getByRole('button', { name: 'Luo ostotilaus', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Uusi ostotilaus' });
  await expect(dialog).toBeVisible();
  const select = dialog.getByRole('combobox', { name: 'Henkilö' });
  await expect(select.getByRole('option', { name: person.name })).toHaveCount(1);
  await expect(select.getByRole('option', { name: other.name })).toHaveCount(1);
  await select.selectOption({ label: person.name });

  // This gig's open fees of the person, pre-ticked.
  const drumsBox = dialog.getByRole('checkbox', { name: new RegExp(`Rummut \\(${drumsDesc}\\)`) });
  const bassBox = dialog.getByRole('checkbox', { name: new RegExp(`Basso \\(${bassDesc}\\)`) });
  await expect(drumsBox).toBeChecked();
  await expect(bassBox).toBeChecked();
  await expect(dialog.getByRole('checkbox')).toHaveCount(2);
  await expect(dialog.locator('.po-create-total')).toContainText(fiMoney(50000));
  await bassBox.uncheck();
  await expect(dialog.locator('.po-create-total')).toContainText(fiMoney(30000));
  await expectNoHorizontalScroll(page, 'gig page with the PO dialog');

  const created = page.waitForResponse((r) => new URL(r.url()).pathname === '/api/purchase-orders' && r.request().method() === 'POST');
  await dialog.getByRole('button', { name: 'Luo ostotilaus', exact: true }).click();
  const res = await created;
  expect(res.status()).toBe(201);
  const body = (await res.json()) as { id: string; number: string; personId: string };
  expect(body.personId).toBe(person.id);
  await expect(dialog).toBeHidden();

  // Notice with a link; the drums line is tagged, the bass and the other person's lines are not.
  await expect(page.getByRole('status').filter({ hasText: `Ostotilaus ${body.number} luotu.` })).toBeVisible();
  await expect(page.getByRole('link', { name: `Avaa ostotilaus ${body.number}` })).toHaveAttribute('href', `/purchase-orders/${body.id}`);
  await expect(costLine(page, `Rummut (${drumsDesc})`).getByRole('link', { name: `Ostotilaus ${body.number}` })).toBeVisible();
  await expect(costLine(page, `Basso (${bassDesc})`).getByRole('link', { name: /^Ostotilaus / })).toHaveCount(0);
  expect((await costLineOf(page, event.id, drums)).purchaseOrder?.number).toBe(body.number);
  expect((await costLineOf(page, event.id, bass)).purchaseOrder).toBeNull();
  expect((await costLineOf(page, event.id, otherLine)).purchaseOrder).toBeNull();
  const po = await poByNumber(page, body.number);
  expect(po.lines.map((l) => [l.costLineId, l.amountCents])).toEqual([[drums, 30000]]);

  // Ostotilaukset: listed; the log names the partner.
  await page.goto('/purchase-orders');
  await expect(page.getByRole('heading', { level: 1, name: 'Ostotilaukset' })).toBeVisible();
  await expect(poTable(page)).toBeVisible();
  await expect(poRow(page, body.number)).toHaveCount(1);
  const log = page
    .getByRole('table', { name: 'Ostotilausten muutokset' })
    .getByRole('row')
    .filter({ has: page.getByRole('link', { name: body.number, exact: true }) });
  await expect(log).toHaveCount(1);
  await expect(log).toContainText('Luotu käsin');
  await expect(log).toContainText(me.name);

  // Ostotilaukset "+ Uusi ostotilaus": the remaining bass fee, then the PO page opens.
  await page.getByRole('button', { name: '+ Uusi ostotilaus' }).click();
  const listDialog = page.getByRole('dialog', { name: 'Uusi ostotilaus' });
  await listDialog.getByRole('searchbox', { name: 'Hae henkilöä' }).fill(`Manual PO ${tag}-${s}`);
  await listDialog.getByRole('combobox', { name: 'Henkilö' }).selectOption({ label: person.name });
  const bassInList = listDialog.getByRole('checkbox', { name: new RegExp(`Basso \\(${bassDesc}\\)`) });
  await expect(bassInList).not.toBeChecked();
  await expect(listDialog.getByRole('checkbox', { name: new RegExp(`Rummut \\(${drumsDesc}\\)`) })).toHaveCount(0);
  await bassInList.check();
  await expectNoHorizontalScroll(page, 'Ostotilaukset with the PO dialog');
  await listDialog.getByRole('button', { name: 'Luo ostotilaus', exact: true }).click();
  await expect(page).toHaveURL(/\/purchase-orders\/[0-9a-f-]+$/);
  const second = (await costLineOf(page, event.id, bass)).purchaseOrder!;
  await expect(page.getByRole('heading', { level: 1, name: second.number })).toBeVisible();

  if (!isMobile(testInfo)) {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/gigs/${event.id}`);
    await expect(costLine(page, `Basso (${bassDesc})`).getByRole('link', { name: `Ostotilaus ${second.number}` })).toBeVisible();
    await expectNoHorizontalScroll(page, 'gig page at 1440 px');
  }
});
