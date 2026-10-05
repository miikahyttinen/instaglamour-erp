import { useCallback, useState } from 'react';

// Desktop sidebar: expanded (icon + label) or collapsed (icons only). Remembered per browser.
export const SIDEBAR_STORAGE_KEY = 'ig-sidebar';
export type SidebarMode = 'expanded' | 'collapsed';

/** The stored mode; 'expanded' when nothing (valid) is stored or storage is blocked. */
export function readSidebarMode(): SidebarMode {
  try {
    return window.localStorage.getItem(SIDEBAR_STORAGE_KEY) === 'collapsed' ? 'collapsed' : 'expanded';
  } catch {
    return 'expanded';
  }
}

function storeSidebarMode(mode: SidebarMode): void {
  try {
    window.localStorage.setItem(SIDEBAR_STORAGE_KEY, mode);
  } catch {
    // Private mode / blocked storage: the choice just isn't remembered.
  }
}

/** `[collapsed, toggle]` — reads the stored mode once, stores every change. */
export function useSidebarCollapsed(): [boolean, () => void] {
  const [mode, setMode] = useState<SidebarMode>(readSidebarMode);
  const toggle = useCallback(() => {
    setMode((current) => {
      const next: SidebarMode = current === 'collapsed' ? 'expanded' : 'collapsed';
      storeSidebarMode(next);
      return next;
    });
  }, []);
  return [mode === 'collapsed', toggle];
}
