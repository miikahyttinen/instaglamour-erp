import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import type { Id } from '../../api/types';
import { useSelectedYear, useSignedInPartner } from '../../auth/SignedInContext';
import { Button } from '../../components/Button';
import { MiniBars } from '../../components/MiniBars';
import { SectionLabel } from '../../components/SectionLabel';
import { StatGrid, StatTile } from '../../components/StatTile';
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
      <SectionLabel as="h3">{title}</SectionLabel>
      {entries.isPending && <p className="muted">{t('app.loading')}</p>}
      {entries.isError && (
        <p className="notice notice-error" role="alert">
          {apiErrorMessage(t, entries.error)}
        </p>
      )}
      {entries.data && monthEntries.length === 0 && (
        <p className="muted small">{t('hours.emptyMonth')}</p>
      )}
      {monthEntries.length > 0 && <HourEntryList entries={monthEntries} editable={own} />}
      {!own && monthEntries.length > 0 && <p className="meta hours-read-only">{t('hours.readOnly')}</p>}
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

  const monthBars = (hoursOf: (month: number) => number, current: number | null) =>
    MONTHS.map((month) => {
      const hours = hoursOf(month);
      return {
        label: t(`hours.monthsShort.m${month}`),
        value: hours,
        valueText: formatHours(hours, lang),
        current: current === month,
      };
    });

  if (totals.isPending || totals.isError) {
    return (
      <>
        {totals.isPending ? (
          <p className="muted">{t('app.loading')}</p>
        ) : (
          <div className="notice notice-error" role="alert">
            <p>{apiErrorMessage(t, totals.error)}</p>
            <Button size="sm" onClick={() => void totals.refetch()}>
              {t('app.retry')}
            </Button>
          </div>
        )}
      </>
    );
  }

  const partners = totals.data.partners;
  const allMonths = (month: number) =>
    partners.reduce((sum, row) => sum + (row.months[month - 1] ?? 0), 0);

  return (
    <>
      <StatGrid className="hours-stats">
        <StatTile
          label={t('hours.grandTotal')}
          value={<span data-testid="hours-grand-total">{formatHours(totals.data.grandTotal, lang)}</span>}
          bars={monthBars(allMonths, null)}
          barsLabel={t('hours.perMonth')}
        />
      </StatGrid>

      <SectionLabel>{t('hours.partners')}</SectionLabel>
      <div className="hours-partners">
        {partners.map((row) => {
          const name = partnerName(row.partnerId);
          const open = selectedPartner === row.partnerId && selectedMonth !== null;
          return (
            <section key={row.partnerId} className="card hours-partner" aria-label={name}>
              <div className="hours-partner-head">
                <h2 className="label hours-partner-name">{name}</h2>
                <span className="hours-partner-total" aria-label={`${t('hours.total')} ${name}`}>
                  {formatHours(row.total, lang)}
                </span>
              </div>
              <MiniBars
                bars={monthBars((month) => row.months[month - 1] ?? 0, open ? selectedMonth : null)}
                label={t('hours.perMonthOf', { partner: name })}
                showLabels={false}
              />
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
                      <span className="hours-month-cell-label">{t(`hours.monthsShort.m${month}`)}</span>
                      <span className="hours-month-cell-value">{formatHours(hours, lang)}</span>
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
    </>
  );
}
