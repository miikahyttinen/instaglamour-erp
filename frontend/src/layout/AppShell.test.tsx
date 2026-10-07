import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { UpdateMeRequest } from '../api/types';
import { db } from '../mocks/data';
import { errorResponse } from '../mocks/util';
import { server } from '../mocks/server';
import { DESKTOP_QUERY } from '../lib/useMediaQuery';
import { installMatchMedia } from '../test/matchMedia';
import { renderApp, signInMock } from '../test/renderApp';
import { THEME_STORAGE_KEY } from '../theme/theme';
import { readSidebarMode, SIDEBAR_STORAGE_KEY } from './sidebarState';

const yearSelect = () => screen.getByRole('combobox', { name: 'Valittu vuosi' });
const desktop = () => installMatchMedia({ [DESKTOP_QUERY]: true });
const mainNav = (name = 'Päävalikko') => screen.getByRole('navigation', { name });
const menuButton = () => screen.getByRole('button', { name: 'Valikko' });
const drawer = () => screen.getByRole('dialog', { name: 'Päävalikko' });

describe('app shell', () => {
  it('shows the selected year in the top bar on every page', async () => {
    desktop();
    const partner = signInMock();
    partner.selectedYear = 2030;
    const { user } = renderApp('/');
    expect(await screen.findByRole('heading', { name: 'Vuosi 2030' })).toBeInTheDocument();

    for (const [label, heading] of [
      ['Keikat', 'Keikat 2030'],
      ['Asiakkaat', 'Asiakkaat'],
      ['Henkilöt', 'Henkilöt'],
      ['Tehtävät', 'Tehtävät'],
      ['Tunnit', 'Tunnit 2030'],
      ['Budjetti', 'Budjetti 2030'],
      ['Vuosi', 'Vuosi 2030'],
    ] as const) {
      await user.click(within(mainNav()).getByRole('link', { name: label }));
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

  it('language switch (drawer) changes all texts immediately and saves via PATCH /api/me', async () => {
    signInMock();
    const { user } = renderApp('/');
    await screen.findByRole('heading', { name: /^Vuosi/ });
    expect(document.documentElement.lang).toBe('fi');

    await user.click(menuButton());
    const lang = within(drawer()).getByRole('button', { name: 'Vaihda kieleksi English' });
    expect(lang).toHaveTextContent('English');
    await user.click(lang);

    expect(screen.getByRole('heading', { name: /^Year \d{4}$/ })).toBeInTheDocument();
    // The drawer stays open and is translated too.
    const panel = screen.getByRole('dialog', { name: 'Main menu' });
    expect(within(panel).getByRole('link', { name: 'Gigs' })).toBeInTheDocument();
    expect(within(panel).getByRole('button', { name: 'Sign out' })).toBeInTheDocument();
    expect(within(panel).getByRole('button', { name: 'Change language to Suomi' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Selected year' })).toBeInTheDocument();
    expect(document.documentElement.lang).toBe('en');
    await waitFor(() => expect(db.partners[0]!.language).toBe('en'));
  });

  it("opens in the partner's saved language", async () => {
    signInMock('partner.b@example.com');
    renderApp('/');
    expect(await screen.findByRole('heading', { name: /^Year \d{4}$/ })).toBeInTheDocument();
  });

  it('sign out (drawer) ends the session and shows sign-in', async () => {
    signInMock();
    const { user } = renderApp('/');
    await screen.findByRole('heading', { name: /^Vuosi/ });
    await user.click(menuButton());
    await user.click(within(drawer()).getByRole('button', { name: 'Kirjaudu ulos' }));
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
    desktop();
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
    await user.click(within(mainNav()).getByRole('link', { name: 'Keikat' }));
    await user.click(within(mainNav()).getByRole('link', { name: 'Tunnit' }));
    expect(calls).toBe(1);
  });

  it('shows a not-found page for unknown routes inside the shell', async () => {
    signInMock();
    renderApp('/nope');
    expect(await screen.findByRole('heading', { name: 'Sivua ei löytynyt.' })).toBeInTheDocument();
  });

  it('renders every route inside the shared page container', async () => {
    signInMock();
    const { container } = renderApp('/gigs');
    const heading = await screen.findByRole('heading', { name: /^Keikat/ });
    expect(heading.closest('main > .page-container')).not.toBeNull();
    expect(container.querySelectorAll('.page-container')).toHaveLength(1);
  });

  it('shows the logo as the home link (phone top bar and desktop sidebar)', async () => {
    signInMock();
    const { unmount } = renderApp('/gigs');
    await screen.findByRole('heading', { name: /^Keikat/ });
    const home = screen.getByRole('link', { name: 'Instaglamour ERP' });
    expect(home).toHaveAttribute('href', '/');
    expect(within(home).getByRole('img')).toBeInTheDocument();
    unmount();

    desktop();
    renderApp('/gigs');
    await screen.findByRole('heading', { name: /^Keikat/ });
    expect(screen.getByRole('link', { name: 'Instaglamour ERP' })).toHaveAttribute('href', '/');
  });

  it('drawer theme button switches the theme and remembers it', async () => {
    signInMock();
    document.documentElement.setAttribute('data-theme', 'dark');
    const { user } = renderApp('/');
    await screen.findByRole('heading', { name: /^Vuosi/ });
    await user.click(menuButton());
    await user.click(within(drawer()).getByRole('button', { name: 'Vaihda vaaleaan teemaan' }));
    expect(document.documentElement).toHaveAttribute('data-theme', 'light');
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');
    expect(within(drawer()).getByRole('button', { name: 'Vaihda tummaan teemaan' })).toBeInTheDocument();
  });

  describe('phone: top bar + drawer', () => {
    it('has ☰, logo and year in the top bar; no nav until the drawer opens; no bottom nav', async () => {
      signInMock();
      const { container } = renderApp('/');
      await screen.findByRole('heading', { name: /^Vuosi/ });
      const topbar = container.querySelector('header.topbar') as HTMLElement;
      expect(within(topbar).getByRole('button', { name: 'Valikko' })).toHaveAttribute('aria-expanded', 'false');
      expect(within(topbar).getByRole('link', { name: 'Instaglamour ERP' })).toBeInTheDocument();
      expect(within(topbar).getByRole('combobox', { name: 'Valittu vuosi' })).toBeInTheDocument();
      // Language / theme / sign out stay in the drawer on phones (Layout v2.1).
      expect(within(topbar).getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual([
        'Valikko',
        'Edellinen vuosi',
        'Seuraava vuosi',
      ]);
      expect(screen.queryByRole('button', { name: 'Kirjaudu ulos' })).not.toBeInTheDocument();
      expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
      expect(container.querySelector('.nav-bottom')).toBeNull();
    });

    it('opens as a modal dialog, focuses the close button, and Esc closes it (focus back to ☰)', async () => {
      signInMock();
      const { user } = renderApp('/');
      await screen.findByRole('heading', { name: /^Vuosi/ });
      await user.click(menuButton());

      const panel = drawer();
      expect(panel).toHaveAttribute('aria-modal', 'true');
      expect(menuButton()).toHaveAttribute('aria-expanded', 'true');
      expect(menuButton()).toHaveAttribute('aria-controls', panel.id);
      expect(within(panel).getByRole('button', { name: 'Sulje valikko' })).toHaveFocus();
      expect(within(panel).getByRole('navigation', { name: 'Päävalikko' })).toBeInTheDocument();
      expect(within(panel).getByText(`Kirjautuneena: ${db.partners[0]!.name}`)).toBeInTheDocument();
      expect(document.body.style.overflow).toBe('hidden');

      await user.keyboard('{Escape}');
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(menuButton()).toHaveFocus();
      expect(menuButton()).toHaveAttribute('aria-expanded', 'false');
      expect(document.body.style.overflow).toBe('');
    });

    it('closes on backdrop click and on the close button', async () => {
      signInMock();
      const { user } = renderApp('/');
      await screen.findByRole('heading', { name: /^Vuosi/ });

      await user.click(menuButton());
      await user.click(screen.getByTestId('drawer-backdrop'));
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

      await user.click(menuButton());
      await user.click(within(drawer()).getByRole('button', { name: 'Sulje valikko' }));
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('closes when a nav link is clicked and navigates there', async () => {
      signInMock();
      const { user } = renderApp('/');
      await screen.findByRole('heading', { name: /^Vuosi/ });
      await user.click(menuButton());
      await user.click(within(drawer()).getByRole('link', { name: 'Tunnit' }));
      expect(await screen.findByRole('heading', { name: /^Tunnit/ })).toBeInTheDocument();
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

      // The current page's link also closes it.
      await user.click(menuButton());
      const current = within(drawer()).getByRole('link', { name: 'Tunnit' });
      expect(current).toHaveAttribute('aria-current', 'page');
      await user.click(current);
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('traps focus: Tab wraps from the last to the first item and Shift+Tab back', async () => {
      signInMock();
      const { user } = renderApp('/');
      await screen.findByRole('heading', { name: /^Vuosi/ });
      await user.click(menuButton());
      const panel = drawer();
      const first = within(panel).getByRole('link', { name: 'Instaglamour ERP' });
      const last = within(panel).getByRole('button', { name: 'Kirjaudu ulos' });

      last.focus();
      await user.tab();
      expect(first).toHaveFocus();
      await user.tab({ shift: true });
      expect(last).toHaveFocus();
      // Every Tab stays inside the drawer.
      for (let i = 0; i < 12; i += 1) {
        await user.tab();
        expect(panel.contains(document.activeElement)).toBe(true);
      }
    });

    it('never shows on desktop, even if it was open when the window got wider', async () => {
      const media = installMatchMedia({ [DESKTOP_QUERY]: false });
      signInMock();
      const { user } = renderApp('/');
      await screen.findByRole('heading', { name: /^Vuosi/ });
      await user.click(menuButton());
      expect(drawer()).toBeInTheDocument();
      media.set(DESKTOP_QUERY, true);
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      expect(screen.queryByRole('button', { name: 'Valikko' })).not.toBeInTheDocument();
      expect(mainNav()).toBeInTheDocument();
    });
  });

  describe('desktop sidebar', () => {
    it('has icon nav with the active item marked, the section in the top bar and no ☰', async () => {
      desktop();
      signInMock();
      const { container } = renderApp('/gigs');
      await screen.findByRole('heading', { name: /^Keikat/ });
      expect(screen.queryByRole('button', { name: 'Valikko' })).not.toBeInTheDocument();

      const links = within(mainNav()).getAllByRole('link');
      expect(links.map((l) => l.textContent)).toEqual([
        'Vuosi',
        'Keikat',
        'Asiakkaat',
        'Henkilöt',
        'Tehtävät',
        'Tunnit',
        'Budjetti',
      ]);
      for (const link of links) expect(link.querySelector('svg')).not.toBeNull();
      expect(within(mainNav()).getByRole('link', { name: 'Keikat' })).toHaveAttribute('aria-current', 'page');
      expect(within(mainNav()).getByRole('link', { name: 'Vuosi' })).not.toHaveAttribute('aria-current');
      expect(container.querySelector('.topbar-context')).toHaveTextContent('Keikat');
    });

    it('has year · language · theme · sign out in the top bar (Layout v2.1)', async () => {
      desktop();
      signInMock();
      document.documentElement.setAttribute('data-theme', 'dark');
      const { user, container } = renderApp('/');
      await screen.findByRole('heading', { name: /^Vuosi/ });
      const topbarEnd = container.querySelector('header.topbar .topbar-end') as HTMLElement;
      const name = db.partners[0]!.name;

      // Order: year selector, then language, theme, sign out (icon buttons with tooltips).
      const buttons = within(topbarEnd).getAllByRole('button');
      expect(buttons.map((b) => b.getAttribute('aria-label'))).toEqual([
        'Edellinen vuosi',
        'Seuraava vuosi',
        'Vaihda kieleksi English',
        'Vaihda vaaleaan teemaan',
        'Kirjaudu ulos',
      ]);
      const year = within(topbarEnd).getByRole('group', { name: 'Valittu vuosi' });
      expect(year.compareDocumentPosition(buttons[2]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      for (const b of buttons.slice(2)) expect(b).toHaveClass('icon-btn');
      const signOut = within(topbarEnd).getByRole('button', { name: 'Kirjaudu ulos' });
      expect(signOut).toHaveAccessibleDescription(`Kirjautuneena: ${name}`);
      expect(signOut).toHaveAttribute('title', `Kirjaudu ulos · Kirjautuneena: ${name}`);

      // None of them are in the sidebar any more.
      const sidebar = container.querySelector('aside.sidebar') as HTMLElement;
      expect(within(sidebar).queryByRole('button', { name: /kieleksi|teemaan|Kirjaudu ulos/ })).toBeNull();

      // Theme: sun in dark (→ light), moon in light (→ dark).
      await user.click(within(topbarEnd).getByRole('button', { name: 'Vaihda vaaleaan teemaan' }));
      expect(document.documentElement).toHaveAttribute('data-theme', 'light');
      expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');
      expect(within(topbarEnd).getByRole('button', { name: 'Vaihda tummaan teemaan' })).toBeInTheDocument();

      // Language: shows the current code; switches FI ⇄ EN and saves it.
      const lang = within(topbarEnd).getByRole('button', { name: 'Vaihda kieleksi English' });
      expect(lang).toHaveTextContent('FI');
      await user.click(lang);
      expect(await screen.findByRole('heading', { name: /^Year \d{4}$/ })).toBeInTheDocument();
      expect(within(topbarEnd).getByRole('button', { name: 'Switch to dark theme' })).toBeInTheDocument();
      expect(within(topbarEnd).getByRole('button', { name: 'Change language to Suomi' })).toHaveTextContent('EN');
      expect(within(topbarEnd).getByRole('button', { name: 'Sign out' })).toHaveAccessibleDescription(
        `Signed in as ${name}`,
      );
      await waitFor(() => expect(db.partners[0]!.language).toBe('en'));

      await user.click(within(topbarEnd).getByRole('button', { name: 'Sign out' }));
      expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
      expect(db.sessionPartnerId).toBeNull();
    });

    it('sidebar bottom has only the collapse toggle, without a divider or name line', async () => {
      desktop();
      signInMock();
      const { user, container } = renderApp('/');
      await screen.findByRole('heading', { name: /^Vuosi/ });
      const sidebar = container.querySelector('aside.sidebar') as HTMLElement;
      for (const state of ['Pienennä valikko', 'Laajenna valikko']) {
        const foot = sidebar.querySelector('.sidebar-foot') as HTMLElement;
        expect(foot).toHaveClass('sidebar-foot-rail');
        expect(within(foot).getAllByRole('button').map((b) => b.textContent)).toEqual([state]);
        expect(foot.querySelector('.sidebar-user')).toBeNull();
        // Outside the nav, the toggle is the only control in the sidebar.
        const outsideNav = within(sidebar)
          .getAllByRole('button')
          .filter((b) => !b.closest('nav'));
        expect(outsideNav).toEqual([within(foot).getByRole('button')]);
        expect(screen.queryByText(`Kirjautuneena: ${db.partners[0]!.name}`, { selector: 'p' })).toBeNull();
        await user.click(within(foot).getByRole('button', { name: state }));
      }
    });

    it('collapses to icons (labels stay accessible, tooltips on) and remembers it', async () => {
      desktop();
      signInMock();
      const { user, container, unmount } = renderApp('/');
      await screen.findByRole('heading', { name: /^Vuosi/ });
      expect(container.querySelector('.shell')).not.toHaveClass('is-collapsed');
      expect(within(mainNav()).getByRole('link', { name: 'Keikat' })).not.toHaveAttribute('data-tooltip');

      await user.click(screen.getByRole('button', { name: 'Pienennä valikko' }));
      expect(container.querySelector('.shell')).toHaveClass('is-collapsed');
      expect(window.localStorage.getItem(SIDEBAR_STORAGE_KEY)).toBe('collapsed');
      const gigs = within(mainNav()).getByRole('link', { name: 'Keikat' });
      expect(gigs).toHaveAttribute('data-tooltip', 'Keikat');
      expect(screen.getByRole('button', { name: 'Laajenna valikko' })).toHaveAttribute(
        'data-tooltip',
        'Laajenna valikko',
      );
      // The top bar controls are unaffected by the collapse.
      expect(screen.getByRole('button', { name: 'Kirjaudu ulos' })).toHaveAccessibleDescription(
        `Kirjautuneena: ${db.partners[0]!.name}`,
      );

      // Still collapsed after a reload.
      unmount();
      const again = renderApp('/');
      await screen.findByRole('heading', { name: /^Vuosi/ });
      expect(again.container.querySelector('.shell')).toHaveClass('is-collapsed');
      await again.user.click(screen.getByRole('button', { name: 'Laajenna valikko' }));
      expect(again.container.querySelector('.shell')).not.toHaveClass('is-collapsed');
      expect(window.localStorage.getItem(SIDEBAR_STORAGE_KEY)).toBe('expanded');
    });

    it('works when localStorage is blocked (expanded, toggle still works)', async () => {
      desktop();
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('blocked');
      });
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('blocked');
      });
      expect(readSidebarMode()).toBe('expanded');
      signInMock();
      const { container } = renderApp('/');
      await screen.findByRole('heading', { name: /^Vuosi/ });
      fireEvent.click(screen.getByRole('button', { name: 'Pienennä valikko' }));
      expect(container.querySelector('.shell')).toHaveClass('is-collapsed');
    });
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});
