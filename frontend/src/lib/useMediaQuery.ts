import { useCallback, useSyncExternalStore } from 'react';

/** Same breakpoint as the CSS (`@media (min-width: 900px)`): header nav + icon buttons. */
export const DESKTOP_QUERY = '(min-width: 900px)';

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
