import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { formatMoney } from '../../lib/format';
import { DESKTOP_QUERY, TABLET_QUERY } from '../../lib/useMediaQuery';
import { db } from '../../mocks/data';
import { addPurchaseOrder } from '../../mocks/purchaseOrderStore';
import { server } from '../../mocks/server';
import { addMockEvent, partnerB, person, staffMockEvent, TEST_YEAR } from '../../test/eventFixtures';
import { installMatchMedia } from '../../test/matchMedia';
import { addMockPurchaseOrder, clearPurchaseOrders, localTs } from '../../test/purchaseOrderFixtures';
import { renderApp, signInMock } from '../../test/renderApp';

const text = (el: HTMLElement) => (el.textContent ?? '').replace(/\s/g, ' ');
const fiMoney = (cents: number) => formatMoney(cents, 'fi').replace(/\s/g, ' ');
const table = (name = 'Ostotilaukset') => screen.getByRole('table', { name });
const bodyRows = (name?: string) =>
  within(table(name))
    .getAllByRole('row')
    .filter((r) => r.closest('tbody'));
const rowOf = (number: string, name?: string) => bodyRows(name).find((r) => r.textContent?.includes(number))!;

describe('purchase order list (UC-034)', () => {
  beforeEach(() => {
    // The list is not tied to the selected year (contract "Year is no longer global").
    signInMock().selectedYear = TEST_YEAR - 10;
    clearPurchaseOrders();
    installMatchMedia({ [TABLET_QUERY]: true, [DESKTOP_QUERY]: true });
  });

  it('is in the menu after Keikat and lists every year, newest created first, with every column', async () => {
    const event = addMockEvent({ startDate: `${TEST_YEAR}-06-01`, venue: 'Venue X' });
    const second = addMockEvent({ startDate: `${TEST_YEAR}-07-15`, venue: 'Venue Y' });
    staffMockEvent(event, ['Person 1']);
    staffMockEvent(second, ['Person 1']);
    const lineIds = [event, second].map((g) => db.events.costLines.find((l) => l.eventId === g.id && l.type === 'VOC')!.id);
    // One PO with two events, made through the store like the freelancer would.
    const two = addPurchaseOrder(db.freelancer, db.events, person('Person 1').id, lineIds, localTs(TEST_YEAR, 8, 1, 9, 5));
    const paid = addMockPurchaseOrder({ personName: 'Person 2', status: 'PAID', paidAt: localTs(TEST_YEAR, 10, 16, 14, 32) }).po;
    const next = addMockPurchaseOrder({ personName: 'Person 3', createdAt: localTs(TEST_YEAR + 1, 1, 2) }).po; // next year
    const listUrls: string[] = [];
    const onRequest = ({ request }: { request: Request }) => {
      if (new URL(request.url).pathname === '/api/purchase-orders') listUrls.push(request.url);
    };
    server.events.on('request:start', onRequest);

    const { user } = renderApp('/');
    const nav = await screen.findByRole('navigation', { name: 'Päävalikko' });
    const labels = within(nav).getAllByRole('link').map((l) => l.textContent);
    expect(labels.indexOf('Ostotilaukset')).toBe(labels.indexOf('Keikat') + 1);
    await user.click(within(nav).getByRole('link', { name: 'Ostotilaukset' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'Ostotilaukset' })).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Valittu vuosi' })).toBeNull();
    await screen.findByRole('table', { name: 'Ostotilaukset' });
    expect(within(table()).getAllByRole('columnheader').map((h) => h.textContent)).toEqual([
      'Numero',
      'Freelancer',
      'Luotu',
      'Keikat',
      'Summa',
      'Tila',
    ]);
    // Every year, newest first; no year is sent.
    expect(bodyRows().map((r) => within(r).getAllByRole('link')[0]!.textContent)).toEqual([
      next.number,
      two.number,
      paid.number,
    ]);
    expect(listUrls.length).toBeGreaterThan(0);
    for (const url of listUrls) expect(new URL(url).searchParams.has('year')).toBe(false);
    server.events.removeListener('request:start', onRequest);
    const row = rowOf(two.number);
    expect(within(row).getByRole('link', { name: two.number })).toHaveAttribute('href', `/purchase-orders/${two.id}`);
    expect(text(row)).toContain('Person 1');
    expect(text(row)).toContain(`1.8.${TEST_YEAR} klo 09.05`);
    expect(text(row)).toContain(`1.6.${TEST_YEAR}, 15.7.${TEST_YEAR}`);
    expect(text(row)).toContain(fiMoney(two.totalCents));
    expect(text(rowOf(paid.number))).toContain(`Maksettu 16.10.${TEST_YEAR} klo 14.32`);
  });

  it('Mark paid is one click: the row then shows the green paid label and the event line is paid', async () => {
    const { po } = addMockPurchaseOrder();
    const { user } = renderApp('/purchase-orders');
    await screen.findByRole('table', { name: 'Ostotilaukset' });
    await user.click(within(rowOf(po.number)).getByRole('button', { name: `Merkitse maksetuksi: ${po.number}` }));
    const tag = await within(rowOf(po.number)).findByText(/^Maksettu \d+\.\d+\.\d{4} klo \d\d\.\d\d$/);
    expect(tag).toHaveClass('tag', 'tag-ok');
    expect(db.events.costLines.find((l) => l.id === po.lines[0]!.costLineId)!.paidAt).not.toBeNull();
    expect(within(rowOf(po.number)).queryByRole('button')).not.toBeInTheDocument();
  });

  it('shows an error under the button when paying fails', async () => {
    const { po } = addMockPurchaseOrder();
    server.use(
      http.post('/api/purchase-orders/:id/pay', () =>
        HttpResponse.json({ error: { code: 'FORBIDDEN', message: 'x' } }, { status: 403 }),
      ),
    );
    const { user } = renderApp('/purchase-orders');
    await screen.findByRole('table', { name: 'Ostotilaukset' });
    await user.click(within(rowOf(po.number)).getByRole('button', { name: /Merkitse maksetuksi/ }));
    expect(await within(rowOf(po.number)).findByRole('alert')).toHaveTextContent('Sinulla ei ole oikeutta');
    expect(within(rowOf(po.number)).getByRole('button', { name: /Merkitse maksetuksi/ })).toBeEnabled();
  });

  it('labels cancelled POs grey and filters by Freelancer and Tila', async () => {
    const cancelled = addMockPurchaseOrder({ personName: 'Person 2', status: 'CANCELLED' }).po;
    const open = addMockPurchaseOrder({ personName: 'Person 3' }).po;
    const { user } = renderApp('/purchase-orders');
    await screen.findByRole('table', { name: 'Ostotilaukset' });
    const tag = within(rowOf(cancelled.number)).getByText('Peruttu');
    expect(tag).toHaveClass('tag', 'tag-muted');

    await user.click(within(table()).getByRole('button', { name: 'Suodata: Tila' }));
    let popover = screen.getByRole('dialog', { name: 'Suodata: Tila' });
    expect(within(popover).getAllByRole('checkbox').map((c) => c.closest('label')!.textContent)).toEqual([
      'Avoin',
      'Peruttu',
    ]);
    await user.click(within(popover).getByRole('button', { name: 'Tyhjennä' }));
    await user.click(within(popover).getByRole('checkbox', { name: 'Avoin' }));
    await user.click(within(popover).getByRole('button', { name: 'OK' }));
    expect(bodyRows()).toHaveLength(1);
    expect(text(bodyRows()[0]!)).toContain(open.number);

    await user.click(screen.getByRole('button', { name: 'Tyhjennä suodattimet' }));
    await user.click(within(table()).getByRole('button', { name: 'Suodata: Freelancer' }));
    popover = screen.getByRole('dialog', { name: 'Suodata: Freelancer' });
    await user.click(within(popover).getByRole('button', { name: 'Tyhjennä' }));
    await user.click(within(popover).getByRole('checkbox', { name: 'Person 2' }));
    await user.click(within(popover).getByRole('button', { name: 'OK' }));
    expect(bodyRows()).toHaveLength(1);
    expect(text(bodyRows()[0]!)).toContain(cancelled.number);
  });

  it('search finds POs by number or name across every year and keeps it in the URL', async () => {
    const old = addMockPurchaseOrder({ personName: 'Person 4', createdAt: localTs(TEST_YEAR - 3, 2, 1) }).po;
    addMockPurchaseOrder({ personName: 'Person 5' });
    const { user } = renderApp('/purchase-orders');
    await screen.findByRole('table', { name: 'Ostotilaukset' });
    expect(bodyRows()).toHaveLength(2);

    await user.type(screen.getByRole('searchbox', { name: 'Haku' }), old.number.slice(-4));
    await waitFor(() => expect(bodyRows().map((r) => r.textContent)).toEqual([expect.stringContaining(old.number)]));
    expect(screen.getByRole('heading', { level: 1, name: 'Ostotilaukset' })).toBeInTheDocument();
  });

  it('opens with ?q= from the URL', async () => {
    const old = addMockPurchaseOrder({ personName: 'Person 4', createdAt: localTs(TEST_YEAR - 2, 2, 1) }).po;
    renderApp('/purchase-orders?q=person%204');
    expect(await screen.findByRole('searchbox', { name: 'Haku' })).toHaveValue('person 4');
    await screen.findByRole('table', { name: 'Ostotilaukset' });
    expect(bodyRows().map((r) => r.textContent)).toEqual([expect.stringContaining(old.number)]);
  });

  it('shows the log of recent PO events with links, event texts and actors', async () => {
    const { po } = addMockPurchaseOrder({
      personName: 'Person 2',
      createdAt: localTs(2020, 1, 1),
      status: 'PAID',
      paidAt: localTs(2020, 1, 3, 8, 15),
    });
    renderApp('/purchase-orders');

    expect(await screen.findByRole('heading', { name: 'Loki' })).toBeInTheDocument();
    const log = await screen.findByRole('table', { name: 'Ostotilausten muutokset' });
    await waitFor(() => expect(within(log).getAllByRole('row').filter((r) => r.closest('tbody'))).toHaveLength(2));
    const [paidRow, createdRow] = within(log).getAllByRole('row').filter((r) => r.closest('tbody'));
    expect(within(paidRow!).getByRole('link', { name: po.number })).toHaveAttribute('href', `/purchase-orders/${po.id}`);
    expect(text(paidRow!)).toContain('Merkitty maksetuksi');
    expect(text(paidRow!)).toContain('Partner A');
    expect(text(createdRow!)).toContain('Luotu freelancerin linkillä');
    expect(text(createdRow!)).toContain('Freelancer');
    expect(text(createdRow!)).toContain('1.1.2020 klo 12.00');
  });

  it('is in English for an English-speaking partner', async () => {
    signInMock(partnerB().email);
    const paid = addMockPurchaseOrder({ status: 'PAID', paidAt: localTs(TEST_YEAR, 10, 16, 14, 32) }).po;
    const cancelled = addMockPurchaseOrder({ personName: 'Person 2', status: 'CANCELLED' }).po;
    const open = addMockPurchaseOrder({ personName: 'Person 3' }).po;
    renderApp('/purchase-orders');
    expect(await screen.findByRole('heading', { level: 1, name: 'Purchase orders' })).toBeInTheDocument();
    await screen.findByRole('table', { name: 'Purchase orders' });
    const en = 'Purchase orders';
    expect(text(rowOf(paid.number, en))).toContain(`Paid 16 Oct ${TEST_YEAR} 14:32`);
    expect(within(rowOf(cancelled.number, en)).getByText('Cancelled')).toHaveClass('tag-muted');
    expect(within(rowOf(open.number, en)).getByRole('button', { name: `Mark paid: ${open.number}` })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Log' })).toBeInTheDocument();
  });
});
