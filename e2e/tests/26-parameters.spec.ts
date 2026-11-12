import type { Page } from '@playwright/test';
import {
  api,
  editInline,
  expect,
  expectEscReverts,
  expectInvalidNotSent,
  expectNoHorizontalScroll,
  fiInput,
  goNav,
  SEED,
  signIn,
  tagOf,
  test,
} from './helpers';
import { costField, costLine, createEventViaApi, suffix } from './events';

// Settings → Parameters (TASK-195 / TASK-057, contract "Settings: Parameters tab"): the sound
// check deduction is editable; existing cost lines keep their deduction, a later load-in
// switch-off uses the new value. Synthetic amounts only (BR-090).

const KEY = 'fees.load_in_deduction';

interface Parameter {
  key: string;
  type: string;
  value: number | null;
  updatedAt: string | null;
  updatedBy: string | null;
}
interface Line {
  id: string;
  type: string;
  budgetedCents: number;
  loadInDeductionAppliedCents: number | null;
}

const field = (page: Page) => page.getByLabel('Soundcheck-vähennys', { exact: true });

async function vocLine(page: Page, eventId: string): Promise<Line> {
  const event = (await api(page).get(`/events/${eventId}`)) as { costLines: Line[] };
  return event.costLines.find((l) => l.type === 'VOC')!;
}

test('change the sound check deduction: persists, existing lines keep theirs, a later switch-off uses it', async ({
  page,
}, testInfo) => {
  const me = await signIn(page);
  const tag = `${tagOf(testInfo)}-${suffix()}`;
  // Each project its own value; restored at the end (other specs expect the seed value).
  const newCents = tagOf(testInfo) === 'M' ? 2500 : 3500;
  const year = tagOf(testInfo) === 'M' ? 2050 : 2051;

  try {
    await api(page).patch(`/settings/parameters/${KEY}`, { value: SEED.loadInDeductionCents });

    // A line switched off before the change: deducted with the old value.
    const before = await createEventViaApi(page, { startDate: `${year}-02-01`, venue: `Venue Q ${tag}` });
    const oldLine = before.costLines.find((l) => l.type === 'VOC')!;
    await api(page).patch(`/cost-lines/${oldLine.id}`, { joinsLoadIn: false });
    expect((await vocLine(page, before.id)).loadInDeductionAppliedCents).toBe(SEED.loadInDeductionCents);

    // Settings → Parametrit (tabs Kokoonpanot, Parametrit, Referenssit, Tietojen tuonti).
    await page.goto('/');
    await goNav(page, 'Asetukset');
    const tabs = page.getByRole('navigation', { name: 'Asetusten osiot' });
    await expect(tabs.getByRole('link')).toHaveText(['Kokoonpanot', 'Parametrit', 'Referenssit', 'Tietojen tuonti']);
    await tabs.getByRole('link', { name: 'Parametrit' }).click();
    await expect(page).toHaveURL((url) => url.pathname === '/settings/parameters');
    await expect(field(page)).toHaveValue(fiInput(SEED.loadInDeductionCents));
    await expect(field(page)).toHaveAccessibleDescription(/Vähennetään muusikon palkkiosta/);
    await expectNoHorizontalScroll(page, 'parameters tab');

    // Esc reverts; invalid values are not sent.
    await expectEscReverts(page, field(page), '77', fiInput(SEED.loadInDeductionCents));
    await expectInvalidNotSent(page, field(page), '-5', 'Summa ei voi olla negatiivinen.');
    await field(page).press('Escape');

    // Enter saves one PATCH; "Muutettu <time> · Partner A".
    const body = await editInline(page, field(page), fiInput(newCents), { commit: 'Enter', method: 'PATCH' });
    expect(body).toEqual({ value: newCents });
    const changed = page.getByText(new RegExp(`^Muutettu .+ · ${me.name}$`));
    await expect(changed).toBeVisible();

    // Persists after reload; the API and the reference data follow.
    await page.reload();
    await expect(field(page)).toHaveValue(fiInput(newCents));
    await expect(changed).toBeVisible();
    const list = (await api(page).get('/settings/parameters')) as Parameter[];
    expect(list.find((p) => p.key === KEY)).toMatchObject({ value: newCents, updatedBy: me.id });
    const ref = (await api(page).get('/reference')) as { settings: { loadInDeductionCents: number } };
    expect(ref.settings.loadInDeductionCents).toBe(newCents);

    // A new gig: switching load-in off on its vocals line uses the new value.
    const after = await createEventViaApi(page, { startDate: `${year}-02-02`, venue: `Venue R ${tag}` });
    await page.goto(`/gigs/${after.id}`);
    const voc = costLine(page, 'Laulu');
    const loadIn = voc.getByRole('switch', { name: 'Roudaus ja soundcheck' });
    await expect(loadIn).toBeChecked();
    await loadIn.click();
    await expect(loadIn).not.toBeChecked();
    await expect(costField(page, 'Budjetti', 'Laulu')).toHaveValue(fiInput(SEED.templateB.roleFeeCents - newCents));
    expect(await vocLine(page, after.id)).toMatchObject({
      budgetedCents: SEED.templateB.roleFeeCents - newCents,
      loadInDeductionAppliedCents: newCents,
    });

    // The line switched off before the change keeps the old deduction.
    expect(await vocLine(page, before.id)).toMatchObject({
      budgetedCents: SEED.templateB.roleFeeCents - SEED.loadInDeductionCents,
      loadInDeductionAppliedCents: SEED.loadInDeductionCents,
    });
  } finally {
    await api(page).patch(`/settings/parameters/${KEY}`, { value: SEED.loadInDeductionCents });
  }
});
