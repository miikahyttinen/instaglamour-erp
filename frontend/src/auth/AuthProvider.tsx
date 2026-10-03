import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { onUnauthenticated } from '../api/client';
import type { Partner } from '../api/types';
import { setLanguage } from '../i18n';
import { AuthContext } from './AuthContext';
import { meKey, useMe } from './useMe';

/**
 * Keeps the session state in the `me` query: any 401 from any API call clears it, which
 * makes the route guard show the sign-in page. Also applies the partner's language.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [sessionEnded, setSessionEnded] = useState(false);
  const { data: me } = useMe();

  useEffect(
    () =>
      onUnauthenticated(() => {
        const previous = queryClient.getQueryData<Partner | null>(meKey);
        if (previous) setSessionEnded(true);
        queryClient.setQueryData(meKey, null);
        queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== meKey[0] });
      }),
    [queryClient],
  );

  const language = me?.language;
  useEffect(() => {
    if (language) setLanguage(language);
  }, [language]);

  const clearSessionEnded = useCallback(() => setSessionEnded(false), []);
  const value = useMemo(
    () => ({ sessionEnded, clearSessionEnded }),
    [sessionEnded, clearSessionEnded],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
