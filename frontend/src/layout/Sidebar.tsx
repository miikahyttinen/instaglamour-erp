import { Languages, LogOut, Moon, PanelLeftClose, PanelLeftOpen, Sun, X } from 'lucide-react';
import type { Ref } from 'react';
import { useTranslation } from 'react-i18next';
import { NavLink } from 'react-router-dom';
import type { Language } from '../api/enums';
import { Logo } from '../components/Logo';
import { useTheme, type Theme } from '../theme/theme';
import { NAV_ITEMS } from './navItems';

export interface SidebarProps {
  /** rail: desktop sidebar (collapsible); drawer: phone overlay content (always expanded). */
  variant: 'rail' | 'drawer';
  /** Rail only: icons only, labels as tooltips (they stay the accessible names). */
  collapsed?: boolean;
  /** Rail only: the collapse / expand button. */
  onToggleCollapsed?: () => void;
  /** Drawer only: the close (X) button. */
  onClose?: () => void;
  /** Drawer only: focus target when it opens. */
  closeRef?: Ref<HTMLButtonElement>;
  /** Called after a nav link is clicked (the drawer closes). */
  onNavigate?: () => void;
  /** Signed-in partner's name (shown when expanded) and language. */
  name: string;
  language: Language;
  onLanguageChange: (language: Language) => void;
  onSignOut: () => void;
  signingOut?: boolean;
  /** Override the logo / toggle theme (styleguide panels). */
  theme?: Theme;
  id?: string;
}

/**
 * Logo, icon nav (Layout v2), then language / theme / sign out and the collapse toggle.
 * Every item is a `.nav-item` (icon + `.nav-item-label`); collapsed, labels are visually hidden
 * and shown as a CSS tooltip (`data-tooltip`).
 */
export function Sidebar({
  variant,
  collapsed = false,
  onToggleCollapsed,
  onClose,
  closeRef,
  onNavigate,
  name,
  language,
  onLanguageChange,
  onSignOut,
  signingOut,
  theme: themeOverride,
  id,
}: SidebarProps) {
  const { t } = useTranslation();
  const { theme: current, toggleTheme } = useTheme();
  const theme = themeOverride ?? current;
  const isCollapsed = variant === 'rail' && collapsed;
  const tip = (text: string) => (isCollapsed ? text : undefined);

  const nextLanguage: Language = language === 'fi' ? 'en' : 'fi';
  const languageLabel = t('header.switchLanguage', { language: t(`language.${nextLanguage}`) });
  const themeLabel = theme === 'dark' ? t('header.switchToLight') : t('header.switchToDark');
  const signedIn = t('header.signedInAs', { name });
  const toggleLabel = collapsed ? t('nav.expand') : t('nav.collapse');

  return (
    <div
      id={id}
      className={['sidebar-body', `sidebar-${variant}`, isCollapsed && 'is-collapsed']
        .filter(Boolean)
        .join(' ')}
    >
      <div className="sidebar-head">
        <NavLink to="/" className="brand sidebar-brand" onClick={onNavigate}>
          <Logo theme={themeOverride} />
        </NavLink>
        {variant === 'drawer' && onClose && (
          <button
            ref={closeRef}
            type="button"
            className="icon-btn sidebar-close"
            aria-label={t('nav.close')}
            title={t('nav.close')}
            onClick={onClose}
          >
            <X />
          </button>
        )}
      </div>

      <nav className="sidebar-nav" aria-label={t('nav.label')}>
        <ul className="sidebar-list">
          {NAV_ITEMS.map((item) => {
            const label = t(item.labelKey);
            return (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.end}
                  className="nav-item"
                  data-tooltip={tip(label)}
                  onClick={onNavigate}
                >
                  <item.icon />
                  <span className="nav-item-label">{label}</span>
                </NavLink>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="sidebar-foot">
        <button
          type="button"
          className="nav-item"
          aria-label={languageLabel}
          data-tooltip={tip(languageLabel)}
          onClick={() => onLanguageChange(nextLanguage)}
        >
          <Languages />
          <span className="nav-item-label" lang={nextLanguage}>
            {t(`language.${nextLanguage}`)}
          </span>
          <span className="nav-item-code" aria-hidden="true">
            {language.toUpperCase()}
          </span>
        </button>
        <button
          type="button"
          className="nav-item"
          aria-label={themeLabel}
          data-tooltip={tip(themeLabel)}
          onClick={toggleTheme}
        >
          {theme === 'dark' ? <Sun /> : <Moon />}
          <span className="nav-item-label">
            {theme === 'dark' ? t('header.themeLight') : t('header.themeDark')}
          </span>
        </button>
        {!isCollapsed && <p className="sidebar-user">{signedIn}</p>}
        <button
          type="button"
          className="nav-item"
          data-tooltip={tip(`${t('header.signOut')} · ${signedIn}`)}
          onClick={onSignOut}
          disabled={signingOut}
        >
          <LogOut />
          <span className="nav-item-label">{t('header.signOut')}</span>
        </button>
        {variant === 'rail' && onToggleCollapsed && (
          <button
            type="button"
            className="nav-item sidebar-toggle"
            data-tooltip={tip(toggleLabel)}
            aria-controls={id}
            onClick={onToggleCollapsed}
          >
            {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
            <span className="nav-item-label">{toggleLabel}</span>
          </button>
        )}
      </div>
    </div>
  );
}
