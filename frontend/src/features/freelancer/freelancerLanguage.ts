import type { Language } from '../../api/enums';
import { DEFAULT_LANGUAGE, isLanguage } from '../../i18n';

/** Language of the public freelancer page, remembered on this device (no account). */
export const FREELANCER_LANG_KEY = 'ig-freelancer-lang';

/** The stored choice, else Finnish. Storage may be blocked (private mode): then Finnish. */
export function readFreelancerLanguage(): Language {
  try {
    const value = window.localStorage.getItem(FREELANCER_LANG_KEY);
    return isLanguage(value) ? value : DEFAULT_LANGUAGE;
  } catch {
    return DEFAULT_LANGUAGE;
  }
}

export function storeFreelancerLanguage(lang: Language): void {
  try {
    window.localStorage.setItem(FREELANCER_LANG_KEY, lang);
  } catch {
    // storage unavailable: the choice lasts for this page view only
  }
}
