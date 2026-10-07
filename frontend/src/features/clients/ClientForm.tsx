import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { Client } from '../../api/types';
import { Button } from '../../components/Button';
import { Field } from '../../components/fields';
import { apiErrorMessage, apiFieldErrors } from '../../i18n/labels';
import { useCreateClient } from './queries';

/**
 * Add a client (UC-027 step 2): name (required) and notes. Empty name → REQUIRED before sending;
 * DUPLICATE / TOO_LONG come from the server and show under the field (E1). Clears on success.
 */
export function ClientForm({ onCreated }: { onCreated: (client: Client) => void }) {
  const { t } = useTranslation();
  const create = useCreateClient();
  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  const serverFields = create.isError ? apiFieldErrors(t, create.error) : {};
  const nameError = localError ?? serverFields.name;
  const notesError = serverFields.notes;
  const formError =
    create.isError && !serverFields.name && !serverFields.notes ? apiErrorMessage(t, create.error) : null;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (create.isPending) return;
    if (!name.trim()) {
      setLocalError(t('fields.REQUIRED'));
      return;
    }
    setLocalError(null);
    create.mutate(
      { name: name.trim(), notes: notes.trim() || null },
      {
        onSuccess: (client) => {
          setName('');
          setNotes('');
          create.reset();
          onCreated(client);
        },
      },
    );
  };

  return (
    <form className="client-form" onSubmit={submit} noValidate>
      <Field label={t('clients.name')} error={nameError}>
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
      <Field label={t('clients.notes')} error={notesError}>
        {(props) => (
          <textarea {...props} rows={2} maxLength={5000} value={notes} onChange={(e) => setNotes(e.target.value)} />
        )}
      </Field>
      {formError && (
        <p className="field-error" role="alert">
          {formError}
        </p>
      )}
      <div className="form-actions client-form-actions">
        <Button type="submit" variant="primary" disabled={create.isPending}>
          {create.isPending ? t('common.saving') : t('clients.add')}
        </Button>
      </div>
    </form>
  );
}
