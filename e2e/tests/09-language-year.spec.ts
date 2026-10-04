import {
  api,
  CURRENT_YEAR,
  enMoney,
  expect,
  expectNoHorizontalScroll,
  goNav,
  isWide,
  PARTNER_C,
  signIn,
  test,
} from './helpers';

// Flow 9: language switch to EN; year switch (UC-001 A1, BR-081). Uses Partner C so other flows
// keep their Finnish UI; preferences are saved on the server and survive a reload.
test('switch language to English and change the year', async ({ page }) => {
  await signIn(page, PARTNER_C, { language: 'fi', selectedYear: CURRENT_YEAR });

  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: `Vuosi ${CURRENT_YEAR}` })).toBeVisible();

  // Phones: language in the header menu. Desktop (900 px+): a language icon button in the header,
  // with the signed-in partner in the sign-out button's description.
  const wide = isWide(page);
  if (wide) {
    await expect(page.getByRole('button', { name: 'Kirjaudu ulos', exact: true })).toHaveAccessibleDescription(
      /Kirjautuneena: Partner C/,
    );
    await page.getByRole('button', { name: 'Vaihda kieleksi English' }).click();
  } else {
    await page.getByRole('button', { name: 'Valikko' }).click();
    await expect(page.getByText('Kirjautuneena: Partner C')).toBeVisible();
    await page.getByRole('group', { name: 'Kieli' }).getByRole('button', { name: 'English' }).click();
  }

  await expect(page.getByRole('heading', { level: 1, name: `Year ${CURRENT_YEAR}` })).toBeVisible();
  if (wide) {
    // The toggle now offers the other language.
    await expect(page.getByRole('button', { name: 'Change language to Suomi' })).toBeVisible();
  } else {
    await expect(
      page.getByRole('group', { name: 'Language' }).getByRole('button', { name: 'English' }),
    ).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('Escape');
  }
  const year = await api(page).get(`/years/${CURRENT_YEAR}`);
  await expect(
    page.getByRole('region', { name: 'Gigs' }).getByRole('link', { name: `Sold gigs sum ${enMoney(year.gigs.soldGigsSumCents)}` }),
  ).toBeVisible();
  await expectNoHorizontalScroll(page, 'year page (EN)');

  // Year switch with the header buttons and the picker.
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

  // Back to Finnish.
  if (wide) {
    await page.getByRole('button', { name: 'Change language to Suomi' }).click();
  } else {
    await page.getByRole('button', { name: 'Menu' }).click();
    await page.getByRole('group', { name: 'Language' }).getByRole('button', { name: 'Suomi' }).click();
  }
  await expect(page.getByRole('heading', { level: 1, name: `Keikat ${CURRENT_YEAR - 1}` })).toBeVisible();
});
