import {
  api,
  expect,
  expectNoEditSaveButtons,
  expectNoHorizontalScroll,
  fiInput,
  goNav,
  SEED,
  selectInline,
  signIn,
  tagOf,
  test,
} from './helpers';
import { suffix } from './gigs';

// Technical setup / logistics / house technician (contract 2026-10-05, TASK-010, TASK-011):
// technicalSetup and logistics are one code or null (selects with "–"), houseTechnician is a
// boolean (switch). Created from the new gig form, then edited in place on the gig page.

const TECH_OPTIONS = ['–', 'Talon tekniikka', 'Setti A', 'Setti B', 'Setti C'];
const LOGISTICS_OPTIONS = ['–', 'Oma paku', 'Vuokrapaku', 'Taksi', 'Muu'];

test('create a gig with Set A, own van and house technician; edit each in place; history shows old → new', async ({
  page,
}, testInfo) => {
  await signIn(page);
  const tag = tagOf(testInfo);
  const venue = `Venue ${tag}-${suffix()}`;
  const startDate = tag === 'M' ? '2026-11-14' : '2026-11-15';
  const title = `${SEED.templateB.name} · ${venue}`;

  // ---- New gig form: two selects and a switch ----
  await page.goto('/');
  await goNav(page, 'Keikat');
  await page.getByRole('link', { name: 'Uusi keikka' }).first().click();
  await expect(page.getByRole('heading', { level: 1, name: 'Uusi keikka' })).toBeVisible();

  const main = page.getByRole('main');
  const newTech = main.getByRole('combobox', { name: 'Tekniikka', exact: true });
  const newLogistics = main.getByRole('combobox', { name: 'Logistiikka', exact: true });
  const newHouseTech = main.getByRole('switch', { name: 'Talon teknikko', exact: true });
  // The old "Tekniikka" checkbox group is gone.
  await expect(main.getByRole('checkbox')).toHaveCount(0);
  await expect(newTech.locator('option')).toHaveText(TECH_OPTIONS);
  await expect(newLogistics.locator('option')).toHaveText(LOGISTICS_OPTIONS);
  // Defaults: none, none, off.
  await expect(newTech.locator('option:checked')).toHaveText('–');
  await expect(newLogistics.locator('option:checked')).toHaveText('–');
  await expect(newHouseTech).not.toBeChecked();

  await page.getByLabel('Alkupäivä').fill(startDate);
  await page.getByLabel('Kokoonpano', { exact: true }).selectOption({ label: SEED.templateB.name });
  await page.getByLabel('Paikka').fill(venue);
  await page.getByLabel('Hinta (alv 0 %)').fill(fiInput(100000));
  await newTech.selectOption({ label: 'Setti A' });
  await newLogistics.selectOption({ label: 'Oma paku' });
  await newHouseTech.check();
  await expect(newHouseTech).toBeChecked();
  await expectNoHorizontalScroll(page, 'new gig with technical setup');

  const created = page.waitForResponse(
    (res) => res.request().method() === 'POST' && new URL(res.url()).pathname === '/api/gigs',
  );
  await page.getByRole('button', { name: 'Luo keikka' }).click();
  const createRes = await created;
  expect(createRes.status(), 'POST /api/gigs').toBe(201);
  expect(createRes.request().postDataJSON()).toMatchObject({
    technicalSetup: 'SET_A',
    logistics: 'OWN_VAN',
    houseTechnician: true,
  });

  // ---- Gig page shows the saved values as inline controls ----
  await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
  const id = page.url().split('/').pop() ?? '';
  const tech = main.getByRole('combobox', { name: 'Tekniikka', exact: true });
  const logistics = main.getByRole('combobox', { name: 'Logistiikka', exact: true });
  const houseTech = main.getByRole('switch', { name: 'Talon teknikko', exact: true });
  await expect(tech.locator('option:checked')).toHaveText('Setti A');
  await expect(logistics.locator('option:checked')).toHaveText('Oma paku');
  await expect(houseTech).toBeChecked();
  await expect(tech.locator('option')).toHaveText(TECH_OPTIONS);
  await expect(logistics.locator('option')).toHaveText(LOGISTICS_OPTIONS);
  await expectNoEditSaveButtons(main, 'gig page');
  const before = await api(page).get(`/gigs/${id}`);
  expect(before).toMatchObject({ technicalSetup: 'SET_A', logistics: 'OWN_VAN', houseTechnician: true });

  // ---- Inline: each control saves on change with one PATCH of just that field ----
  expect(await selectInline(page, tech, 'Setti B')).toEqual({ technicalSetup: 'SET_B' });
  await expect(tech.locator('option:checked')).toHaveText('Setti B');
  expect(await selectInline(page, logistics, 'Taksi')).toEqual({ logistics: 'TAXI' });
  await expect(logistics.locator('option:checked')).toHaveText('Taksi');

  const switched = page.waitForResponse(
    (res) => res.request().method() === 'PATCH' && new URL(res.url()).pathname === `/api/gigs/${id}`,
  );
  await houseTech.click();
  const switchRes = await switched;
  expect(switchRes.ok(), `PATCH → ${switchRes.status()}`).toBeTruthy();
  expect(switchRes.request().postDataJSON()).toEqual({ houseTechnician: false });
  await expect(houseTech).not.toBeChecked();

  // "–" clears the technical setup (null).
  expect(await selectInline(page, tech, '–')).toEqual({ technicalSetup: null });
  await expect(tech.locator('option:checked')).toHaveText('–');

  // ---- Reload: everything reached the backend ----
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
  await expect(tech.locator('option:checked')).toHaveText('–');
  await expect(logistics.locator('option:checked')).toHaveText('Taksi');
  await expect(houseTech).not.toBeChecked();
  const after = await api(page).get(`/gigs/${id}`);
  expect(after).toMatchObject({ technicalSetup: null, logistics: 'TAXI', houseTechnician: false });

  // ---- History: one "Tietoja muutettu" per saved field, old → new, newest first ----
  const historyList = main.getByRole('list', { name: 'Muutoshistoria' });
  const items = historyList.getByRole('listitem');
  await expect(items.locator('.history-title strong')).toHaveText([
    'Tietoja muutettu',
    'Tietoja muutettu',
    'Tietoja muutettu',
    'Tietoja muutettu',
    'Keikka luotu',
  ]);
  await expect(items.nth(0).locator('.history-line')).toHaveText(['Tekniikka: Setti B → –']);
  await expect(items.nth(1).locator('.history-line')).toHaveText(['Talon teknikko: kyllä → ei']);
  await expect(items.nth(2).locator('.history-line')).toHaveText(['Logistiikka: Oma paku → Taksi']);
  await expect(items.nth(3).locator('.history-line')).toHaveText(['Tekniikka: Setti A → Setti B']);

  const events = (await api(page).get(`/gigs/${id}/history`)) as {
    type: string;
    details: { changes?: { field: string; from: unknown; to: unknown }[] };
  }[];
  expect(events.map((e) => e.type)).toEqual(['UPDATED', 'UPDATED', 'UPDATED', 'UPDATED', 'CREATED']);
  expect(events.slice(0, 4).map((e) => e.details.changes)).toEqual([
    [{ field: 'technicalSetup', from: 'SET_B', to: null }],
    [{ field: 'houseTechnician', from: true, to: false }],
    [{ field: 'logistics', from: 'OWN_VAN', to: 'TAXI' }],
    [{ field: 'technicalSetup', from: 'SET_A', to: 'SET_B' }],
  ]);
  await expectNoHorizontalScroll(page, 'gig page after technical setup edits');
});

// API: the contract's single-value shape; the old array and unknown codes are refused.
test('API: technicalSetup / logistics take one code or null; arrays and unknown codes → 400', async ({
  page,
}, testInfo) => {
  await signIn(page);
  const ref = (await api(page).get('/reference')) as {
    technicalSetups: string[];
    logistics: string[];
    lineupTemplates: { id: string; name: string }[];
  };
  expect(ref.technicalSetups).toEqual(['HOUSE_TECH', 'SET_A', 'SET_B', 'SET_C']);
  expect(ref.logistics).toEqual(['OWN_VAN', 'RENTAL_VAN', 'TAXI', 'OTHER']);
  const me = (await api(page).get('/me')) as { id: string };
  const template = ref.lineupTemplates.find((t) => t.name === SEED.templateB.name);
  if (!template) throw new Error('Template B missing from the example seed');
  const base = {
    startDate: tagOf(testInfo) === 'M' ? '2026-11-14' : '2026-11-15',
    endDate: null,
    lineupTemplateId: template.id,
    lineupName: null,
    venue: `Venue ${tagOf(testInfo)}-${suffix()}`,
    sellerId: me.id,
    producerId: me.id,
    priceCents: 100000,
    additionalSalesCents: 0,
    additionalSalesDescription: null,
    notes: null,
  };

  for (const [field, value] of [
    ['technicalSetup', ['SET_A']],
    ['technicalSetup', 'OWN_PA'],
    ['logistics', 'VAN'],
    ['houseTechnician', 'yes'],
  ] as const) {
    const res = await api(page).raw.post('/api/gigs', { data: { ...base, [field]: value } });
    expect(res.status(), `${field}: ${JSON.stringify(value)}`).toBe(400);
    expect(await res.json(), `${field} error`).toMatchObject({
      error: { code: 'VALIDATION_ERROR', fields: { [field]: 'INVALID_VALUE' } },
    });
  }

  // Omitted fields default to null / null / false.
  const gig = await api(page).post('/gigs', base);
  expect(gig).toMatchObject({ technicalSetup: null, logistics: null, houseTechnician: false });
  const patched = await api(page).patch(`/gigs/${gig.id}`, { technicalSetup: 'HOUSE_TECH', logistics: 'OTHER' });
  expect(patched.gig).toMatchObject({ technicalSetup: 'HOUSE_TECH', logistics: 'OTHER', houseTechnician: false });
  const bad = await api(page).raw.patch(`/api/gigs/${gig.id}`, { data: { technicalSetup: ['SET_B'] } });
  expect(bad.status()).toBe(400);
  expect(await bad.json()).toMatchObject({
    error: { code: 'VALIDATION_ERROR', fields: { technicalSetup: 'INVALID_VALUE' } },
  });
  // Soft-delete the helper gig so it doesn't show up in later checks.
  await api(page).post(`/gigs/${gig.id}/delete`, { reason: 'Synthetic cleanup' });
});
