import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import type { Id } from '../../api/types';
import { useSelectedYear, useSignedInPartner } from '../../auth/SignedInContext';
import { apiErrorMessage } from '../../i18n/labels';
import { useLang } from '../../i18n/useLang';
import { formatHours } from '../../lib/format';
import { useReference } from '../../reference/useReference';
import { HourEntryList } from './HourEntryList';
import { useHourEntries, useHoursTotals } from './queries';

const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

function MonthEntries({ partnerId, partnerName, month }: { partnerId: Id; partnerName: string; month: number }) {
  const { t } = useTranslation();
  const year = useSelectedYear();
  const me = useSignedInPartner();
  const entries = useHourEntries(year, partnerId);
  const prefix = `${year}-${String(month).padStart(2, '0')}-`;
  const monthEntries = entries.data?.filter((e) => e.date.startsWith(prefix)) ?? [];
  const own = partnerId === me.id;
  const title = t('hours.monthEntries', {
    partner: partnerName,
    month: t(`hours.months.m${month}`),
    year,
  });

  return (
    <section className="hours-month-detail" aria-label={title}>
      <h3>{title}</h3>
      {entries.isPending && <p className="muted">{t('app.loading')}</p>}
      {entries.isError && (
        <p className="notice notice-error" role="alert">
          {apiErrorMessage(t, entries.error)}
        </p>
      )}
      {entries.data && monthEntries.length === 0 && (
        <p className="muted">{t('hours.emptyMonth')}</p>
      )}
      {monthEntries.length > 0 && <HourEntryList entries={monthEntries} editable={own} />}
      {!own && monthEntries.length > 0 && <p className="muted small">{t('hours.readOnly')}</p>}
    </section>
  );
}

/** Every partner's year total and 12 monthly totals, plus the grand total (UC-019). */
export function HoursTotalsPage() {
  const { t } = useTranslation();
  const lang = useLang();
  const year = useSelectedYear();
  const totals = useHoursTotals(year);
  const reference = useReference();
  const [params, setParams] = useSearchParams();
  const selectedPartner = params.get('partner');
  const selectedMonth = Number(params.get('month')) || null;

  const partnerName = (id: Id) =>
    reference.data?.partners.find((p) => p.id === id)?.name ?? '–';

  const toggle = (partnerId: Id, month: number) => {
    if (selectedPartner === partnerId && selectedMonth === month) setParams({}, { replace: true });
    else setParams({ partner: partnerId, month: String(month) }, { replace: true });
  };

  if (totals.isPending) return <p className="muted">{t('app.loading')}</p>;
  if (totals.isError) {
    return (
      <div className="notice notice-error" role="alert">
        <p>{apiErrorMessage(t, totals.error)}</p>
        <button type="button" className="btn btn-small" onClick={() => void totals.refetch()}>
          {t('app.retry')}
        </button>
      </div>
    );
  }

  return (
    <div>
      <dl className="stat hours-grand">
        <dt>{t('hours.grandTotal')}</dt>
        <dd data-testid="hours-grand-total">{formatHours(totals.data.grandTotal, lang)}</dd>
      </dl>
      {totals.data.partners.map((row) => {
        const name = partnerName(row.partnerId);
        const open = selectedPartner === row.partnerId && selectedMonth !== null;
        return (
          <section key={row.partnerId} className="hours-partner" aria-label={name}>
            <div className="hours-month-head">
              <h2>{name}</h2>
              <span className="num" aria-label={`${t('hours.total')} ${name}`}>
                {formatHours(row.total, lang)}
              </span>
            </div>
            <div className="hours-month-grid">
              {MONTHS.map((month) => {
                const hours = row.months[month - 1] ?? 0;
                const pressed = open && selectedMonth === month;
                return (
                  <button
                    key={month}
                    type="button"
                    className="hours-month-cell"
                    aria-pressed={pressed}
                    aria-label={t('hours.showMonth', {
                      partner: name,
                      month: t(`hours.months.m${month}`),
                      hours: formatHours(hours, lang),
                    })}
                    onClick={() => toggle(row.partnerId, month)}
                  >
                    <span className="muted small">{t(`hours.monthsShort.m${month}`)}</span>
                    <span className="num">{formatHours(hours, lang)}</span>
                  </button>
                );
              })}
            </div>
            {open && selectedMonth !== null && (
              <MonthEntries partnerId={row.partnerId} partnerName={name} month={selectedMonth} />
            )}
          </section>
        );
      })}
    </div>
  );
}
