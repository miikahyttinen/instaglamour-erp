import { createContext, useContext } from 'react';
import type { Partner } from '../api/types';

/**
 * The signed-in partner, provided by RequireAuth. Pages below the guard read it from here
 * (not straight from the `me` query) so they never render with a just-cleared session.
 */
export const SignedInContext = createContext<Partner | null>(null);

export function useSignedInPartner(): Partner {
  const partner = useContext(SignedInContext);
  if (!partner) throw new Error('useSignedInPartner must be used below <RequireAuth>');
  return partner;
}

/**
 * The partner's selected year (BR-081 revised): shared by the year pages only (Vuosi, Budjetti,
 * Tunnit, Keikat), which change it with PageYearSelector. Other pages show all years.
 */
export function useSelectedYear(): number {
  return useSignedInPartner().selectedYear;
}
