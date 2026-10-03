import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSelectedYear, useSignedInPartner } from '../../auth/SignedInContext';
import { apiErrorMessage } from '../../i18n/labels';
import { useLang } from '../../i18n/useLang';
import { formatHours } from '../../lib/format';
import { HourEntryForm } from './HourEntryForm';
import { HourEntryList } from './HourEntryList';
import { groupByMonth, sumHours } from './hoursLogic';
import { useHourEntries } from './queries';

/** Own hour entries of the selected year by month, with month and year totals (UC-018). */
export function MyHoursPage() {
  const { t } = useTranslation();
  const lang = useLang();
  const me = useSignedInPartner();
  const year = useSelectedYear();
  const entries = useHourEntries(year, me.id);
  const [adding, setAdding] = useState(false);
  const [savedOtherYear, setSavedOtherYear] = useState<number | null>(null);

  return (
    <div>
      <div className="hours-summary">
        <dl className="stat">
          <dt>{t('hours.yearTotal', { year })}</dt>
          <dd data-testid="hours-year-total">
            {entries.data ? formatHours(sumHours(entries.data), lang) : '–'}
          </dd>
        </dl>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => {
            setSavedOtherYear(null);
            setAdding(true);
          }}
        >
          {t('hours.add')}
        </button>
      </div>

      {savedOtherYear !== null && (
        <p className="notice" role="status">
          {t('hours.savedOtherYear', { year: savedOtherYear })}
        </p>
      )}

      {entries.isPending && <p className="muted">{t('app.loading')}</p>}
      {entries.isError && (
        <div className="notice notice-error" role="alert">
          <p>{apiErrorMessage(t, entries.error)}</p>
          <button type="button" className="btn btn-small" onClick={() => void entries.refetch()}>
            {t('app.retry')}
          </button>
        </div>
      )}
      {entries.data && entries.data.length === 0 && (
        <p className="muted empty">{t('hours.empty', { year })}</p>
      )}
      {entries.data &&
        groupByMonth(entries.data).map((group) => {
          const monthName = t(`hours.months.m${group.month}`);
          return (
            <section key={group.month} className="hours-month" aria-label={monthName}>
              <div className="hours-month-head">
                <h2>{monthName}</h2>
                <span className="num" aria-label={`${t('hours.monthTotal')} ${monthName}`}>
                  {formatHours(group.total, lang)}
                </span>
              </div>
              <HourEntryList entries={group.entries} editable />
            </section>
          );
        })}

      {adding && (
        <HourEntryForm
          onClose={() => setAdding(false)}
          onSaved={(entry) => {
            setAdding(false);
            const entryYear = Number(entry.date.slice(0, 4));
            if (entryYear !== year) setSavedOtherYear(entryYear);
          }}
        />
      )}
    </div>
  );
}
