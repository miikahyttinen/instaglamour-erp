import { createContext, useContext } from 'react';

export interface AuthContextValue {
  /** True when a signed-in session was lost (401) — the sign-in page explains why. */
  sessionEnded: boolean;
  clearSessionEnded: () => void;
}

export const AuthContext = createContext<AuthContextValue>({
  sessionEnded: false,
  clearSessionEnded: () => undefined,
});

export function useAuthContext(): AuthContextValue {
  return useContext(AuthContext);
}
