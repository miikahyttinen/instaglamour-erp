import { createEventViaApi, costField, costLine, suffix } from './events';
import {
  api,
  CURRENT_YEAR,
  expect,
  expectNoHorizontalScroll,
  fiDate,
  fiMoney,
  goNav,
  isMobile,
  pageHead,
  PARTNER_A,
  signIn,
  tagOf,
  test,
} from './helpers';
import { createClientViaApi } from './offers';
import {
  addLine,
  anonymous,
  backdatePo,
  costLineOf,
  createPersonViaApi,
  createPoPublic,
  feeRow,
  feeRows,
  feeTable,
  fiPaidLabel,
  freelancerPath,
  nameSlug,
  openFreelancer,
  personWithPlayedFee,
  poByNumber,
  poFutureYear,
  poPastYear,
  poRow,
  poTable,
} from './po';

// Purchase orders end to end (UC-033, UC-034, BR-113…BR-119, TASK-024): freelancer link → the
// freelancer creates a PO without a session → a partner marks it paid → the event cost lines are
// paid and locked; unmark, cancel, logs, and the guards around it. Synthetic, tagged data only;
// played events live in a past year of their own per project (poPastYear), so other specs' figures
// stay untouched. Public requests are kept low (rate limit 60 / min / IP, shared with offers).

const PRICE_CENTS = 4370000; // distinctive event price: must never reach the freelancer
const PRICE_FORMS = ['4370000', '43700', '43 700', '43 700', '43 700', '43,700', '43.700'];
const VIEW_KEYS = ['lines', 'name', 'purchaseOrders', 'settings'];
const LINE_KEYS = ['amountCents', 'costLineId', 'description', 'eventEndDate', 'eventStartDate', 'purchaseOrderNumber', 'state', 'type', 'venue'];
const PUBLIC_PO_KEYS = ['createdAt', 'lines', 'number', 'paidAt', 'status', 'totalCents', 'vatLiable', 'vatRateBp'];
const PUBLIC_PO_LINE_KEYS = ['amountCents', 'baseCents', 'deductionCents', 'description', 'eventStartDate', 'soundcheck', 'type', 'vatCents', 'venue'];

/** Contract "Freelancer PO: VAT and sound check" / "VAT rate choice": fee − deduction (≥ 0), then × (1 + rate) rounded. */
function poAmount(fee: number, soundcheck: boolean, vatRateBp: number, settings: { soundcheckDeductionCents: number }) {
  const net = soundcheck ? fee : Math.max(fee - settings.soundcheckDeductionCents, 0);
  return vatRateBp > 0 ? Math.round((net * (10000 + vatRateBp)) / 10000) : net;
}
/** "13,5 %" from basis points (Finnish). */
const fiRate = (bp: number) => `${String(bp / 100).replace('.', ',')} %`;
const PO_NUMBER = /^[A-Z0-9-]+-\d{4,}$/;

test('freelancer link → create PO → mark paid → event lines paid and locked; unmark, cancel, logs', async ({ page, context, browser, baseURL, request }, testInfo) => {
  test.setTimeout(240_000);
  const tag = tagOf(testInfo);
  const s = suffix();
  const past = poPastYear(testInfo);
  const me = await signIn(page, PARTNER_A, { selectedYear: CURRENT_YEAR });
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);

  // ---- Setup via API ----
  const person = await createPersonViaApi(page, `PO Person ${tag}-${s}`);
  const other = await createPersonViaApi(page, `PO Other ${tag}-${s}`);
  const client = await createClientViaApi(page, `PO Client ${tag}-${s}`, `Internal note ${tag}-${s}`);
  const venue = (n: number) => `Venue PO${n} ${tag}-${s}`;
  const d1 = `${past}-03-10`;
  const d2 = `${past}-04-12`;
  const d3 = `${poFutureYear(testInfo)}-05-20`;
  const d4 = `${past}-05-05`;
  const event1 = await createEventViaApi(page, { startDate: d1, venue: venue(1), priceCents: PRICE_CENTS });
  const event2 = await createEventViaApi(page, { startDate: d2, venue: venue(2), priceCents: PRICE_CENTS });
  const event3 = await createEventViaApi(page, { startDate: d3, venue: venue(3), priceCents: PRICE_CENTS });
  const event4 = await createEventViaApi(page, { startDate: d4, venue: venue(4), priceCents: PRICE_CENTS });
  await api(page).patch(`/events/${event1.id}`, { clientId: client.id });
  const drums1 = await addLine(page, event1.id, person.id, 'DRUMS', 30000); // selectable
  const keys1 = await addLine(page, event1.id, person.id, 'KEYS', 10000); // goes on the other-year PO
  const zero1 = await addLine(page, event1.id, person.id, 'GUITAR', 0); // 0 € → hidden
  await addLine(page, event1.id, other.id, 'PIANO', 70000); // another person → hidden
  const bass2 = await addLine(page, event2.id, person.id, 'BASS', 40000); // selectable
  const backing2 = await addLine(page, event2.id, person.id, 'BACKING_VOC', 20000); // paid outside a PO
  await api(page).post(`/cost-lines/${backing2}/pay`, {});
  const voc3 = await addLine(page, event3.id, person.id, 'VOC', 60000); // upcoming
  const voc4 = await addLine(page, event4.id, person.id, 'VOC', 50000); // cancelled event → hidden
  await api(page).post(`/events/${event4.id}/cancel`, { reason: 'Synthetic reason' });

  // ---- Person page: copy the link; regenerate → the old link is not found ----
  const firstPath = await freelancerPath(page, person.id);
  await page.goto(`/people/${person.id}`);
  await expect(page.getByRole('heading', { level: 1, name: person.name })).toBeVisible();
  const origin = new URL(page.url()).origin;
  const linkField = page.getByRole('textbox', { name: 'Freelancer-linkki', exact: true });
  await expect(linkField).toHaveValue(`${origin}${firstPath}`);
  await page.getByRole('button', { name: 'Kopioi linkki', exact: true }).click();
  const copied = page.getByRole('status').filter({ hasText: /Linkki kopioitu leikepöydälle\.|Kopiointi ei onnistunut/ });
  await expect(copied).toBeVisible();
  if (await copied.getByText('Linkki kopioitu leikepöydälle.').isVisible()) {
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(`${origin}${firstPath}`);
  }
  expect(new URL(await linkField.inputValue()).pathname).toMatch(/^\/f\/[A-Za-z0-9_-]{43,}$/);

  await page.getByRole('button', { name: 'Luo uusi linkki', exact: true }).click();
  const confirm = page.getByRole('dialog', { name: 'Luo uusi linkki' });
  await expect(confirm).toContainText('Nykyinen linkki lakkaa toimimasta heti.');
  await confirm.getByRole('button', { name: 'Luo uusi linkki', exact: true }).click();
  await expect(confirm).toBeHidden();
  await expect(page.getByRole('status').filter({ hasText: 'Uusi linkki luotu. Vanha linkki ei enää toimi.' })).toBeVisible();
  const sharePath = await freelancerPath(page, person.id);
  expect(sharePath).not.toBe(firstPath);
  await expect(linkField).toHaveValue(`${origin}${sharePath}`);

  const anon = await anonymous(browser, testInfo, baseURL!);
  const fp = anon.page;
  const oldRes = await openFreelancer(anon, firstPath);
  expect(oldRes.status()).toBe(404);
  expect((await oldRes.json()).error.code).toBe('NOT_FOUND');
  await expect(fp.getByRole('heading', { level: 1, name: 'Linkkiä ei löydy' })).toBeVisible();

  // A PO from another year (search must find it, BR-119): created now, then backdated 3 years.
  const oldPo = await createPoPublic(request, sharePath, [keys1]);
  backdatePo(oldPo.number, 3);

  // ---- Freelancer page without a session ----
  anon.responses.length = 0;
  const viewRes = await openFreelancer(anon, sharePath);
  expect(viewRes.status()).toBe(200);
  expect(viewRes.headers()['x-robots-tag']).toMatch(/noindex/);
  expect(await anon.context.cookies(), 'no session cookie').toEqual([]);
  const view = await viewRes.json();
  expect(Object.keys(view).sort()).toEqual(VIEW_KEYS);
  expect(view.name).toBe(person.name);
  expect(Object.keys(view.settings).sort()).toEqual(['soundcheckDeductionCents', 'vatRatesBp']);
  const settings = view.settings as { soundcheckDeductionCents: number; vatRatesBp: number[] };
  expect(settings.vatRatesBp.length, 'two VAT rates to choose from').toBe(2);
  // Drums: not at the sound check; bass: at it; the second (higher) VAT rate.
  const vatRateBp = settings.vatRatesBp[1]!;
  const drumsAmount = poAmount(30000, false, vatRateBp, settings);
  const bassAmount = poAmount(40000, true, vatRateBp, settings);
  const poTotal = drumsAmount + bassAmount;
  for (const line of view.lines) expect(Object.keys(line).sort()).toEqual(LINE_KEYS);
  for (const po of view.purchaseOrders) {
    expect(Object.keys(po).sort()).toEqual(PUBLIC_PO_KEYS);
    for (const l of po.lines) expect(Object.keys(l).sort()).toEqual(PUBLIC_PO_LINE_KEYS);
  }
  const states = Object.fromEntries(view.lines.map((l: { costLineId: string; state: string }) => [l.costLineId, l.state]));
  expect(states).toEqual({
    [voc3]: 'UPCOMING',
    [bass2]: 'SELECTABLE',
    [backing2]: 'PAID',
    [drums1]: 'SELECTABLE',
    [keys1]: 'ON_PO',
  });
  const dates = view.lines.map((l: { eventStartDate: string }) => l.eventStartDate);
  expect(dates, 'newest event first').toEqual([...dates].sort().reverse());
  for (const hidden of [zero1, voc4]) expect(states[hidden], 'cancelled event / 0 € line hidden').toBeUndefined();

  // Only own lines: no price, client, notes, other people or partners — in the page and the JSON.
  await expect(fp.getByRole('heading', { level: 1, name: person.name })).toBeVisible();
  const text = await fp.evaluate(() => document.body.innerText);
  const html = await fp.content();
  const secrets = [client.name, `Internal note ${tag}-${s}`, other.name, me.name, venue(4), fiMoney(70000), fiMoney(50000), 'priceCents'];
  for (const secret of [...secrets, ...PRICE_FORMS]) {
    expect(text.includes(secret), `page text has "${secret}"`).toBe(false);
    expect(html.includes(secret), `page DOM has "${secret}"`).toBe(false);
  }
  for (const res of anon.responses.filter((r) => new URL(r.url()).pathname.startsWith('/api/'))) {
    expect(new URL(res.url()).pathname.startsWith('/api/public/freelancers/'), `only public calls: ${res.url()}`).toBe(true);
    const body = await res.text().catch(() => '');
    for (const secret of [...secrets, ...PRICE_FORMS, 'clientName', 'personId', 'partner']) {
      expect(body.includes(secret), `${res.url()} has "${secret}"`).toBe(false);
    }
  }

  // Rows: upcoming not selectable; paid; the other-year PO's line "Ostotilaus <number>".
  await expect(feeRows(fp)).toHaveCount(5);
  const upcoming = feeRow(fp, venue(3), 'Laulu');
  await expect(upcoming).toContainText('Keikka on vielä tulossa');
  await expect(upcoming.getByRole('checkbox')).toHaveCount(0);
  await expect(feeRow(fp, venue(2), 'Taustalaulu')).toContainText('Maksettu');
  await expect(feeRow(fp, venue(2), 'Taustalaulu').getByRole('checkbox')).toHaveCount(0);
  await expect(feeRow(fp, venue(1), 'Koskettimet')).toContainText(`Ostotilaus ${oldPo.number}`);
  await expect(fp.getByText(venue(4))).toHaveCount(0);

  // Select fees from two events → modal: VAT question + sound check per fee → create.
  // Scoped to the fee table: the PO breakdowns below have the same column.
  await expect(feeTable(fp).getByRole('columnheader', { name: 'Palkkio alv 0 %' })).toBeVisible();
  const create = fp.getByRole('button', { name: 'Luo ostotilausnumero', exact: true });
  await expect(create).toBeDisabled();
  await fp.getByRole('checkbox', { name: `Valitse: ${fiDate(d1)}, ${venue(1)}, Rummut` }).check();
  await fp.getByRole('checkbox', { name: `Valitse: ${fiDate(d2)}, ${venue(2)}, Basso` }).check();
  await expect(fp.getByText(`Yhteensä ${fiMoney(70000)}`)).toBeVisible();
  await create.click();
  const modal = fp.getByRole('dialog', { name: 'Luo ostotilausnumero' });
  await expect(modal.getByRole('group', { name: 'Oletko ALV-velvollinen?' })).toBeVisible();
  await expectNoHorizontalScroll(fp, 'create-PO modal');
  // Keyboard: Escape closes; the button opens it again.
  await fp.keyboard.press('Escape');
  await expect(modal).toBeHidden();
  await create.click();
  const confirmPo = modal.getByRole('button', { name: 'Vahvista ja luo', exact: true });
  await confirmPo.click();
  await expect(modal.getByRole('alert')).toHaveText('Valitse jokin vaihtoehdoista.');
  // Three answers: Ei and one per rate from settings.
  await expect(modal.getByRole('radio')).toHaveCount(3);
  await expect(modal.getByRole('radio', { name: 'Ei', exact: true })).toBeVisible();
  for (const bp of settings.vatRatesBp) {
    await expect(modal.getByRole('radio', { name: `Kyllä, ALV ${fiRate(bp)}`, exact: true })).toBeVisible();
  }
  const drumsSwitch = modal.getByRole('switch', { name: `Olin soundcheckissä: ${fiDate(d1)}, ${venue(1)}, Rummut` });
  await expect(drumsSwitch).toBeChecked();
  await expect(modal.getByRole('switch', { name: `Olin soundcheckissä: ${fiDate(d2)}, ${venue(2)}, Basso` })).toBeChecked();
  await drumsSwitch.uncheck();
  const modalTotal = modal.getByRole('region', { name: 'Ostotilaus yhteensä' });
  // The preview follows the chosen rate.
  await modal.getByRole('radio', { name: `Kyllä, ALV ${fiRate(settings.vatRatesBp[0]!)}`, exact: true }).check();
  await expect(modalTotal).toContainText(fiMoney(poAmount(30000, false, settings.vatRatesBp[0]!, settings) + poAmount(40000, true, settings.vatRatesBp[0]!, settings)));
  await modal.getByRole('radio', { name: `Kyllä, ALV ${fiRate(vatRateBp)}`, exact: true }).check();
  await expect(modalTotal).toContainText(fiMoney(poTotal));
  if (settings.soundcheckDeductionCents > 0) await expect(modalTotal).toContainText('Soundcheck-vähennys');
  await expect(modalTotal).toContainText(`ALV ${fiRate(vatRateBp)}`);
  const postRes = fp.waitForResponse((r) => r.request().method() === 'POST' && r.url().includes('/purchase-orders'));
  await confirmPo.click();
  const created = await postRes;
  expect(created.status()).toBe(201);
  expect(created.request().postDataJSON()).toEqual({
    vatRateBp,
    lines: expect.arrayContaining([
      { costLineId: drums1, soundcheck: false },
      { costLineId: bass2, soundcheck: true },
    ]),
  });
  await expect(modal).toBeHidden();
  const po = (await created.json()) as { number: string; totalCents: number; status: string; vatLiable: boolean; vatRateBp: number };
  expect(po.number).toMatch(PO_NUMBER);
  expect(po.number.startsWith(`${nameSlug(person.name)}-`), `${po.number} starts with the name slug`).toBe(true);
  expect(po.number).not.toBe(oldPo.number);
  expect(po.totalCents).toBe(poTotal);
  expect(po.vatLiable).toBe(true);
  expect(po.vatRateBp).toBe(vatRateBp);
  expect(po.status).toBe('OPEN');
  await expect(fp.getByRole('status').filter({ hasText: `Ostotilausnumero ${po.number} luotu.` })).toBeVisible();
  await expect(feeRow(fp, venue(1), 'Rummut')).toContainText(`Ostotilaus ${po.number}`);
  await expect(feeRow(fp, venue(2), 'Basso')).toContainText(`Ostotilaus ${po.number}`);
  await expect(fp.getByRole('heading', { level: 3, name: po.number })).toBeVisible();
  await expect(fp.getByRole('button', { name: `Kopioi numero ${po.number}` })).toBeVisible();
  const newOrder = fp.getByRole('listitem').filter({ has: fp.getByRole('heading', { level: 3, name: po.number }) });
  await expect(newOrder.locator('dd').filter({ hasText: /^ALV / })).toHaveText(`ALV ${fiRate(vatRateBp)}`);
  await expect(newOrder.getByRole('columnheader', { name: 'Soundcheck-vähennys' })).toHaveCount(1);
  await expect(newOrder).toContainText(fiMoney(poTotal));
  await expect(fp.getByRole('button', { name: 'Luo ostotilausnumero', exact: true })).toBeDisabled();

  // ---- Partner: Ostotilaukset ----
  await page.goto('/');
  await goNav(page, 'Ostotilaukset');
  await expect(page.getByRole('heading', { level: 1, name: 'Ostotilaukset' })).toBeVisible();
  const row = poRow(page, po.number);
  await expect(row).toBeVisible();
  await expect(row).toContainText(person.name);
  await expect(row).toContainText(fiMoney(poTotal));
  // Every year is listed (contract "Year is no longer global"): the backdated PO too, below.
  await expect(poRow(page, oldPo.number), 'the backdated PO is listed (all years)').toHaveCount(1);
  await expect(page.getByRole('combobox', { name: 'Valittu vuosi' })).toHaveCount(0);

  // Search by part of the number finds it; the shared slug finds the other year's PO too.
  const search = page.getByLabel('Haku', { exact: true });
  await search.fill(po.number.slice(-9).toLowerCase());
  await expect(poRow(page, po.number)).toBeVisible();
  await expect(poRow(page, oldPo.number)).toHaveCount(0);
  await search.fill(`${tag}-${s}`.toLowerCase());
  await expect(poRow(page, po.number)).toBeVisible();
  await expect(poRow(page, oldPo.number)).toBeVisible();
  await search.fill('');
  await expect(page.getByRole('heading', { level: 1, name: 'Ostotilaukset' })).toBeVisible();

  // Mark paid in the list → green "Maksettu <date> klo <time>".
  const payRes = page.waitForResponse((r) => r.request().method() === 'POST' && r.url().endsWith('/pay'));
  await poRow(page, po.number).getByRole('button', { name: `Merkitse maksetuksi: ${po.number}` }).click();
  expect((await payRes).status()).toBe(200);
  const paid = await poByNumber(page, po.number);
  expect(paid.status).toBe('PAID');
  const paidLabel = poRow(page, po.number).locator('.tag.tag-ok');
  await expect(paidLabel).toHaveText(fiPaidLabel(paid.paidAt!));
  await expect(poRow(page, po.number).getByRole('button', { name: /Merkitse maksetuksi/ })).toHaveCount(0);

  // Event page: lines paid with the PO amount, PO tag, controls locked.
  for (const [lineId, eventId, amount] of [[drums1, event1.id, drumsAmount], [bass2, event2.id, bassAmount]] as const) {
    const line = await costLineOf(page, eventId, lineId);
    expect(line.paidAt).not.toBeNull();
    expect(line.actualCents).toBe(amount);
    expect(line.purchaseOrder).toEqual({ id: paid.id, number: po.number, status: 'PAID' });
  }
  await page.goto(`/gigs/${event1.id}`);
  await expect(pageHead(page)).toBeVisible();
  const drums = costLine(page, 'Rummut');
  const tagLink = drums.getByRole('link', { name: `Ostotilaus ${po.number}` });
  await expect(tagLink).toBeVisible();
  await expect(tagLink).toHaveAttribute('href', `/purchase-orders/${paid.id}`);
  await expect(drums).toContainText(fiMoney(drumsAmount));
  await expect(costField(page, 'Budjetti', 'Rummut')).toBeDisabled();
  await expect(costField(page, 'Henkilö', 'Rummut')).toBeDisabled();
  await expect(drums.getByRole('button', { name: /Merkitse maksetuksi|Poista maksumerkintä|Poista/ })).toHaveCount(0);
  await expect(drums.getByRole('switch')).toBeDisabled();

  // API: the amount can't be changed while the line is on a PO (BR-118).
  const patch = await page.request.patch(`/api/cost-lines/${drums1}`, { data: { budgetedCents: 10000 } });
  expect(patch.status()).toBe(409);
  const patchErr = (await patch.json()).error;
  expect(patchErr.code).toBe('COST_LINE_ON_PURCHASE_ORDER');
  expect(patchErr.details.purchaseOrderNumber).toBe(po.number);

  // Freelancer page shows Maksettu.
  await openFreelancer(anon, sharePath);
  await expect(feeRow(fp, venue(1), 'Rummut')).toContainText('Maksettu');
  await expect(feeRow(fp, venue(1), 'Rummut')).toContainText(po.number);
  const fpOrder = fp.getByRole('listitem').filter({ has: fp.getByRole('heading', { level: 3, name: po.number }) });
  await expect(fpOrder).toContainText(fiPaidLabel(paid.paidAt!));

  // ---- PO page: Unmark paid (confirm) → open, lines unpaid ----
  await page.goto('/purchase-orders');
  await poRow(page, po.number).getByRole('link', { name: po.number, exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: po.number })).toBeVisible();
  await expect(pageHead(page).locator('.tag.tag-ok')).toHaveText(fiPaidLabel(paid.paidAt!));
  const lines = page.getByRole('table', { name: 'Ostotilauksen palkkiot' });
  await expect(lines.getByRole('link', { name: `Avaa keikka: ${venue(1)}` })).toHaveAttribute('href', `/gigs/${event1.id}`);
  await expect(lines.getByRole('link', { name: `Avaa keikka: ${venue(2)}` })).toHaveAttribute('href', `/gigs/${event2.id}`);
  await expect(lines).toContainText(fiMoney(poTotal));
  await expect(page.locator('.po-facts')).toContainText(`ALV ${fiRate(vatRateBp)}`);
  await expect(lines.getByRole('columnheader', { name: 'Palkkio alv 0 %' })).toHaveCount(1);
  await expect(lines).toContainText(fiMoney(70000)); // fees excl. VAT in the totals row

  await page.getByRole('button', { name: 'Peru maksu', exact: true }).click();
  const unpay = page.getByRole('dialog', { name: 'Peru maksu' });
  await expect(unpay).toContainText(`Ostotilaus ${po.number} palautetaan avoimeksi`);
  await unpay.getByRole('button', { name: 'Peru maksu', exact: true }).click();
  await expect(unpay).toBeHidden();
  await expect(pageHead(page)).toContainText('Avoin');
  expect((await poByNumber(page, po.number)).status).toBe('OPEN');
  for (const [lineId, eventId] of [[drums1, event1.id], [bass2, event2.id]] as const) {
    const line = await costLineOf(page, eventId, lineId);
    expect(line.paidAt).toBeNull();
    expect(line.purchaseOrder?.status).toBe('OPEN');
  }

  // Cancel with a reason → fees selectable again on the freelancer page.
  const reason = `Synthetic cancel ${tag}-${s}`;
  await page.getByRole('button', { name: 'Peru ostotilaus', exact: true }).click();
  const cancel = page.getByRole('dialog', { name: 'Peru ostotilaus' });
  await expect(cancel.getByRole('button', { name: 'Peru ostotilaus', exact: true })).toBeDisabled();
  await cancel.getByLabel('Syy').fill(reason);
  await cancel.getByRole('button', { name: 'Peru ostotilaus', exact: true }).click();
  await expect(cancel).toBeHidden();
  await expect(pageHead(page).locator('.tag.tag-muted')).toHaveText('Peruttu');
  await expect(page.getByRole('main')).toContainText(reason);
  expect((await costLineOf(page, event1.id, drums1)).purchaseOrder).toBeNull();

  // Log on the PO page: created (Freelancer), paid, unpaid, cancelled — newest first, with actors.
  const expectedLog: [string, string][] = [
    [`Peruttu: ${reason}`, me.name],
    ['Maksu peruttu', me.name],
    ['Merkitty maksetuksi', me.name],
    ['Luotu freelancerin linkillä', 'Freelancer'],
  ];
  const history = page.getByRole('table', { name: 'Historia', exact: true }).getByRole('row').filter({ has: page.getByRole('cell') });
  await expect(history).toHaveCount(4);
  for (const [i, [event, actor]] of expectedLog.entries()) {
    await expect(history.nth(i)).toContainText(event);
    await expect(history.nth(i)).toContainText(actor);
  }
  const apiHistory = (await api(page).get(`/purchase-orders/${paid.id}/history`)) as { type: string; partnerId: string | null; details: { reason?: string } }[];
  expect(apiHistory.map((e) => [e.type, e.partnerId])).toEqual([
    ['CANCELLED', me.id],
    ['UNPAID', me.id],
    ['PAID', me.id],
    ['CREATED', null],
  ]);
  expect(apiHistory[0].details.reason).toBe(reason);

  // … and in the list's log, with the number.
  await page.goto('/purchase-orders');
  await expect(page.getByRole('heading', { level: 1, name: 'Ostotilaukset' })).toBeVisible();
  await expect(poRow(page, po.number).locator('.tag.tag-muted')).toHaveText('Peruttu');
  const log = page
    .getByRole('table', { name: 'Ostotilausten muutokset' })
    .getByRole('row')
    .filter({ has: page.getByRole('link', { name: po.number, exact: true }) });
  await expect(log).toHaveCount(4);
  for (const [i, [event, actor]] of expectedLog.entries()) {
    await expect(log.nth(i)).toContainText(event);
    await expect(log.nth(i)).toContainText(actor);
  }

  // Freelancer page: the fees are selectable again; the PO is listed as cancelled.
  await openFreelancer(anon, sharePath);
  await expect(fp.getByRole('checkbox', { name: `Valitse: ${fiDate(d1)}, ${venue(1)}, Rummut` })).toBeVisible();
  await expect(fp.getByRole('checkbox', { name: `Valitse: ${fiDate(d2)}, ${venue(2)}, Basso` })).toBeVisible();
  const cancelledOrder = fp.getByRole('listitem').filter({ has: fp.getByRole('heading', { level: 3, name: po.number }) });
  await expect(cancelledOrder).toContainText('Peruttu');
  expect(await fp.evaluate(() => document.body.innerText)).not.toContain(reason);

  expect(anon.problems, 'browser errors on the freelancer page').toEqual([]);
  await anon.context.close();
});

test('two parallel creates with the same line → one 201, one 409 COST_LINE_NOT_ELIGIBLE', async ({ page, playwright, baseURL }, testInfo) => {
  await signIn(page);
  const { lineId, sharePath, eventId } = await personWithPlayedFee(page, testInfo, 'PO Race');
  const url = `/api/public/freelancers/${sharePath.replace(/^\/f\//, '')}/purchase-orders`;
  const [a, b] = await Promise.all([playwright.request.newContext({ baseURL }), playwright.request.newContext({ baseURL })]);
  const results = await Promise.all([a.post(url, { data: { costLineIds: [lineId] } }), b.post(url, { data: { costLineIds: [lineId] } })]);
  const statuses = results.map((r) => r.status()).sort();
  expect(statuses).toEqual([201, 409]);
  const conflict = results.find((r) => r.status() === 409)!;
  const err = (await conflict.json()).error;
  expect(err.code).toBe('COST_LINE_NOT_ELIGIBLE');
  expect(err.details.costLineIds).toEqual([lineId]);
  const ok = await results.find((r) => r.status() === 201)!.json();
  // Exactly one PO holds the line.
  const line = await costLineOf(page, eventId, lineId);
  expect(line.purchaseOrder?.number).toBe(ok.number);
  const list = (await api(page).get(`/purchase-orders?q=${encodeURIComponent(ok.number.replace(/-\d+$/, ''))}`)) as { purchaseOrders: unknown[] };
  expect(list.purchaseOrders).toHaveLength(1);
  await Promise.all([a.dispose(), b.dispose()]);
});

test('event cancel with a line on an open PO → error shown, event unchanged', async ({ page, request }, testInfo) => {
  await signIn(page);
  const { lineId, sharePath, eventId } = await personWithPlayedFee(page, testInfo, 'PO Guard');
  const po = await createPoPublic(request, sharePath, [lineId]);

  await page.goto(`/gigs/${eventId}`);
  await expect(pageHead(page)).toBeVisible();
  await page.getByRole('group', { name: 'Toiminnot' }).getByRole('button', { name: 'Peru keikka' }).click();
  const dialog = page.getByRole('dialog', { name: 'Peru keikka' });
  await dialog.getByLabel('Syy').fill('Synthetic reason');
  const res = page.waitForResponse((r) => r.request().method() === 'POST' && r.url().endsWith('/cancel'));
  await dialog.getByRole('button', { name: 'Peru keikka' }).click();
  const cancelRes = await res;
  expect(cancelRes.status()).toBe(409);
  const err = (await cancelRes.json()).error;
  expect(err.code).toBe('COST_LINE_ON_PURCHASE_ORDER');
  expect(err.details.purchaseOrderNumber).toBe(po.number);
  await expect(dialog.getByRole('alert')).toContainText(`Rivi on ostotilauksella ${po.number}.`);
  await dialog.getByRole('button', { name: 'Peruuta', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(pageHead(page)).not.toContainText('Peruttu');
  await page.reload();
  await expect(pageHead(page)).toBeVisible();
  await expect(pageHead(page)).not.toContainText('Peruttu');
  const event = (await api(page).get(`/events/${eventId}`)) as { status: string };
  expect(event.status).toBe('SOLD');
  // Delete is guarded the same way.
  const del = await page.request.post(`/api/events/${eventId}/delete`, { data: { reason: 'Synthetic reason' } });
  expect(del.status()).toBe(409);
  expect((await del.json()).error.code).toBe('COST_LINE_ON_PURCHASE_ORDER');
});

test('no horizontal scroll: purchase order list, PO page and freelancer page', async ({ page, browser, baseURL, request }, testInfo) => {
  await signIn(page);
  const setup = await personWithPlayedFee(page, testInfo, 'PO Layout', { month: '07' });
  const second = await addLine(page, setup.eventId, setup.person.id, 'VOC', 20000);
  const po = await createPoPublic(request, setup.sharePath, [setup.lineId, second]);
  const full = await poByNumber(page, po.number);
  await api(page).post(`/purchase-orders/${full.id}/pay`);

  await page.goto('/purchase-orders');
  await expect(poRow(page, po.number)).toBeVisible();
  await expectNoHorizontalScroll(page, 'purchase order list');
  await expect(poTable(page)).toBeVisible();
  await poRow(page, po.number).getByRole('link', { name: po.number, exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: po.number })).toBeVisible();
  await expect(page.getByRole('table', { name: 'Historia', exact: true }).getByRole('row').filter({ has: page.getByRole('cell') })).toHaveCount(2);
  await expectNoHorizontalScroll(page, 'purchase order page');

  const anon = await anonymous(browser, testInfo, baseURL!);
  await openFreelancer(anon, setup.sharePath);
  await expect(anon.page.getByRole('heading', { level: 3, name: po.number })).toBeVisible();
  await expectNoHorizontalScroll(anon.page, 'freelancer page');
  expect(anon.problems).toEqual([]);
  await anon.context.close();
});

// F-010 (fixed): a long PO number (long freelancer name) wraps after its dashes in the list, so
// next to the expanded sidebar the Tila column and its "Merkitse maksetuksi" button stay on the
// page — no sideways scroll at 600 / 900 / 1200 / 1440 px.
test('F-010: a long PO number does not push the list wider than the page (600–1440 px, sidebar expanded)', async ({ page, request }, testInfo) => {
  test.skip(isMobile(testInfo), 'Desktop sidebar widths only; phones show the list as compact rows.');
  await signIn(page);
  const setup = await personWithPlayedFee(page, testInfo, 'PO Layout With A Rather Long Freelancer Name', { month: '08' });
  const po = await createPoPublic(request, setup.sharePath, [setup.lineId]);
  for (const width of [600, 900, 1200, 1440]) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto('/purchase-orders');
    await expect(poRow(page, po.number)).toBeVisible();
    // From 900 px the sidebar is shown expanded next to the list.
    if (width >= 900) await expect(page.getByRole('button', { name: 'Pienennä valikko', exact: true })).toBeVisible();
    await expect(poRow(page, po.number).getByRole('button', { name: /Merkitse maksetuksi/ })).toBeInViewport();
    await expectNoHorizontalScroll(page, `purchase order list with a long number, ${width} px`);
  }
});

// BR-113 (2026-10-18, TASK-025 / TASK-153): active partners have no freelancer link. The person
// page shows no link section, the link endpoints answer 409 PERSON_IS_PARTNER and the old /f/ link
// is "not found"; removing partner status brings the same link back.
test('BR-113: an active partner has no freelancer link; removing partner status restores it', async ({ page, browser, baseURL }, testInfo) => {
  await signIn(page);
  const tag = tagOf(testInfo);
  const s = suffix();
  const { person, sharePath } = await personWithPlayedFee(page, testInfo, 'PO Partner');
  const anon = await anonymous(browser, testInfo, baseURL!);
  expect((await openFreelancer(anon, sharePath)).status()).toBe(200);

  await api(page).put(`/people/${person.id}/partner`, { email: `partner.po${tag.toLowerCase()}${s}@example.com` });

  // Person page: no link section and no link request.
  const linkRequests: string[] = [];
  page.on('request', (r) => {
    if (r.url().includes('/freelancer-link')) linkRequests.push(r.url());
  });
  await page.goto(`/people/${person.id}`);
  await expect(page.getByRole('heading', { level: 1, name: person.name })).toBeVisible();
  await expect(page.getByRole('switch', { name: 'Osakas', exact: true })).toBeChecked();
  await expect(page.getByText('Freelancer-linkki', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('textbox', { name: 'Freelancer-linkki', exact: true })).toHaveCount(0);
  expect(linkRequests).toEqual([]);

  // API: link and regenerate → 409 PERSON_IS_PARTNER.
  for (const res of [
    await page.request.get(`/api/people/${person.id}/freelancer-link`),
    await page.request.post(`/api/people/${person.id}/freelancer-link/regenerate`),
  ]) {
    expect(res.status()).toBe(409);
    expect((await res.json()).error.code).toBe('PERSON_IS_PARTNER');
  }

  // The old public link → not found.
  expect((await openFreelancer(anon, sharePath)).status()).toBe(404);
  await expect(anon.page.getByRole('heading', { level: 1, name: 'Linkkiä ei löydy' })).toBeVisible();

  // Remove partner status → the same link works again and the section is back.
  expect((await page.request.delete(`/api/people/${person.id}/partner`)).status()).toBe(200);
  expect((await openFreelancer(anon, sharePath)).status()).toBe(200);
  await expect(anon.page.getByRole('heading', { level: 1, name: person.name })).toBeVisible();
  await page.reload();
  const origin = new URL(page.url()).origin;
  await expect(page.getByRole('textbox', { name: 'Freelancer-linkki', exact: true })).toHaveValue(`${origin}${sharePath}`);
  await anon.context.close();
});
