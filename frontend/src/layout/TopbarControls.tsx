import { Languages, LogOut, Moon, Sun } from 'lucide-react';
import { useId } from 'react';
import type { Language } from '../api/enums';
import { IconButton } from '../components/Button';
import { useTheme, type Theme } from '../theme/theme';
import { useAccountLabels } from './accountLabels';

export interface TopbarControlsProps {
  /** Signed-in partner's name (sign-out tooltip + accessible description). */
  name: string;
  language: Language;
  onLanguageChange: (language: Language) => void;
  onSignOut: () => void;
  signingOut?: boolean;
  /** Override the shown theme (styleguide panels). */
  theme?: Theme;
}

/**
 * Layout v2.1, desktop top bar (right of the year selector): language · theme · sign out as
 * icon buttons. Accessible names are also the tooltips; sign out is described by
 * "Signed in as <name>".
 */
export function TopbarControls({
  name,
  language,
  onLanguageChange,
  onSignOut,
  signingOut,
  theme: themeOverride,
}: TopbarControlsProps) {
  const { theme: current, toggleTheme } = useTheme();
  const theme = themeOverride ?? current;
  const labels = useAccountLabels(language, theme, name);
  const signedInId = useId();

  return (
    <div className="topbar-controls">
      <IconButton
        icon={Languages}
        label={labels.languageLabel}
        text={language.toUpperCase()}
        onClick={() => onLanguageChange(labels.nextLanguage)}
      />
      <IconButton icon={theme === 'dark' ? Sun : Moon} label={labels.themeLabel} onClick={toggleTheme} />
      <IconButton
        icon={LogOut}
        label={labels.signOutLabel}
        title={`${labels.signOutLabel} · ${labels.signedIn}`}
        aria-describedby={signedInId}
        onClick={onSignOut}
        disabled={signingOut}
      />
      <span id={signedInId} className="visually-hidden">
        {labels.signedIn}
      </span>
    </div>
  );
}
