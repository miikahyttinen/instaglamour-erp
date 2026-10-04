import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import type { UpdateMeRequest } from '../api/types';
import { db } from '../mocks/data';
import { errorResponse } from '../mocks/util';
import { server } from '../mocks/server';
import { DESKTOP_QUERY } from '../lib/useMediaQuery';
import { installMatchMedia } from '../test/matchMedia';
import { renderApp, signInMock } from '../test/renderApp';
import { THEME_STORAGE_KEY } from '../theme/theme';

const yearSelect = () => screen.getByRole('combobox', { name: 'Valittu vuosi' });

describe('app shell', () => {
  it('shows the selected year in the header on every page', async () => {
    const partner = signInMock();
    partner.selectedYear = 2030;
    const { user } = renderApp('/');
    expect(await screen.findByRole('heading', { name: 'Vuosi 2030' })).toBeInTheDocument();

    const nav = screen.getAllByRole('navigation', { name: 'Päävalikko' })[0]!;
    for (const [label, heading] of [
      ['Keikat', 'Keikat 2030'],
      ['Henkilöt', 'Henkilöt'],
      ['Tehtävät', 'Tehtävät'],
      ['Tunnit', 'Tunnit 2030'],
      ['Budjetti', 'Budjetti 2030'],
      ['Vuosi', 'Vuosi 2030'],
    ] as const) {
      await user.click(within(nav).getByRole('link', { name: label }));
      expect(await screen.findByRole('heading', { name: heading })).toBeInTheDocument();
      expect(yearSelect()).toHaveValue('2030');
    }
  });

  it('next / previous / pick change selectedYear via PATCH /api/me', async () => {
    const partner = signInMock();
    partner.selectedYear = 2030;
    const patches: UpdateMeRequest[] = [];
    server.events.on('request:start', async ({ request }) => {
      if (request.method === 'PATCH' && new URL(request.url).pathname === '/api/me') {
        patches.push((await request.clone().json()) as UpdateMeRequest);
      }
    });

    const { user } = renderApp('/gigs');
    await screen.findByRole('heading', { name: 'Keikat 2030' });

    await user.click(screen.getByRole('button', { name: 'Seuraava vuosi' }));
    expect(await screen.findByRole('heading', { name: 'Keikat 2031' })).toBeInTheDocument();
    await waitFor(() => expect(db.partners[0]!.selectedYear).toBe(2031));

    await user.click(screen.getByRole('button', { name: 'Edellinen vuosi' }));
    await user.click(screen.getByRole('button', { name: 'Edellinen vuosi' }));
    expect(await screen.findByRole('heading', { name: 'Keikat 2029' })).toBeInTheDocument();

    await user.selectOptions(yearSelect(), '2027');
    expect(await screen.findByRole('heading', { name: 'Keikat 2027' })).toBeInTheDocument();
    await waitFor(() => expect(db.partners[0]!.selectedYear).toBe(2027));
    expect(patches.map((p) => p.selectedYear)).toEqual([2031, 2030, 2029, 2027]);
    server.events.removeAllListeners();
  });

  it('rolls back the year and shows an error when saving fails', async () => {
    const partner = signInMock();
    partner.selectedYear = 2030;
    server.use(http.patch('/api/me', () => errorResponse(400, 'VALIDATION_ERROR', 'x')));
    const { user } = renderApp('/');
    await screen.findByRole('heading', { name: 'Vuosi 2030' });
    await user.click(screen.getByRole('button', { name: 'Seuraava vuosi' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Tallennus epäonnistui');
    expect(screen.getByRole('heading', { name: 'Vuosi 2030' })).toBeInTheDocument();
    expect(yearSelect()).toHaveValue('2030');
  });

  it('language switch changes all texts immediately and saves via PATCH /api/me', async () => {
    signInMock();
    const { user } = renderApp('/');
    await screen.findByRole('heading', { name: /^Vuosi/ });
    expect(document.documentElement.lang).toBe('fi');

    await user.click(screen.getByRole('button', { name: 'Valikko' }));
    await user.click(screen.getByRole('button', { name: 'English' }));

    expect(screen.getByRole('heading', { name: /^Year \d{4}$/ })).toBeInTheDocument();
    const nav = screen.getAllByRole('navigation', { name: 'Main menu' })[0]!;
    expect(within(nav).getByRole('link', { name: 'Gigs' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Selected year' })).toBeInTheDocument();
    expect(document.documentElement.lang).toBe('en');
    await waitFor(() => expect(db.partners[0]!.language).toBe('en'));
  });

  it("opens in the partner's saved language", async () => {
    signInMock('partner.b@example.com');
    renderApp('/');
    expect(await screen.findByRole('heading', { name: /^Year \d{4}$/ })).toBeInTheDocument();
  });

  it('sign out ends the session and shows sign-in', async () => {
    signInMock();
    const { user } = renderApp('/');
    await screen.findByRole('heading', { name: /^Vuosi/ });
    await user.click(screen.getByRole('button', { name: 'Valikko' }));
    await user.click(screen.getByRole('button', { name: 'Kirjaudu ulos' }));
    expect(await screen.findByRole('heading', { name: 'Kirjaudu sisään' })).toBeInTheDocument();
    expect(db.sessionPartnerId).toBeNull();
  });

  it('a 401 from any API call returns to sign-in with a message', async () => {
    signInMock();
    const { user } = renderApp('/');
    await screen.findByRole('heading', { name: /^Vuosi/ });

    // Session expires on the server; the next call (year change) gets 401.
    server.use(http.patch('/api/me', () => errorResponse(401, 'UNAUTHENTICATED', 'expired')));
    await user.click(screen.getByRole('button', { name: 'Seuraava vuosi' }));

    expect(await screen.findByRole('heading', { name: 'Kirjaudu sisään' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Istunto on päättynyt');
  });

  it('a 401 from reference data also returns to sign-in', async () => {
    signInMock();
    server.use(http.get('/api/reference', () => errorResponse(401, 'UNAUTHENTICATED', 'expired')));
    renderApp('/');
    expect(await screen.findByRole('heading', { name: 'Kirjaudu sisään' })).toBeInTheDocument();
  });

  it('loads reference data once and caches it', async () => {
    signInMock();
    let calls = 0;
    server.use(
      http.get('/api/reference', () => {
        calls += 1;
        return HttpResponse.json({
          partners: db.partners,
          ...db.reference,
        });
      }),
    );
    const { user, queryClient } = renderApp('/');
    await screen.findByRole('heading', { name: /^Vuosi/ });
    await waitFor(() => expect(queryClient.getQueryData(['reference'])).toBeDefined());
    const nav = screen.getAllByRole('navigation', { name: 'Päävalikko' })[0]!;
    await user.click(within(nav).getByRole('link', { name: 'Keikat' }));
    await user.click(within(nav).getByRole('link', { name: 'Tunnit' }));
    expect(calls).toBe(1);
  });

  it('shows a not-found page for unknown routes inside the shell', async () => {
    signInMock();
    renderApp('/nope');
    expect(await screen.findByRole('heading', { name: 'Sivua ei löytynyt.' })).toBeInTheDocument();
  });

  it('shows the logo as the home link', async () => {
    signInMock();
    renderApp('/gigs');
    await screen.findByRole('heading', { name: /^Keikat/ });
    const home = screen.getByRole('link', { name: 'Instaglamour ERP' });
    expect(home).toHaveAttribute('href', '/');
    expect(within(home).getByRole('img')).toBeInTheDocument();
  });

  it('phone menu switches the theme and remembers it', async () => {
    signInMock();
    document.documentElement.setAttribute('data-theme', 'dark');
    const { user } = renderApp('/');
    await screen.findByRole('heading', { name: /^Vuosi/ });
    await user.click(screen.getByRole('button', { name: 'Valikko' }));
    const group = screen.getByRole('group', { name: 'Teema' });
    expect(within(group).getByRole('button', { name: 'Tumma' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(within(group).getByRole('button', { name: 'Vaalea' }));
    expect(document.documentElement).toHaveAttribute('data-theme', 'light');
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');
    expect(within(group).getByRole('button', { name: 'Vaalea' })).toHaveAttribute('aria-pressed', 'true');
  });

  describe('desktop header', () => {
    it('has language, theme and sign-out icon buttons instead of the menu', async () => {
      installMatchMedia({ [DESKTOP_QUERY]: true });
      signInMock();
      document.documentElement.setAttribute('data-theme', 'dark');
      const { user } = renderApp('/');
      await screen.findByRole('heading', { name: /^Vuosi/ });
      expect(screen.queryByRole('button', { name: 'Valikko' })).not.toBeInTheDocument();

      // Theme: sun in dark (→ light), moon in light (→ dark); FI/EN labels.
      await user.click(screen.getByRole('button', { name: 'Vaihda vaaleaan teemaan' }));
      expect(document.documentElement).toHaveAttribute('data-theme', 'light');
      expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');
      expect(screen.getByRole('button', { name: 'Vaihda tummaan teemaan' })).toBeInTheDocument();

      // Language: shows the current code, switches FI ⇄ EN and saves it.
      const lang = screen.getByRole('button', { name: 'Vaihda kieleksi English' });
      expect(lang).toHaveTextContent('FI');
      await user.click(lang);
      expect(await screen.findByRole('heading', { name: /^Year \d{4}$/ })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Switch to dark theme' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Change language to Suomi' })).toHaveTextContent('EN');
      await waitFor(() => expect(db.partners[0]!.language).toBe('en'));

      await user.click(screen.getByRole('button', { name: 'Sign out' }));
      expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
      expect(db.sessionPartnerId).toBeNull();
    });
  });
});
