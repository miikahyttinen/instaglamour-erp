import { useEffect, useRef, type ReactNode, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { useFocusTrap } from '../lib/useFocusTrap';

interface Props {
  id?: string;
  onClose: () => void;
  /** Focus target on open (e.g. the close button); the first focusable otherwise. */
  initialFocus?: RefObject<HTMLElement | null>;
  children: ReactNode;
}

/**
 * Phone navigation drawer: slides in from the left over a backdrop. Modal: focus is trapped
 * inside, Esc and a backdrop click close it, and focus returns to the opener (☰).
 * Render it only while open.
 */
export function NavDrawer({ id, onClose, initialFocus, children }: Props) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useFocusTrap(ref, true, initialFocus);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current();
    };
    document.addEventListener('keydown', onKey);
    // No page scrolling behind the drawer.
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
    };
  }, []);

  return (
    <div className="drawer-root">
      <div className="drawer-backdrop" aria-hidden="true" onClick={onClose} data-testid="drawer-backdrop" />
      <div
        ref={ref}
        id={id}
        className="drawer"
        role="dialog"
        aria-modal="true"
        aria-label={t('nav.label')}
        tabIndex={-1}
      >
        {children}
      </div>
    </div>
  );
}
