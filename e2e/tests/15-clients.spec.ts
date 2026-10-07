import type { Page } from '@playwright/test';
import { createGigViaApi, gigListRows, isGigTable, suffix } from './gigs';
import {
  api,
  editInline,
  expect,
  expectEscReverts,
  expectInvalidNotSent,
  expectNoEditSaveButtons,
  expectNoHorizontalScroll,
  fiDate,
  fiInput,
  goNav,
  PARTNER_A,
  SEED,
  selectInline,
  signIn,
  tagOf,
  test,
  trackWrites,
} from './helpers';
import { clientByName, createClientViaApi, createOfferViaApi, offerYear, type Client } from './offers';

// Clients (UC-027, BR-100, BR-101): add, inline edit, search, client page, link to gigs, delete.
// Every client is tagged per project (M / D) with a random suffix; gigs and offers go to the
// project's own year (offerYear) so the older specs' 2026 figures are untouched.

const clientsTable = (page: Page) => page.getByRole('table', { name: 'Asiakkaat', exact: true });
const clientRows = (page: Page) => clientsTable(page).getByRole('row').filter({ has: page.getByRole('cell') });
const clientRow = (page: Page, name: string) =>
  clientRows(page).filter({ has: page.getByRole('link', { name, exact: true }) });

async function openClient(page: Page, client: Client): Promise<void> {
  await page.goto(`/clients/${client.id}`);
  await expect(page.getByRole('heading', { level: 1, name: client.name })).toBeVisible();
}

async function linkGig(page: Page, gigId: string, clientId: string | null): Promise<void> {
  await api(page).patch(`/gigs/${gigId}`, { clientId });
}

test('add a client: empty and duplicate names refused, then found by search', async ({ page }, testInfo) => {
  await signIn(page);
  const name = `Client ${tagOf(testInfo)}-${suffix()}`;

  await page.goto('/');
  await goNav(page, 'Asiakkaat');
  await expect(page.getByRole('heading', { level: 1, name: 'Asiakkaat' })).toBeVisible();
  await expect(clientRows(page).first()).toBeVisible();
  await expectNoHorizontalScroll(page, 'clients');

  const nameField = page.getByLabel('Nimi', { exact: true });
  const notesField = page.getByLabel('Muistiinpanot', { exact: true });
  const add = page.getByRole('button', { name: 'Lisää', exact: true });

  // E1: empty name → REQUIRED under the field, nothing sent.
  const writes = trackWrites(page);
  await add.click();
  await expect(nameField).toHaveAccessibleDescription(/Pakollinen tieto\./);
  await page.waitForTimeout(300);
  expect(writes, 'an empty name is not sent').toEqual([]);

  // Add with notes.
  await nameField.fill(name);
  await notesField.fill('Synthetic e2e client.');
  const created = page.waitForResponse((r) => r.request().method() === 'POST' && r.url().endsWith('/api/clients'));
  await add.click();
  const res = await created;
  expect(res.status()).toBe(201);
  expect(res.request().postDataJSON()).toEqual({ name, notes: 'Synthetic e2e client.' });
  const notice = page.getByRole('status').filter({ hasText: 'Asiakas lisätty:' });
  await expect(notice.getByRole('link', { name, exact: true })).toBeVisible();
  await expect(nameField).toHaveValue('');
  await expect(clientRow(page, name)).toHaveCount(1);
  await expect(clientRow(page, name)).toContainText('0');

  // E1 / BR-100: duplicate, case-insensitive and trimmed → DUPLICATE from the server, not created.
  await nameField.fill(`  ${name.toUpperCase()} `);
  const dup = page.waitForResponse((r) => r.request().method() === 'POST' && r.url().endsWith('/api/clients'));
  await add.click();
  const dupRes = await dup;
  expect(dupRes.status()).toBe(400);
  expect((await dupRes.json()).error.fields).toEqual({ name: 'DUPLICATE' });
  await expect(nameField).toHaveAccessibleDescription(/Nimi on jo käytössä\./);
  const all = (await api(page).get('/clients')) as Client[];
  expect(all.filter((c) => c.name.toLowerCase() === name.toLowerCase())).toHaveLength(1);

  // Search: substring, case-insensitive; the counts match the API.
  const search = page.getByLabel('Haku', { exact: true });
  await search.fill(name.slice(-7).toLowerCase());
  await expect(clientRows(page)).toHaveCount(1);
  await expect(clientRow(page, name)).toHaveCount(1);

  await search.fill('client a oy');
  const clientA = await clientByName(page, 'Client A Oy');
  await expect(clientRows(page)).toHaveCount(1);
  const rowA = clientRow(page, 'Client A Oy');
  await expect(rowA.getByRole('cell').nth(1)).toHaveText(String(clientA.gigCount));
  await expect(rowA.getByRole('cell').nth(2)).toHaveText(String(clientA.offerCount));

  await search.fill(`no such client ${suffix()}`);
  await expect(page.getByText('Ei hakua vastaavia asiakkaita.')).toBeVisible();
  await search.fill('');
  // Sorted by name, like the API.
  const apiNames = ((await api(page).get('/clients')) as Client[]).map((c) => c.name);
  await expect(clientRows(page).locator('a.client-link')).toHaveText(apiNames);
  await expectNoHorizontalScroll(page, 'clients after search');
});

test('client page: name and notes edited in place; lists the gigs and offers of all years, newest first', async ({ page }, testInfo) => {
  await signIn(page);
  const tag = tagOf(testInfo);
  const year = offerYear(testInfo);
  const client = await createClientViaApi(page, `Client ${tag}-${suffix()}`, 'First notes.');
  const early = await createGigViaApi(page, { startDate: `${year}-03-06`, venue: `Venue ${tag}-early` });
  const late = await createGigViaApi(page, { startDate: `${year}-09-04`, venue: `Venue ${tag}-late` });
  const older = await createGigViaApi(page, { startDate: '2026-01-23', venue: `Venue ${tag}-older` });
  for (const gig of [early, late, older]) await linkGig(page, gig.id, client.id);
  const offer = await createOfferViaApi(page, {
    clientId: client.id,
    eventName: `Juhla ${tag}-${suffix()}`,
    eventDate: `${year}-05-15`,
    venue: 'Venue Q',
    priceCents: 200000,
  });

  await openClient(page, client);
  await expectNoEditSaveButtons(page.getByRole('main'), 'client page');
  const nameField = page.getByLabel('Nimi', { exact: true });
  const notesField = page.getByLabel('Muistiinpanot', { exact: true });
  await expect(nameField).toHaveValue(client.name);
  await expect(notesField).toHaveValue('First notes.');

  // Gigs: all years, newest first; each links to its gig.
  const gigs = page.getByRole('table', { name: 'Asiakkaan keikat' });
  const gigRows = gigs.getByRole('row').filter({ has: page.getByRole('cell') });
  await expect(gigRows).toHaveCount(3);
  await expect(gigRows.nth(0)).toContainText(`Venue ${tag}-late`);
  await expect(gigRows.nth(1)).toContainText(`Venue ${tag}-early`);
  await expect(gigRows.nth(2)).toContainText(`Venue ${tag}-older`);
  await expect(gigRows.nth(0)).toContainText(SEED.templateB.name);
  // Offers with their status and a link.
  const offers = page.getByRole('table', { name: 'Asiakkaan tarjoukset' });
  const offerRows = offers.getByRole('row').filter({ has: page.getByRole('cell') });
  await expect(offerRows).toHaveCount(1);
  await expect(offerRows.first()).toContainText('Avoin');
  await expect(offerRows.first()).toContainText(fiDate(offer.eventDate));
  await expectNoHorizontalScroll(page, 'client page');

  // Name: Enter saves one PATCH; Esc reverts; empty and duplicate are refused.
  const renamed = `${client.name} Renamed`;
  expect(await editInline(page, nameField, renamed, { commit: 'Enter' })).toEqual({ name: renamed });
  await expect(page.getByRole('heading', { level: 1, name: renamed })).toBeVisible();
  await expectEscReverts(page, nameField, 'Something else', renamed);
  await expectInvalidNotSent(page, nameField, '', 'Pakollinen tieto.');
  await nameField.fill(renamed); // back to the saved value before the next check
  await nameField.press('Escape');

  await nameField.click();
  await nameField.fill('client a oy'); // seed client, other case
  const dup = page.waitForResponse((r) => r.request().method() === 'PATCH' && r.url().includes('/api/clients/'));
  await nameField.blur();
  expect((await dup).status()).toBe(400);
  await expect(nameField).toHaveAttribute('aria-invalid', 'true');
  await expect(nameField).toHaveAccessibleDescription(/Nimi on jo käytössä\./);

  // Notes: blur saves.
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: renamed })).toBeVisible();
  expect(await editInline(page, notesField, 'Second notes.')).toEqual({ notes: 'Second notes.' });

  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: renamed })).toBeVisible();
  await expect(nameField).toHaveValue(renamed);
  await expect(notesField).toHaveValue('Second notes.');
  const saved = (await api(page).get(`/clients/${client.id}`)) as { client: Client };
  expect(saved.client).toEqual({ id: client.id, name: renamed, notes: 'Second notes.' });

  // Links open the gig and the offer.
  await gigRows.nth(0).getByRole('link').first().click();
  await expect(page).toHaveURL(new RegExp(`/gigs/${late.id}$`));
  await expect(page.getByRole('heading', { level: 1, name: `${SEED.templateB.name} · Venue ${tag}-late` })).toBeVisible();
  await page.goBack();
  await offerRows.first().getByRole('link', { name: offer.eventName }).click();
  await expect(page).toHaveURL(new RegExp(`/offers/${offer.id}$`));
  await expect(page.getByRole('heading', { level: 1, name: offer.eventName })).toBeVisible();
});

test('attach a client to a gig: gig page select, "New client…", new gig form, gig list column and search', async ({ page }, testInfo) => {
  const tag = tagOf(testInfo);
  const year = offerYear(testInfo);
  await signIn(page, PARTNER_A, { selectedYear: year });
  const sfx = suffix();
  const existing = await createClientViaApi(page, `Client ${tag}-${sfx}-pick`);
  const gig = await createGigViaApi(page, { startDate: `${year}-04-10`, venue: `Venue ${tag}-${sfx}-a` });

  // Gig page: the inline select saves on change (one PATCH), "–" clears.
  await page.goto(`/gigs/${gig.id}`);
  const select = page.getByRole('main').getByLabel('Asiakas', { exact: true });
  await expect(select.locator('option:checked')).toHaveText('–');
  expect(await selectInline(page, select, existing.name)).toEqual({ clientId: existing.id });
  await page.reload();
  await expect(select.locator('option:checked')).toHaveText(existing.name);
  expect((await api(page).get(`/gigs/${gig.id}`)).clientName).toBe(existing.name);

  expect(await selectInline(page, select, '–')).toEqual({ clientId: null });
  await page.reload();
  await expect(select.locator('option:checked')).toHaveText('–');
  expect((await api(page).get(`/gigs/${gig.id}`)).clientId).toBeNull();

  // "New client…" creates the client and links it.
  const fresh = `Client ${tag}-${sfx}-inline`;
  await select.selectOption({ label: '+ Uusi asiakas…' });
  const nameInput = page.getByLabel('Uuden asiakkaan nimi');
  await expect(nameInput).toBeFocused();
  await nameInput.fill(fresh);
  const createClient = page.waitForResponse((r) => r.request().method() === 'POST' && r.url().endsWith('/api/clients'));
  const patchGig = page.waitForResponse((r) => r.request().method() === 'PATCH' && r.url().endsWith(`/api/gigs/${gig.id}`));
  await page.getByRole('button', { name: 'Lisää asiakas', exact: true }).click();
  const newClient = (await (await createClient).json()) as Client;
  expect(newClient.name).toBe(fresh);
  expect((await patchGig).request().postDataJSON()).toEqual({ clientId: newClient.id });
  await page.reload();
  await expect(select.locator('option:checked')).toHaveText(fresh);
  // The history logs the change.
  await expect(page.getByRole('list', { name: 'Muutoshistoria' }).getByText('Tietoja muutettu').first()).toBeVisible();

  // New gig form: "New client…" there too; the created gig carries the client.
  const formClient = `Client ${tag}-${sfx}-form`;
  const venue = `Venue ${tag}-${sfx}-b`;
  await page.goto('/gigs/new');
  await expect(page.getByRole('heading', { level: 1, name: 'Uusi keikka' })).toBeVisible();
  await page.getByLabel('Alkupäivä').fill(`${year}-04-11`);
  await page.getByLabel('Kokoonpano', { exact: true }).selectOption({ label: SEED.templateB.name });
  await page.getByLabel('Paikka').fill(venue);
  await page.getByLabel('Hinta (alv 0 %)').fill(fiInput(100000));
  const formSelect = page.getByLabel('Asiakas', { exact: true });
  await formSelect.selectOption({ label: '+ Uusi asiakas…' });
  await page.getByLabel('Uuden asiakkaan nimi').fill(formClient);
  await page.getByRole('button', { name: 'Lisää asiakas', exact: true }).click();
  await expect(formSelect.locator('option:checked')).toHaveText(formClient);
  const createGig = page.waitForResponse((r) => r.request().method() === 'POST' && r.url().endsWith('/api/gigs'));
  await page.getByRole('button', { name: 'Luo keikka' }).click();
  const gigRes = await createGig;
  expect(gigRes.status()).toBe(201);
  const formClientId = (await clientByName(page, formClient)).id;
  expect(gigRes.request().postDataJSON().clientId).toBe(formClientId);
  const newGig = await gigRes.json();
  expect(newGig.clientName).toBe(formClient);
  await expect(page.getByRole('heading', { level: 1, name: `${SEED.templateB.name} · ${venue}` })).toBeVisible();
  await expect(page.getByRole('main').getByLabel('Asiakas', { exact: true }).locator('option:checked')).toHaveText(formClient);

  // Gig list: the client column (table) / line (cards), linking to the client; search by client.
  await page.goto('/gigs');
  await expect(page.getByRole('heading', { level: 1, name: `Keikat ${year}` })).toBeVisible();
  const rows = gigListRows(page);
  const rowA = rows.filter({ hasText: `Venue ${tag}-${sfx}-a` });
  const rowB = rows.filter({ hasText: venue });
  await expect(rowA).toContainText(fresh);
  await expect(rowB).toContainText(formClient);
  if (isGigTable(page)) {
    await expect(page.getByRole('table', { name: 'Keikkalista' }).getByRole('columnheader', { name: 'Asiakas' })).toBeVisible();
    await expect(rowB.getByRole('link', { name: formClient })).toHaveAttribute('href', `/clients/${formClientId}`);
  } else {
    await expect(rowB).toContainText(`Asiakas: ${formClient}`);
  }

  await page.getByLabel('Haku').fill(`${sfx}-form`);
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText(venue);
  const byApi = await api(page).get(`/gigs?year=${year}&q=${encodeURIComponent(`${sfx}-FORM`)}`);
  expect(byApi.gigs.map((g: { id: string }) => g.id)).toEqual([newGig.id]);
  await expectNoHorizontalScroll(page, 'gig list with clients');

  // The client page lists the gig.
  await page.goto(`/clients/${formClientId}`);
  await expect(page.getByRole('table', { name: 'Asiakkaan keikat' })).toContainText(venue);
});

test('delete a client: refused while gigs or offers link to it (CLIENT_IN_USE), allowed when unlinked', async ({ page }, testInfo) => {
  await signIn(page);
  const tag = tagOf(testInfo);
  const year = offerYear(testInfo);
  const sfx = suffix();
  const withGig = await createClientViaApi(page, `Client ${tag}-${sfx}-gig`);
  const withOffer = await createClientViaApi(page, `Client ${tag}-${sfx}-offer`);
  const withDeletedGig = await createClientViaApi(page, `Client ${tag}-${sfx}-deleted`);
  const free = await createClientViaApi(page, `Client ${tag}-${sfx}-free`);
  const gig = await createGigViaApi(page, { startDate: `${year}-02-02`, venue: `Venue ${tag}-${sfx}-del` });
  await linkGig(page, gig.id, withGig.id);
  await createOfferViaApi(page, {
    clientId: withOffer.id,
    eventName: `Juhla ${tag}-${sfx}-del`,
    eventDate: `${year}-02-03`,
    venue: 'Venue Q',
  });
  const gone = await createGigViaApi(page, { startDate: `${year}-02-04`, venue: `Venue ${tag}-${sfx}-gone` });
  await linkGig(page, gone.id, withDeletedGig.id);
  await api(page).post(`/gigs/${gone.id}/delete`, { reason: 'e2e' });

  // UI: linked to a gig → the dialog shows the "in use" message; nothing is deleted.
  await openClient(page, withGig);
  await page.getByRole('main').getByRole('button', { name: 'Poista asiakas' }).click();
  const dialog = page.getByRole('dialog', { name: 'Poista asiakas' });
  await expect(dialog).toContainText(`Poistetaanko asiakas ${withGig.name}?`);
  const del = page.waitForResponse((r) => r.request().method() === 'DELETE' && r.url().includes('/api/clients/'));
  await dialog.getByRole('button', { name: 'Poista asiakas' }).click();
  const delRes = await del;
  expect(delRes.status()).toBe(409);
  expect((await delRes.json()).error.code).toBe('CLIENT_IN_USE');
  await expect(dialog.getByRole('alert')).toHaveText(
    'Asiakasta ei voi poistaa, koska siihen on liitetty keikkoja tai tarjouksia.',
  );
  await expect(dialog.getByRole('button', { name: 'Poista asiakas' })).toBeDisabled();
  await dialog.getByRole('button', { name: 'Peruuta' }).click();
  await expect(dialog).toBeHidden();
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: withGig.name })).toBeVisible();

  // API: an offer link and a link from a deleted gig block it too (contract: incl. deleted ones).
  for (const c of [withOffer, withDeletedGig]) {
    const res = await page.request.delete(`/api/clients/${c.id}`);
    expect(res.status(), c.name).toBe(409);
    expect((await res.json()).error.code).toBe('CLIENT_IN_USE');
  }
  // Unlinking the gig makes the client deletable.
  await linkGig(page, gig.id, null);
  expect((await page.request.delete(`/api/clients/${withGig.id}`)).status()).toBe(204);

  // UI: an unlinked client is deleted (soft) and leaves the list; its name is free again (BR-100:
  // unique among active clients).
  await openClient(page, free);
  await page.getByRole('main').getByRole('button', { name: 'Poista asiakas' }).click();
  await page.getByRole('dialog', { name: 'Poista asiakas' }).getByRole('button', { name: 'Poista asiakas' }).click();
  await expect(page).toHaveURL(/\/clients$/);
  await expect(page.getByRole('status').filter({ hasText: `Asiakas poistettu: ${free.name}.` })).toBeVisible();
  await expect(clientRow(page, free.name)).toHaveCount(0);
  const list = (await api(page).get('/clients')) as Client[];
  expect(list.some((c) => c.id === free.id || c.id === withGig.id)).toBe(false);
  // A deleted client can't be linked any more.
  const link = await page.request.patch(`/api/gigs/${gig.id}`, { data: { clientId: free.id } });
  expect(link.status()).toBe(400);
  expect((await link.json()).error.fields).toEqual({ clientId: 'UNKNOWN_REFERENCE' });
  const again = await page.request.post('/api/clients', { data: { name: free.name } });
  expect(again.status(), 'the name of a deleted client can be used again').toBe(201);
});

test('API: client endpoints need a session; nothing client-related is public (UC-027 AC-4)', async ({ playwright, baseURL }) => {
  const anon = await playwright.request.newContext({ baseURL });
  for (const path of ['/api/clients', '/api/clients?q=client']) {
    const res = await anon.get(path);
    expect(res.status(), path).toBe(401);
    expect((await res.json()).error.code).toBe('UNAUTHENTICATED');
  }
  expect((await anon.post('/api/clients', { data: { name: 'Client Anonymous' } })).status()).toBe(401);
  await anon.dispose();
});
