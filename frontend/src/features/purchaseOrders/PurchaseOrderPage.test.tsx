import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { formatMoney } from '../../lib/format';
import { DESKTOP_QUERY, TABLET_QUERY } from '../../lib/useMediaQuery';
import { db } from '../../mocks/data';
import { person, TEST_YEAR } from '../../test/eventFixtures';
import { installMatchMedia } from '../../test/matchMedia';
import { addMockPurchaseOrder, clearPurchaseOrders, localTs } from '../../test/purchaseOrderFixtures';
import { renderApp, signInMock } from '../../test/renderApp';

const text = (el: HTMLElement) => (el.textContent ?? '').replace(/\s/g, ' ');
const fiMoney = (cents: number) => formatMoney(cents, 'fi').replace(/\s/g, ' ');
const costLine = (id: string) => db.events.costLines.find((l) => l.id === id)!;

describe('purchase order page (UC-034)', () => {
  beforeEach(() => {
    signInMock().selectedYear = TEST_YEAR;
    clearPurchaseOrders();
    installMatchMedia({ [TABLET_QUERY]: true, [DESKTOP_QUERY]: true });
  });

  it('shows number, status, freelancer link, totals, fee lines with event links and the history', async () => {
    const { po, event } = addMockPurchaseOrder({ venue: 'Venue X', createdAt: localTs(TEST_YEAR, 6, 5, 9, 0) });
    renderApp(`/purchase-orders/${po.id}`);
    expect(await screen.findByRole('heading', { level: 1, name: po.number })).toBeInTheDocument();
    expect(screen.getByText('Avoin')).toHaveClass('tag');
    expect(screen.getByRole('link', { name: 'Person 1' })).toHaveAttribute('href', `/people/${person('Person 1').id}`);
    const page = document.querySelector('.po-facts') as HTMLElement;
    expect(text(page)).toContain(`5.6.${TEST_YEAR} klo 09.00`);
    expect(text(page)).toContain(fiMoney(po.totalCents));

    const lines = screen.getByRole('table', { name: 'Ostotilauksen palkkiot' });
    expect(within(lines).getAllByRole('columnheader').map((h) => h.textContent)).toEqual([
      'Keikan päivä',
      'Paikka',
      'Kokoonpano',
      'Rooli',
      'Palkkio alv 0 %',
      'Soundcheck-vähennys',
      'ALV',
      'Summa',
      'Keikka',
    ]);
    expect(text(page)).toContain('ALVEi ALV');
    const row = within(lines).getAllByRole('row').find((r) => r.closest('tbody'))!;
    expect(text(row)).toContain(`1.6.${TEST_YEAR}`);
    expect(text(row)).toContain('Venue X');
    expect(text(row)).toContain('Template A');
    expect(text(row)).toContain('Laulu');
    expect(within(row).getByRole('link', { name: 'Avaa keikka: Venue X' })).toHaveAttribute('href', `/gigs/${event.id}`);

    const history = await screen.findByRole('table', { name: 'Historia' });
    expect(text(history)).toContain('Luotu freelancerin linkillä');
    expect(text(history)).toContain('Freelancer');
  });

  it('VAT-liable PO: breakdown per line and in the totals row (deduction, VAT, final amount)', async () => {
    const { po } = addMockPurchaseOrder({ venue: 'Venue X' });
    const stored = db.freelancer.purchaseOrders.find((p) => p.id === po.id)!;
    stored.vatLiable = true;
    stored.vatRateBp = 2550;
    Object.assign(stored.lines[0]!, { baseCents: 10000, soundcheck: false, deductionCents: 1000, vatCents: 1215, amountCents: 10215 });
    stored.totalCents = 10215;
    renderApp(`/purchase-orders/${po.id}`);
    await screen.findByRole('heading', { level: 1, name: po.number });
    expect(text(document.querySelector('.po-facts') as HTMLElement)).toContain('ALVALV 25,5 %');
    const lines = screen.getByRole('table', { name: 'Ostotilauksen palkkiot' });
    const row = within(lines).getAllByRole('row').find((r) => r.closest('tbody'))!;
    const cells = within(row).getAllByRole('cell').map((c) => text(c));
    expect(cells.slice(4, 8)).toEqual([fiMoney(10000), `−${fiMoney(1000)}`, `+${fiMoney(1215)}`, fiMoney(10215)]);
    const total = within(lines).getAllByRole('row').find((r) => r.closest('tfoot'))!;
    expect(within(total).getAllByRole('cell').map((c) => text(c)).slice(1, 5)).toEqual([
      fiMoney(10000),
      `−${fiMoney(1000)}`,
      `+${fiMoney(1215)}`,
      fiMoney(10215),
    ]);
  });

  it('Mark paid → paid label and Unmark paid (after confirming) → open again', async () => {
    const { po } = addMockPurchaseOrder();
    const lineId = po.lines[0]!.costLineId;
    const { user } = renderApp(`/purchase-orders/${po.id}`);
    await screen.findByRole('heading', { level: 1, name: po.number });

    await user.click(screen.getByRole('button', { name: 'Merkitse maksetuksi' }));
    expect(await screen.findByText(/^Maksettu \d+\.\d+\.\d{4} klo \d\d\.\d\d$/)).toHaveClass('tag-ok');
    expect(costLine(lineId).paidAt).not.toBeNull();
    expect(screen.queryByRole('button', { name: 'Peru ostotilaus' })).not.toBeInTheDocument();
    await waitFor(() => expect(text(screen.getByRole('table', { name: 'Historia' }))).toContain('Merkitty maksetuksi'));
    expect(text(screen.getByRole('table', { name: 'Historia' }))).toContain('Partner A');

    await user.click(screen.getByRole('button', { name: 'Peru maksu' }));
    const dialog = screen.getByRole('dialog', { name: 'Peru maksu' });
    expect(text(dialog)).toContain(po.number);
    await user.click(within(dialog).getByRole('button', { name: 'Peru maksu' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(await screen.findByRole('button', { name: 'Merkitse maksetuksi' })).toBeInTheDocument();
    expect(costLine(lineId).paidAt).toBeNull();
    await waitFor(() => expect(text(screen.getByRole('table', { name: 'Historia' }))).toContain('Maksu peruttu'));
  });

  it('Cancel needs a reason; the cancelled PO shows the grey label, reason and no actions', async () => {
    const { po } = addMockPurchaseOrder();
    const { user } = renderApp(`/purchase-orders/${po.id}`);
    await screen.findByRole('heading', { level: 1, name: po.number });
    await user.click(screen.getByRole('button', { name: 'Peru ostotilaus' }));
    const dialog = screen.getByRole('dialog', { name: 'Peru ostotilaus' });
    const confirm = within(dialog).getByRole('button', { name: 'Peru ostotilaus' });
    expect(confirm).toBeDisabled();
    await user.type(within(dialog).getByRole('textbox', { name: 'Syy' }), 'Wrong fee.');
    await user.click(confirm);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    expect(await screen.findByText('Peruttu', { selector: '.tag' })).toHaveClass('tag-muted');
    expect(text(document.querySelector('.po-facts') as HTMLElement)).toContain('Wrong fee.');
    expect(screen.queryByRole('button', { name: 'Merkitse maksetuksi' })).not.toBeInTheDocument();
    expect(costLine(po.lines[0]!.costLineId).purchaseOrder).toBeNull();
    await waitFor(() =>
      expect(text(screen.getByRole('table', { name: 'Historia' }))).toContain('Peruttu: Wrong fee.'),
    );
  });

  it('a status that already changed elsewhere shows a message and refreshes', async () => {
    const { po } = addMockPurchaseOrder();
    const { user } = renderApp(`/purchase-orders/${po.id}`);
    await screen.findByRole('heading', { level: 1, name: po.number });
    db.freelancer.purchaseOrders.find((p) => p.id === po.id)!.status = 'CANCELLED';
    await user.click(screen.getByRole('button', { name: 'Merkitse maksetuksi' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Ostotilauksen tila on jo muuttunut');
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Merkitse maksetuksi' })).not.toBeInTheDocument());
  });

  it('unknown id → not found', async () => {
    renderApp('/purchase-orders/00000000-0000-4000-8000-000000000999');
    expect(await screen.findByRole('alert')).toHaveTextContent('Tietoa ei löytynyt.');
    expect(within(screen.getByRole('main')).getByRole('link', { name: 'Ostotilaukset' })).toHaveAttribute(
      'href',
      '/purchase-orders',
    );
  });
});
