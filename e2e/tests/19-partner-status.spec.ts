import type { Browser, Page, TestInfo } from '@playwright/test';
import {
  api,
  expect,
  expectNoHorizontalScroll,
  pageHead,
  PARTNER_B,
  signIn,
  tagOf,
  test,
  trackWrites,
} from './helpers';
import { createEventViaApi, suffix } from './events';
import { totalsTable } from './hours';
import { createClientViaApi, createOfferViaApi, offerYear } from './offers';

// Partner status (UC-032; BR-110…BR-112; contract "Partner status"). Every test makes its own
// tagged person a partner (synthetic `@example.com` address) and removes only that partner, so the
// seed partners A…E stay active for the other specs and the other project.

interface ApiPerson {
  id: string;
  name: string;
  active: boolean;
  partner: { id: string; email: string; active: boolean } | null;
}

async function createPerson(page: Page, name: string): Promise<ApiPerson> {
  const res = (await api(page).post('/people', { name })) as { person: ApiPerson };
  return res.person;
}

/** Synthetic partner email, unique per run and project. */
function partnerEmail(testInfo: TestInfo, s: string): string {
  return `partner.${tagOf(testInfo).toLowerCase()}${s}@example.com`;
}

const partnerSwitch = (page: Page) => page.getByRole('switch', { name: 'Osakas', exact: true });

async function openPerson(page: Page, person: Pick<ApiPerson, 'id' | 'name'>): Promise<void> {
  await page.goto(`/people/${person.id}`);
  await expect(page.getByRole('heading', { level: 1, name: person.name })).toBeVisible();
}

/** The people list row of a person (read-only list: the name is a link to the person page). */
function peopleRow(page: Page, name: string) {
  return page
    .getByRole('table', { name: 'Henkilöt' })
    .getByRole('row')
    .filter({ has: page.getByRole('link', { name, exact: true }) });
}

/** A second browser with the project's viewport: the other partner's own session. */
async function otherBrowser(browser: Browser, testInfo: TestInfo, baseURL: string | undefined): Promise<Page> {
  const { viewport, isMobile, hasTouch } = testInfo.project.use;
  const context = await browser.newContext({ baseURL, locale: 'fi-FI', timezoneId: 'Europe/Helsinki', viewport, isMobile, hasTouch });
  return context.newPage();
}

test('make a person a partner: email errors, "Osakas" label on the person page and in the list, "Näytä vain osakkaat" filter', async ({ page }, testInfo) => {
  await signIn(page);
  const s = suffix();
  const name = `Person ${tagOf(testInfo)}-${s} Grant`;
  const email = partnerEmail(testInfo, s);
  const person = await createPerson(page, name);
  expect(person.partner).toBeNull();

  await openPerson(page, person);
  const sw = partnerSwitch(page);
  await expect(sw).not.toBeChecked();
  await expect(sw).toBeEnabled();
  await expect(pageHead(page)).not.toContainText('Osakas');

  // Switch on → the email dialog; nothing is saved until "Tee osakkaaksi".
  const writes = trackWrites(page);
  await sw.click();
  const dialog = page.getByRole('dialog', { name: `Tee osakkaaksi: ${name}`, exact: true });
  await expect(dialog).toBeVisible();
  await expect(sw).not.toBeChecked();
  const emailField = dialog.getByLabel('Google-sähköposti', { exact: true });
  const grant = dialog.getByRole('button', { name: 'Tee osakkaaksi', exact: true });

  // E1: missing email → field error, nothing sent.
  await grant.click();
  await expect(emailField).toHaveAccessibleDescription(/Anna Google-sähköposti\./);
  expect(writes, 'an empty email is not sent').toEqual([]);

  // E1: not in the allowed domain → the server's INVALID_VALUE under the field (reserved .test domain).
  await emailField.fill(`person.${s}@not-allowed.test`);
  let res = page.waitForResponse((r) => r.request().method() === 'PUT' && r.url().endsWith(`/api/people/${person.id}/partner`));
  await grant.click();
  expect((await res).status()).toBe(400);
  expect(await (await res).json()).toMatchObject({ error: { fields: { email: 'INVALID_VALUE' } } });
  await expect(emailField).toHaveAccessibleDescription(/Käytä yrityksen Google-sähköpostia/);

  // E1: already a partner's email (case-insensitive) → DUPLICATE.
  await emailField.fill(PARTNER_B.toUpperCase());
  res = page.waitForResponse((r) => r.request().method() === 'PUT' && r.url().endsWith(`/api/people/${person.id}/partner`));
  await grant.click();
  expect((await res).status()).toBe(400);
  await expect(emailField).toHaveAccessibleDescription(/Osoite on jo toisella osakkaalla\./);
  await expect(sw).not.toBeChecked();

  // Valid email → partner; label on the person page.
  await emailField.fill(email);
  res = page.waitForResponse((r) => r.request().method() === 'PUT' && r.url().endsWith(`/api/people/${person.id}/partner`));
  await grant.click();
  expect((await res).status()).toBe(200);
  expect((await res).request().postDataJSON()).toEqual({ email });
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('status').filter({ hasText: `${name} on nyt osakas.` })).toBeVisible();
  await expect(sw).toBeChecked();
  await expect(pageHead(page)).toContainText('Osakas');
  await page.reload();
  await expect(partnerSwitch(page)).toBeChecked();
  await expect(pageHead(page)).toContainText('Osakas');
  await expect(page.getByLabel('Google-sähköposti', { exact: true })).toHaveValue(email);
  const saved = (await api(page).get('/people?active=all')) as ApiPerson[];
  expect(saved.find((p) => p.id === person.id)?.partner).toMatchObject({ email, active: true });
  // AC-1: the new partner appears in the reference data as an active partner.
  const ref = (await api(page).get('/reference')) as { partners: { personId: string; active: boolean; email: string }[] };
  expect(ref.partners.find((p) => p.personId === person.id)).toMatchObject({ active: true, email });
  await expectNoHorizontalScroll(page, 'person page (partner)');

  // People list: "Osakas" label and the "Näytä vain osakkaat" checkbox (?partner=true) = API.
  await page.goto('/people');
  await expect(page.getByRole('heading', { level: 1, name: 'Henkilöt' })).toBeVisible();
  await expect(peopleRow(page, name)).toContainText('Osakas');
  await expect(peopleRow(page, 'Person 1')).not.toContainText('Osakas');
  const onlyPartners = page.getByRole('main').getByRole('checkbox', { name: 'Näytä vain osakkaat', exact: true });
  await expect(onlyPartners).not.toBeChecked();
  await onlyPartners.click(); // URL-controlled: the state follows the navigation
  await expect(onlyPartners).toBeChecked();
  await expect(page).toHaveURL(/[?&]partner=true/);
  await expect(peopleRow(page, name)).toHaveCount(1);
  await expect(peopleRow(page, 'Person 1')).toHaveCount(0);
  const partnersApi = (await api(page).get('/people?partner=true')) as ApiPerson[];
  await expect(page.getByRole('table', { name: 'Henkilöt' }).getByRole('link')).toHaveCount(partnersApi.length);
  expect(partnersApi.every((p) => p.partner?.active)).toBe(true);
  await page.reload();
  await expect(onlyPartners).toBeChecked();
  await onlyPartners.click();
  await expect(onlyPartners).not.toBeChecked();
  await expect(page).not.toHaveURL(/[?&]partner=/);
  await expect(peopleRow(page, name)).toHaveCount(1);
  await expect(peopleRow(page, 'Person 1')).toHaveCount(1);
});

test('own partner status is locked (BR-112): switch disabled with a note, API 409 CANNOT_REMOVE_SELF', async ({ page }) => {
  const me = await signIn(page);
  await openPerson(page, { id: me.personId, name: me.name });
  const sw = partnerSwitch(page);
  await expect(sw).toBeChecked();
  await expect(sw).toBeDisabled();
  await expect(sw).toHaveAccessibleDescription('Et voi poistaa omaa osakkuuttasi.');
  await expect(pageHead(page)).toContainText('Osakas');
  const res = await page.request.delete(`/api/people/${me.personId}/partner`);
  expect(res.status()).toBe(409);
  expect((await res.json()).error.code).toBe('CANNOT_REMOVE_SELF');
  await page.reload();
  await expect(partnerSwitch(page)).toBeChecked();
  expect((await api(page).get('/me')).personId).toBe(me.personId);
});

test('removing a partner ends their session and sign-in; the name stays on their records; not offered for new choices', async ({ page, browser, baseURL }, testInfo) => {
  const tag = tagOf(testInfo);
  const year = offerYear(testInfo);
  await signIn(page, undefined, { selectedYear: year });
  const s = suffix();
  const name = `Person ${tag}-${s} Former`;
  const email = partnerEmail(testInfo, s);
  const person = await createPerson(page, name);
  await api(page).put(`/people/${person.id}/partner`, { email });
  const client = await createClientViaApi(page, `Client ${tag}-${s}-former`);

  // The new partner signs in (AC-1) in their own browser and creates records of their own.
  const other = await otherBrowser(browser, testInfo, baseURL);
  try {
    const partner = await signIn(other, email, { selectedYear: year });
    expect(partner.name).toBe(name);
    const offer = await createOfferViaApi(other, {
      clientId: client.id,
      eventName: `Juhla ${tag}-${s}-former`,
      eventDate: `${year}-08-08`,
      venue: 'Venue F',
    });
    expect(offer.sellerId).toBe(partner.id);
    const event = await createEventViaApi(other, { startDate: `${year}-08-15`, venue: `Venue ${tag}-${s}-former` });
    const taskTitle = `Synthetic task ${tag}-${s}-former`;
    const task = (await api(other).post('/tasks', { title: taskTitle })) as { id: string; ownerId: string };
    expect(task.ownerId).toBe(partner.id);
    const comment = `Synthetic hours ${tag}-${s}-former`;
    await api(other).post('/hours', { date: `${year}-08-01`, comment, hours: 1 });
    await other.goto('/tasks');
    await expect(other.getByRole('heading', { level: 1, name: 'Tehtävät' })).toBeVisible();

    // Partner A removes the status on the person page (A2): confirmation, then removed.
    await openPerson(page, person);
    await partnerSwitch(page).click();
    const dialog = page.getByRole('dialog', { name: `Poista osakkuus: ${name}`, exact: true });
    await expect(dialog).toContainText('Kirjautuminen estyy heti.');
    // Cancel keeps it.
    await dialog.getByRole('button', { name: 'Peruuta', exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(partnerSwitch(page)).toBeChecked();
    await partnerSwitch(page).click();
    const del = page.waitForResponse((r) => r.request().method() === 'DELETE' && r.url().endsWith(`/api/people/${person.id}/partner`));
    await dialog.getByRole('button', { name: 'Poista osakkuus', exact: true }).click();
    expect((await del).status()).toBe(200);
    await expect(dialog).toBeHidden();
    await expect(page.getByRole('status').filter({ hasText: `${name} ei ole enää osakas.` })).toBeVisible();
    await expect(partnerSwitch(page)).not.toBeChecked();
    await expect(pageHead(page)).not.toContainText('Osakas');
    const after = ((await api(page).get('/people?active=all')) as ApiPerson[]).find((p) => p.id === person.id);
    expect(after?.partner).toMatchObject({ email, active: false });
    expect(after?.active, 'the person itself stays active').toBe(true);

    // AC-2: their session ends on the next request → sign-in page with the notice; dev login refused.
    await other.getByRole('button', { name: 'Tehdyt', exact: true }).click(); // GET /api/tasks → 401
    await expect(other).toHaveURL(/\/login/);
    await expect(other.getByRole('status').filter({ hasText: 'Istunto on päättynyt. Kirjaudu uudelleen.' })).toBeVisible();
    expect((await other.request.get('/api/me')).status()).toBe(401);
    await other.getByLabel('Sähköposti').fill(email);
    await other.getByRole('button', { name: 'Kirjaudu', exact: true }).click();
    await expect(other.getByRole('alert')).toHaveText('Sinulla ei ole käyttöoikeutta.');
    await expect(other).toHaveURL(/\/login/);
    expect((await other.request.post('/api/auth/dev-login', { data: { email } })).status()).toBe(403);

    // Reference data keeps the removed partner (inactive) for old records.
    const ref = (await api(page).get('/reference')) as { partners: { id: string; name: string; active: boolean }[] };
    expect(ref.partners.find((p) => p.id === partner.id)).toMatchObject({ name, active: false });

    // Not offered for new choices: offer seller (new offer form), task owner (new task dialog).
    await page.goto('/offers/new');
    const seller = page.getByRole('main').getByLabel('Myyjä', { exact: true });
    await expect(seller.locator('option', { hasText: 'Partner B' })).toHaveCount(1);
    await expect(seller.locator('option', { hasText: name })).toHaveCount(0);
    await page.goto('/tasks');
    await page.getByRole('button', { name: 'Lisää tehtävä' }).click();
    const taskDialog = page.getByRole('dialog', { name: 'Uusi tehtävä' });
    const owner = taskDialog.getByLabel('Vastuuhenkilö');
    await expect(owner.locator('option', { hasText: 'Partner B' })).toHaveCount(1);
    await expect(owner.locator('option', { hasText: name })).toHaveCount(0);
    await taskDialog.getByRole('button', { name: 'Peruuta' }).click();

    // AC-4: the name stays on their offer, event, task and hours.
    await page.goto(`/offers/${offer.id}`);
    await expect(page.getByRole('heading', { level: 1, name: offer.eventName })).toBeVisible();
    await expect(page.getByRole('main').getByLabel('Myyjä', { exact: true }).locator('option:checked')).toHaveText(name);
    await page.goto(`/gigs/${event.id}`);
    await expect(page.getByRole('main').getByLabel('Myyjä', { exact: true }).locator('option:checked')).toHaveText(name);
    await expect(page.getByRole('main').getByLabel('Tuottaja', { exact: true }).locator('option:checked')).toHaveText(name);
    await page.goto('/tasks');
    const taskRow = page
      .getByTestId('task-item')
      .filter({ has: page.getByRole('button', { name: `Poista: ${taskTitle}`, exact: true }) });
    await expect(taskRow.getByLabel('Vastuuhenkilö', { exact: true }).locator('option:checked')).toHaveText(name);
    await page.goto(`/hours/totals?partner=${partner.id}`);
    const totals = totalsTable(page, year);
    await expect(totals).toContainText(comment);
    await expect(totals).toContainText(name);

    // People list: no label; not in "only partners" (API ?partner=false lists it).
    const others = (await api(page).get('/people?partner=false')) as ApiPerson[];
    expect(others.some((p) => p.id === person.id)).toBe(true);
    await page.goto('/people');
    await expect(peopleRow(page, name)).toHaveCount(1);
    await expect(peopleRow(page, name)).not.toContainText('Osakas');
    await page.goto('/people?partner=true');
    await expect(page.getByRole('heading', { level: 1, name: 'Henkilöt' })).toBeVisible();
    await expect(peopleRow(page, 'Partner A')).toHaveCount(1);
    await expect(peopleRow(page, name)).toHaveCount(0);

    // DELETE again → 404 (not an active partner).
    expect((await page.request.delete(`/api/people/${person.id}/partner`)).status()).toBe(404);
  } finally {
    await other.context().close();
  }
});
