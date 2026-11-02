import { Check, ChevronDown, ChevronUp, Trash2 } from 'lucide-react';
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
import { partnerOptions } from '../../reference/partners';
import { useDeleteTask, useUpdateTask } from './hooks';

interface Props {
  task: Task;
  partners: Partner[];
}

/**
 * One task in the list (UC-017, NFR-8), on one line: done toggle, title, owner, due date,
 * details toggle and delete. Fields are edited in place and saved on blur / change (one PATCH
 * per field). The description (and the overdue / done tags) show only when the row is opened.
 * Done is a one-tap toggle; delete asks for confirmation first.
 */
export function TaskRow({ task, partners }: Props) {
  const { t } = useTranslation();
  const lang = useLang();
  const toggle = useUpdateTask();
  const update = useUpdateTask();
  const remove = useDeleteTask();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [open, setOpen] = useState(false);
  const done = task.status === 'DONE';

  const patch = (body: TaskUpdate) => update.mutateAsync({ id: task.id, body });

  // Active partners + the current owner even if removed (UC-032) or missing from the list.
  const ownerOptions = partnerOptions(partners, task.ownerId);

  const detailsId = `task-details-${task.id}`;

  return (
    <li
      className={[
        'task-item',
        task.overdue && 'task-overdue',
        done && 'task-done',
        open && 'task-open',
      ]
        .filter(Boolean)
        .join(' ')}
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
        {/* One line: the title truncates with an ellipsis; the full title is the tooltip. */}
        <div className="task-title" title={task.title}>
          <InlineText
            label={t('tasks.field.title')}
            hideLabel
            required
            maxLength={500}
            value={task.title}
            field="title"
            onSave={(title) => patch({ title })}
          />
        </div>
        {/* Overdue is shown by the warn rule and due date colour; named for screen readers. */}
        {task.overdue && <span className="visually-hidden">{t('tasks.overdue')}</span>}
        {/* Phones: the due date as plain text on the line; owner and due date fields are in the
            opened row. */}
        {task.dueDate && (
          <span className="task-due-short">{formatDate(task.dueDate, lang)}</span>
        )}
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
        {open && (
          <div className="task-details" id={detailsId}>
            <InlineTextarea
              className="task-desc"
              label={t('tasks.field.description')}
              hideLabel
              rows={2}
              maxLength={5000}
              placeholder={t('tasks.descriptionPlaceholder')}
              value={task.description}
              field="description"
              onSave={(description) => patch({ description })}
            />
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
        )}
      </div>

      <IconButton
        icon={open ? ChevronUp : ChevronDown}
        className={`task-expand${task.description ? ' task-has-desc' : ''}`}
        label={t(open ? 'tasks.hideDetails' : 'tasks.showDetails', { title: task.title })}
        aria-expanded={open}
        aria-controls={open ? detailsId : undefined}
        onClick={() => setOpen((o) => !o)}
      />
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
