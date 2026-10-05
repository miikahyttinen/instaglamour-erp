import { Check, CircleAlert, LoaderCircle } from 'lucide-react';
import { useId, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { InlineStatus } from './useInlineSave';

/** Props for the native control inside an inline field. */
export interface InlineControlProps {
  id: string;
  className: string;
  'aria-invalid'?: true;
  'aria-describedby'?: string;
}

/** State indicator: spinner while saving, ok check after saving, danger mark on error. */
export function InlineStateIcon({ status }: { status: InlineStatus }) {
  const { t } = useTranslation();
  return (
    <span className={`inline-state is-${status}`} aria-hidden="true" title={
      status === 'saving' ? t('inline.saving') : status === 'saved' ? t('inline.saved') : undefined
    }>
      {status === 'saving' && <LoaderCircle className="inline-spin" />}
      {status === 'saved' && <Check />}
      {status === 'error' && <CircleAlert />}
    </span>
  );
}

/** Polite live region: announces "label: saved" / "label: error" (always rendered). */
export function InlineAnnouncer({
  label,
  status,
  error,
}: {
  label: string;
  status: InlineStatus;
  error: string | null;
}) {
  const { t } = useTranslation();
  let text = '';
  if (status === 'saved') text = t('inline.announceSaved', { label });
  else if (status === 'error' && error) text = t('inline.announceError', { label, error });
  return (
    <span role="status" aria-live="polite" className="visually-hidden">
      {text}
    </span>
  );
}

interface InlineFieldFrameProps {
  label: string;
  hideLabel?: boolean;
  hint?: string;
  className?: string;
  status: InlineStatus;
  error: string | null;
  disabled?: boolean;
  /** Top-aligns the state icon (textareas). */
  multiline?: boolean;
  children: (control: InlineControlProps) => ReactNode;
}

/**
 * Label + quiet control + state icon + error + live region. The inline components use it;
 * use it directly (with `useInlineSave`) only for a control they don't cover.
 */
export function InlineFieldFrame({
  label,
  hideLabel,
  hint,
  className,
  status,
  error,
  disabled,
  multiline,
  children,
}: InlineFieldFrameProps) {
  const id = useId();
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const shownError = status === 'error' ? error : null;
  const describedBy = [shownError ? errorId : null, hint ? hintId : null].filter(Boolean).join(' ');
  const classes = ['inline-field', `is-${status}`, disabled ? 'is-disabled' : null, className]
    .filter(Boolean)
    .join(' ');
  return (
    <div className={classes}>
      <label htmlFor={id} className={hideLabel ? 'visually-hidden' : undefined}>
        {label}
      </label>
      <div className={multiline ? 'inline-control is-multiline' : 'inline-control'}>
        {children({
          id,
          className: 'inline-input',
          'aria-invalid': shownError ? true : undefined,
          'aria-describedby': describedBy || undefined,
        })}
        <InlineStateIcon status={status} />
      </div>
      {hint && (
        <p id={hintId} className="muted small field-hint">
          {hint}
        </p>
      )}
      {shownError && (
        <p id={errorId} className="field-error">
          {shownError}
        </p>
      )}
      <InlineAnnouncer label={label} status={status} error={error} />
    </div>
  );
}
