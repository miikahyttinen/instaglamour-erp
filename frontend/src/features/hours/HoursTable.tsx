import { Trash2 } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { Language } from '../../api/enums';
import type { HourEntry, HourEntryUpdate, Id } from '../../api/types';
import { Button, IconButton } from '../../components/Button';
import { DataTable, type DataTableColumn } from '../../components/DataTable';
import { Dialog } from '../../components/Dialog';
import { InlineDate, InlineHours, InlineText } from '../../components/inline';
import { apiErrorMessage } from '../../i18n/labels';
import { useLang } from '../../i18n/useLang';
import { formatDate, formatHours } from '../../lib/format';
import {
  DEFAULT_HOUR_SORT,
  nextHourSort,
  sortHourRows,
  sumHours,
  type HourRow,
  type HourSort,
  type HourSortKey,
} from './hoursLogic';
import { useDeleteHourEntry, useUpdateHourEntry } from './queries';

/**
 * Read-only dates in the table: zero-padded numbers (FI 08.01.2030, EN 08/01/2030), so they line
 * up with the own rows' native date inputs in the same column.
 */
function tableDate(iso: string, lang: Language): string {
  const [y, m, d] = iso.split('-');
  return lang === 'fi' ? `${d}.${m}.${y}` : `${d}/${m}/${y}`;
}

interface Props {
  rows: readonly HourRow[];
  /** Accessible name of the table (visually hidden caption). */
  caption: string;
  /** Totals page: Date | Partner | Comment | Hours. My hours: Date | Comment | Hours. */
  showPartner: boolean;
  /** Own entries (this partner's) are edited inline (NFR-8) and can be deleted; others are read-only (BR-051). */
  ownPartnerId: Id;
  /** Shown instead of the table when there are no rows. */
  empty: ReactNode;
  /** Called with the saved entry after an inline change (e.g. the date moved to another year). */
  onSaved?: (entry: HourEntry) => void;
}

/**
 * Hour entries as one flat spreadsheet-style table (UC-018, UC-019): sortable column headers,
 * oldest first by default, and a total row = the sum of the shown rows. No grouping, no collapsing.
 */
export function HoursTable({ rows, caption, showPartner, ownPartnerId, empty, onSaved }: Props) {
  const { t } = useTranslation();
  const lang = useLang();
  const locale = lang === 'fi' ? 'fi-FI' : 'en-GB';
  const [sort, setSort] = useState<HourSort>(DEFAULT_HOUR_SORT);
  const [deleting, setDeleting] = useState<HourEntry | null>(null);
  const update = useUpdateHourEntry();
  const remove = useDeleteHourEntry();

  const sorted = useMemo(() => sortHourRows(rows, sort, locale), [rows, sort, locale]);
  const total = sumHours(rows.map((r) => r.entry));
  const isOwn = (row: HourRow) => row.entry.partnerId === ownPartnerId;
  const anyOwn = rows.some(isOwn);

  /**
   * Own rows' hidden labels name the date and comment. Two own entries with the same date and
   * comment get "(1)", "(2)" (in default order, so the numbers don't change when sorting).
   */
  const suffixOf = useMemo(() => {
    const own = sortHourRows(rows.filter((r) => r.entry.partnerId === ownPartnerId), DEFAULT_HOUR_SORT, locale);
    const keyOf = (e: HourEntry) => `${e.date}\u0000${e.comment}`;
    const counts = new Map<string, number>();
    for (const r of own) counts.set(keyOf(r.entry), (counts.get(keyOf(r.entry)) ?? 0) + 1);
    const seen = new Map<string, number>();
    const result = new Map<Id, string>();
    for (const r of own) {
      const key = keyOf(r.entry);
      if ((counts.get(key) ?? 0) < 2) continue;
      const n = (seen.get(key) ?? 0) + 1;
      seen.set(key, n);
      result.set(r.entry.id, ` ${t('hours.duplicateSuffix', { n })}`);
    }
    return result;
  }, [rows, ownPartnerId, locale, t]);

  const closeDelete = () => {
    setDeleting(null);
    remove.reset();
  };

  /** One PATCH with just the changed field; the hook refetches lists and totals. */
  const patch = (entry: HourEntry, body: HourEntryUpdate) =>
    update.mutateAsync({ id: entry.id, body }).then((saved) => onSaved?.(saved));

  const nameOf = (entry: HourEntry, field: string) =>
    t('hours.entryField', { field, date: formatDate(entry.date, lang), comment: entry.comment }) +
    (suffixOf.get(entry.id) ?? '');

  const sortable = (key: HourSortKey) => ({
    sort: sort.key === key ? sort.dir : undefined,
    onSort: () => setSort((current) => nextHourSort(current, key)),
  });

  const columns: DataTableColumn<HourRow>[] = [
    {
      key: 'date',
      label: t('hours.columns.date'),
      className: 'hours-col-date',
      ...sortable('date'),
      cell: (row) =>
        isOwn(row) ? (
          <InlineDate
            label={nameOf(row.entry, t('hours.date'))}
            hideLabel
            required
            value={row.entry.date}
            field="date"
            onSave={(date) => patch(row.entry, { date })}
          />
        ) : (
          <span className="hours-value hours-date">{tableDate(row.entry.date, lang)}</span>
        ),
    },
    ...(showPartner
      ? [
          {
            key: 'partner',
            label: t('hours.columns.partner'),
            className: 'hours-col-partner',
            ...sortable('partner'),
            cell: (row: HourRow) => row.partnerName,
          },
        ]
      : []),
    {
      key: 'comment',
      label: t('hours.columns.comment'),
      className: 'hours-col-comment',
      ...sortable('comment'),
      cell: (row) =>
        isOwn(row) ? (
          <InlineText
            label={nameOf(row.entry, t('hours.comment'))}
            hideLabel
            required
            maxLength={500}
            value={row.entry.comment}
            field="comment"
            onSave={(comment) => patch(row.entry, { comment })}
          />
        ) : (
          <span className="hours-value pre-wrap">{row.entry.comment}</span>
        ),
    },
    {
      key: 'hours',
      label: t('hours.columns.hours'),
      numeric: true,
      className: 'hours-col-hours',
      ...sortable('hours'),
      cell: (row) =>
        isOwn(row) ? (
          <InlineHours
            label={nameOf(row.entry, t('hours.hours'))}
            hideLabel
            value={row.entry.hours}
            field="hours"
            onSave={(hours) => patch(row.entry, { hours })}
          />
        ) : (
          <span className="inline-num-value">{formatHours(row.entry.hours, lang)}</span>
        ),
    },
    ...(anyOwn
      ? [
          {
            key: 'actions',
            label: t('hours.columns.actions'),
            header: <span className="visually-hidden">{t('hours.columns.actions')}</span>,
            className: 'hours-col-actions',
            cell: (row: HourRow) =>
              isOwn(row) ? (
                <IconButton
                  icon={Trash2}
                  className="hours-delete"
                  label={
                    t('hours.deleteEntry', { date: formatDate(row.entry.date, lang), comment: row.entry.comment }) +
                    (suffixOf.get(row.entry.id) ?? '')
                  }
                  onClick={() => setDeleting(row.entry)}
                />
              ) : null,
          },
        ]
      : []),
  ];
  const labelColumns = columns.findIndex((c) => c.key === 'hours');

  return (
    <>
      <DataTable
        className="hours-table"
        caption={caption}
        columns={columns}
        rows={sorted}
        rowKey={(row) => row.entry.id}
        rowClassName={(row) => (isOwn(row) ? 'hours-row-own' : undefined)}
        empty={empty}
        cardsOnPhone={false}
        footer={
          <tr className="hours-total-row">
            <th scope="row" colSpan={labelColumns}>
              {t('hours.total')}
            </th>
            <td className="num hours-col-hours">
              <span className="inline-num-value" data-testid="hours-table-total">
                {formatHours(total, lang)}
              </span>
            </td>
            {anyOwn && <td className="hours-col-actions" />}
          </tr>
        }
      />

      {deleting && (
        <Dialog title={t('hours.deleteTitle')} onClose={closeDelete}>
          <p className="hours-delete-summary">
            {formatDate(deleting.date, lang)} · {deleting.comment} · {formatHours(deleting.hours, lang)}
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
