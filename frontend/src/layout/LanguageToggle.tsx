import { Languages } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Language } from '../api/enums';
import { IconButton } from '../components/Button';

interface Props {
  value: Language;
  onChange: (lang: Language) => void;
  disabled?: boolean;
}

/** Header icon button showing the current language code; click switches FI ⇄ EN. */
export function LanguageToggle({ value, onChange, disabled }: Props) {
  const { t } = useTranslation();
  const next: Language = value === 'fi' ? 'en' : 'fi';
  return (
    <IconButton
      icon={Languages}
      text={value.toUpperCase()}
      className="lang-toggle"
      label={t('header.switchLanguage', { language: t(`language.${next}`) })}
      onClick={() => onChange(next)}
      disabled={disabled}
    />
  );
}
