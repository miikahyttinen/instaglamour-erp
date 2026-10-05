import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../mocks/data';
import { addCostLine, payCostLine } from '../../mocks/gigStore';
import { addMockGig, partnerA, partnerB, staffMockGig, TEST_YEAR } from '../../test/gigFixtures';
import { renderApp, signInMock } from '../../test/renderApp';

const section = (name: string) => screen.getByRole('heading', { name, level: 2 }).closest('details')!;
const historyItems = () =>
  within(screen.getByRole('list', { name: 'Muutoshistoria' })).getAllByRole('listitem');

describe('gig page (UC-004, UC-007)', () => {
  beforeEach(() => {
    signInMock().selectedYear = TEST_YEAR;
  });

  it('shows all sections, economics and collapsible sections', async () => {
    const gig = addMockGig({ additionalSalesCents: 10000, technicalSetup: ['OWN_PA'], notes: 'Stage left' });
    const { user } = renderApp(`/gigs/${gig.id}`);
    expect(await screen.findByRole('heading', { name: 'Template A · Venue X', level: 1 })).toBeInTheDocument();
    expect(screen.getByText('1.6.2030')).toBeInTheDocument();
    expect(screen.getByText('Myyty')).toBeInTheDocument();
    for (const name of ['Perustiedot', 'Hinta ja lisämyynti', 'Talous', 'Kulut ja miehitys', 'Liitteet', 'Muutoshistoria']) {
      expect(section(name)).toHaveAttribute('open');
    }
    expect(within(section('Perustiedot')).getByText('Oma PA')).toBeInTheDocument();
    expect(within(section('Perustiedot')).getByText('Stage left')).toBeInTheDocument();
    const tile = (name: string) => within(section('Talous')).getByRole('region', { name });
    // Total 1 100 €, budgeted costs 4 × 100 € + 3 × 10 € = 430 €, margin 670 € (BR-001…006).
    // Each tile: budget figure, then the actual figure.
    expect(tile('Kokonaishinta')).toHaveTextContent(/1\s100,00\s€/);
    expect(tile('Kulut')).toHaveTextContent(/430,00\s€\s*Budjetti\s*0,00\s€\s*Toteuma/);
    expect(tile('Kate')).toHaveTextContent(/670,00\s€\s*Budjetti\s*1\s100,00\s€\s*Toteuma/);
    expect(tile('Kate-%')).toHaveTextContent(/60,9\s%\s*Budjetti\s*100,0\s%\s*Toteuma/);

    await user.click(within(section('Talous')).getByText('Talous', { selector: 'h2' }));
    expect(section('Talous')).not.toHaveAttribute('open');
  });

  it('has no Edit buttons: basic info and price are inline fields (NFR-8)', async () => {
    const gig = addMockGig();
    renderApp(`/gigs/${gig.id}`);
    await screen.findByRole('heading', { name: 'Template A · Venue X', level: 1 });
    const basic = section('Perustiedot');
    const price = section('Hinta ja lisämyynti');
    for (const area of [basic, price]) {
      expect(within(area).queryAllByRole('button')).toHaveLength(0);
    }
    expect(screen.queryByRole('button', { name: 'Muokkaa perustietoja' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Muokkaa hintaa ja lisämyyntiä' })).not.toBeInTheDocument();
    expect(within(basic).getByRole('textbox', { name: 'Kokoonpanon nimi' })).toHaveValue('Template A');
    expect(within(basic).getByRole('textbox', { name: 'Paikka' })).toHaveValue('Venue X');
    expect(within(basic).getByRole('group', { name: 'Tekniikka' })).toBeInTheDocument();
    expect(within(basic).getByRole('textbox', { name: 'Muistiinpanot' })).toBeInTheDocument();
    expect(within(price).getByRole('textbox', { name: 'Hinta (alv 0 %)' })).toHaveValue('1000,00');
    expect(within(price).getByRole('textbox', { name: 'Lisämyynti' })).toHaveValue('0,00');
  });

  it('edits basic info in place and shows which Sales/Production lines moved (BR-027)', async () => {
    const gig = addMockGig();
    // A split production line held by Partner B stays where it is.
    addCostLine(db.gigs, gig, { type: 'PRODUCTION', personId: partnerB().personId, description: null, budgetedCents: 1000 }, partnerA().id);
    const { user } = renderApp(`/gigs/${gig.id}`);
    await screen.findAllByRole('option', { name: 'Partner C' });
    const basic = section('Perustiedot');

    // Text: blur saves; Enter saves; empty required text is not sent.
    const venue = within(basic).getByRole('textbox', { name: 'Paikka' });
    await user.clear(venue);
    await user.tab();
    expect(await within(basic).findByText('Pakollinen tieto.')).toBeInTheDocument();
    expect(gig.venue).toBe('Venue X');
    await user.type(venue, 'Venue Y');
    await user.tab();
    expect(await screen.findByRole('heading', { name: 'Template A · Venue Y', level: 1 })).toBeInTheDocument();
    expect(gig.venue).toBe('Venue Y');
    await user.type(within(basic).getByRole('textbox', { name: 'Kokoonpanon nimi' }), ' 2{Enter}');
    await waitFor(() => expect(gig.lineupName).toBe('Template A 2'));

    // Technical setup saves on each change.
    await user.click(within(basic).getByRole('checkbox', { name: 'Oma PA' }));
    await waitFor(() => expect(gig.technicalSetup).toEqual(['OWN_PA']));

    // Notes: textarea, blur saves.
    await user.type(within(basic).getByRole('textbox', { name: 'Muistiinpanot' }), 'Stage left');
    await user.tab();
    await waitFor(() => expect(gig.notes).toBe('Stage left'));

    // Seller: saves on change; the moved lines are named.
    expect(within(basic).getByText(/maksamattomat Myynti/)).toBeInTheDocument();
    await user.selectOptions(within(basic).getByRole('combobox', { name: 'Myyjä' }), 'Partner C');
    const notice = await screen.findByText('Rivit siirtyivät uudelle henkilölle:');
    expect(notice.parentElement).toHaveTextContent('Muutokset tallennettu.');
    expect(notice.parentElement).toHaveTextContent('Myynti: Partner A → Partner C');
    expect(notice.parentElement).not.toHaveTextContent('Tuotanto');

    await waitFor(() => expect(historyItems()[0]).toHaveTextContent('Myyjä: Partner A → Partner C'));
    expect(historyItems()[0]).toHaveTextContent('Siirrettyjä Myynti- / Tuotanto-rivejä: 1');
    expect(historyItems().some((li) => /Paikka: Venue X → Venue Y/.test(li.textContent ?? ''))).toBe(true);
  });

  it('edits price and additional sales in place; total, economics and history update (UC-007)', async () => {
    const gig = addMockGig();
    const { user } = renderApp(`/gigs/${gig.id}`);
    await screen.findByRole('heading', { name: 'Template A · Venue X', level: 1 });
    const form = section('Hinta ja lisämyynti');
    const totalTile = () => within(section('Talous')).getByRole('region', { name: 'Kokonaishinta' });
    const price = within(form).getByRole('textbox', { name: 'Hinta (alv 0 %)' });
    await user.clear(price);
    await user.type(price, '2000{Enter}');
    await waitFor(() => expect(totalTile()).toHaveTextContent(/2\s000,00\s€/));
    expect(within(form).getByRole('group', { name: 'Kokonaishinta' })).toHaveTextContent(/2\s000,00\s€/);
    expect(price).toHaveValue('2000,00');

    const sales = within(form).getByRole('textbox', { name: 'Lisämyynti' });
    await user.clear(sales);
    await user.type(sales, '-1');
    await user.tab();
    expect(await within(form).findByText('Summa ei voi olla negatiivinen.')).toBeInTheDocument();
    expect(gig.additionalSalesCents).toBe(0);
    await user.clear(sales);
    await user.type(sales, '100');
    await user.tab();
    await waitFor(() => expect(totalTile()).toHaveTextContent(/2\s100,00\s€/));
    expect(within(form).queryByText('Summa ei voi olla negatiivinen.')).not.toBeInTheDocument();
    await user.type(within(form).getByRole('textbox', { name: 'Lisämyynnin kuvaus' }), 'Extra set');
    await user.tab();
    await waitFor(() => expect(gig.additionalSalesDescription).toBe('Extra set'));

    await waitFor(() => expect(historyItems()[0]).toHaveTextContent('Lisämyynnin kuvaus: – → Extra set'));
    const texts = historyItems().map((li) => li.textContent ?? '');
    expect(texts.some((x) => /Hinta: 1\s000,00\s€ → 2\s000,00\s€/.test(x))).toBe(true);
    expect(texts.some((x) => /Lisämyynti: 0,00\s€ → 100,00\s€/.test(x))).toBe(true);
  });

  it('cancel requires a reason and reminds to adjust the price; uncancel keeps the history (UC-010, UC-012)', async () => {
    const gig = addMockGig();
    const { user } = renderApp(`/gigs/${gig.id}`);
    await user.click(await screen.findByRole('button', { name: 'Peru keikka' }));
    const dialog = screen.getByRole('dialog', { name: 'Peru keikka' });
    const confirm = within(dialog).getByRole('button', { name: 'Peru keikka' });
    expect(confirm).toBeDisabled();
    await user.type(within(dialog).getByRole('textbox', { name: 'Syy' }), '   ');
    expect(confirm).toBeDisabled();
    await user.type(within(dialog).getByRole('textbox', { name: 'Syy' }), 'Client called off');
    await user.click(confirm);

    expect(await screen.findByText(/Muuta hinta ja lisämyynti vastaamaan/)).toBeInTheDocument();
    expect(screen.getByText('Peruttu', { selector: '.tag' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Siirrä' })).not.toBeInTheDocument();
    // The cancelled gig's price stays editable in place.
    const price = within(section('Hinta ja lisämyynti')).getByRole('textbox', { name: 'Hinta (alv 0 %)' });
    expect(price).toBeEnabled();
    await user.clear(price);
    await user.type(price, '100{Enter}');
    await waitFor(() => expect(gig.priceCents).toBe(10000));

    await user.click(screen.getByRole('button', { name: 'Palauta myydyksi' }));
    const uncancel = screen.getByRole('dialog', { name: 'Palauta keikka myydyksi' });
    await user.type(within(uncancel).getByRole('textbox', { name: 'Syy' }), 'Back on');
    await user.click(within(uncancel).getByRole('button', { name: 'Palauta myydyksi' }));
    expect(await screen.findByText('Keikka palautettu myydyksi.')).toBeInTheDocument();

    await waitFor(() => expect(historyItems()[0]).toHaveTextContent('Palautettu myydyksi'));
    expect(historyItems()[0]).toHaveTextContent('Syy: Back on');
    expect(historyItems()[1]).toHaveTextContent(/Hinta: 1\s000,00\s€ → 100,00\s€/);
    expect(historyItems()[2]).toHaveTextContent('Peruttu');
    expect(historyItems()[2]).toHaveTextContent('Syy: Client called off');
  });

  it('moves a gig, shows overlap warnings and logs old and new dates (UC-009)', async () => {
    const other = addMockGig({ startDate: `${TEST_YEAR}-07-01`, venue: 'Venue Y', lineupTemplateId: db.reference.lineupTemplates[1]!.id });
    staffMockGig(other, ['Person 1']);
    const gig = addMockGig();
    staffMockGig(gig, ['Person 1', 'Person 2']);
    const { user } = renderApp(`/gigs/${gig.id}`);
    await user.click(await screen.findByRole('button', { name: 'Siirrä' }));
    const dialog = screen.getByRole('dialog', { name: 'Siirrä keikka' });
    const start = within(dialog).getByLabelText('Uusi alkupäivä');
    await user.clear(start);
    await user.type(start, `${TEST_YEAR}-07-01`);
    await user.type(within(dialog).getByLabelText('Uusi loppupäivä'), `${TEST_YEAR}-06-30`);
    await user.click(within(dialog).getByRole('button', { name: 'Siirrä' }));
    expect(within(dialog).getByText('Loppupäivä ei voi olla ennen alkupäivää.')).toBeInTheDocument();
    await user.clear(within(dialog).getByLabelText('Uusi loppupäivä'));
    await user.type(within(dialog).getByRole('textbox', { name: 'Syy (valinnainen)' }), 'Venue asked');
    await user.click(within(dialog).getByRole('button', { name: 'Siirrä' }));

    expect(await screen.findByText('Keikka siirretty.')).toBeInTheDocument();
    const warning = screen.getByText('Päällekkäinen keikka').closest('[role="alert"]')!;
    expect(warning).toHaveTextContent('Person 1 on samaan aikaan myös keikalla (1.7.2030): Template B');
    // Partner A is on both gigs' Sales/Production lines: internal lines never warn (BR-022).
    expect(warning).not.toHaveTextContent('Partner A');
    expect(within(warning as HTMLElement).getAllByRole('link', { name: 'Template B' })[0]).toHaveAttribute(
      'href',
      `/gigs/${other.id}`,
    );
    expect(screen.getByText('1.7.2030', { selector: '.gig-header-date' })).toBeInTheDocument();
    await waitFor(() => expect(historyItems()[0]).toHaveTextContent('Siirretty'));
    expect(historyItems()[0]).toHaveTextContent('1.6.2030 → 1.7.2030');
    expect(historyItems()[0]).toHaveTextContent('Syy: Venue asked');
    expect(within(section('Kulut ja miehitys')).getAllByDisplayValue('Person 1').length).toBe(1);
  });

  it('deletes with a reason; the deleted gig is read-only and can be restored (UC-025)', async () => {
    const gig = addMockGig({ venue: 'Venue Gone' });
    payCostLine(db.gigs, db.gigs.costLines.find((l) => l.gigId === gig.id)!, 10000, partnerA().id);
    const { user } = renderApp(`/gigs/${gig.id}`);
    await user.click(await screen.findByRole('button', { name: 'Poista keikka' }));
    const dialog = screen.getByRole('dialog', { name: 'Poista keikka' });
    expect(within(dialog).getByRole('button', { name: 'Poista keikka' })).toBeDisabled();
    await user.type(within(dialog).getByRole('textbox', { name: 'Syy' }), 'Duplicate');
    await user.click(within(dialog).getByRole('button', { name: 'Poista keikka' }));

    expect(await screen.findByText(/Keikka poistettu/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: `Keikat ${TEST_YEAR}` })).toBeInTheDocument();
    expect(gig.deletedAt).not.toBeNull();

    renderApp(`/gigs/${gig.id}`);
    expect(await screen.findAllByText(/Keikka on poistettu/)).not.toHaveLength(0);
    // The first render (gig list after delete) is still mounted: check the latest gig page.
    const last = (role: string, name: string) => screen.getAllByRole(role, { name }).at(-1)!;
    expect(last('textbox', 'Paikka')).toBeDisabled();
    expect(last('textbox', 'Hinta (alv 0 %)')).toBeDisabled();
    expect(last('combobox', 'Myyjä')).toBeDisabled();
    expect(last('checkbox', 'Oma PA')).toBeDisabled();
    expect(screen.queryAllByRole('button', { name: 'Merkitse maksetuksi' })).toHaveLength(0);
    const restore = screen.getAllByRole('button', { name: 'Palauta keikka' }).at(-1)!;
    await user.click(restore);
    expect(await screen.findByText('Keikka palautettu poistosta.')).toBeInTheDocument();
    // All data is back, including the payment (AC-3).
    const paidAmounts = await screen.findAllByRole('textbox', { name: /^Maksettu summa: / });
    expect(paidAmounts.map((el) => (el as HTMLInputElement).value)).toContain('100,00');
  });

  it('shows not found for an unknown gig', async () => {
    renderApp('/gigs/00000000-0000-4000-8000-999999999999');
    expect(await screen.findByRole('alert')).toHaveTextContent('Tietoa ei löytynyt.');
  });
});
