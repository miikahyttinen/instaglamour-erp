import { useTranslation } from 'react-i18next';
import blackLarge from '../assets/brand/logo-black-large.png';
import black from '../assets/brand/logo-black.png';
import whiteLarge from '../assets/brand/logo-white-large.png';
import white from '../assets/brand/logo-white.png';
import { useTheme, type Theme } from '../theme/theme';

const SOURCES: Record<'header' | 'large', Record<Theme, string>> = {
  header: { dark: white, light: black },
  large: { dark: whiteLarge, light: blackLarge },
};

// Source PNG aspect ratio (cropped logo incl. 4 px padding: 988 × 260).
const ASPECT = 988 / 260;

export interface LogoProps {
  /** header: ~28–32 px tall (CSS); large: ~64–80 px (sign-in). */
  size?: 'header' | 'large';
  /** Override the theme (e.g. inside a `data-theme` subtree on /styleguide). */
  theme?: Theme;
  className?: string;
  /** Alt text (default: the app name). The public offer page uses the brand name only. */
  alt?: string;
}

/** Theme-aware logo: white on dark, black on light. Alt text is the app name. */
export function Logo({ size = 'header', theme, className, alt }: LogoProps) {
  const { t } = useTranslation();
  const { theme: current } = useTheme();
  const height = size === 'large' ? 80 : 32;
  return (
    <img
      className={['logo', `logo-${size}`, className].filter(Boolean).join(' ')}
      src={SOURCES[size][theme ?? current]}
      alt={alt ?? t('app.name')}
      width={Math.round(height * ASPECT)}
      height={height}
      decoding="async"
    />
  );
}
