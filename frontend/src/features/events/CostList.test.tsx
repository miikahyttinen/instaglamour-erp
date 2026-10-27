import { screen, waitFor, within } from '@testing-library/react';
import { http } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../mocks/data';
import { addCostLine } from '../../mocks/gigStore';
import { server } from '../../mocks/server';
import { errorResponse } from '../../mocks/util';
import { addMockGig, mockLine, partnerA, staffMockGig, TEST_YEAR } from '../../test/gigFixtures';
import { renderApp, signInMock } from '../../test/renderApp';

// The cost table has one named row group (<tbody>) per cost line.
const costs = () => screen.getByRole('table', { name: 'Kulut ja miehitys' });
const line = (name: string) => within(costs()).getByRole('rowgroup', { name });
// Inline fields (NFR-8) are named "<field>: <line>".
const budget = (name: string) => within(line(name)).getByRole('textbox', { name: `Budjetti: ${name}` });
const econTile = (name: string) => screen.getByRole('region', { name });
const historyItems = () =>
  within(screen.getByRole('list', { name: 'Muutoshistoria' })).getAllByRole('listitem');

async function openGig(gigId: string) {
  const app = renderApp(`/gigs/${gigId}`);
  await screen.findByRole('table', { name: 'Kulut ja miehitys' });
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
    await waitFor(() => expect(budget('Kitara')).toHaveValue('90,00'));
    expect(econTile('Kulut')).toHaveTextContent(/420,00\s€/);
    await user.click(within(line('Kitara')).getByRole('switch'));
    await waitFor(() => expect(budget('Kitara')).toHaveValue('100,00'));
    expect(within(line('Toimisto')).queryByRole('switch')).not.toBeInTheDocument();
    await waitFor(() => expect(historyItems()[0]).toHaveTextContent('Roudaus ja soundcheck: ei → kyllä'));
  });

  it('marks paid with the budget as editable default, edits the paid amount inline, and unmarks', async () => {
    const gig = addMockGig();
    const { user } = await openGig(gig.id);
    await user.click(within(line('Basso')).getByRole('button', { name: 'Merkitse maksetuksi' }));
    const amount = within(line('Basso')).getByRole('textbox', { name: 'Maksettu summa' });
    expect(amount).toHaveValue('100,00');
    await user.clear(amount);
    await user.type(amount, '90');
    await user.click(within(line('Basso')).getByRole('button', { name: 'Merkitse maksetuksi' }));

    const actual = await within(line('Basso')).findByRole('textbox', { name: 'Maksettu summa: Basso' });
    expect(actual).toHaveValue('90,00');
    expect(line('Basso')).toHaveTextContent(/· Partner A/);
    expect(mockLine(gig, 'BASS')).toMatchObject({ actualCents: 10000 - 1000, paidBy: partnerA().id });
    expect(econTile('Kulut')).toHaveTextContent(/90,00\s€\s*Toteuma$/);
    await waitFor(() => expect(historyItems()[0]).toHaveTextContent(/Merkitty maksetuksi.*Basso: 90,00\s€/));

    // The actual amount of a paid line saves on blur via the pay endpoint; paidAt/paidBy stay.
    const paidAt = mockLine(gig, 'BASS').paidAt;
    await user.clear(actual);
    await user.type(actual, '80');
    await user.tab();
    await waitFor(() => expect(mockLine(gig, 'BASS').actualCents).toBe(8000));
    expect(mockLine(gig, 'BASS')).toMatchObject({ paidAt, paidBy: partnerA().id });
    await waitFor(() => expect(econTile('Kulut')).toHaveTextContent(/80,00\s€\s*Toteuma$/));
    expect(within(line('Basso')).getByRole('textbox', { name: 'Maksettu summa: Basso' })).toHaveValue('80,00');

    await user.click(within(line('Basso')).getByRole('button', { name: 'Poista maksumerkintä' }));
    await waitFor(() => expect(line('Basso')).toHaveTextContent('Maksamatta'));
    expect(within(line('Basso')).queryByRole('textbox', { name: 'Maksettu summa: Basso' })).not.toBeInTheDocument();
    await waitFor(() => expect(historyItems()[0]).toHaveTextContent(/Basso: aiemmin maksettu 80,00\s€/));
  });

  it('has no pay action for fuel', async () => {
    const gig = addMockGig();
    addCostLine(db.gigs, gig, { type: 'FUEL', personId: null, description: null, budgetedCents: 10000 }, partnerA().id);
    await openGig(gig.id);
    expect(within(line('Polttoaine')).queryByRole('button', { name: 'Merkitse maksetuksi' })).not.toBeInTheDocument();
    expect(line('Polttoaine')).toHaveTextContent('Arvio – ei maksumerkintää.');
  });

  it('adds lines (OTHER needs a description), edits them inline and removes them', async () => {
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
    const added = await screen.findByRole('rowgroup', { name: 'Muu kulu (Stage rental)' });
    expect(budget('Muu kulu (Stage rental)')).toHaveValue('100,00');

    // Office default fee is suggested from settings.
    await user.click(screen.getByRole('button', { name: '+ Lisää rivi' }));
    const form2 = screen.getByRole('form', { name: 'Uusi kulurivi' });
    await user.selectOptions(within(form2).getByRole('combobox', { name: 'Tyyppi' }), 'Tuotanto');
    expect(within(form2).getByRole('textbox', { name: 'Budjetti' })).toHaveValue('10,00');
    await user.click(within(form2).getByRole('button', { name: 'Peruuta' }));

    // No Edit button: the budget is edited in place, Enter saves.
    expect(within(costs()).queryByRole('button', { name: 'Muokkaa' })).not.toBeInTheDocument();
    expect(within(costs()).queryByRole('button', { name: 'Tallenna' })).not.toBeInTheDocument();
    const lineBudget = budget('Muu kulu (Stage rental)');
    await user.clear(lineBudget);
    await user.type(lineBudget, '200{Enter}');
    await waitFor(() => expect(mockLine(gig, 'OTHER').budgetedCents).toBe(20000));
    expect(budget('Muu kulu (Stage rental)')).toHaveValue('200,00');
    expect(added).toHaveTextContent('Budjetti: Muu kulu (Stage rental): tallennettu');

    // OTHER keeps its description required; the empty value is not sent.
    const description = within(added).getByRole('textbox', { name: 'Kuvaus: Muu kulu (Stage rental)' });
    await user.clear(description);
    await user.tab();
    expect(within(added).getByText('Kuvaus on pakollinen.')).toBeInTheDocument();
    expect(mockLine(gig, 'OTHER').description).toBe('Stage rental');
    await user.type(description, 'Stage hire');
    await user.tab();
    const renamed = await screen.findByRole('rowgroup', { name: 'Muu kulu (Stage hire)' });
    expect(mockLine(gig, 'OTHER').description).toBe('Stage hire');

    await user.click(within(renamed).getByRole('button', { name: 'Poista' }));
    const dialog = screen.getByRole('dialog', { name: 'Poista kulurivi' });
    expect(dialog).toHaveTextContent('Poistetaanko rivi Muu kulu (Stage hire)?');
    await user.click(within(dialog).getByRole('button', { name: 'Poista' }));
    await waitFor(() =>
      expect(screen.queryByRole('rowgroup', { name: 'Muu kulu (Stage hire)' })).not.toBeInTheDocument(),
    );
    await waitFor(() => expect(historyItems()[0]).toHaveTextContent(/Kulurivi poistettu.*Muu kulu · – · 200,00\s€/));
  });

  it('checks the budget before sending, Esc restores it, and shows server errors on the field', async () => {
    const gig = addMockGig();
    const { user } = await openGig(gig.id);
    const field = budget('Basso');
    await user.clear(field);
    await user.type(field, '-5');
    await user.tab();
    expect(within(line('Basso')).getByText('Summa ei voi olla negatiivinen.')).toBeInTheDocument();
    expect(mockLine(gig, 'BASS').budgetedCents).toBe(10000);
    await user.click(field);
    await user.keyboard('{Escape}');
    expect(field).toHaveValue('100,00');
    expect(within(line('Basso')).queryByText('Summa ei voi olla negatiivinen.')).not.toBeInTheDocument();

    server.use(
      http.patch('/api/cost-lines/:id', () =>
        errorResponse(400, 'VALIDATION_ERROR', 'Server English text', { budgetedCents: 'INVALID_VALUE' }),
      ),
    );
    await user.clear(field);
    await user.type(field, '120');
    await user.tab();
    expect(await within(line('Basso')).findByText('Virheellinen arvo.')).toBeInTheDocument();
    expect(screen.queryByText('Server English text')).not.toBeInTheDocument();
    expect(field).toHaveValue('120');
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
    const person10 = db.gigs.people.find((p) => p.name === 'Person 10');
    expect(person10).toBeDefined();
    await waitFor(() => expect(mockLine(gig, 'VOC').personId).toBe(person10!.id));
  });
});
