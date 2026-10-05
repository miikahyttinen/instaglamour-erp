import { Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { HourEntry, HourEntryUpdate } from '../../api/types';
import { Button, IconButton } from '../../components/Button';
import { Dialog } from '../../components/Dialog';
import { InlineDate, InlineHours, InlineText } from '../../components/inline';
import { apiErrorMessage } from '../../i18n/labels';
import { useLang } from '../../i18n/useLang';
import { formatDate, formatHours } from '../../lib/format';
import { useDeleteHourEntry, useUpdateHourEntry } from './queries';

interface Props {
  entries: HourEntry[];
  /**
   * Own entries: date, comment and hours are edited in place (save on blur, NFR-8) and can be
   * deleted after confirmation. Other partners' entries are read-only (BR-051).
   */
  editable: boolean;
  /** Called with the saved entry after an inline change (e.g. the date moved to another year). */
  onSaved?: (entry: HourEntry) => void;
}

/** Hour entries as a list; own entries are edited inline, delete opens a confirmation. */
export function HourEntryList({ entries, editable, onSaved }: Props) {
  const { t } = useTranslation();
  const lang = useLang();
  const [deleting, setDeleting] = useState<HourEntry | null>(null);
  const update = useUpdateHourEntry();
  const remove = useDeleteHourEntry();

  const closeDelete = () => {
    setDeleting(null);
    remove.reset();
  };

  /** One PATCH with just the changed field; the hook refetches lists and totals. */
  const patch = (entry: HourEntry, body: HourEntryUpdate) =>
    update.mutateAsync({ id: entry.id, body }).then((saved) => onSaved?.(saved));

  return (
    <>
      <ul className={editable ? 'hour-entries hour-entries-editable' : 'hour-entries'}>
        {entries.map((entry) => {
          const date = formatDate(entry.date, lang);
          if (!editable) {
            return (
              <li key={entry.id} className="hour-entry">
                <span className="hour-date">{date}</span>
                <span className="hour-comment pre-wrap">{entry.comment}</span>
                <span className="hour-amount">{formatHours(entry.hours, lang)}</span>
              </li>
            );
          }
          const of = (field: string) => t('hours.entryField', { field, date, comment: entry.comment });
          return (
            <li key={entry.id} className="hour-entry">
              <InlineDate
                className="hour-date"
                label={of(t('hours.date'))}
                hideLabel
                required
                value={entry.date}
                field="date"
                onSave={(next) => patch(entry, { date: next })}
              />
              <InlineText
                className="hour-comment"
                label={of(t('hours.comment'))}
                hideLabel
                required
                maxLength={500}
                value={entry.comment}
                field="comment"
                onSave={(comment) => patch(entry, { comment })}
              />
              <InlineHours
                className="hour-amount"
                label={of(t('hours.hours'))}
                hideLabel
                value={entry.hours}
                field="hours"
                onSave={(hours) => patch(entry, { hours })}
              />
              <span className="hour-actions">
                <IconButton
                  icon={Trash2}
                  className="hour-delete"
                  label={t('hours.deleteEntry', { date, comment: entry.comment })}
                  onClick={() => setDeleting(entry)}
                />
              </span>
            </li>
          );
        })}
      </ul>

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
