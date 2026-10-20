import { X } from 'lucide-react';
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { focusableIn } from '../lib/useFocusTrap';

interface Props {
  title: string;
  onClose: () => void;
  children: ReactNode;
}

/**
 * Modal dialog: bottom sheet on phones, centred panel from 600 px. Uppercase title, X close
 * button, Escape closes it, Tab / Shift+Tab stay inside it (focus trap) and focus returns to the
 * opener. Put the actions in a
 * `<div className="form-actions">` at the end of `children`.
 */
export function Dialog({ title, onClose, children }: Props) {
  const { t } = useTranslation();
  const titleId = useId();
  const ref = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const first = ref.current?.querySelector<HTMLElement>(
      'input, textarea, select, button:not(.dialog-close)',
    );
    first?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCloseRef.current();
        return;
      }
      const root = ref.current;
      if (e.key !== 'Tab' || !root) return;
      const items = focusableIn(root);
      const first = items[0];
      const last = items[items.length - 1];
      if (!first || !last) return;
      const current = document.activeElement;
      if (e.shiftKey && (current === first || !root.contains(current))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (current === last || !root.contains(current))) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      previous?.focus?.();
    };
  }, []);

  return (
    <div className="dialog-backdrop">
      <div ref={ref} className="dialog" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="dialog-head">
          <h2 id={titleId}>{title}</h2>
          <button
            type="button"
            className="icon-btn dialog-close"
            aria-label={t('common.close')}
            title={t('common.close')}
            onClick={onClose}
          >
            <X />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
