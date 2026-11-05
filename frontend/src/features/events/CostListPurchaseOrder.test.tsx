// Event cost lines on a purchase order (UC-034 A5, BR-118): PO tag, locked controls, 409 messages.
import { screen, waitFor, within } from '@testing-library/react';
import { http } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { server } from '../../mocks/server';
import { onPurchaseOrder } from '../../mocks/eventHandlers';
import { mockLine, TEST_YEAR } from '../../test/eventFixtures';
import { addMockPurchaseOrder, clearPurchaseOrders } from '../../test/purchaseOrderFixtures';
import { renderApp, signInMock } from '../../test/renderApp';

const costs = () => screen.getByRole('table', { name: 'Kulut ja miehitys' });
const line = (name: string) => within(costs()).getByRole('rowgroup', { name });

async function openEvent(eventId: string) {
  const app = renderApp(`/gigs/${eventId}`);
  await screen.findByRole('table', { name: 'Kulut ja miehitys' });
  await within(line('Laulu')).findByRole('option', { name: 'Person 1' });
  return app;
}

describe('cost lines on a purchase order (BR-118)', () => {
  beforeEach(() => {
    signInMock().selectedYear = TEST_YEAR;
    clearPurchaseOrders();
  });

  it('shows a "PO <number>" tag linking to the PO and locks person, amount, load-in and paid controls', async () => {
    const { po, event } = addMockPurchaseOrder();
    const { user } = await openEvent(event.id);
    const voc = line('Laulu');
    const tag = within(voc).getByRole('link', { name: `Ostotilaus ${po.number}` });
    expect(tag).toHaveTextContent(`PO ${po.number}`);
    expect(tag).toHaveAttribute('href', `/purchase-orders/${po.id}`);

    expect(within(voc).getByRole('combobox', { name: 'Henkilö: Laulu' })).toBeDisabled();
    expect(within(voc).getByRole('textbox', { name: 'Budjetti: Laulu' })).toBeDisabled();
    expect(within(voc).getByRole('switch', { name: 'Roudaus ja soundcheck' })).toBeDisabled();
    expect(within(voc).queryByRole('button', { name: /^Merkitse maksetuksi/ })).not.toBeInTheDocument();
    expect(within(voc).queryByRole('button', { name: 'Poista' })).not.toBeInTheDocument();
    expect(within(voc).getAllByText(`Ostotilauksella ${po.number}`).length).toBeGreaterThan(0);

    // The description stays editable.
    const description = within(voc).getByRole('textbox', { name: 'Kuvaus: Laulu' });
    expect(description).toBeEnabled();
    await user.type(description, 'Extra set');
    await user.tab();
    await waitFor(() => expect(mockLine(event, 'VOC').description).toBe('Extra set'));

    // Other lines are not locked.
    expect(within(line('Kitara')).getByRole('combobox', { name: 'Henkilö: Kitara' })).toBeEnabled();
    expect(within(line('Kitara')).queryByRole('link', { name: /Ostotilaus/ })).not.toBeInTheDocument();
  });

  it('a paid PO line shows just the paid amount, without the edit / pay controls', async () => {
    const { event } = addMockPurchaseOrder({ status: 'PAID' });
    await openEvent(event.id);
    const voc = line('Laulu');
    expect(within(voc).queryByRole('textbox', { name: /Toteutunut summa/ })).not.toBeInTheDocument();
    expect(within(voc).queryByRole('button', { name: /^Merkitse maksetuksi/ })).not.toBeInTheDocument();
    const cell = voc.querySelector('td.cost-paid')!;
    expect(cell.textContent).toMatch(/^[\d\s]+,\d\d\s€$/);
    expect(cell).not.toHaveTextContent('Maksettu');
  });

  it('cancelling an event with a line on an open PO explains which PO blocks it', async () => {
    const { po, event } = addMockPurchaseOrder();
    const { user } = await openEvent(event.id);
    await user.click(screen.getByRole('button', { name: 'Peru keikka' }));
    const dialog = screen.getByRole('dialog', { name: 'Peru keikka' });
    await user.type(within(dialog).getByRole('textbox', { name: 'Syy' }), 'Called off.');
    await user.click(within(dialog).getByRole('button', { name: 'Peru keikka' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      `Rivi on ostotilauksella ${po.number}. Muuta ensin ostotilausta`,
    );
  });

  it('a 409 COST_LINE_ON_PURCHASE_ORDER from a line edit is shown with the PO number', async () => {
    const { event } = addMockPurchaseOrder();
    const { user } = await openEvent(event.id);
    // Someone else put the guitar line on a PO meanwhile.
    server.use(http.patch('/api/cost-lines/:id', () => onPurchaseOrder('PERSON-2-0099')));
    await user.selectOptions(within(line('Kitara')).getByRole('combobox', { name: 'Henkilö: Kitara' }), 'Person 2');
    expect((await within(line('Kitara')).findAllByText(/Rivi on ostotilauksella PERSON-2-0099/)).length).toBeGreaterThan(0);
  });
});
