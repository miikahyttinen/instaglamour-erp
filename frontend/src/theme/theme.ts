import { useSyncExternalStore } from 'react';

// Dark / light theme (docs/design.md "Themes").
// - Default follows the OS (`prefers-color-scheme`), dark when the OS has no preference.
// - An explicit choice (header toggle) is stored in localStorage and wins over the OS.
// - The theme is the `data-theme` attribute on <html>. The inline script in index.html sets it
//   before first paint (same rules as `initialTheme()` below; keep them in sync — a test checks
//   that index.html uses THEME_STORAGE_KEY).

export type Theme = 'dark' | 'light';
export const THEMES: readonly Theme[] = ['dark', 'light'];
export const THEME_STORAGE_KEY = 'ig-theme';
const LIGHT_QUERY = '(prefers-color-scheme: light)';

export function isTheme(value: unknown): value is Theme {
  return value === 'dark' || value === 'light';
}

/** The stored explicit choice, or null (none, invalid, or storage blocked). */
export function readStoredTheme(): Theme | null {
  try {
    const value = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isTheme(value) ? value : null;
  } catch {
    return null;
  }
}

function storeTheme(theme: Theme): void {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Private mode / blocked storage: the choice just isn't remembered.
  }
}

function lightQuery(): MediaQueryList | null {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia(LIGHT_QUERY)
    : null;
}

/** OS preference; dark if unknown. */
export function systemTheme(): Theme {
  return lightQuery()?.matches ? 'light' : 'dark';
}

export function initialTheme(): Theme {
  return readStoredTheme() ?? systemTheme();
}

/** Theme currently applied to <html>. */
export function currentTheme(): Theme {
  const value = document.documentElement.getAttribute('data-theme');
  return isTheme(value) ? value : initialTheme();
}

const listeners = new Set<() => void>();

function apply(theme: Theme): void {
  const root = document.documentElement;
  if (root.getAttribute('data-theme') !== theme) root.setAttribute('data-theme', theme);
  // Browser UI colour follows the page background token.
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  const bg = getComputedStyle(root).getPropertyValue('--bg').trim();
  if (meta && bg) meta.content = bg;
  listeners.forEach((listener) => listener());
}

/** Explicit choice: applies it and remembers it in this browser. */
export function setTheme(theme: Theme): void {
  storeTheme(theme);
  apply(theme);
}

export function toggleTheme(): void {
  setTheme(currentTheme() === 'dark' ? 'light' : 'dark');
}

/**
 * Call once at start-up: applies the initial theme (if the inline script did not) and follows
 * OS changes while no explicit choice is stored. Returns a cleanup function.
 */
export function initTheme(): () => void {
  apply(initialTheme());
  const query = lightQuery();
  if (!query) return () => undefined;
  const onChange = () => {
    if (!readStoredTheme()) apply(systemTheme());
  };
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Current theme + setters; re-renders when the theme changes. */
export function useTheme(): { theme: Theme; setTheme: (theme: Theme) => void; toggleTheme: () => void } {
  const theme = useSyncExternalStore(subscribe, currentTheme, () => 'dark' as Theme);
  return { theme, setTheme, toggleTheme };
}
