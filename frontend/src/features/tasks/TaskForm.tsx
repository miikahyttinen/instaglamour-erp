import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { Id, Partner, Task } from '../../api/types';
import { Field } from '../../components/fields';
import { apiErrorMessage, apiFieldErrors } from '../../i18n/labels';
import { useCreateTask, useDeleteTask, useUpdateTask } from './hooks';

interface Props {
  /** Task to edit; omitted when adding a new one. */
  task?: Task;
  partners: Partner[];
  meId: Id;
  onDone: () => void;
}

/** Add / edit form (UC-017 main flow 2, A1). Edit mode also offers delete with confirmation. */
export function TaskForm({ task, partners, meId, onDone }: Props) {
  const { t } = useTranslation();
  const [title, setTitle] = useState(task?.title ?? '');
  const [ownerId, setOwnerId] = useState<Id>(task?.ownerId ?? meId);
  const [dueDate, setDueDate] = useState(task?.dueDate ?? '');
  const [description, setDescription] = useState(task?.description ?? '');
  const [titleMissing, setTitleMissing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const create = useCreateTask();
  const update = useUpdateTask();
  const remove = useDeleteTask();
  const save = task ? update : create;
  const error = save.error ?? remove.error;
  const fieldErrors = apiFieldErrors(t, save.error);
  if (titleMissing) fieldErrors.title = t('fields.REQUIRED');
  const busy = save.isPending || remove.isPending;

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
    if (task) update.mutate({ id: task.id, body }, { onSuccess: onDone });
    else create.mutate(body, { onSuccess: onDone });
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
            {partners.map((p) => (
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

      {confirmingDelete && task ? (
        <div className="notice notice-error" role="alertdialog" aria-label={t('common.remove')}>
          <p>{t('tasks.confirmDelete', { title: task.title })}</p>
          <div className="inline-actions">
            <button
              type="button"
              className="btn btn-danger-solid"
              disabled={busy}
              onClick={() => remove.mutate(task.id, { onSuccess: onDone })}
            >
              {t('tasks.confirmDeleteYes')}
            </button>
            <button type="button" className="btn" onClick={() => setConfirmingDelete(false)}>
              {t('common.cancel')}
            </button>
          </div>
        </div>
      ) : (
        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {save.isPending ? t('common.saving') : t('common.save')}
          </button>
          <button type="button" className="btn" onClick={onDone}>
            {t('common.cancel')}
          </button>
          {task && (
            <button
              type="button"
              className="btn tasks-delete"
              disabled={busy}
              onClick={() => setConfirmingDelete(true)}
            >
              {t('common.remove')}
            </button>
          )}
        </div>
      )}
    </form>
  );
}
