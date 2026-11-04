import {
  api,
  editInline,
  expect,
  expectEscReverts,
  expectInvalidNotSent,
  expectNoEditSaveButtons,
  expectNoHorizontalScroll,
  fiInput,
  fiMoney,
  goNav,
  SEED,
  signIn,
  tagOf,
  test,
  trackWrites,
} from './helpers';
import { costField, costLine, costLines, createEventViaApi, econTile, suffix, totalPriceLine } from './events';
import { yearFigure } from './year';

// Flow 2: create event from a template → cost lines → assign a person → load-in switch → mark paid →
// economics update (UC-002, UC-005).
test('create an event from a template, staff it, switch load-in, mark paid', async ({ page }, testInfo) => {
  await signIn(page);
  const tag = tagOf(testInfo);
  const venue = `Venue ${tag}-${suffix()}`;
  const startDate = tag === 'M' ? '2026-12-01' : '2026-12-08';
  const priceCents = 100000;
  const fee = SEED.templateB.roleFeeCents;
  const internal = SEED.internalFeeCents;
  const budgeted = 3 * fee + 3 * internal;

  await page.goto('/');
  await goNav(page, 'Keikat');
  await page.getByRole('link', { name: 'Uusi keikka' }).first().click();
  await expect(page.getByRole('heading', { level: 1, name: 'Uusi keikka' })).toBeVisible();
  await expectNoHorizontalScroll(page, 'new event');

  await page.getByLabel('Alkupäivä').fill(startDate);
  await page.getByLabel('Kokoonpano', { exact: true }).selectOption({ label: SEED.templateB.name });
  await page.getByLabel('Paikka').fill(venue);
  await page.getByLabel('Hinta (alv 0 %)').fill(fiInput(priceCents));
  await expect(totalPriceLine(page)).toContainText(fiMoney(priceCents));
  await page.getByRole('button', { name: 'Luo keikka' }).click();

  // Event page with the template's cost lines (BR-020) plus office/sales/production (BR-021).
  await expect(page.getByRole('heading', { level: 1, name: `${SEED.templateB.name} · ${venue}` })).toBeVisible();
  const lines = costLines(page);
  await expect(lines).toHaveCount(6);
  for (const label of ['Laulu', 'Kitara', 'DJ', 'Toimisto', 'Myynti', 'Tuotanto']) {
    await expect(costLine(page, label)).toBeVisible();
  }
  await expect(econTile(page, 'Kulut').budget).toHaveText(fiMoney(budgeted));
  await expect(econTile(page, 'Kulut').actual).toHaveText(fiMoney(0));
  await expect(page.getByRole('note').filter({ hasText: 'Miehitys kesken' })).toBeVisible();
  await expectNoHorizontalScroll(page, 'event page');

  // Assign a person to the vocals line.
  const voc = costLine(page, 'Laulu');
  await voc.getByLabel('Henkilö: Laulu').selectOption({ label: 'Person 8' });
  await expect(voc.getByLabel('Henkilö: Laulu')).toHaveValue(/.+/);
  await expect(voc.getByLabel('Henkilö: Laulu').locator('option:checked')).toHaveText('Person 8');

  // Load-in switch off: budget minus the load-in deduction (BR-026).
  const loadIn = voc.getByRole('switch', { name: 'Roudaus ja soundcheck' });
  await expect(loadIn).toBeChecked();
  // Controlled switch: it flips after the server answers, so click and wait (uncheck() would fail).
  await loadIn.click();
  await expect(loadIn).not.toBeChecked();
  const vocBudget = fee - SEED.loadInDeductionCents;
  // The budget cell is an inline money field now; it shows the deducted budget.
  await expect(costField(page, 'Budjetti', 'Laulu')).toHaveValue(fiInput(vocBudget));
  await expect(econTile(page, 'Kulut').budget).toHaveText(fiMoney(budgeted - SEED.loadInDeductionCents));

  // Unpaid: the actual cell shows only the button, no "Maksamatta" tag.
  await expect(voc).not.toContainText('Maksamatta');
  // Mark paid with the default amount (= budgeted): the button turns into the amount input in
  // place (focused, prefilled), Enter saves.
  await voc.getByRole('button', { name: 'Merkitse maksetuksi' }).click();
  const payInput = costField(page, 'Toteutunut summa', 'Laulu');
  await expect(payInput).toBeFocused();
  await expect(payInput).toHaveValue(fiInput(vocBudget));
  await expect(voc.getByRole('button', { name: 'Merkitse maksetuksi' })).toHaveCount(0);
  await payInput.press('Enter');
  // Paid: the amount is an inline field ("Toteutunut summa: Laulu") and keeps the focus. No paid
  // log (time · partner) and no "unmark paid" button in the table (TASK-178).
  await expect(costField(page, 'Toteutunut summa', 'Laulu')).toHaveValue(fiInput(vocBudget));
  await expect(costField(page, 'Toteutunut summa', 'Laulu')).toBeFocused();
  await expect(voc.locator('td.cost-paid')).not.toContainText('Partner A');
  await expect(voc.getByRole('button', { name: 'Poista maksumerkintä' })).toHaveCount(0);

  // Clearing the amount unmarks the line paid; then mark it paid again for the checks below.
  await costField(page, 'Toteutunut summa', 'Laulu').fill('');
  await costField(page, 'Toteutunut summa', 'Laulu').press('Enter');
  await expect(voc.getByRole('button', { name: 'Merkitse maksetuksi' })).toBeFocused();
  await expect(econTile(page, 'Kulut').actual).toHaveText(fiMoney(0));
  await voc.getByRole('button', { name: 'Merkitse maksetuksi' }).click();
  await costField(page, 'Toteutunut summa', 'Laulu').press('Enter');
  await expect(costField(page, 'Toteutunut summa', 'Laulu')).toHaveValue(fiInput(vocBudget));

  // Economics update: actual costs and actual margin.
  await expect(econTile(page, 'Kulut').actual).toHaveText(fiMoney(vocBudget));
  await expect(econTile(page, 'Kate').budget).toHaveText(fiMoney(priceCents - (budgeted - SEED.loadInDeductionCents)));
  await expect(econTile(page, 'Kate').actual).toHaveText(fiMoney(priceCents - vocBudget));

  // The backend agrees with what the page shows.
  const id = page.url().split('/').pop() ?? '';
  const event = await api(page).get(`/events/${id}`);
  expect(event.actualCostsCents).toBe(vocBudget);
  expect(event.budgetedCostsCents).toBe(budgeted - SEED.loadInDeductionCents);
  const vocLine = event.costLines.find((l: { type: string }) => l.type === 'VOC');
  expect(vocLine.joinsLoadIn).toBe(false);
  expect(vocLine.loadInDeductionAppliedCents).toBe(SEED.loadInDeductionCents);
  expect(vocLine.paidAt).not.toBeNull();

  // The history logged the cost events.
  const history = page.getByRole('list', { name: 'Muutoshistoria' });
  await expect(history.getByText('Merkitty maksetuksi').first()).toBeVisible();
  await expect(history.getByText('Maksumerkintä poistettu')).toBeVisible();
  await expect(history.getByText('Kuluriviä muutettu').first()).toBeVisible();
  await expect(history.getByText('Keikka luotu')).toBeVisible();
  await expectNoHorizontalScroll(page, 'event page after edits');

  // Without a reload, the event list summary and the year page (both loaded earlier in this session)
  // show the new figures.
  const year = await api(page).get('/years/2026');
  expect(year.events.soldEventsSumCents).toBeGreaterThanOrEqual(priceCents);
  await page.getByRole('main').getByRole('link', { name: 'Keikat', exact: true }).click(); // back link
  const summary = page.getByRole('region', { name: 'Vuosi yhteensä' });
  await expect(summary).toContainText(`Myytyjen keikkojen summa${fiMoney(year.events.soldEventsSumCents)}`);
  await expect(summary).toContainText(`Kulut, toteuma${fiMoney(year.events.actualCostsCents)}`);
  await expect(page.getByRole('link', { name: `${SEED.templateB.name} · ${venue}` })).toBeVisible();
  await goNav(page, 'Vuosi');
  const eventsRegion = page.getByRole('region', { name: 'Keikat' });
  await expect(eventsRegion.getByRole('link', { name: `Keikkoja ${year.events.eventCount}` })).toBeVisible();
  await expect(
    eventsRegion.getByRole('link', { name: `Myytyjen keikkojen summa ${fiMoney(year.events.soldEventsSumCents)}` }),
  ).toBeVisible();
  // Actual costs are the "Toteuma" figure of the single costs tile (a link to the list).
  await expect(
    yearFigure(eventsRegion.getByRole('link', { name: /^Kulut Budjetti / }), 'Toteuma'),
  ).toHaveText(fiMoney(year.events.actualCostsCents));
});

// Double booking (BR-022): assigning someone who already plays a seed event that day warns but saves.
test('double booking shows a warning naming the other event', async ({ page }, testInfo) => {
  await signIn(page);
  const venue = `Venue ${tagOf(testInfo)}-${suffix()}`;
  // The example seed has Person 1 on vocals at Venue X on 2026-10-17 (Template A).
  const event = await createEventViaApi(page, { startDate: '2026-10-17', venue });

  await page.goto(`/gigs/${event.id}`);
  const guitar = costLine(page, 'Kitara');
  await guitar.getByLabel('Henkilö: Kitara').selectOption({ label: 'Person 1' });
  const warning = page.getByRole('alert').filter({ hasText: 'Päällekkäinen keikka' });
  await expect(warning).toContainText('Person 1 on samaan aikaan myös keikalla (17.10.2026):');
  await expect(warning.getByRole('link', { name: 'Template A' })).toBeVisible();
  await expect(guitar.getByLabel('Henkilö: Kitara').locator('option:checked')).toHaveText('Person 1');
  await expectNoHorizontalScroll(page, 'event page with warning');
  // The select saved on change: still there after a reload.
  await page.reload();
  await expect(costField(page, 'Henkilö', 'Kitara').locator('option:checked')).toHaveText('Person 1');
});

// Cost lines are edited in place (NFR-8, UC-005): no Edit/Save buttons; budget, description and
// paid amount save on blur / Enter; Esc reverts; invalid amounts are not sent.
test('cost lines are edited in place; Esc and invalid amounts are not saved', async ({ page }, testInfo) => {
  await signIn(page);
  const venue = `Venue ${tagOf(testInfo)}-${suffix()}`;
  const fee = SEED.templateB.roleFeeCents;
  const budgeted = 3 * fee + 3 * SEED.internalFeeCents;
  const guitarBudget = 30000;
  const djPaid = 10000;
  const note = 'Synthetic note';
  const event = await createEventViaApi(page, { startDate: '2026-11-28', venue });

  await page.goto(`/gigs/${event.id}`);
  await expect(costLines(page)).toHaveCount(6);
  await expectNoEditSaveButtons(page.getByRole('table', { name: 'Kulut ja miehitys' }), 'cost lines');

  // Budget: blur saves one PATCH with just that field; the economics follow.
  const guitar = costField(page, 'Budjetti', 'Kitara');
  await expect(guitar).toHaveValue(fiInput(fee));
  expect(await editInline(page, guitar, fiInput(guitarBudget))).toEqual({ budgetedCents: guitarBudget });
  await expect(econTile(page, 'Kulut').budget).toHaveText(fiMoney(budgeted - fee + guitarBudget));

  // Description: Enter saves; the line is then named after it.
  expect(await editInline(page, costField(page, 'Kuvaus', 'Toimisto'), note, { commit: 'Enter' })).toEqual({
    description: note,
  });
  await expect(costLine(page, `Toimisto (${note})`)).toBeVisible();

  // Paid amount: after marking paid, the amount itself is edited in place.
  const dj = costLine(page, 'DJ');
  // Esc on the pay input returns to the button without saving.
  await dj.getByRole('button', { name: 'Merkitse maksetuksi' }).click();
  await costField(page, 'Toteutunut summa', 'DJ').press('Escape');
  await expect(dj.getByRole('button', { name: 'Merkitse maksetuksi' })).toBeFocused();
  // Blur saves the prefilled budget.
  await dj.getByRole('button', { name: 'Merkitse maksetuksi' }).click();
  await costField(page, 'Toteutunut summa', 'DJ').blur();
  await expect(dj.getByRole('button', { name: 'Merkitse maksetuksi' })).toHaveCount(0);
  const paid = costField(page, 'Toteutunut summa', 'DJ');
  await expect(paid).toHaveValue(fiInput(fee));
  expect(await editInline(page, paid, fiInput(djPaid))).toEqual({ actualCents: djPaid });
  await expect(econTile(page, 'Kulut').actual).toHaveText(fiMoney(djPaid));

  // Esc reverts without saving; invalid amounts show the translated error and are not sent.
  const voc = costField(page, 'Budjetti', 'Laulu');
  await expectEscReverts(page, voc, fiInput(90000), fiInput(fee));
  await expectEscReverts(page, paid, fiInput(90000), fiInput(djPaid));
  await expectInvalidNotSent(page, voc, 'abc', 'Virheellinen arvo.');
  await expectInvalidNotSent(page, paid, '-10', 'Summa ei voi olla negatiivinen.');
  await expectNoHorizontalScroll(page, 'cost lines with field errors');

  // Reload: saved values persisted, the others are unchanged.
  await page.reload();
  await expect(guitar).toHaveValue(fiInput(guitarBudget));
  await expect(costField(page, 'Kuvaus', `Toimisto (${note})`)).toHaveValue(note);
  await expect(paid).toHaveValue(fiInput(djPaid));
  await expect(voc).toHaveValue(fiInput(fee));
  await expect(voc).not.toHaveAttribute('aria-invalid', 'true');
  await expect(econTile(page, 'Kulut').budget).toHaveText(fiMoney(budgeted - fee + guitarBudget));
  await expect(econTile(page, 'Kulut').actual).toHaveText(fiMoney(djPaid));
  const saved = await api(page).get(`/events/${event.id}`);
  const byType = (type: string) => saved.costLines.find((l: { type: string }) => l.type === type);
  expect(byType('GUITAR').budgetedCents).toBe(guitarBudget);
  expect(byType('VOC').budgetedCents).toBe(fee);
  expect(byType('OFFICE').description).toBe(note);
  expect(byType('DJ').actualCents).toBe(djPaid);
});

// New line (TASK-179): "Lisää rivi" adds an empty draft row at the end of the cost table (no
// separate form). Leaving it empty drops it, Esc / trash drop it, missing type / description show
// on the fields with nothing sent; once complete, leaving the row saves it (one POST) and it turns
// into a normal inline line.
test('a new cost line is typed in an inline draft row', async ({ page }, testInfo) => {
  await signIn(page);
  const venue = `Venue ${tagOf(testInfo)}-${suffix()}`;
  const budgeted = 3 * SEED.templateB.roleFeeCents + 3 * SEED.internalFeeCents;
  const amount = 5000;
  const note = 'Synthetic rental';
  const event = await createEventViaApi(page, { startDate: '2026-11-21', venue });

  await page.goto(`/gigs/${event.id}`);
  await expect(costLines(page)).toHaveCount(6);
  const addButton = page.getByRole('button', { name: '+ Lisää rivi', exact: true });
  const draft = costLine(page, 'Uusi kulurivi');
  const draftField = (field: 'Tyyppi' | 'Kuvaus' | 'Henkilö' | 'Budjetti') =>
    page.getByRole('table', { name: 'Kulut ja miehitys' }).getByLabel(`${field}: Uusi kulurivi`, { exact: true });
  const writes = trackWrites(page);

  // An empty row at the end of the table, its type select focused; no form, no Save / Cancel.
  await addButton.click();
  await expect(draft).toBeVisible();
  await expect(costLines(page)).toHaveCount(7);
  await expect(costLines(page).last()).toHaveAccessibleName('Uusi kulurivi');
  await expect(draftField('Tyyppi')).toBeFocused();
  await expect(page.getByRole('form', { name: 'Uusi kulurivi' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Peruuta' })).toHaveCount(0);
  await expectNoHorizontalScroll(page, 'event page with a draft row');
  // Moving inside the row keeps it; leaving it empty drops it.
  await draftField('Tyyppi').press('Tab');
  await expect(draftField('Kuvaus')).toBeFocused();
  await draftField('Kuvaus').blur();
  await expect(draft).toHaveCount(0);

  // Esc drops a filled draft; so does its trash button.
  await addButton.click();
  await draftField('Kuvaus').fill(note);
  await draftField('Kuvaus').press('Escape');
  await expect(draft).toHaveCount(0);
  await addButton.click();
  await draftField('Kuvaus').fill(note);
  await draft.getByRole('button', { name: 'Poista' }).click();
  await expect(draft).toHaveCount(0);

  // Filled without a type: REQUIRED on the type, the row stays.
  await addButton.click();
  await draftField('Budjetti').fill(fiInput(amount));
  await draftField('Budjetti').blur();
  await expect(draftField('Tyyppi')).toHaveAttribute('aria-invalid', 'true');
  await expect(draftField('Tyyppi')).toHaveAccessibleDescription('Pakollinen tieto.');
  // Only one draft: "Lisää rivi" focuses it.
  await addButton.click();
  await expect(draft).toHaveCount(1);
  await expect(draftField('Tyyppi')).toBeFocused();
  await expect(draftField('Budjetti')).toHaveValue(fiInput(amount));
  // OTHER needs a description.
  await draftField('Tyyppi').selectOption({ label: 'Muu kulu' });
  await draftField('Tyyppi').blur();
  await expect(draftField('Kuvaus')).toHaveAccessibleDescription('Kuvaus on pakollinen.');
  await page.waitForTimeout(300);
  expect(writes, 'nothing is sent before the draft is complete').toEqual([]);

  // Complete: leaving the row saves it with one POST.
  await draftField('Kuvaus').fill(note);
  const posted = page.waitForResponse(
    (res) => res.request().method() === 'POST' && new URL(res.url()).pathname === `/api/events/${event.id}/cost-lines`,
  );
  await draftField('Kuvaus').blur();
  const res = await posted;
  expect(res.ok()).toBe(true);
  expect(res.request().postDataJSON()).toEqual({ type: 'OTHER', personId: null, description: note, budgetedCents: amount });
  await expect(draft).toHaveCount(0);
  const added = `Muu kulu (${note})`;
  await expect(costLine(page, added)).toBeVisible();
  await expect(costField(page, 'Budjetti', added)).toHaveValue(fiInput(amount));
  await expect(costLines(page)).toHaveCount(7);
  await expect(econTile(page, 'Kulut').budget).toHaveText(fiMoney(budgeted + amount));
  expect(writes).toEqual([`POST /api/events/${event.id}/cost-lines`]);
  await expectNoHorizontalScroll(page, 'event page after adding a line');

  // The backend agrees; the new line survives a reload.
  await page.reload();
  await expect(costField(page, 'Budjetti', added)).toHaveValue(fiInput(amount));
  const saved = await api(page).get(`/events/${event.id}`);
  const other = saved.costLines.find((l: { type: string }) => l.type === 'OTHER');
  expect(other.description).toBe(note);
  expect(other.budgetedCents).toBe(amount);
});
