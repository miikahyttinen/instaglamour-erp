// Build-time switches (see .env.example). Read at call time so tests can stub them.

export function mocksEnabled(): boolean {
  return import.meta.env.VITE_USE_MOCKS === 'true';
}

export function devLoginEnabled(): boolean {
  return import.meta.env.VITE_DEV_LOGIN === 'true';
}
