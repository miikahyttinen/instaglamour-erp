import { act, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setLanguage } from '../../i18n';
import { DESKTOP_QUERY, TABLET_QUERY } from '../../lib/useMediaQuery';
import { db } from '../../mocks/data';
import { addAutoFinalInvoice, addInvoiceRow, type MockEvent } from '../../mocks/eventStore';
import { addMockClient, addMockEvent, partnerA } from '../../test/eventFixtures';
import { installMatchMedia } from '../../test/matchMedia';
import { currentSearch, renderApp, signInMock } from '../../test/renderApp';

const table = () => screen.getByRole('table', { name: 'Laskurivit' });
const bodyRows = () => within(table()).getAllByRole('row').filter((r) => r.closest('tbody'));
const pager = () => screen.queryByRole('navigation', { name: 'Sivutus' });

function addRow(event: MockEvent, description: string, amountCents: number, status: 'NOT_SENT' | 'SENT' = 'NOT_SENT') {
  return addInvoiceRow(db.events, event, { description, amountCents, status }, partnerA().id);
}

describe('Laskutus page (TASK-202)', () => {
  beforeEach(() => {
    signInMock();
    db.events.invoiceRows.length = 0; // only this test's rows
  });

  it('is in the menu right after Keikat and lists every invoice row in API order', async () => {
    const client = addMockClient('Client X');
    const g1 = addMockEvent({ startDate: '2030-03-01', lineupName: 'Band One', clientId: client.id });
    const g2 = addMockEvent({ startDate: '2031-04-02', lineupName: 'Band Two', venue: 'Venue Y' });
    g1.invoicingDetails = 'Reference 123\nPO 456';
    addRow(g1, 'Ennakko', 50000, 'SENT');
    addRow(g2, 'Lasku', 20000);
    g2.priceCents = 100000;
    addAutoFinalInvoice(db.events, g2);
    // A deleted gig's rows are not listed.
    const deleted = addMockEvent({ lineupName: 'Gone' });
    addRow(deleted, 'Deleted row', 100);
    deleted.deletedAt = new Date().toISOString();

    installMatchMedia({ [DESKTOP_QUERY]: true, [TABLET_QUERY]: true });
    const { user } = renderApp('/');
    const nav = await screen.findByRole('navigation', { name: 'Päävalikko' });
    const labels = within(nav).getAllByRole('link').map((l) => l.textContent);
    expect(labels.indexOf('Laskutus')).toBe(labels.indexOf('Keikat') + 1);
    await user.click(within(nav).getByRole('link', { name: 'Laskutus' }));

    expect(await screen.findByRole('heading', { name: 'Laskutus', level: 1 })).toBeInTheDocument();
    await screen.findByRole('table', { name: 'Laskurivit' });
    expect(within(table()).getAllByRole('columnheader').map((h) => h.textContent)).toEqual([
      'Tila',
      'Luotu',
      'Asiakas',
      'Keikka',
      'Kuvaus',
      'Summa',
      'Laskutustiedot',
    ]);
    // API order: not sent first (newest first), then sent. Nothing is sortable.
    expect(within(table()).queryAllByRole('button', { name: /Tila|Summa/ })).toHaveLength(0);
    const rows = bodyRows();
    expect(rows).toHaveLength(3);
    const [auto, open, sent] = rows.map((r) => within(r));
    expect(auto!.getByText('Loppulasku')).toBeInTheDocument();
    expect(auto!.getByText('Automaattinen')).toHaveAttribute('title', 'Luotu automaattisesti 48 h keikan jälkeen');
    expect(open!.getByText('Lasku')).toBeInTheDocument();
    expect(open!.queryByText('Automaattinen')).not.toBeInTheDocument();
    expect(sent!.getByText('Ennakko')).toBeInTheDocument();

    // Status tags in the gig page's tones.
    expect(auto!.getByText('Lähettämättä')).toHaveClass('tag', 'tag-yellow');
    expect(sent!.getByText('Lähetetty')).toHaveClass('tag', 'tag-ok');

    // Client ("–" without one), gig link (date + lineup name), amount right-aligned.
    expect(open!.getAllByRole('cell')[2]).toHaveTextContent('–');
    expect(sent!.getAllByRole('cell')[2]).toHaveTextContent('Client X');
    const link = sent!.getByRole('link', { name: '1.3.2030 Band One' });
    expect(link).toHaveAttribute('href', `/gigs/${g1.id}`);
    expect(open!.getByRole('link', { name: '2.4.2031 Band Two' })).toHaveAttribute('href', `/gigs/${g2.id}`);
    const amount = sent!.getAllByRole('cell')[5]!;
    expect(amount).toHaveTextContent(/500,00\s€/);
    expect(amount).toHaveClass('num');

    // Laskutustiedot: multi-line text with the full text in its title; "–" when empty.
    const details = sent!.getByText(/Reference 123/);
    expect(details.textContent).toBe('Reference 123\nPO 456');
    expect(details).toHaveAttribute('title', 'Reference 123\nPO 456');
    expect(open!.getAllByRole('cell')[6]).toHaveTextContent('–');

    // Few rows: no pager. The link opens the gig page.
    expect(pager()).not.toBeInTheDocument();
    await user.click(link);
    expect(await screen.findByRole('heading', { name: 'Band One · Venue X', level: 1 })).toBeInTheDocument();
  });

  it('shows "Ei laskuja" without rows, and in English', async () => {
    renderApp('/invoicing');
    expect(await screen.findByText('Ei laskuja')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    act(() => setLanguage('en'));
    expect(await screen.findByText('No invoices')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Invoicing', level: 1 })).toBeInTheDocument();
  });

  it('pages 100 rows at a time with the shared pager (?page=)', async () => {
    const event = addMockEvent();
    for (let i = 1; i <= 101; i++) addRow(event, `Row ${String(i).padStart(3, '0')}`, 100);
    const { user } = renderApp('/invoicing');
    await screen.findByRole('table', { name: 'Laskurivit' });
    expect(bodyRows()).toHaveLength(100);
    // Newest first: Row 101 … Row 002 on page 1.
    expect(bodyRows()[0]).toHaveTextContent('Row 101');
    expect(pager()).toHaveTextContent('Sivu 1 / 2');
    await user.click(within(pager()!).getByRole('button', { name: 'Seuraava' }));
    await waitFor(() => expect(bodyRows()).toHaveLength(1));
    expect(bodyRows()[0]).toHaveTextContent('Row 001');
    expect(currentSearch().get('page')).toBe('2');
  });

  it('phone rows: client is the title, the status tag the main item; gig, description, amount and details on the lines below', async () => {
    const event = addMockEvent({ clientId: addMockClient('Client X').id });
    event.invoicingDetails = 'Details';
    addRow(event, 'Lasku', 100);
    renderApp('/invoicing'); // no matchMedia = phone
    await screen.findByRole('table', { name: 'Laskurivit' });
    const cells = within(bodyRows()[0]!).getAllByRole('cell');
    const byText = (text: string | RegExp) => cells.find((c) => c.textContent?.match(text))!;
    expect(byText('Client X')).toHaveClass('cell-primary');
    expect(byText('Lähettämättä')).toHaveClass('cell-main');
    expect(byText('Lasku')).toHaveClass('cell-bare', 'inv-col-description');
    expect(byText(/1,00\s€/)).toHaveClass('cell-bare', 'inv-col-amount');
    expect(byText('Details')).toHaveClass('cell-bare', 'inv-col-details');
    expect(cells.find((c) => c.classList.contains('inv-col-created'))).toHaveClass('hide-phone');
    // No filters: no "Suodattimet" button on phones.
    expect(screen.queryByRole('button', { name: 'Suodattimet' })).not.toBeInTheDocument();
  });

  it('refreshes after an invoice row is changed on the gig page', async () => {
    const event = addMockEvent({ lineupName: 'Band One' });
    addRow(event, 'Ennakko', 100);
    installMatchMedia({ [DESKTOP_QUERY]: true, [TABLET_QUERY]: true });
    const { user } = renderApp('/invoicing');
    await screen.findByRole('table', { name: 'Laskurivit' });
    expect(within(bodyRows()[0]!).getByText('Lähettämättä')).toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: /Band One/ }));
    const status = await screen.findByRole('combobox', { name: 'Tila: Ennakko' });
    await user.selectOptions(status, 'Lähetetty');
    await waitFor(() => expect(db.events.invoiceRows[0]!.status).toBe('SENT'));

    const nav = screen.getByRole('navigation', { name: 'Päävalikko' });
    await user.click(within(nav).getByRole('link', { name: 'Laskutus' }));
    await waitFor(() => expect(within(bodyRows()[0]!).getByText('Lähetetty')).toBeInTheDocument());
  });

  describe('Laskutustiedot toggle', () => {
    let restore: (() => void) | undefined;
    afterEach(() => restore?.());

    it('opens and closes long text when it is cut', async () => {
      // jsdom has no layout: report every clamped paragraph as cut.
      const original = globalThis.ResizeObserver;
      class FakeObserver {
        constructor(private readonly cb: ResizeObserverCallback) {}
        observe() {
          this.cb([], this as unknown as ResizeObserver);
        }
        disconnect() {}
        unobserve() {}
      }
      globalThis.ResizeObserver = FakeObserver as unknown as typeof ResizeObserver;
      const heights = vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(100);
      restore = () => {
        globalThis.ResizeObserver = original;
        heights.mockRestore();
      };

      const event = addMockEvent();
      event.invoicingDetails = 'Line 1\nLine 2\nLine 3\nLine 4';
      addRow(event, 'Lasku', 100);
      const { user } = renderApp('/invoicing');
      await screen.findByRole('table', { name: 'Laskurivit' });
      const text = screen.getByText(/Line 1/);
      const toggle = screen.getByRole('button', { name: 'Näytä kaikki' });
      expect(toggle).toHaveAttribute('aria-expanded', 'false');
      expect(toggle).toHaveAttribute('aria-controls', text.id);
      await user.click(toggle);
      expect(text).toHaveClass('is-open');
      const less = screen.getByRole('button', { name: 'Näytä vähemmän' });
      expect(less).toHaveAttribute('aria-expanded', 'true');
      await user.click(less);
      expect(text).not.toHaveClass('is-open');
      expect(screen.getByRole('button', { name: 'Näytä kaikki' })).toBeInTheDocument();
    });

    it('has no toggle when the text fits', async () => {
      const event = addMockEvent();
      event.invoicingDetails = 'Short';
      addRow(event, 'Lasku', 100);
      renderApp('/invoicing');
      await screen.findByRole('table', { name: 'Laskurivit' });
      expect(screen.getByText('Short')).toHaveAttribute('title', 'Short');
      expect(screen.queryByRole('button', { name: 'Näytä kaikki' })).not.toBeInTheDocument();
    });
  });
});
