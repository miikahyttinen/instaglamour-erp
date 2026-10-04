import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { installMatchMedia } from '../test/matchMedia';
import {
  currentTheme,
  initialTheme,
  initTheme,
  readStoredTheme,
  setTheme,
  THEME_STORAGE_KEY,
  toggleTheme,
  useTheme,
} from './theme';

const LIGHT = '(prefers-color-scheme: light)';
const html = () => document.documentElement;

describe('theme', () => {
  afterEach(() => vi.restoreAllMocks());

  it('defaults to dark when the OS has no preference (no matchMedia)', () => {
    expect(initialTheme()).toBe('dark');
    initTheme();
    expect(html().getAttribute('data-theme')).toBe('dark');
  });

  it('follows prefers-color-scheme when nothing is stored', () => {
    installMatchMedia({ [LIGHT]: true });
    initTheme();
    expect(html().getAttribute('data-theme')).toBe('light');
  });

  it('a stored choice wins over the OS preference', () => {
    installMatchMedia({ [LIGHT]: true });
    window.localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    initTheme();
    expect(html().getAttribute('data-theme')).toBe('dark');
  });

  it('ignores an invalid stored value', () => {
    installMatchMedia({ [LIGHT]: true });
    window.localStorage.setItem(THEME_STORAGE_KEY, 'purple');
    expect(readStoredTheme()).toBeNull();
    expect(initialTheme()).toBe('light');
  });

  it('setTheme / toggleTheme apply to <html> and persist', () => {
    initTheme();
    setTheme('light');
    expect(html().getAttribute('data-theme')).toBe('light');
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');
    toggleTheme();
    expect(currentTheme()).toBe('dark');
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
  });

  it('works when localStorage throws (private mode)', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(readStoredTheme()).toBeNull();
    expect(() => setTheme('light')).not.toThrow();
    expect(html().getAttribute('data-theme')).toBe('light');
  });

  it('follows OS changes only while no choice is stored', () => {
    const media = installMatchMedia({ [LIGHT]: false });
    const stop = initTheme();
    media.set(LIGHT, true);
    expect(currentTheme()).toBe('light');

    setTheme('dark');
    media.set(LIGHT, false);
    media.set(LIGHT, true);
    expect(currentTheme()).toBe('dark');
    stop();
  });

  it('useTheme re-renders on change', () => {
    initTheme();
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe('dark');
    act(() => result.current.toggleTheme());
    expect(result.current.theme).toBe('light');
  });

  it('index.html sets the theme before first paint with the same storage key', () => {
    const indexHtml = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8');
    const head = indexHtml.slice(0, indexHtml.indexOf('</head>'));
    expect(head).toContain(`localStorage.getItem('${THEME_STORAGE_KEY}')`);
    expect(head).toContain(LIGHT);
    expect(head).toContain("setAttribute('data-theme'");
    // Inline (not a module) so it runs before the app bundle and before paint.
    expect(head).not.toMatch(/<script[^>]*type="module"[^>]*>\s*\/\/ Theme/);
  });
});
