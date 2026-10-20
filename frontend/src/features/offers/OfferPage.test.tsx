import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../mocks/data';
import { MOCK_SPOTIFY_URL } from '../../mocks/offerStore';
import { addMockClient, addMockGig, TEST_YEAR } from '../../test/gigFixtures';
import { addMockOffer } from '../../test/offerFixtures';
import { renderApp, signInMock } from '../../test/renderApp';

const preview = () => screen.getByRole('article');

describe('new offer (UC-029)', () => {
  let clientId: string;
  beforeEach(() => {
    signInMock().selectedYear = TEST_YEAR;
    clientId = addMockClient('Client X').id;
  });

  it('shows field errors for missing client, event, date and venue and saves nothing (E1)', async () => {
    const { user } = renderApp('/offers/new');
    await user.click(await screen.findByRole('button', { name: 'Luo tarjous' }));
    for (const name of ['Asiakas', 'Tapahtuma', 'Tapahtumapäivä', 'Paikka']) {
      expect(screen.getByLabelText(name)).toHaveAccessibleDescription('Pakollinen tieto.');
    }
    expect(db.offers.offers.filter((o) => o.clientId === clientId)).toHaveLength(0);
  });

  it('has no Spotify field: the link is fixed in the backend', async () => {
    renderApp('/offers/new');
    await screen.findByRole('button', { name: 'Luo tarjous' });
    expect(screen.queryByRole('textbox', { name: /Spotify/ })).not.toBeInTheDocument();
  });

  it('creates with seller = me, lineup from a template and setting defaults, then opens the offer', async () => {
    const { user } = renderApp('/offers/new');
    await screen.findByRole('option', { name: 'Client X' });
    await user.selectOptions(screen.getByLabelText('Asiakas'), 'Client X');
    await user.type(screen.getByLabelText('Tapahtuma'), 'Event New');
    await user.type(screen.getByLabelText('Tapahtumapäivä'), `${TEST_YEAR}-08-08`);
    await user.type(screen.getByLabelText('Paikka'), 'Venue Q');
    await user.type(screen.getByLabelText('Kaupunki'), 'City Q');
    expect(screen.getByLabelText('Myyjä')).toHaveDisplayValue('Partner A');
    await user.selectOptions(screen.getByLabelText('Täytä kokoonpanopohjasta'), 'Template B');
    expect(screen.getByLabelText('Kokoonpano')).toHaveValue('Laulu\nKoskettimet');
    await user.click(screen.getByRole('switch', { name: 'Näytä referenssit' }));
    await user.type(screen.getByLabelText('Hinta'), '1 500');
    await user.selectOptions(screen.getByLabelText('Lähde'), 'Sähköposti');
    await user.click(screen.getByRole('button', { name: 'Luo tarjous' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'Event New' })).toBeInTheDocument();
    const offer = db.offers.offers.find((o) => o.eventName === 'Event New')!;
    expect(offer).toMatchObject({
      clientId,
      venue: 'Venue Q',
      city: 'City Q',
      sellerId: db.partners[0]!.id,
      lineup: ['Laulu', 'Koskettimet'],
      includesText: db.offers.settings.defaultIncludes,
      showReferences: true,
      priceCents: 150000,
      source: 'EMAIL',
      eventType: null,
    });
  });
});

describe('offer page (UC-029, UC-031)', () => {
  let clientId: string;
  beforeEach(() => {
    signInMock().selectedYear = TEST_YEAR;
    clientId = addMockClient('Client X').id;
  });

  it('shows the customer preview from the API (no price) next to the internal fields (AC-3)', async () => {
    const offer = addMockOffer({ clientId, eventName: 'Event 1', priceCents: 987600, showReferences: true });
    renderApp(`/offers/${offer.id}`);
    expect(await screen.findByRole('heading', { level: 1, name: 'Event 1' })).toBeInTheDocument();
    expect(within(preview()).getByRole('heading', { level: 2, name: 'Event 1' })).toBeInTheDocument();
    expect(within(preview()).getByRole('region', { name: 'Referenssit' })).toHaveTextContent('Esimerkkilainaus A');
    expect(within(preview()).getByRole('region', { name: 'Kokoonpano' })).toHaveTextContent('Line 1');
    expect(preview().textContent).not.toMatch(/9\s?876/);
    expect(screen.getByRole('textbox', { name: 'Hinta' })).toHaveDisplayValue(/^9\s?876,00$/);
    expect(screen.getByRole('group', { name: 'Tarjouksen toiminnot' })).toBeInTheDocument();
    expect(within(preview()).getByRole('link', { name: /Kuuntele settilistaa Spotifyssä/ })).toHaveAttribute(
      'href',
      MOCK_SPOTIFY_URL,
    );
    expect(screen.queryByRole('textbox', { name: /Spotify/ })).not.toBeInTheDocument();
  });

  it('edits fields in place; the preview and the history follow (AC-2)', async () => {
    const offer = addMockOffer({ clientId, eventName: 'Event 1' });
    const { user } = renderApp(`/offers/${offer.id}`);
    const venue = await screen.findByRole('textbox', { name: 'Paikka' });
    await user.clear(venue);
    await user.type(venue, 'Venue New{Enter}');
    await waitFor(() => expect(within(preview()).getByText('Venue New')).toBeInTheDocument());

    const lineup = screen.getByRole('textbox', { name: 'Kokoonpano' });
    await user.clear(lineup);
    await user.type(lineup, 'Duo{Enter}{Enter}Trio');
    await user.tab();
    await waitFor(() => expect(offer.lineup).toEqual(['Duo', 'Trio']));

    await user.selectOptions(screen.getByRole('combobox', { name: 'Lopputulos' }), 'Ei vastausta');
    await waitFor(() => expect(offer.disposition).toBe('NO_RESPONSE'));
    const history = await screen.findByRole('list', { name: 'Muutoshistoria' });
    await waitFor(() => expect(history).toHaveTextContent('Lopputulos: Odottaa → Ei vastausta'));
    expect(history).toHaveTextContent('Paikka: Venue X → Venue New');
    expect(screen.getAllByText('Hylätty').length).toBeGreaterThan(0);

    // Empty client is not allowed.
    await user.selectOptions(screen.getByRole('combobox', { name: 'Asiakas' }), '–');
    expect(await screen.findByText('Pakollinen tieto.')).toBeInTheDocument();
    expect(offer.clientId).toBe(clientId);
  });

  it('copies the absolute link and regenerates it after confirmation (A1)', async () => {
    const offer = addMockOffer({ clientId, eventName: 'Event 1' });
    const oldToken = offer.shareToken;
    const { user } = renderApp(`/offers/${offer.id}`);
    await user.click(await screen.findByRole('button', { name: 'Kopioi julkinen linkki' }));
    expect(await navigator.clipboard.readText()).toBe(`${window.location.origin}/o/${oldToken}`);

    await user.click(screen.getByRole('button', { name: 'Luo uusi linkki' }));
    const dialog = screen.getByRole('dialog', { name: 'Luo uusi linkki' });
    expect(dialog).toHaveTextContent('Nykyinen linkki lakkaa toimimasta heti.');
    await user.click(within(dialog).getByRole('button', { name: 'Luo uusi linkki' }));
    expect(await screen.findByText('Uusi linkki luotu. Vanha linkki ei enää toimi.')).toBeInTheDocument();
    expect(offer.shareToken).not.toBe(oldToken);
    await user.click(screen.getByRole('button', { name: 'Kopioi julkinen linkki' }));
    await waitFor(async () =>
      expect(await navigator.clipboard.readText()).toBe(`${window.location.origin}/o/${offer.shareToken}`),
    );
  });

  it('converts to a gig via the form; the gig page links back "From offer" (UC-031)', async () => {
    const offer = addMockOffer({ clientId, eventName: 'Event 1' });
    const { user } = renderApp(`/offers/${offer.id}`);
    await user.click(await screen.findByRole('link', { name: 'Muuta keikaksi: Event 1' }));
    expect(await screen.findByText('Tarkista, että tiedot ovat oikein.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Luo keikka' }));
    expect(await screen.findByRole('heading', { name: 'Event 1 · Venue X' })).toBeInTheDocument();
    const back = screen.getByRole('link', { name: 'Event 1' });
    expect(back).toHaveAttribute('href', `/offers/${offer.id}`);
    expect(back.closest('p')).toHaveTextContent('Tarjouksesta: Event 1');

    await user.click(back);
    expect(await screen.findByRole('link', { name: 'Keikka: Event 1' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Muuta keikaksi/ })).not.toBeInTheDocument();
    expect(await screen.findByRole('list', { name: 'Muutoshistoria' })).toHaveTextContent('Muutettu keikaksi');
  });

  it('deletes after confirmation; a deleted offer is read-only with Restore only', async () => {
    const offer = addMockOffer({ clientId, eventName: 'Event 1' });
    const { user } = renderApp(`/offers/${offer.id}`);
    await user.click(await screen.findByRole('button', { name: 'Poista tarjous' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Poista tarjous' }));
    expect(await screen.findByText('Tarjous poistettu: Event 1.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: `Tarjoukset ${TEST_YEAR}` })).toBeInTheDocument();

    renderApp(`/offers/${offer.id}`);
    expect(await screen.findByText(/Tarjous on poistettu/)).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Paikka' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Kopioi julkinen linkki' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Muuta keikaksi/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Palauta tarjous' }));
    expect(await screen.findByText('Tarjous palautettu.')).toBeInTheDocument();
    expect(offer.deletedAt).toBeNull();
    expect(screen.getByRole('textbox', { name: 'Paikka' })).toBeEnabled();
  });

  it('a gig without an offer shows no offer link', async () => {
    const gig = addMockGig();
    renderApp(`/gigs/${gig.id}`);
    await screen.findByRole('heading', { level: 1 });
    expect(screen.queryByText(/Tarjouksesta/)).not.toBeInTheDocument();
  });
});
