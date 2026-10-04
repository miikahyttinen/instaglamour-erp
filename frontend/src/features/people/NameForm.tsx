import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/Button';
import { Field } from '../../components/fields';
import { apiErrorMessage, apiFieldErrors } from '../../i18n/labels';

interface Props {
  label: string;
  submitLabel: string;
  initialName?: string;
  pending: boolean;
  /** Error of the last save (translated here; the server's message is never shown). */
  error: unknown;
  /** Resolves when saved; the form clears itself when `clearOnSuccess` is set. */
  onSubmit: (name: string) => Promise<unknown>;
  clearOnSuccess?: boolean;
  onCancel?: () => void;
  /** Field and button on one row from 600 px (the add form on the list page). */
  inline?: boolean;
}

/** Name input for adding or renaming a person. Empty name → REQUIRED (UC-014 E1). */
export function NameForm({
  label,
  submitLabel,
  initialName = '',
  pending,
  error,
  onSubmit,
  clearOnSuccess = false,
  onCancel,
  inline = false,
}: Props) {
  const { t } = useTranslation();
  const [name, setName] = useState(initialName);
  const [localError, setLocalError] = useState<string | null>(null);

  const fieldError = localError ?? (error ? apiFieldErrors(t, error).name : undefined);
  const formError = error && !fieldError ? apiErrorMessage(t, error) : null;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (pending) return;
    if (!name.trim()) {
      setLocalError(t('fields.REQUIRED'));
      return;
    }
    setLocalError(null);
    onSubmit(name.trim()).then(
      () => {
        if (clearOnSuccess) setName('');
      },
      () => undefined,
    );
  };

  return (
    <form
      className={inline ? 'people-name-form people-name-form-inline' : 'people-name-form'}
      onSubmit={submit}
      noValidate
    >
      <Field label={label} error={fieldError}>
        {(props) => (
          <input
            {...props}
            type="text"
            autoComplete="off"
            maxLength={500}
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setLocalError(null);
            }}
          />
        )}
      </Field>
      {formError && (
        <p className="field-error people-form-error" role="alert">
          {formError}
        </p>
      )}
      <div className={inline ? 'people-name-actions' : 'form-actions'}>
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? t('common.saving') : submitLabel}
        </Button>
        {onCancel && <Button onClick={onCancel}>{t('common.cancel')}</Button>}
      </div>
    </form>
  );
}
