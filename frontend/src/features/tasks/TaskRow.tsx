import { Check, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Partner, Task, TaskUpdate } from '../../api/types';
import { Button, IconButton } from '../../components/Button';
import { Dialog } from '../../components/Dialog';
import { InlineDate, InlineSelect, InlineText, InlineTextarea } from '../../components/inline';
import { StatusTag } from '../../components/StatusTag';
import { apiErrorMessage } from '../../i18n/labels';
import { useLang } from '../../i18n/useLang';
import { formatDate } from '../../lib/format';
import { useDeleteTask, useUpdateTask } from './hooks';

interface Props {
  task: Task;
  partners: Partner[];
}

/**
 * One task in the list (UC-017, NFR-8). Title, owner, due date and description are edited in
 * place and saved on blur / change (one PATCH per field). Done is a one-tap toggle; delete asks
 * for confirmation first.
 */
export function TaskRow({ task, partners }: Props) {
  const { t } = useTranslation();
  const lang = useLang();
  const toggle = useUpdateTask();
  const update = useUpdateTask();
  const remove = useDeleteTask();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const done = task.status === 'DONE';

  const patch = (body: TaskUpdate) => update.mutateAsync({ id: task.id, body });

  // The current owner must be among the options even if the reference list lacks them.
  const ownerOptions = partners.map((p) => ({ value: p.id, label: p.name }));
  if (!ownerOptions.some((o) => o.value === task.ownerId)) {
    ownerOptions.unshift({ value: task.ownerId, label: '–' });
  }

  return (
    <li
      className={`task-item${task.overdue ? ' task-overdue' : ''}${done ? ' task-done' : ''}`}
      data-testid="task-item"
    >
      <button
        type="button"
        className="task-check"
        aria-pressed={done}
        aria-label={t(done ? 'tasks.reopen' : 'tasks.markDone', { title: task.title })}
        disabled={toggle.isPending}
        onClick={() => toggle.mutate({ id: task.id, body: { status: done ? 'OPEN' : 'DONE' } })}
      >
        <span className="task-check-box" aria-hidden="true">
          {done && <Check />}
        </span>
      </button>

      <div className="task-body">
        {toggle.error && (
          <p className="field-error" role="alert">
            {apiErrorMessage(t, toggle.error)}
          </p>
        )}
        <InlineText
          className="task-title"
          label={t('tasks.field.title')}
          hideLabel
          required
          maxLength={500}
          value={task.title}
          field="title"
          onSave={(title) => patch({ title })}
        />
        <InlineTextarea
          className="task-desc"
          label={t('tasks.field.description')}
          hideLabel
          rows={1}
          maxLength={5000}
          placeholder={t('tasks.descriptionPlaceholder')}
          value={task.description}
          field="description"
          onSave={(description) => patch({ description })}
        />
        <div className="task-meta">
          <InlineSelect
            className="task-owner"
            label={t('tasks.field.owner')}
            value={task.ownerId}
            field="ownerId"
            options={ownerOptions}
            onSave={(ownerId) => patch({ ownerId })}
          />
          <InlineDate
            className="task-due"
            label={t('tasks.field.dueDate')}
            value={task.dueDate}
            field="dueDate"
            onSave={(dueDate) => patch({ dueDate })}
          />
        </div>
        {(task.overdue || (done && task.completedAt)) && (
          <p className="task-tags">
            {task.overdue && <StatusTag tone="warn">{t('tasks.overdue')}</StatusTag>}
            {done && task.completedAt && (
              <StatusTag tone="ok">
                {t('tasks.completed', { date: formatDate(task.completedAt, lang) })}
              </StatusTag>
            )}
          </p>
        )}
      </div>

      <IconButton
        icon={Trash2}
        className="task-delete"
        label={t('tasks.deleteAria', { title: task.title })}
        onClick={() => setConfirmingDelete(true)}
      />

      {confirmingDelete && (
        <Dialog title={t('tasks.deleteTitle')} onClose={() => setConfirmingDelete(false)}>
          <p>{t('tasks.confirmDelete', { title: task.title })}</p>
          {remove.error && (
            <p className="notice notice-error" role="alert">
              {apiErrorMessage(t, remove.error)}
            </p>
          )}
          <div className="form-actions">
            <Button
              variant="danger"
              icon={Trash2}
              disabled={remove.isPending}
              onClick={() =>
                remove.mutate(task.id, { onSuccess: () => setConfirmingDelete(false) })
              }
            >
              {t('tasks.confirmDeleteYes')}
            </Button>
            <Button onClick={() => setConfirmingDelete(false)}>{t('common.cancel')}</Button>
          </div>
        </Dialog>
      )}
    </li>
  );
}
