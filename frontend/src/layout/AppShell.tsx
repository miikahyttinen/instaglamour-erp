import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Menu } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { authApi } from '../api/endpoints';
import type { Language } from '../api/enums';
import { Logo } from '../components/Logo';
import { useSignedInPartner } from '../auth/SignedInContext';
import { meKey, useUpdateMe } from '../auth/useMe';
import { apiErrorMessage } from '../i18n/labels';
import { DESKTOP_QUERY, useMediaQuery } from '../lib/useMediaQuery';
import { useReference } from '../reference/useReference';
import { NavDrawer } from './NavDrawer';
import { activeNavItem } from './navItems';
import { Sidebar } from './Sidebar';
import { useSidebarCollapsed } from './sidebarState';
import { YearSelector } from './YearSelector';

/**
 * Layout v2. Desktop (≥ 900 px): collapsible left sidebar + sticky top bar (section, year).
 * Phone: sticky top bar (☰, logo, year); ☰ opens the sidebar as a drawer. Every route renders
 * inside `.page-container` (one left edge, max width, page padding).
 */
export function AppShell() {
  const { t } = useTranslation();
  const me = useSignedInPartner();
  const updateMe = useUpdateMe();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const isDesktop = useMediaQuery(DESKTOP_QUERY);
  const [collapsed, toggleCollapsed] = useSidebarCollapsed();
  const sidebarId = useId();
  const drawerId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  // The drawer is open for the path it was opened on: any navigation (link, back) closes it,
  // and it never shows on desktop.
  const [drawerPath, setDrawerPath] = useState<string | null>(null);
  const drawerOpen = !isDesktop && drawerPath === pathname;
  const closeDrawer = () => setDrawerPath(null);

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

  const sidebarProps = {
    name: me.name,
    language: me.language,
    onLanguageChange: (language: Language) => updateMe.mutate({ language }),
    onSignOut: () => signOut.mutate(),
    signingOut: signOut.isPending,
  };
  const section = activeNavItem(pathname);

  return (
    <div className={['shell', collapsed && 'is-collapsed'].filter(Boolean).join(' ')}>
      {isDesktop && (
        <aside className="sidebar">
          <Sidebar
            {...sidebarProps}
            id={sidebarId}
            variant="rail"
            collapsed={collapsed}
            onToggleCollapsed={toggleCollapsed}
          />
        </aside>
      )}

      <div className="shell-body">
        <header className="topbar">
          <div className="topbar-inner">
            {isDesktop ? (
              <p className="topbar-context">
                {section && (
                  <>
                    <section.icon />
                    <span>{t(section.labelKey)}</span>
                  </>
                )}
              </p>
            ) : (
              <>
                <button
                  type="button"
                  className="icon-btn topbar-menu"
                  aria-label={t('header.menu')}
                  aria-expanded={drawerOpen}
                  aria-controls={drawerOpen ? drawerId : undefined}
                  onClick={() => setDrawerPath(pathname)}
                >
                  <Menu size={20} />
                </button>
                <NavLink to="/" className="brand topbar-brand">
                  <Logo />
                </NavLink>
              </>
            )}
            <div className="topbar-end">
              <YearSelector
                year={me.selectedYear}
                onChange={(selectedYear) => updateMe.mutate({ selectedYear })}
              />
            </div>
          </div>
          {updateMe.isError && (
            <p className="topbar-error" role="alert">
              {t('header.saveFailed')} ({apiErrorMessage(t, updateMe.error)})
            </p>
          )}
        </header>

        <main className="main">
          <div className="page-container">
            <Outlet />
          </div>
        </main>
      </div>

      {drawerOpen && (
        <NavDrawer id={drawerId} onClose={closeDrawer} initialFocus={closeRef}>
          <Sidebar
            {...sidebarProps}
            variant="drawer"
            onClose={closeDrawer}
            closeRef={closeRef}
            onNavigate={closeDrawer}
          />
        </NavDrawer>
      )}
    </div>
  );
}
