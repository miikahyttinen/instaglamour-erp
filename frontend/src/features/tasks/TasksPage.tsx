import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Task, TaskListQuery } from '../../api/types';
import { useSignedInPartner } from '../../auth/SignedInContext';
import { Dialog } from '../../components/Dialog';
import { apiErrorMessage } from '../../i18n/labels';
import { useLang } from '../../i18n/useLang';
import { formatDate } from '../../lib/format';
import { useReference } from '../../reference/useReference';
import { TaskForm } from './TaskForm';
import { useTasks, useUpdateTask } from './hooks';
import './tasks.css';

type StatusFilter = NonNullable<TaskListQuery['status']>;
const STATUS_FILTERS: StatusFilter[] = ['OPEN', 'DONE', 'ALL'];

/** Partners' shared to-do list (UC-017). */
export function TasksPage() {
  const { t } = useTranslation();
  const lang = useLang();
  const me = useSignedInPartner();
  const { data: reference } = useReference();
  const partners = reference?.partners ?? [me];
  const [status, setStatus] = useState<StatusFilter>('OPEN');
  const [onlyMine, setOnlyMine] = useState(false);
  const [editing, setEditing] = useState<Task | 'new' | null>(null);

  const tasks = useTasks({ status, ownerId: onlyMine ? me.id : undefined });
  const toggle = useUpdateTask();

  const ownerName = (id: string) => partners.find((p) => p.id === id)?.name ?? '–';

  return (
    <section className="page tasks-page">
      <div className="tasks-head">
        <h1>{t('pages.tasks')}</h1>
        <button type="button" className="btn btn-primary" onClick={() => setEditing('new')}>
          {t('tasks.add')}
        </button>
      </div>

      <div className="tasks-filters">
        <div className="segmented" role="group" aria-label={t('tasks.filterLabel')}>
          {STATUS_FILTERS.map((s) => (
            <button key={s} type="button" aria-pressed={status === s} onClick={() => setStatus(s)}>
              {t(`tasks.filter.${s}`)}
            </button>
          ))}
        </div>
        <label className="check">
          <input type="checkbox" checked={onlyMine} onChange={(e) => setOnlyMine(e.target.checked)} />
          {t('tasks.onlyMine')}
        </label>
      </div>

      {toggle.error && (
        <p className="notice notice-error" role="alert">
          {apiErrorMessage(t, toggle.error)}
        </p>
      )}

      {tasks.isPending && <p className="muted">{t('app.loading')}</p>}
      {tasks.isError && (
        <div className="notice notice-error" role="alert">
          <p>{apiErrorMessage(t, tasks.error)}</p>
          <button type="button" className="btn" onClick={() => void tasks.refetch()}>
            {t('app.retry')}
          </button>
        </div>
      )}
      {tasks.data && tasks.data.length === 0 && <p className="muted">{t('tasks.empty')}</p>}
      {tasks.data && tasks.data.length > 0 && (
        <ul className="tasks-list">
          {tasks.data.map((task) => {
            const done = task.status === 'DONE';
            return (
              <li
                key={task.id}
                className={`task-item${task.overdue ? ' task-overdue' : ''}${done ? ' task-done' : ''}`}
                data-testid="task-item"
              >
                <button
                  type="button"
                  className="task-check"
                  aria-pressed={done}
                  aria-label={t(done ? 'tasks.reopen' : 'tasks.markDone', { title: task.title })}
                  disabled={toggle.isPending && toggle.variables?.id === task.id}
                  onClick={() =>
                    toggle.mutate({ id: task.id, body: { status: done ? 'OPEN' : 'DONE' } })
                  }
                >
                  <span aria-hidden="true">{done ? '✓' : ''}</span>
                </button>
                <div className="task-body">
                  <p className="task-title">{task.title}</p>
                  <p className="task-meta small">
                    <span>{ownerName(task.ownerId)}</span>
                    <span>
                      {task.dueDate
                        ? t('tasks.due', { date: formatDate(task.dueDate, lang) })
                        : t('tasks.noDueDate')}
                    </span>
                    {task.overdue && <span className="badge badge-cancelled">{t('tasks.overdue')}</span>}
                    {done && task.completedAt && (
                      <span>{t('tasks.completed', { date: formatDate(task.completedAt, lang) })}</span>
                    )}
                  </p>
                  {task.description && <p className="task-desc small muted">{task.description}</p>}
                </div>
                <button
                  type="button"
                  className="btn task-edit"
                  aria-label={t('tasks.editAria', { title: task.title })}
                  onClick={() => setEditing(task)}
                >
                  {t('common.edit')}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {editing && (
        <Dialog
          title={editing === 'new' ? t('tasks.newTask') : t('tasks.editTask')}
          onClose={() => setEditing(null)}
        >
          <TaskForm
            task={editing === 'new' ? undefined : editing}
            partners={partners}
            meId={me.id}
            onDone={() => setEditing(null)}
          />
        </Dialog>
      )}
    </section>
  );
}
