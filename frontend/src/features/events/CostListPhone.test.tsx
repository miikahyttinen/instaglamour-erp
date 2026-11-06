import { screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../mocks/data';
import { addMockEvent, mockLine, staffMockEvent, TEST_YEAR } from '../../test/eventFixtures';
import { addMockPurchaseOrder, clearPurchaseOrders } from '../../test/purchaseOrderFixtures';
import { renderApp, signInMock } from '../../test/renderApp';

// TASK-184: on phones each cost line shows everything in two rows (type · person · budget · actual,
// then description · load-in · remove / PO tag), with no chevron or hidden detail area. jsdom has
// no layout, so these tests check the markup the phone grid places (costListLayout.test.ts guards
// the CSS itself; e2e 12-layout-v2 checks the real rows).
const costs = () => screen.getByRole('table', { name: 'Kulut ja miehitys' });
const line = (name: string) => within(costs()).getByRole('rowgroup', { name });

async function openEvent(eventId: string) {
  const app = renderApp(`/gigs/${eventId}`);
  await screen.findByRole('table', { name: 'Kulut ja miehitys' });
  await within(line('Laulu')).findByRole('option', { name: 'Person 1' });
  return app;
}

describe('cost list on phones: two rows per line (TASK-184)', () => {
  beforeEach(() => {
    signInMock().selectedYear = TEST_YEAR;
  });

  it('no chevron, expand state or summary cell: every control of the line is in its one table row', async () => {
    const event = addMockEvent();
    staffMockEvent(event, ['Person 1']);
    await openEvent(event.id);
    expect(within(costs()).queryByRole('button', { name: /^Näytä lisätiedot/ })).not.toBeInTheDocument();
    expect(costs().querySelector('[aria-expanded]')).toBeNull();
    expect(costs().querySelector('.is-expanded, td.cost-summary, td.cost-toggle, .cost-phone-only')).toBeNull();

    const laulu = line('Laulu');
    expect(laulu.querySelectorAll('tr')).toHaveLength(1);
    const staffed = db.events.people.find((p) => p.id === mockLine(event, 'VOC').personId)!;
    // Row 1: type name, person picker, budget, actual.
    expect(laulu.querySelector('td.cost-type .cost-type-name')).toHaveTextContent(/^Laulu$/);
    expect(laulu.querySelector('.cost-type-name')).toHaveAttribute('title', 'Laulu');
    expect(within(laulu).getByRole('combobox', { name: 'Henkilö: Laulu' })).toHaveDisplayValue(staffed.name);
    expect(within(laulu).getByRole('textbox', { name: 'Budjetti: Laulu' })).toBeInTheDocument();
    expect(within(laulu).getByRole('button', { name: 'Merkitse maksetuksi: Laulu' })).toBeInTheDocument();
    // Row 2: description, load-in switch (musician), remove.
    expect(within(laulu).getByRole('textbox', { name: 'Kuvaus: Laulu' })).toBeInTheDocument();
    expect(within(laulu).getByRole('switch', { name: 'Roudaus ja soundcheck' })).toBeInTheDocument();
    expect(within(laulu).getByRole('button', { name: 'Poista' }).closest('td')).toHaveClass('cost-actions');
  });

  it('the cells come in the order the phone grid places them; the description is in the type cell', async () => {
    const event = addMockEvent();
    await openEvent(event.id);
    const row = line('Basso').querySelector('tr')!;
    const cells = [...row.children].map((c) => c.className.split(' '));
    const order = ['cost-type', 'cost-person', 'cost-loadin', 'cost-budget', 'cost-paid', 'cost-actions'].map((cls) =>
      cells.findIndex((c) => c.includes(cls)),
    );
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(within(line('Basso')).getByRole('textbox', { name: 'Kuvaus: Basso' }).closest('td')).toHaveClass('cost-type');
  });

  it('musician lines are marked for the load-in column; other lines have an empty load-in cell', async () => {
    const event = addMockEvent();
    await openEvent(event.id);
    expect(line('Basso')).toHaveClass('is-musician');
    expect(line('Toimisto')).not.toHaveClass('is-musician');
    expect(line('Toimisto').querySelector('td.cost-loadin')).toHaveClass('is-empty');
    expect(within(line('Toimisto')).queryByRole('switch')).not.toBeInTheDocument();
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

  it('a line on a purchase order: the PO tag replaces the remove button, its title is the lock hint', async () => {
    clearPurchaseOrders();
    const { po, event } = addMockPurchaseOrder();
    await openEvent(event.id);
    const laulu = line('Laulu');
    expect(laulu).toHaveClass('has-po');
    const actions = laulu.querySelector('td.cost-actions')!;
    const tag = within(laulu).getByRole('link', { name: `Ostotilaus ${po.number}` });
    expect(tag.closest('td')).toBe(actions);
    expect(tag).toHaveClass('tag', 'tag-info', 'cost-po-tag');
    expect(tag).toHaveAttribute('title', `Ostotilauksella ${po.number}`);
    expect(actions).toHaveTextContent(new RegExp(`^PO ${po.number}$`));
    expect(within(laulu).queryByRole('button', { name: 'Poista' })).not.toBeInTheDocument();
    expect(laulu.querySelector('td.cost-type .cost-po-tag')).toBeNull();
    expect(line('Kitara')).not.toHaveClass('has-po');
  });

  it('read-only (deleted gig): no actions column, so the PO tag stays next to the type', async () => {
    clearPurchaseOrders();
    const { po, event } = addMockPurchaseOrder();
    const stored = db.events.events.find((e) => e.id === event.id)!;
    stored.deletedAt = new Date().toISOString();
    renderApp(`/gigs/${event.id}`);
    await screen.findByRole('table', { name: 'Kulut ja miehitys' });
    const tag = within(line('Laulu')).getByRole('link', { name: `Ostotilaus ${po.number}` });
    expect(tag.closest('td')).toHaveClass('cost-type');
    expect(tag).toHaveAttribute('title', `Ostotilauksella ${po.number}`);
    expect(line('Laulu').querySelector('td.cost-actions')).toBeNull();
  });

  it('the draft row has the same cells: type select in the type cell, then person, budget, remove', async () => {
    const event = addMockEvent();
    const { user } = await openEvent(event.id);
    await user.click(screen.getByRole('button', { name: '+ Lisää rivi' }));
    const draft = within(costs()).getByRole('rowgroup', { name: 'Uusi kulurivi' });
    expect(draft).not.toHaveClass('is-expanded');
    expect(draft.querySelector('td.cost-summary, td.cost-toggle')).toBeNull();
    expect(within(draft).getByRole('combobox', { name: 'Tyyppi: Uusi kulurivi' }).closest('td')).toHaveClass('cost-type');
    expect(within(draft).getByRole('textbox', { name: 'Kuvaus: Uusi kulurivi' }).closest('td')).toHaveClass('cost-type');
    expect(within(draft).getByRole('combobox', { name: 'Henkilö: Uusi kulurivi' }).closest('td')).toHaveClass('cost-person');
    expect(within(draft).getByRole('textbox', { name: 'Budjetti: Uusi kulurivi' }).closest('td')).toHaveClass('cost-budget');
    expect(within(draft).getByRole('button', { name: 'Poista' }).closest('td')).toHaveClass('cost-actions');
  });
});
