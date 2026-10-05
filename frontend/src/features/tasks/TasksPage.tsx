import { Plus } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TaskListQuery } from '../../api/types';
import { useSignedInPartner } from '../../auth/SignedInContext';
import { Button } from '../../components/Button';
import { Dialog } from '../../components/Dialog';
import { PageHead } from '../../components/PageHead';
import { apiErrorMessage } from '../../i18n/labels';
import { useReference } from '../../reference/useReference';
import { TaskForm } from './TaskForm';
import { TaskRow } from './TaskRow';
import { useTasks } from './hooks';
import './tasks.css';

type StatusFilter = NonNullable<TaskListQuery['status']>;
const STATUS_FILTERS: StatusFilter[] = ['OPEN', 'DONE', 'ALL'];

/** Partners' shared to-do list (UC-017). */
export function TasksPage() {
  const { t } = useTranslation();
  const me = useSignedInPartner();
  const { data: reference } = useReference();
  const partners = reference?.partners ?? [me];
  const [status, setStatus] = useState<StatusFilter>('OPEN');
  const [onlyMine, setOnlyMine] = useState(false);
  const [adding, setAdding] = useState(false);

  const tasks = useTasks({ status, ownerId: onlyMine ? me.id : undefined });
  const overdueCount = tasks.data?.filter((task) => task.overdue).length ?? 0;
  const subtitle = tasks.data
    ? [
        t('tasks.shown', { filter: t(`tasks.filter.${status}`), count: tasks.data.length }),
        overdueCount > 0 && t('tasks.overdueCount', { count: overdueCount }),
      ]
        .filter(Boolean)
        .join(' · ')
    : undefined;

  return (
    <section className="page tasks-page">
      <PageHead
        title={t('pages.tasks')}
        subtitle={subtitle}
        actions={
          <Button icon={Plus} onClick={() => setAdding(true)}>
            {t('tasks.add')}
          </Button>
        }
      />

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

      {tasks.isPending && <p className="muted">{t('app.loading')}</p>}
      {tasks.isError && (
        <div className="notice notice-error" role="alert">
          <p>{apiErrorMessage(t, tasks.error)}</p>
          <Button size="sm" onClick={() => void tasks.refetch()}>
            {t('app.retry')}
          </Button>
        </div>
      )}
      {tasks.data && tasks.data.length === 0 && <p className="empty">{t('tasks.empty')}</p>}
      {tasks.data && tasks.data.length > 0 && (
        <ul className="tasks-list">
          {tasks.data.map((task) => (
            <TaskRow key={task.id} task={task} partners={partners} />
          ))}
        </ul>
      )}

      {adding && (
        <Dialog title={t('tasks.newTask')} onClose={() => setAdding(false)}>
          <TaskForm partners={partners} meId={me.id} onDone={() => setAdding(false)} />
        </Dialog>
      )}
    </section>
  );
}
