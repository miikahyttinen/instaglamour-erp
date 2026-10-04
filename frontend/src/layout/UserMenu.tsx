import { LogOut, Menu } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Language } from '../api/enums';
import type { Partner } from '../api/types';
import { Button } from '../components/Button';
import { LanguageButtons } from './LanguageButtons';
import { ThemeButtons } from './ThemeToggle';

interface Props {
  me: Partner;
  onLanguageChange: (lang: Language) => void;
  onSignOut: () => void;
  signingOut: boolean;
}

/** Phone header menu: signed-in partner, language, theme and sign-out (UC-001 A1, A2). */
export function UserMenu({ me, onLanguageChange, onSignOut, signingOut }: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const onPointer = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer);
    };
  }, [open]);

  return (
    <div className="user-menu" ref={rootRef}>
      <button
        type="button"
        className="icon-btn menu-btn"
        aria-label={t('header.menu')}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
      >
        <Menu />
      </button>
      {open && (
        <div className="menu-panel" id={panelId}>
          <p className="meta">{t('header.signedInAs', { name: me.name })}</p>
          <p className="label">{t('header.language')}</p>
          <LanguageButtons value={me.language} onChange={onLanguageChange} />
          <p className="label">{t('header.theme')}</p>
          <ThemeButtons />
          <Button block icon={LogOut} onClick={onSignOut} disabled={signingOut}>
            {t('header.signOut')}
          </Button>
        </div>
      )}
    </div>
  );
}
