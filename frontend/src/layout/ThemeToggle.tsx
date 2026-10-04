import { Moon, Sun } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { IconButton } from '../components/Button';
import { THEMES, useTheme } from '../theme/theme';

/** Header icon button: sun in dark theme (→ light), moon in light theme (→ dark). */
export function ThemeToggle() {
  const { t } = useTranslation();
  const { theme, toggleTheme } = useTheme();
  return (
    <IconButton
      icon={theme === 'dark' ? Sun : Moon}
      label={theme === 'dark' ? t('header.switchToLight') : t('header.switchToDark')}
      onClick={toggleTheme}
    />
  );
}

/** Dark / Light segmented buttons (phone menu). */
export function ThemeButtons() {
  const { t } = useTranslation();
  const { theme, setTheme } = useTheme();
  return (
    <div className="segmented" role="group" aria-label={t('header.theme')}>
      {THEMES.map((value) => (
        <button
          key={value}
          type="button"
          aria-pressed={theme === value}
          onClick={() => setTheme(value)}
        >
          {value === 'dark' ? t('header.themeDark') : t('header.themeLight')}
        </button>
      ))}
    </div>
  );
}
