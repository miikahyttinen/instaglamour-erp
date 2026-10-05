import { useCallback, useSyncExternalStore } from 'react';

/** Same breakpoint as the CSS (`@media (min-width: 900px)`): sidebar instead of the ☰ drawer. */
export const DESKTOP_QUERY = '(min-width: 900px)';

/** Same breakpoint as the CSS (`@media (min-width: 1200px)`): `lg` StatGrid spans, wide tables. */
export const WIDE_QUERY = '(min-width: 1200px)';

function mediaQuery(query: string): MediaQueryList | null {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia(query)
    : null;
}

/** True while the media query matches. False where matchMedia is missing (jsdom = phone). */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = mediaQuery(query);
      list?.addEventListener('change', onChange);
      return () => list?.removeEventListener('change', onChange);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => mediaQuery(query)?.matches ?? false,
    () => false,
  );
}
