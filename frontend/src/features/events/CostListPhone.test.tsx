import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../mocks/data';
import { addCostLine } from '../../mocks/eventStore';
import { addMockEvent, mockLine, partnerA, staffMockEvent, TEST_YEAR } from '../../test/eventFixtures';
import { addMockPurchaseOrder, clearPurchaseOrders } from '../../test/purchaseOrderFixtures';
import { renderApp, signInMock } from '../../test/renderApp';

// TASK-183: on phones each cost line is one row (summary · budget · actual · chevron) and the
// chevron opens a detail area. jsdom has no layout, so these tests check the markup and the
// expand state the phone CSS works on (costListLayout.test.ts guards the CSS itself).
const costs = () => screen.getByRole('table', { name: 'Kulut ja miehitys' });
const line = (name: string) => within(costs()).getByRole('rowgroup', { name });
const chevron = (name: string) => within(line(name)).getByRole('button', { name: `Näytä lisätiedot: ${name}` });
const summary = (name: string) => line(name).querySelector('td.cost-summary');

async function openEvent(eventId: string) {
  const app = renderApp(`/gigs/${eventId}`);
  await screen.findByRole('table', { name: 'Kulut ja miehitys' });
  await within(line('Laulu')).findByRole('option', { name: 'Person 1' });
  return app;
}

describe('cost list on phones: one row per line (TASK-183)', () => {
  beforeEach(() => {
    signInMock().selectedYear = TEST_YEAR;
  });

  it('the row has the summary "Type · Person" (person omitted when none), budget, actual and the chevron', async () => {
    const event = addMockEvent();
    staffMockEvent(event, ['Person 1']);
    await openEvent(event.id);
    const staffed = db.events.people.find((p) => p.id === mockLine(event, 'VOC').personId)!;
    expect(summary('Laulu')).toHaveTextContent(`Laulu · ${staffed.name}`);
    expect(summary('Laulu')).toHaveAttribute('title', `Laulu · ${staffed.name}`);
    expect(summary('Basso')).toHaveTextContent(/^Basso$/);
    expect(summary('Basso')).toHaveClass('cost-phone-only');

    // Cells in row order for the phone grid: summary, budget, actual, chevron.
    const row = line('Basso').querySelector('tr')!;
    const cells = [...row.children].map((c) => c.className);
    const order = ['cost-summary', 'cost-budget', 'cost-paid', 'cost-toggle'].map((cls) =>
      cells.findIndex((c) => c.split(' ').includes(cls)),
    );
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(chevron('Basso').closest('td')).toHaveClass('cost-toggle', 'cost-phone-only');
  });

  it('the chevron expands only its own line and collapses it again', async () => {
    const event = addMockEvent();
    const { user } = await openEvent(event.id);
    expect(chevron('Basso')).toHaveAttribute('aria-expanded', 'false');
    expect(line('Basso')).not.toHaveClass('is-expanded');

    await user.click(chevron('Basso'));
    expect(chevron('Basso')).toHaveAttribute('aria-expanded', 'true');
    expect(line('Basso')).toHaveClass('is-expanded');
    expect(line('Kitara')).not.toHaveClass('is-expanded');
    expect(chevron('Kitara')).toHaveAttribute('aria-expanded', 'false');
    // The detail area: type label + description, person picker, load-in switch, remove.
    const basso = line('Basso');
    expect(basso.querySelector('td.cost-type')).toHaveTextContent('Basso');
    expect(within(basso).getByRole('textbox', { name: 'Kuvaus: Basso' })).toBeInTheDocument();
    expect(within(basso).getByRole('combobox', { name: 'Henkilö: Basso' })).toBeInTheDocument();
    expect(within(basso).getByRole('switch', { name: 'Roudaus ja soundcheck' })).toBeInTheDocument();
    expect(within(basso).getByRole('button', { name: 'Poista' })).toBeInTheDocument();

    await user.click(chevron('Basso'));
    expect(chevron('Basso')).toHaveAttribute('aria-expanded', 'false');
    expect(line('Basso')).not.toHaveClass('is-expanded');
  });

  it('"Mark paid" is an icon button named after the line; it opens the amount input in the actual cell', async () => {
    const event = addMockEvent();
    const { user } = await openEvent(event.id);
    const button = within(line('Basso')).getByRole('button', { name: 'Merkitse maksetuksi: Basso' });
    expect(button.querySelector('svg.cost-pay-icon')).toHaveAttribute('aria-hidden', 'true');
    expect(button.querySelector('.cost-pay-text')).toHaveTextContent('Merkitse maksetuksi');
    const cell = button.closest('td')!;
    expect(cell).toHaveClass('cost-paid');
    await user.click(button);
    const input = within(line('Basso')).getByRole('textbox', { name: 'Toteutunut summa: Basso' });
    expect(input.closest('td')).toBe(cell);
    expect(input).toHaveFocus();
  });

  it('fuel lines have an empty actual cell; a paid line shows its amount in the row', async () => {
    const event = addMockEvent();
    addCostLine(db.events, event, { type: 'FUEL', personId: null, description: null, budgetedCents: 10000 }, partnerA().id);
    const { user } = await openEvent(event.id);
    expect(line('Polttoaine').querySelector('td.cost-paid')).toBeEmptyDOMElement();
    await user.click(within(line('Basso')).getByRole('button', { name: 'Merkitse maksetuksi: Basso' }));
    await user.keyboard('{Enter}');
    await waitFor(() =>
      expect(within(line('Basso')).getByRole('textbox', { name: 'Toteutunut summa: Basso' })).toHaveValue('100,00'),
    );
  });

  it('a line on a purchase order shows the lock hint in the detail area', async () => {
    clearPurchaseOrders();
    const { po, event } = addMockPurchaseOrder();
    const { user } = await openEvent(event.id);
    await user.click(chevron('Laulu'));
    expect(line('Laulu')).toHaveClass('is-expanded');
    expect(line('Laulu').querySelector('td.cost-actions')).toHaveTextContent(`Ostotilauksella ${po.number}`);
  });

  it('the draft row is expanded by default; its summary shows the chosen type', async () => {
    const event = addMockEvent();
    const { user } = await openEvent(event.id);
    await user.click(screen.getByRole('button', { name: '+ Lisää rivi' }));
    const draft = within(costs()).getByRole('rowgroup', { name: 'Uusi kulurivi' });
    expect(draft).toHaveClass('is-expanded');
    expect(draft.querySelector('td.cost-summary')).toHaveTextContent('Uusi kulurivi');
    // No chevron on the draft: its fields stay open until it is saved or dropped.
    expect(within(draft).queryByRole('button', { name: /^Näytä lisätiedot/ })).not.toBeInTheDocument();
    await user.selectOptions(within(draft).getByRole('combobox', { name: 'Tyyppi: Uusi kulurivi' }), 'Toimisto');
    expect(draft.querySelector('td.cost-summary')).toHaveTextContent('Toimisto');
  });
});
