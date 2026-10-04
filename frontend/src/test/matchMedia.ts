// jsdom has no matchMedia. Tests that need it (theme default, desktop header) install this fake.
// Without it the app behaves as on a phone with no OS theme preference (dark).

type Listener = (event: MediaQueryListEvent) => void;

export interface FakeMedia {
  /** Change what a query matches and notify listeners (e.g. OS switches to light). */
  set: (query: string, matches: boolean) => void;
}

/** Installs a fake `window.matchMedia`; `initial` lists the queries that match. Cleared after each test. */
export function installMatchMedia(initial: Record<string, boolean> = {}): FakeMedia {
  const state = new Map(Object.entries(initial));
  const listeners = new Map<string, Set<Listener>>();
  window.matchMedia = (query: string) => {
    const set = listeners.get(query) ?? new Set<Listener>();
    listeners.set(query, set);
    return {
      media: query,
      get matches() {
        return state.get(query) ?? false;
      },
      onchange: null,
      addEventListener: (_type: string, listener: Listener) => set.add(listener),
      removeEventListener: (_type: string, listener: Listener) => set.delete(listener),
      addListener: (listener: Listener) => set.add(listener),
      removeListener: (listener: Listener) => set.delete(listener),
      dispatchEvent: () => false,
    } as unknown as MediaQueryList;
  };
  return {
    set: (query, matches) => {
      state.set(query, matches);
      listeners.get(query)?.forEach((l) => l({ matches, media: query } as MediaQueryListEvent));
    },
  };
}

export function removeMatchMedia(): void {
  delete (window as { matchMedia?: unknown }).matchMedia;
}
