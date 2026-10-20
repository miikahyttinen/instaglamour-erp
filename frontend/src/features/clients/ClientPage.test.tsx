import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { formatMoney } from '../../lib/format';
import { addMockClient, addMockGig, TEST_YEAR } from '../../test/gigFixtures';
import { renderApp, signInMock } from '../../test/renderApp';
import { addMockOffer } from '../../test/offerFixtures';

const fi = (cents: number) => formatMoney(cents, 'fi').replace(/\s/g, ' ');
const bodyRows = (name: string) =>
  within(screen.getByRole('table', { name })).getAllByRole('row').filter((r) => r.closest('tbody'));

describe('client page (UC-027)', () => {
  beforeEach(() => {
    signInMock().selectedYear = TEST_YEAR;
  });

  it("lists the client's gigs of all years, newest first, with links; offers empty state", async () => {
    const x = addMockClient('Client X', 'Synthetic note');
    const old = addMockGig({ clientId: x.id, startDate: `${TEST_YEAR - 1}-03-01`, venue: 'Venue Old' });
    const newer = addMockGig({ clientId: x.id, startDate: `${TEST_YEAR}-05-01`, venue: 'Venue New', priceCents: 200000 });
    newer.status = 'CANCELLED';
    addMockGig({ venue: 'Venue Other' }); // no client
    renderApp(`/clients/${x.id}`);

    expect(await screen.findByRole('heading', { name: 'Client X', level: 1 })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '← Asiakkaat' })).toHaveAttribute('href', '/clients');
    expect(screen.getByRole('textbox', { name: 'Nimi' })).toHaveValue('Client X');
    expect(screen.getByRole('textbox', { name: 'Muistiinpanot' })).toHaveValue('Synthetic note');

    const rows = bodyRows('Asiakkaan keikat');
    expect(rows).toHaveLength(2);
    expect(within(rows[0]!).getByRole('link')).toHaveAttribute('href', `/gigs/${newer.id}`);
    expect(rows[0]).toHaveTextContent('Venue New');
    expect(rows[0]).toHaveTextContent('Peruttu');
    expect(rows[0]!.textContent!.replace(/\s/g, ' ')).toContain(fi(200000));
    expect(within(rows[1]!).getByRole('link', { name: `1.3.${TEST_YEAR - 1}` })).toHaveAttribute('href', `/gigs/${old.id}`);
    expect(screen.queryByText('Venue Other')).not.toBeInTheDocument();

    expect(screen.getByRole('heading', { name: 'Tarjoukset', level: 2 })).toBeInTheDocument();
    expect(screen.getByText('Asiakkaalla ei ole tarjouksia.')).toBeInTheDocument();
  });

  it('lists offers with status, expired and price', async () => {
    const x = addMockClient('Client X');
    addMockOffer({
      clientId: x.id,
      eventName: 'Event Lost',
      eventDate: `${TEST_YEAR}-02-01`,
      disposition: 'LOST_PRICE',
      priceCents: null,
    });
    const open = addMockOffer({ clientId: x.id, eventName: 'Event Open', eventDate: `${TEST_YEAR}-09-01` });
    // Expired = open and the event date has passed (derived by the backend, BR-102).
    addMockOffer({ clientId: x.id, eventName: 'Event Expired', eventDate: '2020-04-01' });
    renderApp(`/clients/${x.id}`);
    await screen.findByRole('table', { name: 'Asiakkaan tarjoukset' });
    const rows = bodyRows('Asiakkaan tarjoukset');
    expect(rows.map((r) => within(r).getByRole('link').textContent)).toEqual([
      'Event Open',
      'Event Lost',
      'Event Expired',
    ]);
    expect(within(rows[0]!).getByRole('link')).toHaveAttribute('href', `/offers/${open.id}`);
    expect(rows[0]).toHaveTextContent('Avoin');
    expect(rows[0]!.textContent!.replace(/\s/g, ' ')).toContain(fi(100000));
    expect(rows[2]).toHaveTextContent('Vanhentunut');
    expect(rows[1]).toHaveTextContent('Hylätty');
    expect(within(rows[1]!).getByText('Hylätty')).toHaveClass('tag', 'tag-danger');
    expect(rows[1]).toHaveTextContent('Hävitty: hinta');
    expect(within(rows[1]!).getAllByRole('cell').at(-1)).toHaveTextContent('–');
  });

  it('renames and edits notes in place; empty and duplicate names are not saved (A1, E1)', async () => {
    const x = addMockClient('Client X');
    const gig = addMockGig({ clientId: x.id });
    const { user } = renderApp(`/clients/${x.id}`);
    const name = await screen.findByRole('textbox', { name: 'Nimi' });

    await user.clear(name);
    await user.tab();
    expect(await screen.findByText('Pakollinen tieto.')).toBeInTheDocument();
    expect(x.name).toBe('Client X');

    await user.type(name, 'Client B');
    await user.tab();
    expect(await screen.findByText('Nimi on jo käytössä.')).toBeInTheDocument();
    expect(x.name).toBe('Client X');

    await user.clear(name);
    await user.type(name, 'Client Y{Enter}');
    await waitFor(() => expect(x.name).toBe('Client Y'));
    expect(await screen.findByRole('heading', { name: 'Client Y', level: 1 })).toBeInTheDocument();

    const notes = screen.getByRole('textbox', { name: 'Muistiinpanot' });
    await user.type(notes, 'Note 1');
    await user.tab();
    await waitFor(() => expect(x.notes).toBe('Note 1'));

    // The gig shows the new client name.
    await user.click(within(screen.getByRole('table', { name: 'Asiakkaan keikat' })).getByRole('link'));
    expect(await screen.findByRole('combobox', { name: 'Asiakas' })).toHaveDisplayValue('Client Y');
    expect(gig.clientId).toBe(x.id);
  });

  it('deletes an unused client after confirmation', async () => {
    const x = addMockClient('Client X');
    const { user } = renderApp(`/clients/${x.id}`);
    await user.click(await screen.findByRole('button', { name: 'Poista asiakas' }));
    const dialog = screen.getByRole('dialog', { name: 'Poista asiakas' });
    expect(dialog).toHaveTextContent('Poistetaanko asiakas Client X?');
    await user.click(within(dialog).getByRole('button', { name: 'Peruuta' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(x.deletedAt).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Poista asiakas' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Poista asiakas' }));
    expect(await screen.findByRole('heading', { name: 'Asiakkaat', level: 1 })).toBeInTheDocument();
    expect(screen.getByText('Asiakas poistettu: Client X.')).toBeInTheDocument();
    expect(x.deletedAt).not.toBeNull();
    await screen.findByRole('table', { name: 'Asiakkaat' });
    expect(screen.queryByRole('link', { name: 'Client X' })).not.toBeInTheDocument();
  });

  it('shows "client in use" when gigs or offers link to it (E2, BR-101)', async () => {
    const x = addMockClient('Client X');
    addMockGig({ clientId: x.id });
    const { user } = renderApp(`/clients/${x.id}`);
    await user.click(await screen.findByRole('button', { name: 'Poista asiakas' }));
    const dialog = screen.getByRole('dialog', { name: 'Poista asiakas' });
    await user.click(within(dialog).getByRole('button', { name: 'Poista asiakas' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Asiakasta ei voi poistaa, koska siihen on liitetty keikkoja tai tarjouksia.',
    );
    expect(within(dialog).getByRole('button', { name: 'Poista asiakas' })).toBeDisabled();
    expect(x.deletedAt).toBeNull();
  });

  it('shows not found for an unknown or deleted client', async () => {
    const x = addMockClient('Client X');
    x.deletedAt = new Date().toISOString();
    renderApp(`/clients/${x.id}`);
    expect(await screen.findByText('Asiakasta ei löytynyt.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '← Asiakkaat' })).toBeInTheDocument();
  });
});
