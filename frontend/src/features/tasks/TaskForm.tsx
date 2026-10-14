import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { Id, Partner } from '../../api/types';
import { Button } from '../../components/Button';
import { Field } from '../../components/fields';
import { apiErrorMessage, apiFieldErrors } from '../../i18n/labels';
import { activePartners } from '../../reference/partners';
import { useCreateTask } from './hooks';

interface Props {
  partners: Partner[];
  meId: Id;
  onDone: () => void;
}

/** Add form (UC-017 main flow 2). Existing tasks are edited inline in `TaskRow` (NFR-8). */
export function TaskForm({ partners, meId, onDone }: Props) {
  const { t } = useTranslation();
  const [title, setTitle] = useState('');
  const [ownerId, setOwnerId] = useState<Id>(meId);
  const [dueDate, setDueDate] = useState('');
  const [description, setDescription] = useState('');
  const [titleMissing, setTitleMissing] = useState(false);

  const create = useCreateTask();
  const error = create.error;
  const fieldErrors = apiFieldErrors(t, create.error);
  if (titleMissing) fieldErrors.title = t('fields.REQUIRED');

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim()) {
      setTitleMissing(true);
      return;
    }
    setTitleMissing(false);
    const body = {
      title: title.trim(),
      ownerId,
      dueDate: dueDate || null,
      description: description.trim() || null,
    };
    create.mutate(body, { onSuccess: onDone });
  };

  return (
    <form className="form" onSubmit={onSubmit} noValidate>
      {error && !Object.keys(fieldErrors).length && (
        <p className="notice notice-error" role="alert">
          {apiErrorMessage(t, error)}
        </p>
      )}
      <Field label={t('tasks.field.title')} error={fieldErrors.title}>
        {(props) => (
          <input
            {...props}
            type="text"
            value={title}
            maxLength={500}
            onChange={(e) => setTitle(e.target.value)}
          />
        )}
      </Field>
      <Field label={t('tasks.field.owner')} error={fieldErrors.ownerId}>
        {(props) => (
          <select {...props} value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
            {activePartners(partners).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        )}
      </Field>
      <Field label={t('tasks.field.dueDate')} error={fieldErrors.dueDate}>
        {(props) => (
          <input {...props} type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        )}
      </Field>
      <Field label={t('tasks.field.description')} error={fieldErrors.description}>
        {(props) => (
          <textarea
            {...props}
            value={description}
            maxLength={5000}
            onChange={(e) => setDescription(e.target.value)}
          />
        )}
      </Field>

      <div className="form-actions">
        <Button type="submit" variant="primary" disabled={create.isPending}>
          {create.isPending ? t('common.saving') : t('common.save')}
        </Button>
        <Button onClick={onDone}>{t('common.cancel')}</Button>
      </div>
    </form>
  );
}
