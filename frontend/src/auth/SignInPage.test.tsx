import { screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PARTNER_A_EMAIL, renderApp } from '../test/renderApp';

describe('sign-in page', () => {
  it('shows sign-in when there is no session, for any page', async () => {
    renderApp('/gigs');
    expect(await screen.findByRole('heading', { name: 'Kirjaudu sisään' })).toBeInTheDocument();
    const google = screen.getByRole('link', { name: 'Kirjaudu Googlella' });
    expect(google).toHaveAttribute('href', '/api/auth/google/start');
  });

  it.each([
    ['WRONG_DOMAIN', 'Käytä Instaglamourin Google-tiliäsi.'],
    ['NOT_A_PARTNER', 'Sinulla ei ole käyttöoikeutta.'],
    ['SIGN_IN_FAILED', 'Kirjautuminen epäonnistui tai peruttiin. Yritä uudelleen.'],
  ])('shows a translated message for ?error=%s', async (code, message) => {
    renderApp(`/login?error=${code}`);
    expect(await screen.findByRole('alert')).toHaveTextContent(message);
  });

  it('shows error messages in English after switching language', async () => {
    const { user } = renderApp('/login?error=NOT_A_PARTNER');
    await screen.findByRole('alert');
    await user.click(screen.getByRole('button', { name: 'English' }));
    expect(screen.getByRole('alert')).toHaveTextContent("You don't have access.");
    expect(screen.getByRole('link', { name: 'Sign in with Google' })).toBeInTheDocument();
  });

  it('ignores unknown error codes', async () => {
    renderApp('/login?error=SOMETHING_ELSE');
    await screen.findByRole('heading', { name: 'Kirjaudu sisään' });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('hides the dev login unless VITE_DEV_LOGIN=true', async () => {
    vi.stubEnv('VITE_DEV_LOGIN', 'false');
    renderApp('/login');
    await screen.findByRole('heading', { name: 'Kirjaudu sisään' });
    expect(screen.queryByLabelText('Sähköposti')).not.toBeInTheDocument();
  });

  it('dev login signs in and opens the shell with year and navigation', async () => {
    vi.stubEnv('VITE_DEV_LOGIN', 'true');
    const { user } = renderApp('/login');
    await user.type(await screen.findByLabelText('Sähköposti'), PARTNER_A_EMAIL);
    await user.click(screen.getByRole('button', { name: 'Kirjaudu' }));

    expect(await screen.findByRole('heading', { name: /^Vuosi \d{4}$/ })).toBeInTheDocument();
    const year = String(new Date().getFullYear());
    expect(screen.getAllByRole('combobox', { name: 'Valittu vuosi' })[0]).toHaveValue(year);
    const nav = screen.getAllByRole('navigation', { name: 'Päävalikko' })[0]!;
    for (const label of ['Vuosi', 'Keikat', 'Henkilöt', 'Tehtävät', 'Tunnit', 'Budjetti']) {
      expect(within(nav).getByRole('link', { name: label })).toBeInTheDocument();
    }
  });

  it('dev login with a non-partner email shows "no access"', async () => {
    vi.stubEnv('VITE_DEV_LOGIN', 'true');
    const { user } = renderApp('/login');
    await user.type(await screen.findByLabelText('Sähköposti'), 'someone@example.com');
    await user.click(screen.getByRole('button', { name: 'Kirjaudu' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Sinulla ei ole käyttöoikeutta.');
  });

  it('dev login returns to the page that was asked for', async () => {
    vi.stubEnv('VITE_DEV_LOGIN', 'true');
    const { user } = renderApp('/hours');
    await user.type(await screen.findByLabelText('Sähköposti'), PARTNER_A_EMAIL);
    await user.click(screen.getByRole('button', { name: 'Kirjaudu' }));
    expect(await screen.findByRole('heading', { name: /^Tunnit \d{4}$/ })).toBeInTheDocument();
  });
});
