import { screen, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import type { GigCreate } from '../../api/types';
import { db } from '../../mocks/data';
import { server } from '../../mocks/server';
import { addMockClient, partnerA, partnerB, TEST_YEAR } from '../../test/gigFixtures';
import { addMockOffer } from '../../test/offerFixtures';
import { renderApp, signInMock } from '../../test/renderApp';

const partnerC = () => db.partners[2]!;
const optionNames = (name: string) =>
  within(screen.getByRole('combobox', { name })).getAllByRole('option').map((o) => o.textContent);

describe('convert offer to gig via the prefilled form (UC-031, BR-105)', () => {
  let clientId: string;
  beforeEach(() => {
    signInMock().selectedYear = TEST_YEAR;
    clientId = addMockClient('Client X').id;
  });

  it('prefills every field from the gig draft and shows the yellow review notice', async () => {
    const offer = addMockOffer({
      clientId,
      eventName: 'Event 1',
      city: 'City Y',
      priceCents: 123456,
      sellerId: partnerB().id,
    });
    renderApp(`/gigs/new?fromOffer=${offer.id}`);

    const review = await screen.findByRole('note');
    expect(review).toHaveClass('notice-warn');
    expect(review).toHaveTextContent('Tarkista, että tiedot ovat oikein.');
    expect(within(review).getByRole('link', { name: 'Event 1' })).toHaveAttribute('href', `/offers/${offer.id}`);
    expect(review).toHaveTextContent('Tarjouksesta: Event 1');

    expect(screen.getByRole('heading', { level: 1, name: 'Muuta keikaksi' })).toBeInTheDocument();
    expect(screen.getByLabelText('Alkupäivä')).toHaveValue(offer.eventDate);
    expect(screen.getByRole('combobox', { name: 'Kokoonpano' })).toHaveDisplayValue('Oma kokoonpano');
    expect(screen.getByRole('textbox', { name: 'Kokoonpanon nimi' })).toHaveValue('Event 1');
    expect(screen.getByRole('textbox', { name: 'Paikka' })).toHaveValue('Venue X, City Y');
    expect(screen.getByRole('combobox', { name: 'Myyjä' })).toHaveValue(partnerB().id);
    expect(screen.getByRole('combobox', { name: 'Tuottaja' })).toHaveValue(partnerB().id);
    expect(screen.getByRole('textbox', { name: 'Hinta (alv 0 %)' })).toHaveValue('1234,56');
    expect(await screen.findByText('Client X')).toBeInTheDocument();
  });

  it('submits the edited form to convert, goes to the gig and guards a double click', async () => {
    const offer = addMockOffer({ clientId, eventName: 'Event 1', priceCents: 100000 });
    const { user } = renderApp(`/gigs/new?fromOffer=${offer.id}`);
    const venue = await screen.findByRole('textbox', { name: 'Paikka' });
    await user.clear(venue);
    await user.type(venue, 'Venue Q');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Kokoonpano' }), 'Template A');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Tuottaja' }), partnerB().id);
    const price = screen.getByRole('textbox', { name: 'Hinta (alv 0 %)' });
    await user.clear(price);
    await user.type(price, '2000');
    await user.dblClick(screen.getByRole('button', { name: 'Luo keikka' }));

    expect(await screen.findByRole('heading', { name: 'Template A · Venue Q' })).toBeInTheDocument();
    const gigs = db.gigs.gigs.filter((g) => g.offerId === offer.id);
    expect(gigs).toHaveLength(1);
    expect(gigs[0]).toMatchObject({
      venue: 'Venue Q',
      lineupTemplateId: db.reference.lineupTemplates[0]!.id,
      producerId: partnerB().id,
      sellerId: partnerA().id,
      priceCents: 200000,
      clientId,
    });
    expect(offer).toMatchObject({ gigId: gigs[0]!.id, disposition: 'WON' });
  });

  it('Cancel goes back to the offer and creates nothing (A1)', async () => {
    const offer = addMockOffer({ clientId, eventName: 'Event 1' });
    const before = db.gigs.gigs.length;
    const { user } = renderApp(`/gigs/new?fromOffer=${offer.id}`);
    await user.click(await screen.findByRole('link', { name: 'Peruuta' }));
    expect(await screen.findByRole('button', { name: 'Poista tarjous' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Paikka' })).toHaveValue('Venue X');
    expect(db.gigs.gigs.length).toBe(before);
    expect(offer.gigId).toBeNull();
  });

  it('shows validation errors from the form without converting', async () => {
    const offer = addMockOffer({ clientId, eventName: 'Event 1' });
    const { user } = renderApp(`/gigs/new?fromOffer=${offer.id}`);
    await user.clear(await screen.findByRole('textbox', { name: 'Paikka' }));
    await user.click(screen.getByRole('button', { name: 'Luo keikka' }));
    expect(screen.getByRole('textbox', { name: 'Paikka' })).toHaveAccessibleDescription('Pakollinen tieto.');
    expect(offer.gigId).toBeNull();
  });

  it('409 ALREADY_CONVERTED on submit shows the message and a link to the existing gig (E1)', async () => {
    const offer = addMockOffer({ clientId, eventName: 'Event 1' });
    const { user } = renderApp(`/gigs/new?fromOffer=${offer.id}`);
    await screen.findByRole('textbox', { name: 'Paikka' });
    offer.gigId = '00000000-0000-4000-8000-00000000ffff'; // converted elsewhere meanwhile
    await user.click(screen.getByRole('button', { name: 'Luo keikka' }));
    expect(await screen.findByText(/Tarjouksesta on jo tehty keikka\./)).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: 'Avaa keikka' })).toHaveAttribute(
      'href',
      '/gigs/00000000-0000-4000-8000-00000000ffff',
    );
    expect(screen.getByRole('button', { name: 'Luo keikka' })).toBeDisabled();
  });

  it('opening the form for an already converted offer shows the gig link instead (E1)', async () => {
    const offer = addMockOffer({ clientId, eventName: 'Event 1' });
    offer.gigId = '00000000-0000-4000-8000-00000000ffff';
    renderApp(`/gigs/new?fromOffer=${offer.id}`);
    expect(await screen.findByText(/Tarjouksesta on jo tehty keikka\./)).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: 'Avaa keikka' })).toHaveAttribute(
      'href',
      '/gigs/00000000-0000-4000-8000-00000000ffff',
    );
    expect(screen.queryByRole('button', { name: 'Luo keikka' })).not.toBeInTheDocument();
  });

  it('offers only active partners, plus an inactive prefilled one (BR-111)', async () => {
    partnerC().active = false;
    const offer = addMockOffer({ clientId, eventName: 'Event 1' });
    const { unmount } = renderApp(`/gigs/new?fromOffer=${offer.id}`);
    await screen.findByRole('textbox', { name: 'Paikka' });
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
    renderApp(`/gigs/new?fromOffer=${offer.id}`);
    await screen.findByRole('textbox', { name: 'Paikka' });
    expect(screen.getByRole('combobox', { name: 'Myyjä' })).toHaveValue(partnerC().id);
    expect(optionNames('Myyjä')).toEqual(['Partner C', 'Partner A', 'Partner B']);
    expect(optionNames('Tuottaja')).toEqual(['Partner A', 'Partner B']);
  });
});
