import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Language } from '../api/enums';
import type { Partner } from '../api/types';
import { LanguageButtons } from './LanguageButtons';

interface Props {
  me: Partner;
  onLanguageChange: (lang: Language) => void;
  onSignOut: () => void;
  signingOut: boolean;
}

/** Menu with the signed-in partner, language switch and sign-out (UC-001 A1, A2). */
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
        <span aria-hidden="true">☰</span>
      </button>
      {open && (
        <div className="menu-panel" id={panelId}>
          <p className="muted small">{t('header.signedInAs', { name: me.name })}</p>
          <p className="menu-label">{t('header.language')}</p>
          <LanguageButtons value={me.language} onChange={onLanguageChange} />
          <button
            type="button"
            className="btn btn-block"
            onClick={onSignOut}
            disabled={signingOut}
          >
            {t('header.signOut')}
          </button>
        </div>
      )}
    </div>
  );
}
