import { Plus } from 'lucide-react';
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useSelectedYear, useSignedInPartner } from '../../auth/SignedInContext';
import { Button } from '../../components/Button';
import { SectionLabel } from '../../components/SectionLabel';
import { StatGrid, StatTile } from '../../components/StatTile';
import { apiErrorMessage } from '../../i18n/labels';
import { useLang } from '../../i18n/useLang';
import { formatHours, todayIso } from '../../lib/format';
import { HourEntryForm } from './HourEntryForm';
import { HourEntryList } from './HourEntryList';
import { groupByMonth, monthTotals, sumHours } from './hoursLogic';
import { useHoursOutlet } from './hoursOutlet';
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
  const { actionsSlot } = useHoursOutlet();

  const today = todayIso();
  const currentMonth = Number(today.slice(0, 4)) === year ? Number(today.slice(5, 7)) : null;
  const bars = entries.data
    ? monthTotals(entries.data).map((hours, i) => ({
        label: t(`hours.monthsShort.m${i + 1}`),
        value: hours,
        valueText: formatHours(hours, lang),
        current: currentMonth === i + 1,
      }))
    : undefined;

  return (
    <>
      {actionsSlot &&
        createPortal(
          <Button
            icon={Plus}
            onClick={() => {
              setSavedOtherYear(null);
              setAdding(true);
            }}
          >
            {t('hours.add')}
          </Button>,
          actionsSlot,
        )}

      <StatGrid className="hours-stats">
        <StatTile
          label={t('hours.yearTotal', { year })}
          value={
            <span data-testid="hours-year-total">
              {entries.data ? formatHours(sumHours(entries.data), lang) : '–'}
            </span>
          }
          caption={entries.data ? t('hours.entryCount', { count: entries.data.length }) : undefined}
          bars={bars}
          barsLabel={t('hours.perMonth')}
        />
      </StatGrid>

      {savedOtherYear !== null && (
        <p className="notice" role="status">
          {t('hours.savedOtherYear', { year: savedOtherYear })}
        </p>
      )}

      {entries.isPending && <p className="muted">{t('app.loading')}</p>}
      {entries.isError && (
        <div className="notice notice-error" role="alert">
          <p>{apiErrorMessage(t, entries.error)}</p>
          <Button size="sm" onClick={() => void entries.refetch()}>
            {t('app.retry')}
          </Button>
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
                <SectionLabel>{monthName}</SectionLabel>
                <span className="hours-month-total" aria-label={`${t('hours.monthTotal')} ${monthName}`}>
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
    </>
  );
}
