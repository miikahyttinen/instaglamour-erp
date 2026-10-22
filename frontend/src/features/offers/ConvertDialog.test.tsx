import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import type { GigCreate } from '../../api/types';
import { db } from '../../mocks/data';
import { server } from '../../mocks/server';
import { addMockClient, partnerA, partnerB, TEST_YEAR } from '../../test/gigFixtures';
import { addMockOffer as addAnyOffer } from '../../test/offerFixtures';
import { renderApp, signInMock } from '../../test/renderApp';

const partnerC = () => db.partners[2]!;
/** A convertible offer (BR-109): accepted, dated in TEST_YEAR (future). */
const addMockOffer = (overrides: Parameters<typeof addAnyOffer>[0]) =>
  addAnyOffer({ disposition: 'WON', ...overrides });
const dialog = () => screen.getByRole('dialog', { name: 'Muuta keikaksi' });
const optionNames = (name: string) =>
  within(within(dialog()).getByRole('combobox', { name })).getAllByRole('option').map((o) => o.textContent);

/** Offer page → open the convert modal and wait for the prefilled form. */
async function openConvert(offerId: string) {
  const app = renderApp(`/offers/${offerId}`);
  await app.user.click(await screen.findByRole('button', { name: /^Muuta keikaksi:/ }));
  await within(dialog()).findByRole('textbox', { name: 'Paikka' });
  return app;
}

describe('convert offer to gig in a modal (UC-031, BR-105)', () => {
  let clientId: string;
  beforeEach(() => {
    signInMock().selectedYear = TEST_YEAR;
    clientId = addMockClient('Client X').id;
  });

  it('prefills the key fields from the gig draft and shows the yellow review tag', async () => {
    const offer = addMockOffer({
      clientId,
      eventName: 'Event 1',
      city: 'City Y',
      priceCents: 123456,
      sellerId: partnerB().id,
    });
    await openConvert(offer.id);
    const d = within(dialog());
    const review = d.getByRole('note');
    expect(review).toHaveTextContent('Tarkista, että tiedot ovat oikein.');
    expect(review.querySelector('.tag-warn')).not.toBeNull();
    expect(d.getByLabelText('Alkupäivä')).toHaveValue(offer.eventDate);
    expect(d.getByRole('textbox', { name: 'Kokoonpano' })).toHaveValue('Event 1');
    expect(d.getByRole('textbox', { name: 'Paikka' })).toHaveValue('Venue X, City Y');
    expect(d.getByRole('combobox', { name: 'Asiakas' })).toHaveValue(clientId);
    expect(d.getByRole('textbox', { name: 'Hinta (alv 0 %)' })).toHaveValue('1234,56');
    expect(d.getByRole('combobox', { name: 'Myyjä' })).toHaveValue(partnerB().id);
    expect(d.getByRole('combobox', { name: 'Tuottaja' })).toHaveValue(partnerB().id);
    // Focus moves to the first field once the draft has loaded.
    expect(d.getByLabelText('Alkupäivä')).toHaveFocus();
  });

  it('sends the draft merged with the edits, shows the gig link and guards a double click', async () => {
    const offer = addMockOffer({ clientId, eventName: 'Event 1', priceCents: 100000 });
    const requests: GigCreate[] = [];
    server.events.on('request:start', ({ request }) => {
      if (request.method === 'POST' && request.url.endsWith(`/api/offers/${offer.id}/convert`)) {
        void request
          .clone()
          .json()
          .then((b) => requests.push(b as GigCreate));
      }
    });
    const { user } = await openConvert(offer.id);
    const d = within(dialog());
    const venue = d.getByRole('textbox', { name: 'Paikka' });
    await user.clear(venue);
    await user.type(venue, 'Venue Q');
    const lineup = d.getByRole('textbox', { name: 'Kokoonpano' });
    await user.clear(lineup);
    await user.type(lineup, 'Lineup Q');
    await user.selectOptions(d.getByRole('combobox', { name: 'Tuottaja' }), partnerB().id);
    await user.selectOptions(d.getByRole('combobox', { name: 'Asiakas' }), '');
    const price = d.getByRole('textbox', { name: 'Hinta (alv 0 %)' });
    await user.clear(price);
    await user.type(price, '2000');
    await user.dblClick(d.getByRole('button', { name: 'Muuta keikaksi' }));

    expect(await screen.findByText(/Keikka luotu\./)).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    server.events.removeAllListeners();
    const gigs = db.gigs.gigs.filter((g) => g.offerId === offer.id);
    expect(gigs).toHaveLength(1);
    expect(gigs[0]).toMatchObject({
      venue: 'Venue Q',
      lineupName: 'Lineup Q',
      producerId: partnerB().id,
      sellerId: partnerA().id,
      priceCents: 200000,
      clientId: null,
    });
    expect(screen.getByRole('link', { name: 'Avaa keikka' })).toHaveAttribute('href', `/gigs/${gigs[0]!.id}`);
    expect(offer).toMatchObject({ gigId: gigs[0]!.id, disposition: 'WON' });
    await waitFor(() => expect(requests).toHaveLength(1));
    expect(requests[0]).toMatchObject({ startDate: offer.eventDate, venue: 'Venue Q', priceCents: 200000 });
  });

  it('Cancel and Esc close the modal and create nothing (A1)', async () => {
    const offer = addMockOffer({ clientId, eventName: 'Event 1' });
    const before = db.gigs.gigs.length;
    const { user } = await openConvert(offer.id);
    await user.click(within(dialog()).getByRole('button', { name: 'Peruuta' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    const opener = screen.getByRole('button', { name: 'Muuta keikaksi: Event 1' });
    expect(opener).toHaveFocus();

    await user.click(opener);
    await within(dialog()).findByRole('textbox', { name: 'Paikka' });
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(db.gigs.gigs.length).toBe(before);
    expect(offer.gigId).toBeNull();
  });

  it('keeps Tab focus inside the modal', async () => {
    const offer = addMockOffer({ clientId, eventName: 'Event 1' });
    const { user } = await openConvert(offer.id);
    const d = within(dialog());
    d.getByRole('button', { name: 'Peruuta' }).focus();
    await user.tab();
    expect(d.getByRole('button', { name: 'Sulje' })).toHaveFocus();
    await user.tab({ shift: true });
    expect(d.getByRole('button', { name: 'Peruuta' })).toHaveFocus();
  });

  it('shows client-side and server field errors next to the fields', async () => {
    const offer = addMockOffer({ clientId, eventName: 'Event 1' });
    const { user } = await openConvert(offer.id);
    const d = within(dialog());
    await user.clear(d.getByRole('textbox', { name: 'Paikka' }));
    await user.clear(d.getByRole('textbox', { name: 'Kokoonpano' }));
    await user.click(d.getByRole('button', { name: 'Muuta keikaksi' }));
    expect(d.getByRole('textbox', { name: 'Paikka' })).toHaveAccessibleDescription('Pakollinen tieto.');
    expect(d.getByRole('textbox', { name: 'Kokoonpano' })).toHaveAccessibleDescription('Pakollinen tieto.');
    expect(offer.gigId).toBeNull();

    server.use(
      http.post('/api/offers/:id/convert', () =>
        HttpResponse.json(
          { error: { code: 'VALIDATION_ERROR', message: 'x', fields: { priceCents: 'NEGATIVE_AMOUNT' } } },
          { status: 400 },
        ),
      ),
    );
    await user.type(d.getByRole('textbox', { name: 'Paikka' }), 'Venue X');
    await user.type(d.getByRole('textbox', { name: 'Kokoonpano' }), 'Event 1');
    await user.click(d.getByRole('button', { name: 'Muuta keikaksi' }));
    await waitFor(() =>
      expect(d.getByRole('textbox', { name: 'Hinta (alv 0 %)' })).toHaveAttribute('aria-invalid', 'true'),
    );
    expect(d.getByRole('textbox', { name: 'Paikka' })).not.toHaveAttribute('aria-invalid');
    expect(d.getByRole('button', { name: 'Muuta keikaksi' })).toBeEnabled();
  });

  it('409 ALREADY_CONVERTED on confirm shows the message and a link to the existing gig (E1)', async () => {
    const offer = addMockOffer({ clientId, eventName: 'Event 1' });
    const { user } = await openConvert(offer.id);
    offer.gigId = '00000000-0000-4000-8000-00000000ffff'; // converted elsewhere meanwhile
    await user.click(within(dialog()).getByRole('button', { name: 'Muuta keikaksi' }));
    const d = within(dialog());
    expect(await d.findByText(/Tarjouksesta on jo tehty keikka\./)).toBeInTheDocument();
    expect(await d.findByRole('link', { name: 'Avaa keikka' })).toHaveAttribute(
      'href',
      '/gigs/00000000-0000-4000-8000-00000000ffff',
    );
    expect(d.getByRole('button', { name: 'Muuta keikaksi' })).toBeDisabled();
  });

  it('a stale page opening the modal for a converted offer shows the gig link instead (E1)', async () => {
    const offer = addMockOffer({ clientId, eventName: 'Event 1' });
    const { user } = renderApp(`/offers/${offer.id}`);
    const opener = await screen.findByRole('button', { name: 'Muuta keikaksi: Event 1' });
    offer.gigId = '00000000-0000-4000-8000-00000000ffff';
    await user.click(opener);
    const d = within(dialog());
    expect(await d.findByText(/Tarjouksesta on jo tehty keikka\./)).toBeInTheDocument();
    expect(await d.findByRole('link', { name: 'Avaa keikka' })).toHaveAttribute(
      'href',
      '/gigs/00000000-0000-4000-8000-00000000ffff',
    );
    expect(d.queryByRole('button', { name: 'Muuta keikaksi' })).not.toBeInTheDocument();
  });

  it('409 OFFER_NOT_CONVERTIBLE on confirm shows the message and refetches the offer (BR-109)', async () => {
    const offer = addMockOffer({ clientId, eventName: 'Event 1' });
    const { user } = await openConvert(offer.id);
    offer.disposition = 'LOST_PRICE'; // changed elsewhere meanwhile
    await user.click(within(dialog()).getByRole('button', { name: 'Muuta keikaksi' }));
    const d = within(dialog());
    expect(
      await d.findByText('Vain hyväksytyn tarjouksen, jonka päivä ei ole mennyt, voi muuttaa keikaksi.'),
    ).toBeInTheDocument();
    expect(d.getByRole('button', { name: 'Muuta keikaksi' })).toBeDisabled();
    expect(db.gigs.gigs.filter((g) => g.offerId === offer.id)).toHaveLength(0);
    await user.click(d.getByRole('button', { name: 'Peruuta' }));
    // The refetched offer is no longer accepted: the page shows no Convert action.
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Muuta keikaksi: Event 1' })).not.toBeInTheDocument(),
    );
  });

  it('a stale page opening the modal for an offer that is no longer convertible shows the message (BR-109)', async () => {
    const offer = addMockOffer({ clientId, eventName: 'Event 1' });
    const { user } = renderApp(`/offers/${offer.id}`);
    const opener = await screen.findByRole('button', { name: 'Muuta keikaksi: Event 1' });
    offer.disposition = 'PENDING';
    await user.click(opener);
    const d = within(dialog());
    expect(
      await d.findByText('Vain hyväksytyn tarjouksen, jonka päivä ei ole mennyt, voi muuttaa keikaksi.'),
    ).toBeInTheDocument();
    expect(d.queryByRole('textbox', { name: 'Paikka' })).not.toBeInTheDocument();
  });

  it('offers only active partners, plus an inactive prefilled one (BR-111)', async () => {
    partnerC().active = false;
    const offer = addMockOffer({ clientId, eventName: 'Event 1' });
    const { unmount } = await openConvert(offer.id);
    expect(optionNames('Myyjä')).toEqual(['Partner A', 'Partner B']);
    unmount();

    // A backend draft may carry an inactive partner; it stays selectable as the prefilled value.
    server.use(
      http.get('/api/offers/:id/gig-draft', () => {
        const draft: GigCreate = {
          startDate: `${TEST_YEAR}-06-01`,
          lineupName: 'Event 1',
          venue: 'Venue X',
          sellerId: partnerC().id,
          producerId: partnerA().id,
          priceCents: 0,
          clientId,
        };
        return HttpResponse.json(draft);
      }),
    );
    await openConvert(offer.id);
    expect(within(dialog()).getByRole('combobox', { name: 'Myyjä' })).toHaveValue(partnerC().id);
    expect(optionNames('Myyjä')).toEqual(['Partner C', 'Partner A', 'Partner B']);
    expect(optionNames('Tuottaja')).toEqual(['Partner A', 'Partner B']);
  });
});
