import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import type { CostType } from '../../api/enums';
import { setLanguage } from '../../i18n';
import { DESKTOP_QUERY } from '../../lib/useMediaQuery';
import { db } from '../../mocks/data';
import { addCostLine, type MockEvent } from '../../mocks/eventStore';
import { server } from '../../mocks/server';
import { errorResponse } from '../../mocks/util';
import { markConverted } from '../../mocks/offerStore';
import { addMockClient, addMockEvent, partnerA, partnerB, person } from '../../test/eventFixtures';
import { addMockOffer } from '../../test/offerFixtures';
import { installMatchMedia } from '../../test/matchMedia';
import { renderApp, signInMock } from '../../test/renderApp';

const table = () => screen.getByRole('table', { name: 'Omat keikat' });
const rows = () => within(table()).getAllByRole('row').slice(1);

function line(event: MockEvent, type: CostType, personId: string | null, description: string | null = null) {
  addCostLine(db.events, event, { type, personId, description, budgetedCents: 1000 }, partnerA().id);
}

/** A gig without the template's lines (fully staffed unless lines are added). */
function bareEvent(overrides: Parameters<typeof addMockEvent>[0]): MockEvent {
  const event = addMockEvent(overrides);
  db.events.costLines = db.events.costLines.filter((l) => l.eventId !== event.id);
  return event;
}

describe('My gigs page', () => {
  beforeEach(() => {
    db.events.events = [];
    db.events.costLines = [];
    db.offers.offers = [];
    signInMock();
  });

  it('lists my upcoming gigs soonest first with date, gig, venue · client, roles and the staffing tag', async () => {
    const me = partnerA();
    const client = addMockClient('Client A Oy');
    // Producer + musician (custom role with a description) on a two-day gig, not fully staffed.
    const both = bareEvent({ startDate: '2030-06-07', endDate: '2030-06-08', lineupName: 'Lineup B', venue: 'Venue Y', clientId: client.id });
    line(both, 'VOC', me.personId);
    line(both, 'OTHER_ROLE', me.personId, 'Role X');
    line(both, 'KEYS', null);
    // Musician only (other producer), fully staffed, sooner.
    const played = bareEvent({ startDate: '2030-06-01', lineupName: 'Lineup A', venue: 'Venue X', producerId: partnerB().id });
    line(played, 'KEYS', me.personId);
    // Not mine.
    const other = bareEvent({ startDate: '2030-05-01', lineupName: 'Lineup C', producerId: partnerB().id });
    line(other, 'VOC', person('Person 1').id);

    renderApp('/my-gigs');
    expect(await screen.findByRole('heading', { level: 1, name: 'Omat keikat' })).toBeInTheDocument();
    await screen.findByRole('table', { name: 'Omat keikat' });
    const [first, second] = rows();
    expect(rows()).toHaveLength(2);

    // 2030-06-01 is a Saturday.
    expect(first).toHaveTextContent('Lauantai 1.6.2030');
    expect(within(first!).getByRole('link', { name: 'Lineup A' })).toHaveAttribute('href', `/gigs/${played.id}`);
    expect(first).toHaveTextContent('Venue X');
    expect(within(first!).getAllByText(/./, { selector: '.my-events-role' }).map((el) => el.textContent)).toEqual([
      'Koskettimet',
    ]);
    expect(within(first!).queryByText('Miehitys kesken')).toBeNull();

    expect(second).toHaveTextContent('Perjantai 7.6.2030–8.6.2030');
    expect(within(second!).getByRole('link', { name: 'Lineup B' })).toHaveAttribute('href', `/gigs/${both.id}`);
    expect(second).toHaveTextContent('Venue Y · Client A Oy');
    const roleTags = within(second!).getAllByText(/./, { selector: '.my-events-role' });
    expect(roleTags.map((el) => el.textContent)).toEqual(['Tuottaja', 'Laulu', 'Role X']);
    // The producer chip is red (danger tone); musician chips stay neutral (owner 2026-11-09).
    expect(roleTags[0]).toHaveClass('tag-danger');
    expect(roleTags[1]).toHaveClass('tag-muted');
    expect(roleTags[2]).toHaveClass('tag-muted');
    expect(within(first!).getByText('Koskettimet', { selector: '.my-events-role' })).toHaveClass('tag-muted');
    const tag = within(second!).getByText('Miehitys kesken');
    expect(tag).toHaveClass('tag', 'tag-warn');
  });

  it('a custom role without a description shows the cost type label; English labels', async () => {
    const event = bareEvent({ startDate: '2030-06-01', lineupName: 'Lineup A', producerId: partnerB().id });
    line(event, 'OTHER_ROLE', partnerA().personId);
    setLanguage('en');
    db.partners[0]!.language = 'en';
    renderApp('/my-gigs');
    expect(await screen.findByRole('heading', { level: 1, name: 'My gigs' })).toBeInTheDocument();
    const row = (await screen.findAllByRole('row'))[1]!;
    expect(within(row).getByText('Custom role', { selector: '.my-events-role' })).toBeInTheDocument();
    expect(row).toHaveTextContent('Saturday 1 Jun 2030');
  });

  it('opens the gig page from the row link', async () => {
    const event = bareEvent({ startDate: '2030-06-01', lineupName: 'Lineup A' });
    const { user } = renderApp('/my-gigs');
    await user.click(await screen.findByRole('link', { name: 'Lineup A' }));
    expect(await screen.findByRole('heading', { level: 1, name: /Lineup A/ })).toBeInTheDocument();
    expect(event.id).toBeTruthy();
  });

  it('shows the empty state when I have no upcoming gigs', async () => {
    renderApp('/my-gigs');
    expect(await screen.findByText('Ei tulevia keikkoja')).toBeInTheDocument();
    expect(await screen.findByText('Ei avoimia tarjouksia')).toBeInTheDocument();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('shows loading, then an error with retry', async () => {
    let fail = true;
    server.use(
      http.get('/api/me/events', () =>
        fail ? errorResponse(500, 'VALIDATION_ERROR', 'boom') : HttpResponse.json([]),
      ),
    );
    const { user } = renderApp('/my-gigs');
    expect((await screen.findAllByText('Ladataan…')).length).toBeGreaterThan(0);
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    fail = false;
    await user.click(screen.getByRole('button', { name: 'Yritä uudelleen' }));
    expect(await screen.findByText('Ei tulevia keikkoja')).toBeInTheDocument();
  });

  it('has no year selector', async () => {
    renderApp('/my-gigs');
    await screen.findByText('Ei tulevia keikkoja');
    expect(screen.queryByRole('combobox', { name: 'Valittu vuosi' })).toBeNull();
  });

  it.each(['/', '/year', '/year/2030'])('%s redirects to /my-gigs', async (path) => {
    renderApp(path);
    expect(await screen.findByRole('heading', { level: 1, name: 'Omat keikat' })).toBeInTheDocument();
  });

  it('is the first menu item and marked current', async () => {
    installMatchMedia({ [DESKTOP_QUERY]: true });
    renderApp('/my-gigs');
    await screen.findByRole('heading', { level: 1, name: 'Omat keikat' });
    const nav = screen.getByRole('navigation', { name: 'Päävalikko' });
    const links = within(nav).getAllByRole('link');
    expect(links[0]).toHaveTextContent('Omat keikat');
    expect(links[0]).toHaveAttribute('href', '/my-gigs');
    expect(links[0]).toHaveAttribute('aria-current', 'page');
    expect(within(nav).queryByRole('link', { name: 'Vuosi' })).toBeNull();
  });

  it('refreshes after a cost line change (cache invalidation)', async () => {
    const event = bareEvent({ startDate: '2030-06-01', lineupName: 'Lineup A', producerId: partnerB().id });
    line(event, 'VOC', partnerA().personId);
    const { queryClient } = renderApp('/my-gigs');
    await screen.findByRole('link', { name: 'Lineup A' });
    db.events.costLines = [];
    const { invalidateYearData } = await import('../../api/cache');
    await invalidateYearData(queryClient, 'events');
    await waitFor(() => expect(screen.getByText('Ei tulevia keikkoja')).toBeInTheDocument());
  });

  describe('offers section (GET /api/me/offers)', () => {
    const offersTable = () => screen.getByRole('table', { name: 'Tarjoukset' });
    const offerRows = () => within(offersTable()).getAllByRole('row').slice(1);

    /** An accepted offer of mine converted to a gig (contract not done unless set). */
    function convertedOffer(eventName: string, eventDate: string) {
      const client = addMockClient('Client C');
      const offer = addMockOffer({ clientId: client.id, eventName, eventDate, disposition: 'WON' });
      const event = bareEvent({ startDate: eventDate, lineupName: eventName, clientId: client.id });
      event.offerId = offer.id;
      markConverted(db.offers, offer, event.id, partnerA().id);
      return { offer, event };
    }

    it('lists contract-missing rows (red) first, then follow-up rows (blue), with date, event, client and venue', async () => {
      const client = addMockClient('Client A Oy');
      const won = addMockOffer({ clientId: client.id, eventName: 'Won W', eventDate: '2030-08-01', city: 'City Y', disposition: 'WON' });
      const { offer: converted, event } = convertedOffer('Converted C', '2030-07-01');
      const open = addMockOffer({ clientId: client.id, eventName: 'Open O', eventDate: '2030-06-01', venue: 'Venue Z' });
      // Not listed: someone else's offer, a done follow-up, a lost offer, an expired open offer.
      addMockOffer({ clientId: client.id, eventName: 'Other seller', sellerId: partnerB().id });
      addMockOffer({ clientId: client.id, eventName: 'Followed', followUpDone: true });
      addMockOffer({ clientId: client.id, eventName: 'Lost', disposition: 'LOST_PRICE' });
      addMockOffer({ clientId: client.id, eventName: 'Expired', eventDate: '2020-01-01' });

      renderApp('/my-gigs');
      expect(await screen.findByRole('heading', { level: 2, name: 'Tarjoukset' })).toBeInTheDocument();
      await screen.findByRole('table', { name: 'Tarjoukset' });
      expect(offerRows()).toHaveLength(3);
      const [first, second, third] = offerRows();

      expect(within(first!).getByRole('link', { name: 'Converted C' })).toHaveAttribute('href', `/gigs/${event.id}`);
      expect(within(first!).getByText('Sopimus tekemättä')).toHaveClass('tag', 'tag-danger');
      expect(converted.eventId).toBe(event.id);

      // Not converted yet: links to the offer. 2030-08-01 is a Thursday.
      expect(within(second!).getByRole('link', { name: 'Won W' })).toHaveAttribute('href', `/offers/${won.id}`);
      expect(second).toHaveTextContent('Torstai 1.8.2030');
      expect(second).toHaveTextContent('Client A Oy');
      expect(second).toHaveTextContent('Venue X, City Y');
      expect(within(second!).getByText('Sopimus tekemättä')).toHaveClass('tag-danger');

      expect(within(third!).getByRole('link', { name: 'Open O' })).toHaveAttribute('href', `/offers/${open.id}`);
      expect(third).toHaveTextContent('Venue Z');
      expect(within(third!).getByText('Follow-up?')).toHaveClass('tag', 'tag-info');
      // Only follow-up rows have the "Follow-up tehty" checkbox.
      expect(within(third!).getByRole('checkbox', { name: 'Follow-up tehty' })).not.toBeChecked();
      expect(within(first!).queryByRole('checkbox')).not.toBeInTheDocument();
      expect(within(second!).queryByRole('checkbox')).not.toBeInTheDocument();
    });

    it('phone rows: event name + tag on line 1; date, client and venue bare on line 2', async () => {
      const client = addMockClient('Client A Oy');
      addMockOffer({ clientId: client.id, eventName: 'Open O' });
      renderApp('/my-gigs');
      await screen.findByRole('table', { name: 'Tarjoukset' });
      const row = offerRows()[0]!;
      const cellOf = (label: string) => row.querySelector<HTMLElement>(`td[data-label="${label}"]`)!;
      expect(cellOf('Tapahtuma')).toHaveClass('cell-primary');
      expect(cellOf('Toimenpide')).toHaveClass('cell-end');
      for (const label of ['Päivä', 'Asiakas', 'Paikka', 'Follow-up tehty']) {
        expect(cellOf(label), label).toHaveClass('cell-bare');
      }
      expect(within(cellOf('Follow-up tehty')).getByRole('checkbox', { name: 'Follow-up tehty' })).toBeInTheDocument();
    });

    it('ticking "Follow-up tehty" PATCHes followUpDone: true (logged) and the row disappears', async () => {
      const client = addMockClient('Client A Oy');
      const open = addMockOffer({ clientId: client.id, eventName: 'Open O' });
      addMockOffer({ clientId: client.id, eventName: 'Open P', eventDate: '2030-09-01' });
      const patches: unknown[] = [];
      const onRequest = ({ request }: { request: Request }) => {
        if (request.method === 'PATCH') void request.clone().json().then((b) => patches.push(b));
      };
      server.events.on('request:start', onRequest);
      const { user } = renderApp('/my-gigs');
      await screen.findByRole('table', { name: 'Tarjoukset' });
      expect(offerRows()).toHaveLength(2);
      const row = offerRows().find((r) => within(r).queryByRole('link', { name: 'Open O' }))!;
      await user.click(within(row).getByRole('checkbox', { name: 'Follow-up tehty' }));
      await waitFor(() => expect(open.followUpDone).toBe(true));
      await waitFor(() => expect(within(offersTable()).queryByRole('link', { name: 'Open O' })).not.toBeInTheDocument());
      expect(offerRows()).toHaveLength(1);
      // Clicking the checkbox did not follow the row link.
      expect(screen.getByRole('heading', { level: 1, name: 'Omat keikat' })).toBeInTheDocument();
      expect(patches).toEqual([{ followUpDone: true }]);
      const updated = db.offers.events.filter((e) => e.offerId === open.id && e.type === 'UPDATED');
      expect(updated.at(-1)?.details.changes).toEqual([{ field: 'followUpDone', from: false, to: true }]);
      server.events.removeListener('request:start', onRequest);
    });

    it('shows an inline error when saving "Follow-up tehty" fails; the row stays', async () => {
      const client = addMockClient('Client A Oy');
      const open = addMockOffer({ clientId: client.id, eventName: 'Open O' });
      server.use(http.patch('/api/offers/:id', () => errorResponse(500, 'VALIDATION_ERROR', 'boom')));
      const { user } = renderApp('/my-gigs');
      await screen.findByRole('table', { name: 'Tarjoukset' });
      await user.click(within(offersTable()).getByRole('checkbox', { name: 'Follow-up tehty' }));
      expect(await within(offersTable()).findByText(/./, { selector: '.field-error' })).toBeInTheDocument();
      expect(open.followUpDone).toBe(false);
      expect(within(offersTable()).getByRole('link', { name: 'Open O' })).toBeInTheDocument();
    });

    it('a converted gig with its contract done, cancelled or deleted is not listed', async () => {
      convertedOffer('Done', '2030-07-01').event.contractDone = true;
      convertedOffer('Cancelled', '2030-07-02').event.status = 'CANCELLED';
      convertedOffer('Deleted', '2030-07-03').event.deletedAt = '2030-01-01T00:00:00Z';
      renderApp('/my-gigs');
      expect(await screen.findByText('Ei avoimia tarjouksia')).toBeInTheDocument();
    });

    it('ticking "Sopimus tehty" on the gig page removes the row (refreshes my-offers)', async () => {
      installMatchMedia({ [DESKTOP_QUERY]: true });
      convertedOffer('Converted C', '2030-07-01');
      const { user } = renderApp('/my-gigs');
      await screen.findByRole('table', { name: 'Tarjoukset' });
      await user.click(within(offersTable()).getByRole('link', { name: 'Converted C' }));
      const box = await screen.findByRole('checkbox', { name: 'Sopimus tehty' });
      expect(box).not.toBeChecked();
      await user.click(box);
      await waitFor(() => expect(db.events.events.find((e) => e.lineupName === 'Converted C')!.contractDone).toBe(true));
      const nav = screen.getByRole('navigation', { name: 'Päävalikko' });
      await user.click(within(nav).getByRole('link', { name: 'Omat keikat' }));
      expect(await screen.findByText('Ei avoimia tarjouksia')).toBeInTheDocument();
    });

    it('English labels', async () => {
      const client = addMockClient('Client A Oy');
      addMockOffer({ clientId: client.id, eventName: 'Open O' });
      addMockOffer({ clientId: client.id, eventName: 'Won W', disposition: 'WON' });
      setLanguage('en');
      db.partners[0]!.language = 'en';
      renderApp('/my-gigs');
      expect(await screen.findByRole('heading', { level: 2, name: 'Offers' })).toBeInTheDocument();
      expect(await screen.findByText('Contract not done')).toBeInTheDocument();
      expect(screen.getByText('Follow-up?')).toBeInTheDocument();
      expect(screen.getByRole('checkbox', { name: 'Follow-up done' })).toBeInTheDocument();
    });

    it('English empty state', async () => {
      setLanguage('en');
      db.partners[0]!.language = 'en';
      renderApp('/my-gigs');
      expect(await screen.findByText('No open offers')).toBeInTheDocument();
    });

    it('shows an error with retry when the offers fail to load; the gigs still show', async () => {
      let fail = true;
      server.use(
        http.get('/api/me/offers', () =>
          fail ? errorResponse(500, 'VALIDATION_ERROR', 'boom') : HttpResponse.json({ contractMissing: [], followUp: [] }),
        ),
      );
      const { user } = renderApp('/my-gigs');
      expect(await screen.findByRole('alert')).toBeInTheDocument();
      expect(screen.getByText('Ei tulevia keikkoja')).toBeInTheDocument();
      fail = false;
      await user.click(screen.getByRole('button', { name: 'Yritä uudelleen' }));
      expect(await screen.findByText('Ei avoimia tarjouksia')).toBeInTheDocument();
    });
  });
});
