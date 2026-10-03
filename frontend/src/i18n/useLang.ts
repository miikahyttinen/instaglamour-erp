import { useTranslation } from 'react-i18next';
import type { Language } from '../api/enums';
import { DEFAULT_LANGUAGE, isLanguage } from './index';

/** Current UI language (re-renders on change). */
export function useLang(): Language {
  const { i18n } = useTranslation();
  return isLanguage(i18n.language) ? i18n.language : DEFAULT_LANGUAGE;
}
