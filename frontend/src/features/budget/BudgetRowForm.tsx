import { Plus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/Button';
import { Field } from '../../components/fields';
import { apiErrorMessage, apiFieldErrors } from '../../i18n/labels';

interface Props {
  pending: boolean;
  /** Error of the last add (translated here; the server's message is never shown). */
  error: unknown;
  /** Resolves when the row was added; the form then clears itself. */
  onSubmit: (name: string) => Promise<unknown>;
  /** Changing the name clears the previous error. */
  onEdit: () => void;
}

const MAX_NAME = 500;

/** "Add row" form (UC-020 A2): name + Add. Empty → REQUIRED; the server answers DUPLICATE (E2). */
export function BudgetRowForm({ pending, error, onSubmit, onEdit }: Props) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  const fieldError = localError ?? (error ? apiFieldErrors(t, error).name : undefined);
  const formError = error && !fieldError ? apiErrorMessage(t, error) : null;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (pending) return;
    const trimmed = name.trim();
    if (!trimmed) {
      setLocalError(t('fields.REQUIRED'));
      return;
    }
    if (trimmed.length > MAX_NAME) {
      setLocalError(t('fields.TOO_LONG'));
      return;
    }
    setLocalError(null);
    onSubmit(trimmed).then(
      () => setName(''),
      () => undefined,
    );
  };

  return (
    <form className="budget-add-form" onSubmit={submit} noValidate>
      <Field label={t('budget.rowName')} error={fieldError}>
        {(props) => (
          <input
            {...props}
            type="text"
            autoComplete="off"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setLocalError(null);
              onEdit();
            }}
          />
        )}
      </Field>
      {formError && (
        <p className="field-error budget-add-error" role="alert">
          {formError}
        </p>
      )}
      <div className="budget-add-actions">
        <Button type="submit" variant="primary" icon={Plus} disabled={pending}>
          {pending ? t('budget.adding') : t('budget.add')}
        </Button>
      </div>
    </form>
  );
}
