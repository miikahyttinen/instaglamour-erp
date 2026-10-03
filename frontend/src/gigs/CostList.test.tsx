import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../mocks/data';
import { addCostLine } from '../mocks/gigStore';
import { addMockGig, mockLine, partnerA, staffMockGig, TEST_YEAR } from '../test/gigFixtures';
import { renderApp, signInMock } from '../test/renderApp';

const costs = () => screen.getByRole('list', { name: 'Kulut ja miehitys' });
const line = (name: string) => within(costs()).getByRole('listitem', { name });
const econRow = (name: RegExp) => within(screen.getByRole('table')).getByRole('row', { name });
const historyItems = () =>
  within(screen.getByRole('list', { name: 'Muutoshistoria' })).getAllByRole('listitem');

async function openGig(gigId: string) {
  const app = renderApp(`/gigs/${gigId}`);
  await screen.findByRole('list', { name: 'Kulut ja miehitys' });
  await within(line('Laulu')).findByRole('option', { name: 'Person 1' });
  return app;
}

describe('cost list (UC-005)', () => {
  beforeEach(() => {
    signInMock().selectedYear = TEST_YEAR;
  });

  it('staffing with active people clears "not fully staffed"', async () => {
    const gig = addMockGig();
    staffMockGig(gig, ['Person 1', 'Person 2', 'Person 3']);
    const { user } = await openGig(gig.id);
    expect(screen.getByRole('note')).toHaveTextContent('Miehitys kesken');
    const drums = within(line('Rummut')).getByRole('combobox', { name: 'Henkilö: Rummut' });
    // Inactive people are not offered.
    expect(within(drums).queryByRole('option', { name: 'Person 9' })).not.toBeInTheDocument();
    await user.selectOptions(drums, 'Person 4');
    await waitFor(() => expect(screen.queryByRole('note')).not.toBeInTheDocument());
    expect(mockLine(gig, 'DRUMS').personId).toBe(db.gigs.people.find((p) => p.name === 'Person 4')!.id);
  });

  it('warns about double booking, naming the other gig, without blocking', async () => {
    const other = addMockGig({ startDate: `${TEST_YEAR}-06-01`, venue: 'Venue Y', lineupTemplateId: db.reference.lineupTemplates[1]!.id });
    staffMockGig(other, ['Person 1']);
    const gig = addMockGig({ sellerId: db.partners[2]!.id, producerId: db.partners[2]!.id });
    const { user } = await openGig(gig.id);
    await user.selectOptions(within(line('Basso')).getByRole('combobox'), 'Person 1');
    const warning = await screen.findByText(/Person 1 on samaan aikaan/);
    expect(warning.closest('li')).toHaveTextContent('Template B');
    expect(within(line('Basso')).getByDisplayValue('Person 1')).toBeInTheDocument();
  });

  it('load-in switch deducts and restores the budget (BR-026)', async () => {
    const gig = addMockGig();
    const { user } = await openGig(gig.id);
    const toggle = within(line('Kitara')).getByRole('switch', { name: 'Roudaus ja soundcheck' });
    expect(toggle).toBeChecked();
    await user.click(toggle);
    await waitFor(() => expect(line('Kitara')).toHaveTextContent(/Budjetti\s90,00\s€/));
    expect(econRow(/^Kulut/)).toHaveTextContent(/420,00\s€/);
    await user.click(within(line('Kitara')).getByRole('switch'));
    await waitFor(() => expect(line('Kitara')).toHaveTextContent(/Budjetti\s100,00\s€/));
    expect(within(line('Toimisto')).queryByRole('switch')).not.toBeInTheDocument();
    await waitFor(() => expect(historyItems()[0]).toHaveTextContent('Roudaus ja soundcheck: ei → kyllä'));
  });

  it('marks paid with the budget as editable default, shows who and when, and unmarks', async () => {
    const gig = addMockGig();
    const { user } = await openGig(gig.id);
    await user.click(within(line('Basso')).getByRole('button', { name: 'Merkitse maksetuksi' }));
    const amount = within(line('Basso')).getByRole('textbox', { name: 'Maksettu summa' });
    expect(amount).toHaveValue('100,00');
    await user.clear(amount);
    await user.type(amount, '90');
    await user.click(within(line('Basso')).getByRole('button', { name: 'Merkitse maksetuksi' }));

    await waitFor(() => expect(line('Basso')).toHaveTextContent(/Maksettu 90,00\s€ · .* · Partner A/));
    expect(mockLine(gig, 'BASS')).toMatchObject({ actualCents: 10000 - 1000, paidBy: partnerA().id });
    expect(econRow(/^Kulut/)).toHaveTextContent(/90,00\s€$/);
    await waitFor(() => expect(historyItems()[0]).toHaveTextContent(/Merkitty maksetuksi.*Basso: 90,00\s€/));

    await user.click(within(line('Basso')).getByRole('button', { name: 'Poista maksumerkintä' }));
    await waitFor(() => expect(line('Basso')).toHaveTextContent('Maksamatta'));
    await waitFor(() => expect(historyItems()[0]).toHaveTextContent(/Basso: aiemmin maksettu 90,00\s€/));
  });

  it('has no pay action for fuel', async () => {
    const gig = addMockGig();
    addCostLine(db.gigs, gig, { type: 'FUEL', personId: null, description: null, budgetedCents: 10000 }, partnerA().id);
    await openGig(gig.id);
    expect(within(line('Polttoaine')).queryByRole('button', { name: 'Merkitse maksetuksi' })).not.toBeInTheDocument();
    expect(line('Polttoaine')).toHaveTextContent('Arvio – ei maksumerkintää.');
  });

  it('adds lines (OTHER needs a description), edits and removes them', async () => {
    const gig = addMockGig();
    const { user } = await openGig(gig.id);
    await user.click(screen.getByRole('button', { name: '+ Lisää rivi' }));
    const form = screen.getByRole('form', { name: 'Uusi kulurivi' });
    await user.selectOptions(within(form).getByRole('combobox', { name: 'Tyyppi' }), 'Muu kulu');
    await user.type(within(form).getByRole('textbox', { name: 'Budjetti' }), '100');
    await user.click(within(form).getByRole('button', { name: 'Lisää rivi' }));
    expect(within(form).getByText('Kuvaus on pakollinen.')).toBeInTheDocument();
    await user.type(within(form).getByRole('textbox', { name: 'Kuvaus' }), 'Stage rental');
    await user.click(within(form).getByRole('button', { name: 'Lisää rivi' }));
    const added = await screen.findByRole('listitem', { name: 'Muu kulu (Stage rental)' });
    expect(added).toHaveTextContent(/100,00\s€/);

    // Office default fee is suggested from settings.
    await user.click(screen.getByRole('button', { name: '+ Lisää rivi' }));
    const form2 = screen.getByRole('form', { name: 'Uusi kulurivi' });
    await user.selectOptions(within(form2).getByRole('combobox', { name: 'Tyyppi' }), 'Tuotanto');
    expect(within(form2).getByRole('textbox', { name: 'Budjetti' })).toHaveValue('10,00');
    await user.click(within(form2).getByRole('button', { name: 'Peruuta' }));

    await user.click(within(added).getByRole('button', { name: 'Muokkaa' }));
    const budget = within(added).getByRole('textbox', { name: 'Budjetti' });
    await user.clear(budget);
    await user.type(budget, '200');
    await user.click(within(added).getByRole('button', { name: 'Tallenna' }));
    await waitFor(() => expect(screen.getByRole('listitem', { name: 'Muu kulu (Stage rental)' })).toHaveTextContent(/200,00\s€/));

    await user.click(within(screen.getByRole('listitem', { name: 'Muu kulu (Stage rental)' })).getByRole('button', { name: 'Poista' }));
    const dialog = screen.getByRole('dialog', { name: 'Poista kulurivi' });
    expect(dialog).toHaveTextContent('Poistetaanko rivi Muu kulu (Stage rental)?');
    await user.click(within(dialog).getByRole('button', { name: 'Poista' }));
    await waitFor(() =>
      expect(screen.queryByRole('listitem', { name: 'Muu kulu (Stage rental)' })).not.toBeInTheDocument(),
    );
    await waitFor(() => expect(historyItems()[0]).toHaveTextContent(/Kulurivi poistettu.*Muu kulu · – · 200,00\s€/));
  });

  it('warns before removing a paid line', async () => {
    const gig = addMockGig();
    const office = mockLine(gig, 'OFFICE');
    office.paidAt = new Date().toISOString();
    office.actualCents = 1000;
    office.paidBy = partnerA().id;
    const { user } = await openGig(gig.id);
    await user.click(within(line('Toimisto')).getByRole('button', { name: 'Poista' }));
    expect(screen.getByRole('dialog')).toHaveTextContent(/Rivi on merkitty maksetuksi \(10,00\s€\)/);
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Peruuta' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('creates a new person inline and puts them on the line (UC-005 A8)', async () => {
    const gig = addMockGig();
    const { user } = await openGig(gig.id);
    await user.selectOptions(within(line('Laulu')).getByRole('combobox'), '+ Uusi henkilö…');
    await user.type(within(line('Laulu')).getByRole('textbox', { name: 'Uuden henkilön nimi' }), 'Person 10');
    await user.click(within(line('Laulu')).getByRole('button', { name: 'Lisää henkilö' }));
    expect(await within(line('Laulu')).findByDisplayValue('Person 10')).toBeInTheDocument();
    expect(db.gigs.people.some((p) => p.name === 'Person 10')).toBe(true);
  });
});
