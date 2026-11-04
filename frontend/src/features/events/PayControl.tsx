import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { buttonClass } from '../../components/buttonClass';
import { InlineFieldFrame, inlineErrorMessage, type InlineStatus } from '../../components/inline';
import { fieldErrorLabel } from '../../i18n/labels';
import { useLang } from '../../i18n/useLang';
import { centsToInput } from '../../lib/format';
import { parseMoneyField } from '../../lib/moneyField';

interface Props {
  /** Accessible name of the input, e.g. "Toteutunut summa: Basso". */
  inputLabel: string;
  /** Prefill (the budgeted amount). */
  initialCents: number;
  /** POST /cost-lines/{id}/pay; reject with an `ApiError` on failure. */
  onPay: (actualCents: number, via: 'enter' | 'blur') => Promise<unknown>;
}

/**
 * "Mark paid" button that turns into the actual-amount input in the same place (NFR-8 pattern):
 * prefilled with the budget, focused and selected; Enter or blur saves, Esc returns to the button.
 * Leaving it empty (blur) also cancels, for phones without an Esc key; so does 0 (Enter or blur),
 * since 0 is not a payment. On success the line becomes
 * paid and the parent renders the paid amount instead.
 */
export function PayControl({ inputLabel, initialCents, onPay }: Props) {
  const { t } = useTranslation();
  const lang = useLang();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [status, setStatus] = useState<InlineStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const focusButton = useRef(false);
  const saving = useRef(false);
  const mounted = useRef(true);
  const draftRef = useRef(draft);

  useLayoutEffect(() => {
    draftRef.current = draft;
  });
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    } else if (focusButton.current) {
      focusButton.current = false;
      buttonRef.current?.focus();
    }
  }, [editing]);

  const open = () => {
    setDraft(centsToInput(initialCents, lang));
    setStatus('idle');
    setError(null);
    setEditing(true);
  };

  const cancel = (refocus = true) => {
    if (saving.current) return;
    focusButton.current = refocus;
    setEditing(false);
    setStatus('idle');
    setError(null);
  };

  const commit = async (via: 'enter' | 'blur') => {
    if (saving.current) return;
    const { cents, error: code } = parseMoneyField(draftRef.current, lang, true);
    if (code) {
      setStatus('error');
      setError(fieldErrorLabel(t, code));
      return;
    }
    // 0 is "not paid" (a paid line cleared to 0 is unmarked, TASK-178): close without paying.
    if (cents === 0) return cancel(via === 'enter');
    saving.current = true;
    setStatus('saving');
    setError(null);
    try {
      await onPay(cents ?? 0, via);
      // Success: the line is paid now and the parent replaces this control.
    } catch (e) {
      if (mounted.current) {
        setStatus('error');
        setError(inlineErrorMessage(t, e, 'actualCents'));
      }
    } finally {
      saving.current = false;
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      cancel();
      return;
    }
    if (e.key !== 'Enter' || e.nativeEvent.isComposing) return;
    e.preventDefault();
    void commit('enter');
  };

  if (!editing) {
    return (
      <button
        ref={buttonRef}
        type="button"
        className={buttonClass({ size: 'sm', className: 'cost-pay-button' })}
        onClick={open}
      >
        {t('costs.markPaid')}
      </button>
    );
  }

  return (
    <InlineFieldFrame
      label={inputLabel}
      hideLabel
      className="inline-numeric cost-pay-input"
      status={status}
      error={error}
    >
      {(control) => (
        <span className="inline-unit">
          <input
            {...control}
            ref={inputRef}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            value={draft}
            readOnly={status === 'saving'}
            aria-busy={status === 'saving' || undefined}
            onChange={(e) => {
              setDraft(e.target.value);
              if (status === 'error') setStatus('idle');
            }}
            onKeyDown={onKeyDown}
            onBlur={() => {
              // Esc already closed the input; a blur while closing must not save.
              if (focusButton.current) return;
              // Phones have no Esc: leaving the input empty closes it without saving.
              if (draftRef.current.trim() === '') return cancel(false);
              void commit('blur');
            }}
          />
          <span aria-hidden="true">€</span>
        </span>
      )}
    </InlineFieldFrame>
  );
}
