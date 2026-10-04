import { Pencil, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { HourEntry } from '../../api/types';
import { Button, IconButton } from '../../components/Button';
import { Dialog } from '../../components/Dialog';
import { apiErrorMessage } from '../../i18n/labels';
import { useLang } from '../../i18n/useLang';
import { formatDate, formatHours } from '../../lib/format';
import { HourEntryForm } from './HourEntryForm';
import { useDeleteHourEntry } from './queries';

interface Props {
  entries: HourEntry[];
  /** Own entries get edit / delete buttons; other partners' entries are read-only (BR-051). */
  editable: boolean;
}

/** Hour entries as a list; edit and delete open dialogs. */
export function HourEntryList({ entries, editable }: Props) {
  const { t } = useTranslation();
  const lang = useLang();
  const [editing, setEditing] = useState<HourEntry | null>(null);
  const [deleting, setDeleting] = useState<HourEntry | null>(null);
  const remove = useDeleteHourEntry();

  const closeDelete = () => {
    setDeleting(null);
    remove.reset();
  };

  return (
    <>
      <ul className={editable ? 'hour-entries hour-entries-editable' : 'hour-entries'}>
        {entries.map((entry) => {
          const date = formatDate(entry.date, lang);
          return (
            <li key={entry.id} className="hour-entry">
              <span className="hour-date">{date}</span>
              <span className="hour-comment pre-wrap">{entry.comment}</span>
              <span className="hour-amount">{formatHours(entry.hours, lang)}</span>
              {editable && (
                <span className="hour-actions">
                  <IconButton
                    icon={Pencil}
                    label={t('hours.editEntry', { date, comment: entry.comment })}
                    onClick={() => setEditing(entry)}
                  />
                  <IconButton
                    icon={Trash2}
                    className="hour-delete"
                    label={t('hours.deleteEntry', { date, comment: entry.comment })}
                    onClick={() => setDeleting(entry)}
                  />
                </span>
              )}
            </li>
          );
        })}
      </ul>

      {editing && (
        <HourEntryForm
          entry={editing}
          onClose={() => setEditing(null)}
          onSaved={() => setEditing(null)}
        />
      )}

      {deleting && (
        <Dialog title={t('hours.deleteTitle')} onClose={closeDelete}>
          <p className="hours-delete-summary">
            {formatDate(deleting.date, lang)} · {deleting.comment} ·{' '}
            {formatHours(deleting.hours, lang)}
          </p>
          {remove.isError && (
            <p className="notice notice-error" role="alert">
              {apiErrorMessage(t, remove.error)}
            </p>
          )}
          <div className="form-actions">
            <Button
              variant="danger"
              icon={Trash2}
              disabled={remove.isPending}
              onClick={() => remove.mutate(deleting.id, { onSuccess: closeDelete })}
            >
              {remove.isPending ? t('hours.deleting') : t('hours.deleteConfirm')}
            </Button>
            <Button onClick={closeDelete}>{t('common.cancel')}</Button>
          </div>
        </Dialog>
      )}
    </>
  );
}
