import { ChevronDown, ChevronRight } from 'lucide-react';
import { Fragment, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import type { Id } from '../../api/types';
import { useSelectedYear, useSignedInPartner } from '../../auth/SignedInContext';
import { Button } from '../../components/Button';
import { SectionLabel } from '../../components/SectionLabel';
import { StatGrid, StatTile } from '../../components/StatTile';
import { apiErrorMessage } from '../../i18n/labels';
import { useLang } from '../../i18n/useLang';
import { formatHours } from '../../lib/format';
import { useReference } from '../../reference/useReference';
import { HourMonthGroups } from './HourMonthGroups';
import { partnerHourRows } from './hoursLogic';
import { useHourEntries, useHoursTotals } from './queries';

/** One partner's entries of the year by month; own entries editable inline, others read-only. */
function PartnerEntries({ id, partnerId, partnerName }: { id: string; partnerId: Id; partnerName: string }) {
  const { t } = useTranslation();
  const year = useSelectedYear();
  const me = useSignedInPartner();
  const entries = useHourEntries(year, partnerId);
  const own = partnerId === me.id;
  const [savedOtherYear, setSavedOtherYear] = useState<number | null>(null);

  return (
    <section id={id} className="hours-partner-entries" aria-label={t('hours.partnerEntries', { partner: partnerName, year })}>
      {entries.isPending && <p className="muted">{t('app.loading')}</p>}
      {entries.isError && (
        <div className="notice notice-error" role="alert">
          <p>{apiErrorMessage(t, entries.error)}</p>
          <Button size="sm" onClick={() => void entries.refetch()}>
            {t('app.retry')}
          </Button>
        </div>
      )}
      {savedOtherYear !== null && (
        <p className="notice" role="status">
          {t('hours.savedOtherYear', { year: savedOtherYear })}
        </p>
      )}
      {entries.data && entries.data.length === 0 && <p className="muted small">{t('hours.empty', { year })}</p>}
      {entries.data && entries.data.length > 0 && (
        <>
          {!own && <p className="meta hours-read-only">{t('hours.readOnly')}</p>}
          <HourMonthGroups
            entries={entries.data}
            editable={own}
            headingAs="h3"
            onSaved={(entry) => {
              const entryYear = Number(entry.date.slice(0, 4));
              if (entryYear !== year) setSavedOtherYear(entryYear);
            }}
          />
        </>
      )}
    </section>
  );
}

/**
 * Hours summary (UC-019): the year total, then every partner's year hours as a plain list
 * (most hours first) with a total row. A partner row expands to that partner's entries by month.
 */
export function HoursTotalsPage() {
  const { t } = useTranslation();
  const lang = useLang();
  const year = useSelectedYear();
  const totals = useHoursTotals(year);
  const reference = useReference();
  const [params, setParams] = useSearchParams();
  const headingId = useId();
  const panelPrefix = useId();
  const openPartner = params.get('partner');

  const toggle = (partnerId: Id) => {
    if (openPartner === partnerId) setParams({}, { replace: true });
    else setParams({ partner: partnerId }, { replace: true });
  };

  if (totals.isPending || totals.isError) {
    return totals.isPending ? (
      <p className="muted">{t('app.loading')}</p>
    ) : (
      <div className="notice notice-error" role="alert">
        <p>{apiErrorMessage(t, totals.error)}</p>
        <Button size="sm" onClick={() => void totals.refetch()}>
          {t('app.retry')}
        </Button>
      </div>
    );
  }

  const rows = partnerHourRows(
    totals.data,
    reference.data?.partners ?? [],
    t('hours.unknownPartner'),
    lang === 'fi' ? 'fi-FI' : 'en-GB',
  );
  const grandTotal = totals.data.grandTotal;

  return (
    <>
      <StatGrid className="hours-stats">
        <StatTile
          label={t('hours.total')}
          value={<span data-testid="hours-grand-total">{formatHours(grandTotal, lang)}</span>}
        />
      </StatGrid>

      <section className="hours-summary" aria-labelledby={headingId}>
        <SectionLabel id={headingId}>{t('hours.partners')}</SectionLabel>
        <div className="table-wrap">
          <table className="data-table hours-summary-table" aria-labelledby={headingId}>
            <thead>
              <tr>
                <th scope="col">{t('hours.partner')}</th>
                <th scope="col" className="num">
                  {t('hours.yearHours', { year })}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const open = openPartner === row.partnerId;
                const panelId = `${panelPrefix}-${row.partnerId}`;
                const Icon = open ? ChevronDown : ChevronRight;
                return (
                  <Fragment key={row.partnerId}>
                    <tr
                      className={['hours-summary-row', open && 'is-open'].filter(Boolean).join(' ')}
                      onClick={(e) => {
                        // The button handles its own clicks (and keyboard); the rest of the row is a
                        // bigger tap target for the same action.
                        if (!(e.target as HTMLElement).closest('button')) toggle(row.partnerId);
                      }}
                    >
                      <th scope="row">
                        <button
                          type="button"
                          className="hours-summary-toggle"
                          aria-expanded={open}
                          aria-controls={open ? panelId : undefined}
                          onClick={() => toggle(row.partnerId)}
                        >
                          <Icon className="hours-summary-icon" aria-hidden="true" />
                          {row.name}
                        </button>
                      </th>
                      <td className="num hours-summary-hours">{formatHours(row.total, lang)}</td>
                    </tr>
                    {open && (
                      <tr className="hours-summary-detail">
                        <td colSpan={2}>
                          <PartnerEntries id={panelId} partnerId={row.partnerId} partnerName={row.name} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row">{t('hours.total')}</th>
                <td className="num" data-testid="hours-partners-sum">
                  {formatHours(grandTotal, lang)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>
    </>
  );
}
