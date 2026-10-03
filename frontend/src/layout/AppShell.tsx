import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { authApi } from '../api/endpoints';
import { useSignedInPartner } from '../auth/SignedInContext';
import { meKey, useUpdateMe } from '../auth/useMe';
import { apiErrorMessage } from '../i18n/labels';
import { useReference } from '../reference/useReference';
import { NAV_ITEMS } from './navItems';
import { UserMenu } from './UserMenu';
import { YearSelector } from './YearSelector';

/** Header (brand, nav on desktop, selected year, menu) + page + bottom nav on phones. */
export function AppShell() {
  const { t } = useTranslation();
  const me = useSignedInPartner();
  const updateMe = useUpdateMe();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  // Load reference data once per session so every page has it cached.
  useReference();

  const { reset: resetUpdate, isError: updateFailed } = updateMe;
  useEffect(() => {
    if (!updateFailed) return undefined;
    const timer = window.setTimeout(resetUpdate, 6000);
    return () => window.clearTimeout(timer);
  }, [updateFailed, resetUpdate]);

  const signOut = useMutation({
    mutationFn: authApi.logout,
    onSettled: () => {
      queryClient.clear();
      queryClient.setQueryData(meKey, null);
      void navigate('/login', { replace: true });
    },
  });

  return (
    <div className="shell">
      <header className="header">
        <div className="header-inner">
          <NavLink to="/" className="brand">
            {t('app.name')}
          </NavLink>
          <nav className="nav-desktop" aria-label={t('nav.label')}>
            {NAV_ITEMS.map((item) => (
              <NavLink key={item.to} to={item.to} end={item.end} className="nav-link">
                {t(item.labelKey)}
              </NavLink>
            ))}
          </nav>
          <div className="header-actions">
            <YearSelector
              year={me.selectedYear}
              onChange={(selectedYear) => updateMe.mutate({ selectedYear })}
            />
            <UserMenu
              me={me}
              onLanguageChange={(language) => updateMe.mutate({ language })}
              onSignOut={() => signOut.mutate()}
              signingOut={signOut.isPending}
            />
          </div>
        </div>
        {updateMe.isError && (
          <p className="header-error" role="alert">
            {t('header.saveFailed')} ({apiErrorMessage(t, updateMe.error)})
          </p>
        )}
      </header>

      <main className="main">
        <Outlet />
      </main>

      <nav className="nav-bottom" aria-label={t('nav.label')}>
        {NAV_ITEMS.map((item) => (
          <NavLink key={item.to} to={item.to} end={item.end} className="nav-bottom-link">
            <span className="nav-icon" aria-hidden="true">
              {item.icon}
            </span>
            <span>{t(item.labelKey)}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
