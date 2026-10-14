// Build-time switches (see .env.example). Read at call time so tests can stub them.

export function mocksEnabled(): boolean {
  return import.meta.env.VITE_USE_MOCKS === 'true';
}

export function devLoginEnabled(): boolean {
  return import.meta.env.VITE_DEV_LOGIN === 'true';
}

/**
 * Google domain partners sign in with (same value as the backend's AUTH_ALLOWED_DOMAIN), only
 * for the hint on the partner email field. The contract does not expose it: unset → generic hint.
 */
export function allowedEmailDomain(): string | null {
  const domain = import.meta.env.VITE_AUTH_ALLOWED_DOMAIN?.trim().replace(/^@/, '');
  return domain ? domain.toLowerCase() : null;
}
