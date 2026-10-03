import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import type { Language } from '../api/enums';
import { LANGUAGES } from '../api/enums';
import en from './en';
import fi from './fi';

export const DEFAULT_LANGUAGE: Language = 'fi';

export function isLanguage(value: unknown): value is Language {
  return typeof value === 'string' && (LANGUAGES as readonly string[]).includes(value);
}

/** Language before sign-in: English only if the browser prefers English, otherwise Finnish. */
export function detectBrowserLanguage(
  languages: readonly string[] = typeof navigator !== 'undefined' ? navigator.languages : [],
): Language {
  for (const tag of languages) {
    const base = tag.toLowerCase().split('-')[0];
    if (isLanguage(base)) return base;
  }
  return DEFAULT_LANGUAGE;
}

export function currentLanguage(): Language {
  return isLanguage(i18n.language) ? i18n.language : DEFAULT_LANGUAGE;
}

export function setLanguage(lang: Language): void {
  if (i18n.language !== lang) void i18n.changeLanguage(lang);
  if (typeof document !== 'undefined') document.documentElement.lang = lang;
}

void i18n.use(initReactI18next).init({
  resources: { fi: { translation: fi }, en: { translation: en } },
  lng: detectBrowserLanguage(),
  fallbackLng: DEFAULT_LANGUAGE,
  supportedLngs: [...LANGUAGES],
  interpolation: { escapeValue: false },
  returnNull: false,
  initAsync: false,
});

export default i18n;
