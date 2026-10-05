import { Moon, Sun } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { IconButton } from '../components/Button';
import { useTheme } from '../theme/theme';

/** Icon button: sun in dark theme (→ light), moon in light theme (→ dark). Sign-in page. */
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
