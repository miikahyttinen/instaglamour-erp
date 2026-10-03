import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { HourEntry } from '../../api/types';
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
      <ul className="hour-entries">
        {entries.map((entry) => {
          const date = formatDate(entry.date, lang);
          return (
            <li key={entry.id} className="hour-entry">
              <span className="hour-date">{date}</span>
              <span className="hour-comment pre-wrap">{entry.comment}</span>
              <span className="hour-amount num">{formatHours(entry.hours, lang)}</span>
              {editable && (
                <span className="hour-actions">
                  <button
                    type="button"
                    className="btn btn-small"
                    aria-label={t('hours.editEntry', { date, comment: entry.comment })}
                    onClick={() => setEditing(entry)}
                  >
                    {t('common.edit')}
                  </button>
                  <button
                    type="button"
                    className="btn btn-small btn-danger"
                    aria-label={t('hours.deleteEntry', { date, comment: entry.comment })}
                    onClick={() => setDeleting(entry)}
                  >
                    {t('common.remove')}
                  </button>
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
          <p>
            {formatDate(deleting.date, lang)} · {deleting.comment} ·{' '}
            {formatHours(deleting.hours, lang)}
          </p>
          {remove.isError && (
            <p className="notice notice-error" role="alert">
              {apiErrorMessage(t, remove.error)}
            </p>
          )}
          <div className="form-actions">
            <button
              type="button"
              className="btn btn-danger-solid"
              disabled={remove.isPending}
              onClick={() => remove.mutate(deleting.id, { onSuccess: closeDelete })}
            >
              {remove.isPending ? t('hours.deleting') : t('hours.deleteConfirm')}
            </button>
            <button type="button" className="btn" onClick={closeDelete}>
              {t('common.cancel')}
            </button>
          </div>
        </Dialog>
      )}
    </>
  );
}
