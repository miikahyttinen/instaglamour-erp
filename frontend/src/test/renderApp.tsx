import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { App } from '../App';
import { db, setMockSession } from '../mocks/data';
import { createQueryClient } from '../queryClient';

export const PARTNER_A_EMAIL = 'partner.a@example.com';

/** Signs in the given synthetic partner in the mock backend (default: Partner A). */
export function signInMock(email = PARTNER_A_EMAIL) {
  const partner = db.partners.find((p) => p.email === email);
  if (!partner) throw new Error(`No mock partner ${email}`);
  setMockSession(partner.id);
  return partner;
}

/** Hidden probe of the current query string (read with `currentSearch()`). */
function SearchProbe() {
  const { search } = useLocation();
  return (
    <span hidden data-testid="current-search">
      {search}
    </span>
  );
}

/** Query parameters of the app rendered by `renderApp` (the MemoryRouter's location). */
export function currentSearch(): URLSearchParams {
  return new URLSearchParams(document.querySelector('[data-testid="current-search"]')?.textContent ?? '');
}

/** Renders the whole app at `path` with a fresh query client and the MSW mock backend. */
export function renderApp(path = '/') {
  const queryClient = createQueryClient({ retry: false });
  const user = userEvent.setup();
  const result = render(
    <MemoryRouter initialEntries={[path]}>
      <App queryClient={queryClient} />
      <SearchProbe />
    </MemoryRouter>,
  );
  return { ...result, user, queryClient };
}
