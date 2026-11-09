import type { Locator, Page } from '@playwright/test';
import { api, expect, expectNoHorizontalScroll, goNav, PARTNER_A, signIn, tagOf, test } from './helpers';
import { suffix } from './events';
import { createClientViaApi, createOfferViaApi, setDisposition } from './offers';

// Contract done, follow-up done and the offers section of My gigs (owner request 2026-11-09,
// TASK-196 / TASK-058). An accepted offer without a contract shows "Sopimus tekemättä" (yellow)
// until "Sopimus tehty" is ticked on its gig; an open offer shows "Follow-up?" (blue) until
// "Follow-up tehty" is ticked on its My gigs row (revised 2026-11-09: the only place with that
// checkbox, TASK-197). Each row also shows the offer status tag (TASK-198). Own far-future years per project; synthetic data only.

interface MyOffer {
  offerId: string;
  eventName: string;
  eventDate: string;
  clientName: string;
  venue: string;
  city: string | null;
  priceCents: number | null;
  eventId: string | null;
}
interface MyOffers {
  contractMissing: MyOffer[];
  followUp: MyOffer[];
}

const offersTable = (page: Page): Locator => page.getByRole('table', { name: 'Tarjoukset', exact: true });
/** A row of the My gigs offers section by its event name. */
const myOfferRow = (page: Page, eventName: string): Locator =>
  offersTable(page)
    .locator('tbody tr')
    .filter({ has: page.getByRole('link', { name: eventName, exact: true }) });

async function partnerId(page: Page, name: string): Promise<string> {
  const ref = (await api(page).get('/reference')) as { partners: { id: string; name: string }[] };
  const partner = ref.partners.find((p) => p.name === name);
  if (!partner) throw new Error(`${name} missing from the example seed`);
  return partner.id;
}

test('My gigs offers: contract not done until ticked on the gig; follow-up until ticked on My gigs', async ({ page }, testInfo) => {
  await signIn(page, PARTNER_A);
  const year = tagOf(testInfo) === 'M' ? 2050 : 2051;
  const tag = `${tagOf(testInfo)}-${suffix()}`;
  const partnerB = await partnerId(page, 'Partner B');
  const client = await createClientViaApi(page, `Client ${tag}-mo`);
  const won = await createOfferViaApi(page, {
    clientId: client.id,
    eventName: `Won ${tag}`,
    eventDate: `${year}-05-16`,
    venue: 'Venue W',
    city: 'City W',
    priceCents: 100000,
  });
  await setDisposition(page, won.id, 'WON');
  const open = await createOfferViaApi(page, {
    clientId: client.id,
    eventName: `Open ${tag}`,
    eventDate: `${year}-06-13`,
    venue: 'Venue O',
    priceCents: 50000,
  });
  // Not mine: another seller's open offer.
  const others = await createOfferViaApi(page, {
    clientId: client.id,
    eventName: `Others ${tag}`,
    eventDate: `${year}-06-14`,
    venue: 'Venue X',
    sellerId: partnerB,
  });

  // API (contract): the fields default to false; the rows land in the right lists.
  expect(((await api(page).get(`/offers/${open.id}`)) as { followUpDone: boolean }).followUpDone).toBe(false);
  const before = (await api(page).get('/me/offers')) as MyOffers;
  expect(before.contractMissing.find((o) => o.offerId === won.id)).toEqual({
    offerId: won.id,
    eventName: won.eventName,
    eventDate: `${year}-05-16`,
    clientName: client.name,
    venue: 'Venue W',
    city: 'City W',
    priceCents: 100000,
    eventId: null,
  });
  expect(before.followUp.map((o) => o.offerId)).toContain(open.id);
  expect([...before.contractMissing, ...before.followUp].map((o) => o.offerId)).not.toContain(others.id);

  // UI: the second section on My gigs, yellow and blue tags + status tags, links to the offers.
  await page.goto('/my-gigs');
  await expect(page.getByRole('heading', { level: 2, name: 'Tarjoukset' })).toBeVisible();
  const wonRow = myOfferRow(page, won.eventName);
  await expect(wonRow.getByText('Sopimus tekemättä')).toHaveClass(/tag-warn/);
  await expect(wonRow.getByText('Hyväksytty', { exact: true })).toHaveClass(/tag-ok/);
  await expect(wonRow).toContainText('Venue W, City W');
  await expect(wonRow).toContainText(client.name);
  await expect(wonRow.getByRole('link', { name: won.eventName })).toHaveAttribute('href', `/offers/${won.id}`);
  const openRow = myOfferRow(page, open.eventName);
  await expect(openRow.getByText('Follow-up?')).toHaveClass(/tag-info/);
  await expect(openRow.getByText('Avoin', { exact: true })).toHaveClass(/tag-info/);
  await expect(wonRow.getByRole('checkbox')).toHaveCount(0);
  await expect(openRow.getByRole('link', { name: open.eventName })).toHaveAttribute('href', `/offers/${open.id}`);
  await expect(myOfferRow(page, others.eventName)).toHaveCount(0);
  await expectNoHorizontalScroll(page, 'my gigs with offers');

  // Convert the accepted offer without ticking "Sopimus tehty" (unchecked by default).
  await wonRow.getByRole('link', { name: won.eventName }).click();
  await page
    .getByRole('group', { name: 'Tarjouksen toiminnot' })
    .getByRole('button', { name: `Muuta keikaksi: ${won.eventName}` })
    .click();
  const dialog = page.getByRole('dialog', { name: 'Muuta keikaksi' });
  await expect(dialog.getByLabel('Paikka', { exact: true })).not.toHaveValue('');
  const contractBox = dialog.getByRole('checkbox', { name: 'Sopimus tehty' });
  await expect(contractBox).not.toBeChecked();
  await dialog.getByLabel('Kokoonpano', { exact: true }).selectOption({ label: 'Oma kokoonpano' });
  await dialog.getByLabel('Kokoonpanon nimi', { exact: true }).fill(`Lineup ${tag}`);
  await dialog.getByRole('button', { name: 'Muuta keikaksi' }).click();
  await expect(dialog).toBeHidden();
  const converted = (await api(page).get(`/offers/${won.id}`)) as { eventId: string | null };
  expect(converted.eventId).toBeTruthy();
  const gigId = converted.eventId!;
  expect(((await api(page).get(`/events/${gigId}`)) as { contractDone: boolean }).contractDone).toBe(false);

  // Still "Sopimus tekemättä", now linking to the gig.
  await goNav(page, 'Omat keikat');
  await expect(myOfferRow(page, won.eventName).getByText('Sopimus tekemättä')).toBeVisible();
  await expect(myOfferRow(page, won.eventName).getByRole('link', { name: won.eventName })).toHaveAttribute(
    'href',
    `/gigs/${gigId}`,
  );

  // Tick "Sopimus tehty" on the gig page: saved at once (one PATCH), then the row is gone.
  await myOfferRow(page, won.eventName).getByRole('link', { name: won.eventName }).click();
  await expect(page).toHaveURL(new RegExp(`/gigs/${gigId}$`));
  const patch = page.waitForResponse(
    (res) => res.request().method() === 'PATCH' && res.url().endsWith(`/api/events/${gigId}`),
  );
  await page.getByRole('checkbox', { name: 'Sopimus tehty' }).check();
  expect((await patch).status()).toBe(200);
  expect(((await api(page).get(`/events/${gigId}`)) as { contractDone: boolean }).contractDone).toBe(true);
  await goNav(page, 'Omat keikat');
  await expect(myOfferRow(page, open.eventName)).toHaveCount(1);
  await expect(myOfferRow(page, won.eventName)).toHaveCount(0);

  // No follow-up checkbox on the offer list or the offer page (revised 2026-11-09).
  await goNav(page, 'Tarjoukset');
  await expect(page.getByRole('link', { name: open.eventName, exact: true }).first()).toBeVisible();
  await expect(page.getByRole('checkbox', { name: /Seuranta|Follow-up/ })).toHaveCount(0);
  await page.goto(`/offers/${open.id}`);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByRole('checkbox', { name: /Seuranta|Follow-up/ })).toHaveCount(0);

  // The open offer shows "Follow-up?" until "Follow-up tehty" is ticked on its My gigs row: saved
  // at once (one PATCH), the click does not open the offer, and the row disappears.
  await goNav(page, 'Omat keikat');
  const followRow = myOfferRow(page, open.eventName);
  await expect(followRow.getByText('Follow-up?')).toBeVisible();
  const box = followRow.getByRole('checkbox', { name: 'Follow-up tehty' });
  await expect(box).not.toBeChecked();
  const followPatch = page.waitForResponse(
    (res) => res.request().method() === 'PATCH' && res.url().endsWith(`/api/offers/${open.id}`),
  );
  await box.check();
  const followRes = await followPatch;
  expect(followRes.status()).toBe(200);
  expect(followRes.request().postDataJSON()).toEqual({ followUpDone: true });
  await expect(page).toHaveURL(/\/my-gigs$/);
  await expect
    .poll(async () => ((await api(page).get(`/offers/${open.id}`)) as { followUpDone: boolean }).followUpDone)
    .toBe(true);
  await expect(myOfferRow(page, open.eventName)).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('heading', { level: 2, name: 'Tarjoukset' })).toBeVisible();
  await expect(myOfferRow(page, open.eventName)).toHaveCount(0);

  const after = (await api(page).get('/me/offers')) as MyOffers;
  expect([...after.contractMissing, ...after.followUp].map((o) => o.offerId)).not.toContain(won.id);
  expect([...after.contractMissing, ...after.followUp].map((o) => o.offerId)).not.toContain(open.id);
});

test('My gigs: the producer chip is red, musician chips stay neutral', async ({ page }, testInfo) => {
  const me = await signIn(page, PARTNER_A);
  const year = tagOf(testInfo) === 'M' ? 2050 : 2051;
  const tag = `${tagOf(testInfo)}-${suffix()}`;
  const gig = (await api(page).post('/events', {
    startDate: `${year}-08-01`,
    endDate: null,
    lineupTemplateId: null,
    lineupName: `Lineup ${tag}`,
    venue: `Venue R ${tag}`,
    technicalSetup: null,
    logistics: null,
    houseTechnician: false,
    sellerId: me.id,
    producerId: me.id,
    priceCents: 100000,
    additionalSalesCents: 0,
    additionalSalesDescription: null,
    notes: null,
  })) as { id: string };
  await api(page).post(`/events/${gig.id}/cost-lines`, { type: 'KEYS', personId: me.personId, budgetedCents: 1000 });
  await page.goto('/my-gigs');
  const row = page
    .getByRole('table', { name: 'Omat keikat' })
    .locator('tbody tr')
    .filter({ hasText: `Venue R ${tag}` });
  await expect(row.locator('.my-events-role')).toHaveText(['Tuottaja', 'Koskettimet']);
  await expect(row.locator('.my-events-role').nth(0)).toHaveClass(/tag-danger/);
  await expect(row.locator('.my-events-role').nth(1)).toHaveClass(/tag-muted/);
});
