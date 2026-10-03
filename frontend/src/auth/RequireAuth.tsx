import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, useLocation } from 'react-router-dom';
import { apiErrorMessage } from '../i18n/labels';
import { SignedInContext } from './SignedInContext';
import { useMe } from './useMe';

/** Shows children only with a session; otherwise redirects to /login (remembering the target). */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const location = useLocation();
  const { data: me, isPending, isError, error, refetch } = useMe();

  if (isPending) {
    return (
      <div className="center-screen" role="status">
        {t('app.loading')}
      </div>
    );
  }
  if (isError && me === undefined) {
    return (
      <div className="center-screen">
        <p role="alert">{apiErrorMessage(t, error)}</p>
        <button type="button" className="btn" onClick={() => void refetch()}>
          {t('app.retry')}
        </button>
      </div>
    );
  }
  if (!me) {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }
  return <SignedInContext.Provider value={me}>{children}</SignedInContext.Provider>;
}
