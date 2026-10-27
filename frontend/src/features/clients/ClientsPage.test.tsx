import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { setLanguage } from '../../i18n';
import { DESKTOP_QUERY } from '../../lib/useMediaQuery';
import { db } from '../../mocks/data';
import { addMockClient, addMockEvent, TEST_YEAR } from '../../test/eventFixtures';
import { installMatchMedia } from '../../test/matchMedia';
import { renderApp, signInMock } from '../../test/renderApp';
import { addMockOffer } from '../../test/offerFixtures';

const table = () => screen.getByRole('table', { name: 'Asiakkaat' });
const bodyRows = () => within(table()).getAllByRole('row').filter((r) => r.closest('tbody'));
const rowTexts = () =>
  bodyRows().map((r) => within(r).getAllByRole('cell').map((c) => c.textContent));

describe('client list (UC-027)', () => {
  beforeEach(() => {
    signInMock().selectedYear = TEST_YEAR;
  });

  it('is in the menu after Events and Purchase orders and lists clients by name with event and offer counts', async () => {
    const x = addMockClient('Client X');
    addMockEvent({ clientId: x.id });
    addMockEvent({ clientId: x.id, startDate: `${TEST_YEAR + 1}-02-01` }); // all years count
    const deletedEvent = addMockEvent({ clientId: x.id });
    deletedEvent.deletedAt = new Date().toISOString();
    addMockOffer({ clientId: x.id });

    installMatchMedia({ [DESKTOP_QUERY]: true });
    const { user } = renderApp('/');
    const nav = await screen.findByRole('navigation', { name: 'Päävalikko' });
    const labels = within(nav).getAllByRole('link').map((l) => l.textContent);
    // Purchase orders (TASK-152) sits between Events and Clients.
    expect(labels.indexOf('Ostotilaukset')).toBe(labels.indexOf('Tapahtumat') + 1);
    expect(labels.indexOf('Asiakkaat')).toBe(labels.indexOf('Tapahtumat') + 2);
    await user.click(within(nav).getByRole('link', { name: 'Asiakkaat' }));

    expect(await screen.findByRole('heading', { name: 'Asiakkaat', level: 1 })).toBeInTheDocument();
    await screen.findByRole('table', { name: 'Asiakkaat' });
    expect(within(table()).getAllByRole('columnheader').map((h) => h.textContent)).toEqual([
      'Nimi',
      'Tapahtumat',
      'Tarjoukset',
    ]);
    // Seed: Client A has two events this year, Client B one, Client C none; offers per offerSeed.ts
    // (non-deleted, all years).
    expect(rowTexts()).toEqual([
      ['Client A', '2', '3'],
      ['Client B', '1', '2'],
      ['Client C', '0', '2'],
      ['Client X', '2', '1'],
    ]);
    expect(within(table()).getByRole('link', { name: 'Client X' })).toHaveAttribute('href', `/clients/${x.id}`);
  });

  it('searches by name', async () => {
    addMockClient('Other Client');
    const { user } = renderApp('/clients');
    await screen.findByRole('table', { name: 'Asiakkaat' });
    await user.type(screen.getByRole('searchbox', { name: 'Haku' }), 'other');
    await waitFor(() => expect(rowTexts()).toEqual([['Other Client', '0', '0']]));

    await user.clear(screen.getByRole('searchbox', { name: 'Haku' }));
    await user.type(screen.getByRole('searchbox', { name: 'Haku' }), 'nobody');
    expect(await screen.findByText('Ei hakua vastaavia asiakkaita.')).toBeInTheDocument();
  });

  it('adds a client with notes and links to it', async () => {
    const { user } = renderApp('/clients');
    await screen.findByRole('table', { name: 'Asiakkaat' });
    await user.type(screen.getByRole('textbox', { name: 'Nimi' }), '  Client New ');
    await user.type(screen.getByRole('textbox', { name: 'Muistiinpanot' }), 'Synthetic note');
    await user.click(screen.getByRole('button', { name: 'Lisää' }));

    const notice = await screen.findByText('Asiakas lisätty:');
    const created = db.events.clients.find((c) => c.name === 'Client New')!;
    expect(created.notes).toBe('Synthetic note');
    expect(within(notice).getByRole('link', { name: 'Client New' })).toHaveAttribute('href', `/clients/${created.id}`);
    expect(screen.getByRole('textbox', { name: 'Nimi' })).toHaveValue('');
    expect(screen.getByRole('textbox', { name: 'Muistiinpanot' })).toHaveValue('');
    await waitFor(() => expect(rowTexts().map((r) => r[0])).toContain('Client New'));
  });

  it('shows REQUIRED without sending and DUPLICATE from the server (E1)', async () => {
    const before = db.events.clients.length;
    const { user } = renderApp('/clients');
    await screen.findByRole('table', { name: 'Asiakkaat' });
    await user.type(screen.getByRole('textbox', { name: 'Nimi' }), '   ');
    await user.click(screen.getByRole('button', { name: 'Lisää' }));
    expect(screen.getByText('Pakollinen tieto.')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Nimi' })).toHaveAttribute('aria-invalid', 'true');

    await user.clear(screen.getByRole('textbox', { name: 'Nimi' }));
    await user.type(screen.getByRole('textbox', { name: 'Nimi' }), 'client a');
    await user.click(screen.getByRole('button', { name: 'Lisää' }));
    expect(await screen.findByText('Nimi on jo käytössä.')).toBeInTheDocument();
    expect(db.events.clients).toHaveLength(before);
  });

  it('is in English for English users', async () => {
    signInMock('partner.b@example.com').selectedYear = TEST_YEAR;
    setLanguage('en');
    renderApp('/clients');
    expect(await screen.findByRole('heading', { name: 'Clients', level: 1 })).toBeInTheDocument();
    const t = await screen.findByRole('table', { name: 'Clients' });
    expect(within(t).getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['Name', 'Events', 'Offers']);
    expect(screen.getByRole('button', { name: 'Add' })).toBeInTheDocument();
  });
});
