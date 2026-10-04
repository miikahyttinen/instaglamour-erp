import { useOutletContext } from 'react-router-dom';

export interface HoursOutletContext {
  /** Element in the page head's action area; pages portal their action button into it. */
  actionsSlot: HTMLElement | null;
}

/** Outlet context of the hours layout (null-safe when a page is rendered outside it). */
export function useHoursOutlet(): HoursOutletContext {
  return useOutletContext<HoursOutletContext | undefined>() ?? { actionsSlot: null };
}
