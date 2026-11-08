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
import { addMockClient, addMockEvent, partnerA, partnerB, person } from '../../test/eventFixtures';
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
    expect(within(second!).getAllByText(/./, { selector: '.my-events-role' }).map((el) => el.textContent)).toEqual([
      'Tuottaja',
      'Laulu',
      'Role X',
    ]);
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
    expect(await screen.findByText('Ladataan…')).toBeInTheDocument();
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
});
