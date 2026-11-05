import { screen, waitFor, within } from '@testing-library/react';
import { http } from 'msw';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MUSICIAN_ROLES, type CostType } from '../../api/enums';
import type { CostLine } from '../../api/types';
import { db } from '../../mocks/data';
import { addCostLine, linesOf } from '../../mocks/eventStore';
import { server } from '../../mocks/server';
import { errorResponse } from '../../mocks/util';
import { addMockEvent, mockLine, partnerA, staffMockEvent, TEST_YEAR } from '../../test/eventFixtures';
import { renderApp, signInMock } from '../../test/renderApp';
import { orderCostLines } from './costLineOrder';

// The cost table has one named row group (<tbody>) per cost line.
const costs = () => screen.getByRole('table', { name: 'Kulut ja miehitys' });
const line = (name: string) => within(costs()).getByRole('rowgroup', { name });
// Inline fields (NFR-8) are named "<field>: <line>".
const budget = (name: string) => within(line(name)).getByRole('textbox', { name: `Budjetti: ${name}` });
// The draft row of a new line (TASK-179) and its fields ("<field>: Uusi kulurivi").
const draft = () => within(costs()).getByRole('rowgroup', { name: 'Uusi kulurivi' });
const draftField = (role: 'combobox' | 'textbox', field: string) =>
  within(draft()).getByRole(role, { name: `${field}: Uusi kulurivi` });
const econTile = (name: string) => screen.getByRole('region', { name });
const historyItems = () =>
  within(screen.getByRole('list', { name: 'Muutoshistoria' })).getAllByRole('listitem');

async function openEvent(eventId: string) {
  const app = renderApp(`/gigs/${eventId}`);
  await screen.findByRole('table', { name: 'Kulut ja miehitys' });
  await within(line('Laulu')).findByRole('option', { name: 'Person 1' });
  return app;
}

describe('cost list (UC-005)', () => {
  beforeEach(() => {
    signInMock().selectedYear = TEST_YEAR;
  });

  it('staffing with active people clears "not fully staffed"', async () => {
    const event = addMockEvent();
    staffMockEvent(event, ['Person 1', 'Person 2', 'Person 3']);
    const { user } = await openEvent(event.id);
    expect(screen.getByRole('note')).toHaveTextContent('Miehitys kesken');
    const drums = within(line('Rummut')).getByRole('combobox', { name: 'Henkilö: Rummut' });
    // Inactive people are not offered.
    expect(within(drums).queryByRole('option', { name: 'Person 9' })).not.toBeInTheDocument();
    await user.selectOptions(drums, 'Person 4');
    await waitFor(() => expect(screen.queryByRole('note')).not.toBeInTheDocument());
    expect(mockLine(event, 'DRUMS').personId).toBe(db.events.people.find((p) => p.name === 'Person 4')!.id);
  });

  it('budget and actual titles are right-aligned number columns, like their amounts (TASK-182)', async () => {
    const event = addMockEvent();
    await openEvent(event.id);
    for (const name of ['Budjetti', 'Toteuma']) {
      expect(within(costs()).getByRole('columnheader', { name })).toHaveClass('num');
    }
    expect(budget('Kitara').closest('td')).toHaveClass('num', 'cost-budget');
  });

  it('warns about double booking, naming the other event, without blocking', async () => {
    const other = addMockEvent({ startDate: `${TEST_YEAR}-06-01`, venue: 'Venue Y', lineupTemplateId: db.reference.lineupTemplates[1]!.id });
    staffMockEvent(other, ['Person 1']);
    const event = addMockEvent({ sellerId: db.partners[2]!.id, producerId: db.partners[2]!.id });
    const { user } = await openEvent(event.id);
    await user.selectOptions(within(line('Basso')).getByRole('combobox'), 'Person 1');
    const warning = await screen.findByText(/Person 1 on samaan aikaan/);
    expect(warning.closest('li')).toHaveTextContent('Template B');
    expect(within(line('Basso')).getByDisplayValue('Person 1')).toBeInTheDocument();
  });

  it('load-in switch deducts and restores the budget (BR-026)', async () => {
    const event = addMockEvent();
    const { user } = await openEvent(event.id);
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

  it('marks paid in place: the button turns into the amount input, Enter saves; edits inline and unmarks', async () => {
    const event = addMockEvent();
    const { user } = await openEvent(event.id);
    // Unpaid: the actual cell shows only the button (no "unpaid" tag).
    expect(line('Basso')).not.toHaveTextContent('Maksamatta');
    await user.click(within(line('Basso')).getByRole('button', { name: /^Merkitse maksetuksi/ }));
    const amount = within(line('Basso')).getByRole('textbox', { name: 'Toteutunut summa: Basso' });
    expect(within(line('Basso')).queryByRole('button', { name: /^Merkitse maksetuksi/ })).not.toBeInTheDocument();
    // Same cell, no extra row; prefilled with the budget, focused and selected.
    expect(amount.closest('td')).toHaveClass('cost-paid');
    expect(line('Basso').querySelectorAll('tr')).toHaveLength(1);
    expect(amount).toHaveValue('100,00');
    expect(amount).toHaveFocus();
    const input = amount as HTMLInputElement;
    expect([input.selectionStart, input.selectionEnd]).toEqual([0, 6]);
    await user.keyboard('90{Enter}');

    const actual = await within(line('Basso')).findByRole('textbox', { name: 'Toteutunut summa: Basso' });
    await waitFor(() => expect(actual).toHaveValue('90,00'));
    // Saved with Enter: keyboard focus moves to the paid amount that replaced the input.
    await waitFor(() => expect(actual).toHaveFocus());
    // No paid log (time · partner) in the table: that is in the gig log (TASK-178).
    expect(actual.closest('td')).not.toHaveTextContent(partnerA().name);
    expect(actual.closest('td')!.querySelector('svg')).toBeNull();
    // Only the remove action stays; there is no separate "unmark paid" button.
    expect(within(line('Basso')).queryByRole('button', { name: 'Poista maksumerkintä' })).not.toBeInTheDocument();
    expect(within(line('Basso')).getByRole('button', { name: 'Poista' })).toBeInTheDocument();
    expect(mockLine(event, 'BASS')).toMatchObject({ actualCents: 10000 - 1000, paidBy: partnerA().id });
    expect(econTile('Kulut')).toHaveTextContent(/90,00\s€\s*Toteuma$/);
    await waitFor(() => expect(historyItems()[0]).toHaveTextContent(/Merkitty maksetuksi.*Basso: 90,00\s€/));

    // The actual amount of a paid line saves on blur via the pay endpoint; paidAt/paidBy stay.
    const paidAt = mockLine(event, 'BASS').paidAt;
    await user.clear(actual);
    await user.type(actual, '80');
    await user.tab();
    await waitFor(() => expect(mockLine(event, 'BASS').actualCents).toBe(8000));
    expect(mockLine(event, 'BASS')).toMatchObject({ paidAt, paidBy: partnerA().id });
    await waitFor(() => expect(econTile('Kulut')).toHaveTextContent(/80,00\s€\s*Toteuma$/));
    expect(within(line('Basso')).getByRole('textbox', { name: 'Toteutunut summa: Basso' })).toHaveValue('80,00');

    // Clearing the amount (blur) unmarks the line paid via POST unpay.
    await user.clear(within(line('Basso')).getByRole('textbox', { name: 'Toteutunut summa: Basso' }));
    await user.tab();
    expect(await within(line('Basso')).findByRole('button', { name: /^Merkitse maksetuksi/ })).toBeInTheDocument();
    expect(mockLine(event, 'BASS')).toMatchObject({ paidAt: null, actualCents: null });
    expect(line('Basso')).not.toHaveTextContent('Maksamatta');
    expect(within(line('Basso')).queryByRole('textbox', { name: 'Toteutunut summa: Basso' })).not.toBeInTheDocument();
    await waitFor(() => expect(historyItems()[0]).toHaveTextContent(/Basso: aiemmin maksettu 80,00\s€/));
  });

  it('entering 0 on a paid line with Enter unmarks it and focuses the "Mark paid" button', async () => {
    const event = addMockEvent();
    const { user } = await openEvent(event.id);
    let pays = 0;
    server.events.on('request:start', ({ request }) => {
      if (request.method === 'POST' && request.url.endsWith('/pay')) pays += 1;
    });
    await user.click(within(line('Basso')).getByRole('button', { name: /^Merkitse maksetuksi/ }));
    await user.keyboard('{Enter}');
    const actual = await within(line('Basso')).findByRole('textbox', { name: 'Toteutunut summa: Basso' });
    await waitFor(() => expect(actual).toHaveFocus());
    expect(pays).toBe(1);
    await user.clear(actual);
    await user.type(actual, '0{Enter}');
    const button = await within(line('Basso')).findByRole('button', { name: /^Merkitse maksetuksi/ });
    await waitFor(() => expect(button).toHaveFocus());
    expect(mockLine(event, 'BASS').paidAt).toBeNull();
    expect(pays).toBe(1);
    server.events.removeAllListeners();
  });

  it('paid line: invalid input shows the inline error; an unpay error shows on the field', async () => {
    const event = addMockEvent();
    server.use(http.post('*/api/cost-lines/:id/unpay', () => errorResponse(409, 'COST_NOT_PAYABLE', 'Not payable')));
    const { user } = await openEvent(event.id);
    await user.click(within(line('Basso')).getByRole('button', { name: /^Merkitse maksetuksi/ }));
    await user.keyboard('{Enter}');
    const actual = await within(line('Basso')).findByRole('textbox', { name: 'Toteutunut summa: Basso' });
    await user.clear(actual);
    await user.type(actual, 'abc');
    await user.tab();
    expect(actual).toHaveAccessibleDescription('Virheellinen arvo.');
    await user.clear(actual);
    await user.tab();
    await waitFor(() => expect(actual).toHaveAttribute('aria-invalid', 'true'));
    expect(actual).not.toHaveAccessibleDescription('Virheellinen arvo.');
    expect(actual).toHaveAccessibleDescription(/.+/);
    expect(mockLine(event, 'BASS').paidAt).not.toBeNull();
    expect(within(line('Basso')).queryByRole('button', { name: /^Merkitse maksetuksi/ })).not.toBeInTheDocument();
  });

  it('read-only (deleted gig): a paid line shows just the amount', async () => {
    const event = addMockEvent();
    const bass = mockLine(event, 'BASS');
    bass.paidAt = new Date().toISOString();
    bass.actualCents = 9000;
    bass.paidBy = partnerA().id;
    event.deletedAt = new Date().toISOString();
    renderApp(`/gigs/${event.id}`);
    await screen.findByRole('table', { name: 'Kulut ja miehitys' });
    const cell = line('Basso').querySelector('td.cost-paid')!;
    expect(cell.textContent).toMatch(/^90,00\s€$/);
    expect(cell.querySelector('svg')).toBeNull();
  });

  it('pay input: blur saves the prefilled budget', async () => {
    const event = addMockEvent();
    const { user } = await openEvent(event.id);
    await user.click(within(line('Basso')).getByRole('button', { name: /^Merkitse maksetuksi/ }));
    await user.tab();
    await waitFor(() => expect(mockLine(event, 'BASS')).toMatchObject({ actualCents: 10000, paidBy: partnerA().id }));
    expect(await within(line('Basso')).findByRole('textbox', { name: 'Toteutunut summa: Basso' })).toHaveValue('100,00');
  });

  it('pay input: Esc cancels back to the focused button; invalid input shows the error and is not sent', async () => {
    const event = addMockEvent();
    const { user } = await openEvent(event.id);
    let posts = 0;
    server.events.on('request:start', ({ request }) => {
      if (request.method === 'POST' && request.url.endsWith('/pay')) posts += 1;
    });
    const button = () => within(line('Basso')).getByRole('button', { name: /^Merkitse maksetuksi/ });
    await user.click(button());
    await user.keyboard('{Escape}');
    expect(button()).toHaveFocus();
    expect(within(line('Basso')).queryByRole('textbox', { name: /Toteutunut summa/ })).not.toBeInTheDocument();

    await user.click(button());
    await user.keyboard('-10{Enter}');
    const amount = within(line('Basso')).getByRole('textbox', { name: 'Toteutunut summa: Basso' });
    expect(amount).toHaveAttribute('aria-invalid', 'true');
    expect(amount).toHaveAccessibleDescription('Summa ei voi olla negatiivinen.');
    await user.clear(amount);
    await user.type(amount, 'abc');
    await user.tab();
    expect(await within(line('Basso')).findByText('Virheellinen arvo.')).toBeInTheDocument();
    expect(within(line('Basso')).getByRole('textbox', { name: 'Toteutunut summa: Basso' })).toBeInTheDocument();

    // 0 on an unpaid line is not a payment: Enter closes back to the focused button, blur too.
    await user.clear(amount);
    await user.type(amount, '0{Enter}');
    expect(button()).toHaveFocus();
    await user.click(button());
    await user.keyboard('0');
    await user.tab();
    expect(button()).toBeInTheDocument();
    // Empty + blur still cancels.
    await user.click(button());
    await user.clear(within(line('Basso')).getByRole('textbox', { name: 'Toteutunut summa: Basso' }));
    await user.tab();
    expect(button()).toBeInTheDocument();
    expect(posts).toBe(0);
    expect(mockLine(event, 'BASS').paidAt).toBeNull();
    server.events.removeAllListeners();
  });

  it('pay input: a server error keeps the input with the error; nothing is marked paid', async () => {
    const event = addMockEvent();
    server.use(http.post('*/api/cost-lines/:id/pay', () => errorResponse(409, 'COST_NOT_PAYABLE', 'Not payable')));
    const { user } = await openEvent(event.id);
    await user.click(within(line('Basso')).getByRole('button', { name: /^Merkitse maksetuksi/ }));
    await user.keyboard('{Enter}');
    const amount = within(line('Basso')).getByRole('textbox', { name: 'Toteutunut summa: Basso' });
    await waitFor(() => expect(amount).toHaveAttribute('aria-invalid', 'true'));
    expect(mockLine(event, 'BASS').paidAt).toBeNull();
  });

  it('has no pay action and an empty actual cell for fuel', async () => {
    const event = addMockEvent();
    addCostLine(db.events, event, { type: 'FUEL', personId: null, description: null, budgetedCents: 10000 }, partnerA().id);
    await openEvent(event.id);
    expect(within(line('Polttoaine')).queryByRole('button', { name: /^Merkitse maksetuksi/ })).not.toBeInTheDocument();
    const cell = line('Polttoaine').querySelector('td.cost-paid')!;
    expect(cell).toBeEmptyDOMElement();
  });

  it('read-only (deleted gig): fuel actual cell is empty', async () => {
    const event = addMockEvent();
    addCostLine(db.events, event, { type: 'FUEL', personId: null, description: null, budgetedCents: 10000 }, partnerA().id);
    event.deletedAt = new Date().toISOString();
    renderApp(`/gigs/${event.id}`);
    await screen.findByRole('table', { name: 'Kulut ja miehitys' });
    const cell = line('Polttoaine').querySelector('td.cost-paid')!;
    expect(cell).toBeEmptyDOMElement();
    expect(within(line('Polttoaine')).queryByRole('button', { name: /^Merkitse maksetuksi/ })).not.toBeInTheDocument();
  });

  it('adds lines (OTHER needs a description), edits them inline and removes them', async () => {
    const event = addMockEvent();
    const { user } = await openEvent(event.id);
    const before = linesOf(db.events, event.id).length;
    await user.click(screen.getByRole('button', { name: '+ Lisää rivi' }));
    // No separate form: an empty row at the end of the table, its type select focused.
    expect(screen.queryByRole('form')).not.toBeInTheDocument();
    const rows = within(costs()).getAllByRole('rowgroup').filter((g) => g.tagName === 'TBODY');
    expect(rows.at(-1)).toBe(draft());
    expect(draftField('combobox', 'Tyyppi')).toHaveFocus();
    await user.selectOptions(draftField('combobox', 'Tyyppi'), 'Muu kulu');
    await user.type(draftField('textbox', 'Budjetti'), '100');
    // Leaving the row without the description OTHER needs: error on the field, nothing sent.
    await user.click(document.body);
    expect(await within(draft()).findByText('Kuvaus on pakollinen.')).toBeInTheDocument();
    expect(draftField('textbox', 'Kuvaus')).toHaveAttribute('aria-invalid', 'true');
    expect(linesOf(db.events, event.id)).toHaveLength(before);
    await user.type(draftField('textbox', 'Kuvaus'), 'Stage rental');
    await user.click(document.body);
    const added = await screen.findByRole('rowgroup', { name: 'Muu kulu (Stage rental)' });
    expect(budget('Muu kulu (Stage rental)')).toHaveValue('100,00');
    expect(within(costs()).queryByRole('rowgroup', { name: 'Uusi kulurivi' })).not.toBeInTheDocument();

    // Office default fee is suggested from settings; Esc drops the draft.
    await user.click(screen.getByRole('button', { name: '+ Lisää rivi' }));
    await user.selectOptions(draftField('combobox', 'Tyyppi'), 'Tuotanto');
    expect(draftField('textbox', 'Budjetti')).toHaveValue('10,00');
    await user.keyboard('{Escape}');
    expect(within(costs()).queryByRole('rowgroup', { name: 'Uusi kulurivi' })).not.toBeInTheDocument();
    expect(linesOf(db.events, event.id).filter((l) => l.type === 'PRODUCTION')).toHaveLength(1);

    // No Edit button: the budget is edited in place, Enter saves.
    expect(within(costs()).queryByRole('button', { name: 'Muokkaa' })).not.toBeInTheDocument();
    expect(within(costs()).queryByRole('button', { name: 'Tallenna' })).not.toBeInTheDocument();
    const lineBudget = budget('Muu kulu (Stage rental)');
    await user.clear(lineBudget);
    await user.type(lineBudget, '200{Enter}');
    await waitFor(() => expect(mockLine(event, 'OTHER').budgetedCents).toBe(20000));
    expect(budget('Muu kulu (Stage rental)')).toHaveValue('200,00');
    expect(added).toHaveTextContent('Budjetti: Muu kulu (Stage rental): tallennettu');

    // OTHER keeps its description required; the empty value is not sent.
    const description = within(added).getByRole('textbox', { name: 'Kuvaus: Muu kulu (Stage rental)' });
    await user.clear(description);
    await user.tab();
    expect(within(added).getByText('Kuvaus on pakollinen.')).toBeInTheDocument();
    expect(mockLine(event, 'OTHER').description).toBe('Stage rental');
    await user.type(description, 'Stage hire');
    await user.tab();
    const renamed = await screen.findByRole('rowgroup', { name: 'Muu kulu (Stage hire)' });
    expect(mockLine(event, 'OTHER').description).toBe('Stage hire');

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
    const event = addMockEvent();
    const { user } = await openEvent(event.id);
    const field = budget('Basso');
    await user.clear(field);
    await user.type(field, '-5');
    await user.tab();
    expect(within(line('Basso')).getByText('Summa ei voi olla negatiivinen.')).toBeInTheDocument();
    expect(mockLine(event, 'BASS').budgetedCents).toBe(10000);
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
    const event = addMockEvent();
    const office = mockLine(event, 'OFFICE');
    office.paidAt = new Date().toISOString();
    office.actualCents = 1000;
    office.paidBy = partnerA().id;
    const { user } = await openEvent(event.id);
    await user.click(within(line('Toimisto')).getByRole('button', { name: 'Poista' }));
    expect(screen.getByRole('dialog')).toHaveTextContent(/Rivi on merkitty maksetuksi \(10,00\s€\)/);
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Peruuta' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('creates a new person inline and puts them on the line (UC-005 A8)', async () => {
    const event = addMockEvent();
    const { user } = await openEvent(event.id);
    await user.selectOptions(within(line('Laulu')).getByRole('combobox'), '+ Uusi henkilö…');
    await user.type(within(line('Laulu')).getByRole('textbox', { name: 'Uuden henkilön nimi' }), 'Person 10');
    await user.click(within(line('Laulu')).getByRole('button', { name: 'Lisää henkilö' }));
    expect(await within(line('Laulu')).findByDisplayValue('Person 10')).toBeInTheDocument();
    const person10 = db.events.people.find((p) => p.name === 'Person 10');
    expect(person10).toBeDefined();
    await waitFor(() => expect(mockLine(event, 'VOC').personId).toBe(person10!.id));
  });
});

describe('cost list: new line as an inline draft row (TASK-179)', () => {
  let posts: string[];
  beforeEach(() => {
    signInMock().selectedYear = TEST_YEAR;
    posts = [];
    server.events.on('request:start', ({ request }) => {
      if (request.method === 'POST' && request.url.includes('/cost-lines')) posts.push(request.url);
    });
  });
  afterEach(() => {
    server.events.removeAllListeners();
  });
  const noDraft = () => expect(within(costs()).queryByRole('rowgroup', { name: 'Uusi kulurivi' })).not.toBeInTheDocument();

  it('drops a completely empty draft when the focus leaves it, without a request', async () => {
    const event = addMockEvent();
    const { user } = await openEvent(event.id);
    await user.click(screen.getByRole('button', { name: '+ Lisää rivi' }));
    expect(draftField('combobox', 'Tyyppi')).toHaveFocus();
    await user.tab();
    expect(draftField('textbox', 'Kuvaus')).toHaveFocus(); // still in the row: kept
    await user.click(document.body);
    await waitFor(noDraft);
    expect(posts).toEqual([]);
  });

  it('keeps one draft at a time; "Lisää rivi" focuses it; the trash button drops it', async () => {
    const event = addMockEvent();
    const { user } = await openEvent(event.id);
    const addButton = screen.getByRole('button', { name: '+ Lisää rivi' });
    await user.click(addButton);
    await user.type(draftField('textbox', 'Kuvaus'), 'Synthetic note');
    await user.click(addButton);
    expect(within(costs()).getAllByRole('rowgroup', { name: 'Uusi kulurivi' })).toHaveLength(1);
    expect(draftField('combobox', 'Tyyppi')).toHaveFocus();
    expect(draftField('textbox', 'Kuvaus')).toHaveValue('Synthetic note');
    await user.click(within(draft()).getByRole('button', { name: 'Poista' }));
    noDraft();
    // A new draft starts empty.
    await user.click(addButton);
    expect(draftField('textbox', 'Kuvaus')).toHaveValue('');
    expect(posts).toEqual([]);
  });

  it('keeps a filled draft without a type with "required" on the type; nothing is sent', async () => {
    const event = addMockEvent();
    const { user } = await openEvent(event.id);
    await user.click(screen.getByRole('button', { name: '+ Lisää rivi' }));
    await user.type(draftField('textbox', 'Budjetti'), '50');
    await user.click(document.body);
    expect(await within(draft()).findByText('Pakollinen tieto.')).toBeInTheDocument();
    expect(draftField('combobox', 'Tyyppi')).toHaveAttribute('aria-invalid', 'true');
    expect(posts).toEqual([]);
    // Choosing the type clears the error; leaving saves the line (as a normal inline row).
    await user.selectOptions(draftField('combobox', 'Tyyppi'), 'Rummut');
    expect(within(draft()).queryByText('Pakollinen tieto.')).not.toBeInTheDocument();
    await user.click(document.body);
    await waitFor(noDraft);
    expect(posts).toHaveLength(1);
    const drums = linesOf(db.events, event.id).filter((l) => l.type === 'DRUMS');
    expect(drums.map((l) => l.budgetedCents)).toContain(5000);
  });

  it('saves with a person and shows the double-booking warning', async () => {
    const other = addMockEvent({ startDate: `${TEST_YEAR}-06-01`, venue: 'Venue Y', lineupTemplateId: db.reference.lineupTemplates[1]!.id });
    staffMockEvent(other, ['Person 1']);
    const event = addMockEvent({ sellerId: db.partners[2]!.id, producerId: db.partners[2]!.id });
    const { user } = await openEvent(event.id);
    await user.click(screen.getByRole('button', { name: '+ Lisää rivi' }));
    await user.selectOptions(draftField('combobox', 'Tyyppi'), 'Oma rooli');
    await user.type(draftField('textbox', 'Kuvaus'), 'Synthetic role');
    await user.selectOptions(draftField('combobox', 'Henkilö'), 'Person 1');
    await user.type(draftField('textbox', 'Budjetti'), '80');
    await user.click(document.body);
    expect(await screen.findByText(/Person 1 on samaan aikaan/)).toBeInTheDocument();
    const added = await screen.findByRole('rowgroup', { name: 'Oma rooli (Synthetic role)' });
    expect(within(added).getByRole('combobox', { name: 'Henkilö: Oma rooli (Synthetic role)' })).toHaveDisplayValue('Person 1');
    noDraft();
  });

  it('shows a server error that has no field in the draft row and keeps it', async () => {
    const event = addMockEvent();
    server.use(http.post('/api/events/:id/cost-lines', () => errorResponse(404, 'NOT_FOUND', 'Server English text')));
    const { user } = await openEvent(event.id);
    await user.click(screen.getByRole('button', { name: '+ Lisää rivi' }));
    await user.selectOptions(draftField('combobox', 'Tyyppi'), 'Kitara');
    await user.click(document.body);
    expect(await within(draft()).findByRole('alert')).toBeInTheDocument();
    expect(screen.queryByText('Server English text')).not.toBeInTheDocument();
    expect(draftField('combobox', 'Tyyppi')).toHaveDisplayValue('Kitara');
  });

  it('works on an event without lines (the table appears for the draft)', async () => {
    const event = addMockEvent();
    db.events.costLines = db.events.costLines.filter((l) => l.eventId !== event.id);
    const { user } = renderApp(`/gigs/${event.id}`);
    await user.click(await screen.findByRole('button', { name: '+ Lisää rivi' }));
    expect(draftField('combobox', 'Tyyppi')).toHaveFocus();
    expect(screen.queryByText('Ei kulurivejä.')).not.toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('table', { name: 'Kulut ja miehitys' })).not.toBeInTheDocument();
  });
});

describe('cost list: musician-role lines first (TASK-181)', () => {
  beforeEach(() => {
    signInMock().selectedYear = TEST_YEAR;
  });
  const isMusician = (type: string) => (MUSICIAN_ROLES as readonly string[]).includes(type);
  const groups = () => Array.from(costs().querySelectorAll<HTMLElement>('tbody.cost-group'));
  const groupNames = () => groups().map((g) => g.getAttribute('aria-label'));
  const musicianFlags = () => groups().map((g) => g.classList.contains('is-musician'));
  /** Musician lines first (all shaded), then the others (none shaded). */
  const expectGrouped = () => {
    const flags = musicianFlags();
    const firstOther = flags.indexOf(false);
    expect(firstOther).toBeGreaterThan(0);
    expect(flags.slice(0, firstOther).every(Boolean)).toBe(true);
    expect(flags.slice(firstOther)).not.toContain(true);
    return firstOther;
  };

  /** Puts the event's non-musician lines in front of its musician lines in the mock store (= API order). */
  function nonMusiciansFirst(eventId: string) {
    const own = linesOf(db.events, eventId);
    const reordered = [...own.filter((l) => !isMusician(l.type)), ...own.filter((l) => isMusician(l.type))];
    db.events.costLines = [...db.events.costLines.filter((l) => l.eventId !== eventId), ...reordered];
  }

  it('orderCostLines keeps the API order within each group (stable)', () => {
    const l = (id: string, type: CostType) => ({ id, type }) as CostLine;
    const ordered = orderCostLines([l('1', 'FUEL'), l('2', 'BASS'), l('3', 'OFFICE'), l('4', 'MIX'), l('5', 'DJ'), l('6', 'OTHER')]);
    expect(ordered.map((x) => x.id)).toEqual(['2', '4', '5', '1', '3', '6']);
  });

  it('lists musician lines first (shaded rows), then the others in their API order', async () => {
    const event = addMockEvent();
    nonMusiciansFirst(event.id);
    addCostLine(db.events, event, { type: 'FUEL', personId: null, description: null, budgetedCents: 1000 }, partnerA().id);
    addCostLine(db.events, event, { type: 'DJ', personId: null, description: null, budgetedCents: 2000 }, partnerA().id);
    await openEvent(event.id);
    const firstOther = expectGrouped();
    const names = groupNames();
    expect(names[firstOther - 1]).toBe('DJ'); // last musician line in the API order
    expect(names.at(-1)).toBe('Polttoaine'); // last other line in the API order
  });

  it('a saved draft musician line moves up into the musician group; the keyboard focus stays put', async () => {
    const event = addMockEvent();
    nonMusiciansFirst(event.id);
    const { user } = await openEvent(event.id);
    const musiciansBefore = musicianFlags().filter(Boolean).length;
    const addButton = screen.getByRole('button', { name: '+ Lisää rivi' });
    await user.click(addButton);
    await user.selectOptions(draftField('combobox', 'Tyyppi'), 'Oma rooli');
    await user.type(draftField('textbox', 'Kuvaus'), 'Synthetic role');
    await user.type(draftField('textbox', 'Budjetti'), '70');
    // Keyboard out of the row: budget → trash → "Lisää rivi" saves the draft.
    await user.tab();
    await user.tab();
    expect(addButton).toHaveFocus();
    await screen.findByRole('rowgroup', { name: 'Oma rooli (Synthetic role)' });
    expect(within(costs()).queryByRole('rowgroup', { name: 'Uusi kulurivi' })).not.toBeInTheDocument();
    expect(groupNames().indexOf('Oma rooli (Synthetic role)')).toBe(musiciansBefore);
    expect(expectGrouped()).toBe(musiciansBefore + 1);
    expect(addButton).toHaveFocus();
  });

  it('uses the same order in the read-only (deleted gig) view', async () => {
    const event = addMockEvent();
    addCostLine(db.events, event, { type: 'PARKING', personId: null, description: null, budgetedCents: 500 }, partnerA().id);
    nonMusiciansFirst(event.id);
    event.deletedAt = new Date().toISOString();
    renderApp(`/gigs/${event.id}`);
    await screen.findByRole('table', { name: 'Kulut ja miehitys' });
    expectGrouped();
    expect(groupNames().at(-1)).toBe('Pysäköinti');
  });
});
