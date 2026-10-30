import { render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import { App } from '../../App';
import { createQueryClient } from '../../queryClient';
import { addMockEvent, TEST_YEAR } from '../../test/eventFixtures';
import { signInMock } from '../../test/renderApp';

function UrlProbe() {
  const { pathname, search, hash } = useLocation();
  return <output data-testid="url">{pathname + search + hash}</output>;
}

function renderAt(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <App queryClient={createQueryClient({ retry: false })} />
      <UrlProbe />
    </MemoryRouter>,
  );
  return () => screen.getByTestId('url').textContent;
}

describe('old /gigs URLs (Gig → Event rename)', () => {
  beforeEach(() => {
    signInMock().selectedYear = TEST_YEAR;
  });

  it('redirects /gigs to the event list and keeps the query string', async () => {
    const url = renderAt('/gigs?q=Venue&status=ALL');
    await screen.findByRole('heading', { name: `Tapahtumat ${TEST_YEAR}` });
    expect(url()).toBe('/events?q=Venue&status=ALL');
  });

  it('redirects /gigs/new to the new event form', async () => {
    const url = renderAt('/gigs/new');
    await screen.findByRole('heading', { name: 'Uusi tapahtuma' });
    expect(url()).toBe('/events/new');
  });

  it('redirects /gigs/:id to the event page, keeping query and hash', async () => {
    const event = addMockEvent({ venue: 'Venue X' });
    const url = renderAt(`/gigs/${event.id}?tab=history#costs`);
    expect(await screen.findByRole('button', { name: 'Peru tapahtuma' })).toBeInTheDocument();
    expect(url()).toBe(`/events/${event.id}?tab=history#costs`);
  });
});
