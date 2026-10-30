import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { DESKTOP_QUERY, TABLET_QUERY, WIDE_QUERY } from '../../lib/useMediaQuery';
import { db } from '../../mocks/data';
import { addMockClient, addMockEvent, TEST_YEAR } from '../../test/eventFixtures';
import { installMatchMedia } from '../../test/matchMedia';
import { renderApp, signInMock } from '../../test/renderApp';

// Client on events (UC-027 A2, AC-3): event page, new event form, event list.
describe('event client', () => {
  beforeEach(() => {
    signInMock().selectedYear = TEST_YEAR;
  });

  it('sets, changes and clears the client in place on the event page; history names it', async () => {
    const event = addMockEvent({ venue: 'Venue X' });
    const { user } = renderApp(`/gigs/${event.id}`);
    const select = await screen.findByRole('combobox', { name: 'Asiakas' });
    await waitFor(() =>
      expect(within(select).getAllByRole('option').map((o) => o.textContent)).toEqual([
        '–',
        'Client A',
        'Client B',
        'Client C',
        '+ Uusi asiakas…',
      ]),
    );
    expect(select).toHaveDisplayValue('–');

    await user.selectOptions(select, 'Client B');
    await waitFor(() => expect(event.clientId).toBe(db.events.clients[1]!.id));
    expect(await screen.findByText('Asiakas: – → Client B')).toBeInTheDocument();

    await user.selectOptions(select, '–');
    await waitFor(() => expect(event.clientId).toBeNull());
  });

  it('creates a new client inline and saves it on the event', async () => {
    const event = addMockEvent({ venue: 'Venue X' });
    const { user } = renderApp(`/gigs/${event.id}`);
    const select = await screen.findByRole('combobox', { name: 'Asiakas' });
    await screen.findByRole('option', { name: 'Client A' });

    await user.selectOptions(select, '+ Uusi asiakas…');
    const name = screen.getByRole('textbox', { name: 'Uuden asiakkaan nimi' });
    expect(name).toHaveFocus();
    await user.type(name, 'Client A{Enter}');
    expect(await screen.findByText('Nimi on jo käytössä.')).toBeInTheDocument();

    await user.clear(name);
    await user.type(name, 'Client New');
    await user.click(screen.getByRole('button', { name: 'Lisää asiakas' }));
    const created = await waitFor(() => {
      const c = db.events.clients.find((x) => x.name === 'Client New');
      expect(c).toBeDefined();
      return c!;
    });
    await waitFor(() => expect(event.clientId).toBe(created.id));
    expect(screen.queryByRole('textbox', { name: 'Uuden asiakkaan nimi' })).not.toBeInTheDocument();
    await waitFor(() => expect(select).toHaveDisplayValue('Client New'));
  });

  it('is read-only on a deleted event', async () => {
    const x = addMockClient('Client X');
    const event = addMockEvent({ clientId: x.id });
    event.deletedAt = new Date().toISOString();
    renderApp(`/gigs/${event.id}`);
    const select = await screen.findByRole('combobox', { name: 'Asiakas' });
    expect(select).toBeDisabled();
    await waitFor(() => expect(select).toHaveDisplayValue('Client X'));
  });

  it('new event form: picks a client or creates one', async () => {
    const { user } = renderApp('/gigs/new');
    await screen.findByRole('option', { name: 'Template A' });
    await user.type(screen.getByLabelText('Alkupäivä'), `${TEST_YEAR}-06-01`);
    await user.selectOptions(screen.getByRole('combobox', { name: 'Kokoonpano' }), 'Template A');
    await user.type(screen.getByRole('textbox', { name: 'Paikka' }), 'Venue X');
    await user.type(screen.getByRole('textbox', { name: 'Hinta (alv 0 %)' }), '1000');

    const select = screen.getByRole('combobox', { name: 'Asiakas' });
    await screen.findByRole('option', { name: 'Client C' });
    await user.selectOptions(select, '+ Uusi asiakas…');
    await user.type(screen.getByRole('textbox', { name: 'Uuden asiakkaan nimi' }), 'Client New{Enter}');
    await waitFor(() => expect(select).toHaveDisplayValue('Client New'));

    await user.click(screen.getByRole('button', { name: 'Luo keikka' }));
    expect(await screen.findByRole('heading', { name: 'Template A · Venue X' })).toBeInTheDocument();
    const created = db.events.clients.find((c) => c.name === 'Client New')!;
    expect(db.events.events.at(-1)!.clientId).toBe(created.id);
  });

  it('new event form: no client by default', async () => {
    const { user } = renderApp('/gigs/new');
    await screen.findByRole('option', { name: 'Template A' });
    expect(screen.getByRole('combobox', { name: 'Asiakas' })).toHaveDisplayValue('–');
    await user.type(screen.getByLabelText('Alkupäivä'), `${TEST_YEAR}-06-01`);
    await user.selectOptions(screen.getByRole('combobox', { name: 'Kokoonpano' }), 'Template A');
    await user.type(screen.getByRole('textbox', { name: 'Paikka' }), 'Venue X');
    await user.type(screen.getByRole('textbox', { name: 'Hinta (alv 0 %)' }), '1000');
    await user.click(screen.getByRole('button', { name: 'Luo keikka' }));
    await screen.findByRole('heading', { name: 'Template A · Venue X' });
    expect(db.events.events.at(-1)!.clientId).toBeNull();
  });

  it('event list shows the client (table and cards) and searches by client name', async () => {
    const x = addMockClient('Client X');
    addMockEvent({ startDate: `${TEST_YEAR}-03-01`, venue: 'Venue X', clientId: x.id });
    addMockEvent({ startDate: `${TEST_YEAR}-04-01`, venue: 'Venue Y' });

    // Cards (phones, < 600 px): the client is a labelled line of the card.
    const first = renderApp('/gigs');
    const cardRows = () =>
      within(screen.getByRole('table', { name: 'Keikkalista' }))
        .getAllByRole('row')
        .filter((r) => r.closest('tbody'));
    const clientCell = (row: HTMLElement) => row.querySelector('td[data-label="Asiakas"]');
    await waitFor(() => expect(cardRows()).toHaveLength(2));
    expect(clientCell(cardRows()[0]!)).toHaveTextContent('Client X');
    expect(clientCell(cardRows()[1]!)).toHaveTextContent('–');
    first.unmount();

    // Table (from 600 px).
    installMatchMedia({ [TABLET_QUERY]: true, [DESKTOP_QUERY]: true, [WIDE_QUERY]: true });
    const { user } = renderApp('/gigs');
    const table = await screen.findByRole('table', { name: 'Keikkalista' });
    const rows = () => within(table).getAllByRole('row').filter((r) => r.closest('tbody'));
    await waitFor(() => expect(rows()).toHaveLength(2));
    expect(within(rows()[0]!).getByRole('link', { name: 'Client X' })).toHaveAttribute('href', `/clients/${x.id}`);

    expect(screen.getByRole('searchbox', { name: 'Haku' })).toHaveAttribute(
      'placeholder',
      'Paikka, kokoonpano, asiakas tai muistiinpanot',
    );
    await user.type(screen.getByRole('searchbox', { name: 'Haku' }), 'client x');
    await waitFor(() => expect(rows()).toHaveLength(1));
    expect(rows()[0]).toHaveTextContent('Venue X');
  });
});
