import { act, screen, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEMO_OFFER_TOKEN, MINIMAL_OFFER_TOKEN } from '../../mocks/publicOfferHandlers';
import { MOCK_SPOTIFY_URL } from '../../mocks/offerStore';
import { server } from '../../mocks/server';
import { renderApp, signInMock } from '../../test/renderApp';

/** Every request the page makes (path + method). */
let requests: string[] = [];
const record = ({ request }: { request: Request }) => {
  requests.push(`${request.method} ${new URL(request.url).pathname}`);
};

function mockBrowserLanguages(languages: string[]) {
  vi.spyOn(window.navigator, 'languages', 'get').mockReturnValue(languages);
}

beforeEach(() => {
  requests = [];
  server.events.on('request:start', record);
  mockBrowserLanguages(['fi-FI', 'fi']);
});

afterEach(() => {
  server.events.removeListener('request:start', record);
  vi.restoreAllMocks();
});

function robotsMeta() {
  return document.head.querySelector('meta[name="robots"]');
}

describe('PublicOfferPage /o/:token', () => {
  it('shows the offer signed out, without the app shell, and calls only the public endpoint', async () => {
    renderApp(`/o/${DEMO_OFFER_TOKEN}`);

    expect(screen.getByRole('status')).toHaveTextContent('Ladataan tarjousta…');
    expect(await screen.findByRole('heading', { level: 1, name: 'Summer Party X' })).toBeInTheDocument();
    expect(screen.getByText('Lauantai 13.6.2026')).toBeInTheDocument();
    expect(screen.getByText('Venue X, City Y')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Referenssit' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'partner.a@example.com' })).toBeInTheDocument();

    // No shell: no navigation, no year selector, no sign-in redirect.
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /vuosi/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /kirjaudu/i })).not.toBeInTheDocument();

    expect(robotsMeta()).toHaveAttribute('content', 'noindex, nofollow');
    expect(document.title).toBe('Summer Party X – Instaglamour');
    expect(requests).toEqual([`GET /api/public/offers/${DEMO_OFFER_TOKEN}`]);
  });

  it('makes no authenticated calls even with a session in the same browser', async () => {
    signInMock();
    renderApp(`/o/${DEMO_OFFER_TOKEN}`);
    await screen.findByRole('heading', { level: 1, name: 'Summer Party X' });
    expect(requests.every((r) => r.startsWith('GET /api/public/offers/'))).toBe(true);
    expect(requests).not.toContain('GET /api/me');
  });

  it('never renders a price or internal fields, even if the API sends them', async () => {
    server.use(
      http.get('/api/public/offers/:token', () =>
        HttpResponse.json({
          eventName: 'Leaky Event',
          clientName: 'Client A',
          eventDate: '2026-06-13',
          venue: 'Venue X',
          city: null,
          lineup: ['Person 1'],
          includesText: null,
          spotifyUrl: 'https://example.com/listen',
          references: null,
          seller: { name: 'Partner A', email: 'partner.a@example.com', phone: null },
          priceCents: 987650,
          disposition: 'LOST_PRICE',
          source: 'WEBSITE',
          notes: 'Internal note Q',
          eventId: 'event-id-9',
        }),
      ),
    );
    const { container } = renderApp(`/o/${DEMO_OFFER_TOKEN}`);
    await screen.findByRole('heading', { level: 1, name: 'Leaky Event' });
    const text = container.textContent ?? '';
    for (const forbidden of ['9876', '9 876', '€', 'LOST_PRICE', 'WEBSITE', 'Internal note Q', 'event-id-9']) {
      expect(text).not.toContain(forbidden);
    }
  });

  it('shows a not-found page without details for an unknown token', async () => {
    renderApp('/o/unknown-token');
    expect(await screen.findByRole('heading', { level: 1, name: 'Tarjousta ei löytynyt' })).toBeInTheDocument();
    expect(screen.getByText(/Linkki ei ole voimassa/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Yritä uudelleen' })).not.toBeInTheDocument();
    expect(screen.queryByRole('article')).not.toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(robotsMeta()).toHaveAttribute('content', 'noindex, nofollow');
  });

  it('shows an error with retry for other failures', async () => {
    let fail = true;
    server.use(
      http.get('/api/public/offers/:token', () =>
        fail
          ? HttpResponse.json({ error: { code: 'UNKNOWN', message: 'boom' } }, { status: 500 })
          : undefined,
      ),
    );
    const { user } = renderApp(`/o/${DEMO_OFFER_TOKEN}`);
    expect(await screen.findByRole('alert')).toHaveTextContent('Tarkista verkkoyhteys');
    expect(screen.getByRole('heading', { level: 1, name: 'Tarjousta ei voitu ladata' })).toBeInTheDocument();
    expect(screen.queryByText('boom')).not.toBeInTheDocument();

    fail = false;
    await user.click(screen.getByRole('button', { name: 'Yritä uudelleen' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Summer Party X' })).toBeInTheDocument();
  });

  it('treats 429 RATE_LIMITED as a generic error with retry', async () => {
    server.use(
      http.get('/api/public/offers/:token', () =>
        HttpResponse.json(
          { error: { code: 'RATE_LIMITED', message: 'slow down' } },
          { status: 429, headers: { 'Retry-After': '60' } },
        ),
      ),
    );
    renderApp(`/o/${DEMO_OFFER_TOKEN}`);
    expect(await screen.findByRole('heading', { level: 1, name: 'Tarjousta ei voitu ladata' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Yritä uudelleen' })).toBeInTheDocument();
    expect(screen.queryByText('slow down')).not.toBeInTheDocument();
  });

  it('defaults to the browser language and switches FI/EN without saving anything', async () => {
    mockBrowserLanguages(['en-GB', 'en']);
    const { user } = renderApp(`/o/${DEMO_OFFER_TOKEN}`);
    await screen.findByRole('heading', { level: 1, name: 'Summer Party X' });
    expect(screen.getByText('Saturday 13 Jun 2026')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'References' })).toHaveTextContent('Sample quote A');

    const switcher = screen.getByRole('group', { name: 'Language' });
    await user.click(within(switcher).getByRole('button', { name: 'Suomi' }));
    expect(screen.getByText('Lauantai 13.6.2026')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Referenssit' })).toHaveTextContent('Esimerkkilainaus A');
    expect(within(screen.getByRole('group', { name: 'Kieli' })).getByRole('button', { name: 'Suomi' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(document.documentElement.lang).toBe('fi');
    expect(requests).toEqual([`GET /api/public/offers/${DEMO_OFFER_TOKEN}`]);
  });

  it('hides absent optional parts (minimal offer) but always shows the fixed Spotify link', async () => {
    renderApp(`/o/${MINIMAL_OFFER_TOKEN}`);
    await screen.findByRole('heading', { level: 1, name: 'Wedding Y' });
    expect(screen.getByText('Venue Z')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Referenssit' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Kuuntele settilistaa Spotifyssä/ })).toHaveAttribute('href', MOCK_SPOTIFY_URL);
    expect(screen.queryByText('Puhelin')).not.toBeInTheDocument();
  });

  it('renders in the light theme while printing', async () => {
    renderApp(`/o/${DEMO_OFFER_TOKEN}`);
    await screen.findByRole('heading', { level: 1, name: 'Summer Party X' });
    const main = screen.getByRole('main');
    expect(main).not.toHaveAttribute('data-theme');

    act(() => {
      window.dispatchEvent(new Event('beforeprint'));
    });
    expect(main).toHaveAttribute('data-theme', 'light');
    act(() => {
      window.dispatchEvent(new Event('afterprint'));
    });
    expect(main).not.toHaveAttribute('data-theme');
  });
});
