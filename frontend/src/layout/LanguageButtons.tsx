import { useTranslation } from 'react-i18next';
import type { Language } from '../api/enums';
import { LANGUAGES } from '../api/enums';

interface Props {
  value: Language;
  onChange: (lang: Language) => void;
  disabled?: boolean;
}

/** FI / EN toggle. Language names are shown in their own language. */
export function LanguageButtons({ value, onChange, disabled }: Props) {
  const { t } = useTranslation();
  return (
    <div className="segmented" role="group" aria-label={t('header.language')}>
      {LANGUAGES.map((lang) => (
        <button
          key={lang}
          type="button"
          lang={lang}
          aria-pressed={value === lang}
          disabled={disabled}
          onClick={() => {
            if (lang !== value) onChange(lang);
          }}
        >
          {t(`language.${lang}`)}
        </button>
      ))}
    </div>
  );
}
