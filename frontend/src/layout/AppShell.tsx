import { useMutation, useQueryClient } from '@tanstack/react-query';
import { LogOut } from 'lucide-react';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { authApi } from '../api/endpoints';
import { IconButton } from '../components/Button';
import { Logo } from '../components/Logo';
import { useSignedInPartner } from '../auth/SignedInContext';
import { meKey, useUpdateMe } from '../auth/useMe';
import { apiErrorMessage } from '../i18n/labels';
import { DESKTOP_QUERY, useMediaQuery } from '../lib/useMediaQuery';
import { useReference } from '../reference/useReference';
import { LanguageToggle } from './LanguageToggle';
import { NAV_ITEMS } from './navItems';
import { ThemeToggle } from './ThemeToggle';
import { UserMenu } from './UserMenu';
import { YearSelector } from './YearSelector';

/**
 * Header: logo, nav (desktop), selected year, then language / theme / sign-out icon buttons on
 * desktop or a menu on phones. Page in <main>. Bottom nav on phones.
 */
export function AppShell() {
  const { t } = useTranslation();
  const me = useSignedInPartner();
  const updateMe = useUpdateMe();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const isDesktop = useMediaQuery(DESKTOP_QUERY);

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
            <Logo />
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
            {isDesktop ? (
              <div className="header-icons">
                <LanguageToggle
                  value={me.language}
                  onChange={(language) => updateMe.mutate({ language })}
                />
                <ThemeToggle />
                <IconButton
                  icon={LogOut}
                  label={t('header.signOut')}
                  title={`${t('header.signOut')} · ${t('header.signedInAs', { name: me.name })}`}
                  onClick={() => signOut.mutate()}
                  disabled={signOut.isPending}
                />
              </div>
            ) : (
              <UserMenu
                me={me}
                onLanguageChange={(language) => updateMe.mutate({ language })}
                onSignOut={() => signOut.mutate()}
                signingOut={signOut.isPending}
              />
            )}
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
            <item.icon className="nav-icon" size={20} />
            <span>{t(item.labelKey)}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
