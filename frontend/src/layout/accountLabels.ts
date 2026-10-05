import { useTranslation } from 'react-i18next';
import type { Language } from '../api/enums';
import type { Theme } from '../theme/theme';

/** Texts shared by the account controls (top bar on desktop, drawer on phone). */
export function useAccountLabels(language: Language, theme: Theme, name: string) {
  const { t } = useTranslation();
  const nextLanguage: Language = language === 'fi' ? 'en' : 'fi';
  const nextLanguageName = t(`language.${nextLanguage}`);
  return {
    nextLanguage,
    nextLanguageName,
    languageLabel: t('header.switchLanguage', { language: nextLanguageName }),
    themeLabel: theme === 'dark' ? t('header.switchToLight') : t('header.switchToDark'),
    themeText: theme === 'dark' ? t('header.themeLight') : t('header.themeDark'),
    signOutLabel: t('header.signOut'),
    signedIn: t('header.signedInAs', { name }),
  };
}
