import {
  api,
  CURRENT_YEAR,
  enMoney,
  expect,
  expectNoHorizontalScroll,
  expectSignedInShown,
  goNav,
  isWide,
  languageButton,
  navDrawer,
  PARTNER_C,
  signIn,
  test,
} from './helpers';

// Flow 9: language switch to EN; year switch (UC-001 A1, BR-081). Uses Partner C so other flows
// keep their Finnish UI; preferences are saved on the server and survive a reload.
// Layout v2: language is one toggle named after the other language ("Vaihda kieleksi English"),
// found by name on desktop and at the bottom of the ☰ drawer on phones.
test('switch language to English and change the year', async ({ page }) => {
  await signIn(page, PARTNER_C, { language: 'fi', selectedYear: CURRENT_YEAR });

  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: `Vuosi ${CURRENT_YEAR}` })).toBeVisible();

  await expectSignedInShown(page, 'Kirjautuneena: Partner C');
  await (await languageButton(page, 'Vaihda kieleksi English')).click();

  await expect(page.getByRole('heading', { level: 1, name: `Year ${CURRENT_YEAR}` })).toBeVisible();
  // One toggle: it now offers the other language (phones: the drawer stays open on the same page).
  await expect(await languageButton(page, 'Change language to Suomi')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Vaihda kieleksi English' })).toHaveCount(0);
  if (!isWide(page)) {
    await page.keyboard.press('Escape');
    await expect(navDrawer(page)).toBeHidden();
  }
  const year = await api(page).get(`/years/${CURRENT_YEAR}`);
  await expect(
    page.getByRole('region', { name: 'Gigs' }).getByRole('link', { name: `Sold gigs sum ${enMoney(year.gigs.soldGigsSumCents)}` }),
  ).toBeVisible();
  await expectNoHorizontalScroll(page, 'year page (EN)');

  // Year switch with the top-bar buttons and the picker.
  await page.getByRole('button', { name: 'Next year' }).click();
  await expect(page.getByRole('heading', { level: 1, name: `Year ${CURRENT_YEAR + 1}` })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Selected year' })).toHaveValue(String(CURRENT_YEAR + 1));
  await goNav(page, 'Gigs');
  await expect(page.getByRole('heading', { level: 1, name: `Gigs ${CURRENT_YEAR + 1}` })).toBeVisible();
  await page.getByRole('combobox', { name: 'Selected year' }).selectOption(String(CURRENT_YEAR));
  await expect(page.getByRole('heading', { level: 1, name: `Gigs ${CURRENT_YEAR}` })).toBeVisible();
  await page.getByRole('button', { name: 'Previous year' }).click();
  await expect(page.getByRole('heading', { level: 1, name: `Gigs ${CURRENT_YEAR - 1}` })).toBeVisible();

  // Both preferences are stored on the server and survive a reload.
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: `Gigs ${CURRENT_YEAR - 1}` })).toBeVisible();
  const me = await api(page).get('/me');
  expect(me.language).toBe('en');
  expect(me.selectedYear).toBe(CURRENT_YEAR - 1);
  await expectNoHorizontalScroll(page, 'gig list (EN)');
  await expectSignedInShown(page, 'Signed in as Partner C');

  // Back to Finnish.
  await (await languageButton(page, 'Change language to Suomi')).click();
  await expect(page.getByRole('heading', { level: 1, name: `Keikat ${CURRENT_YEAR - 1}` })).toBeVisible();
  // The UI switches right away; the PATCH /api/me may land a moment later.
  await expect.poll(async () => (await api(page).get('/me')).language, 'language saved on the server').toBe('fi');
});
