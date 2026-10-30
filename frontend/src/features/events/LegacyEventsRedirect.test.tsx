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

describe('old /events URLs (UI back to "Gigs")', () => {
  beforeEach(() => {
    signInMock().selectedYear = TEST_YEAR;
  });

  it('redirects /events to the gig list and keeps the query string', async () => {
    const url = renderAt('/events?q=Venue&status=ALL');
    await screen.findByRole('heading', { name: `Keikat ${TEST_YEAR}` });
    expect(url()).toBe('/gigs?q=Venue&status=ALL');
  });

  it('redirects /events/new to the new gig form', async () => {
    const url = renderAt('/events/new');
    await screen.findByRole('heading', { name: 'Uusi keikka' });
    expect(url()).toBe('/gigs/new');
  });

  it('redirects /events/:id to the gig page, keeping query and hash', async () => {
    const event = addMockEvent({ venue: 'Venue X' });
    const url = renderAt(`/events/${event.id}?tab=history#costs`);
    expect(await screen.findByRole('button', { name: 'Peru keikka' })).toBeInTheDocument();
    expect(url()).toBe(`/gigs/${event.id}?tab=history#costs`);
  });
});
