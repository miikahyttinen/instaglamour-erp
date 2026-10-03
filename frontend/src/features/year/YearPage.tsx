import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import type { Partner, YearPage as YearPageData } from '../../api/types';
import { useSelectedYear } from '../../auth/SignedInContext';
import { apiErrorMessage } from '../../i18n/labels';
import { useLang } from '../../i18n/useLang';
import { formatDateRange, formatHours, formatMoney } from '../../lib/format';
import { useReference } from '../../reference/useReference';
import { useYearPage } from './queries';
import './YearPage.css';

/** Year page (UC-022): the selected year at a glance. Home route `/`. */
export function YearPage() {
  const { t } = useTranslation();
  const year = useSelectedYear();
  const query = useYearPage(year);

  return (
    <section className="page year-page">
      <h1>{t('pages.year', { year })}</h1>
      {query.isPending && (
        <p className="muted" role="status">
          {t('app.loading')}
        </p>
      )}
      {query.isError && (
        <div className="notice notice-error" role="alert">
          <p>{apiErrorMessage(t, query.error)}</p>
          <button type="button" className="btn" onClick={() => void query.refetch()}>
            {t('app.retry')}
          </button>
        </div>
      )}
      {query.data && <YearContent data={query.data} />}
    </section>
  );
}

function YearContent({ data }: { data: YearPageData }) {
  return (
    <div className="year-grid">
      <GigsSection data={data} />
      <UpcomingSection data={data} />
      <HoursSection data={data} />
      <BudgetSection data={data} />
    </div>
  );
}

function Tile({ to, label, value, wide }: { to: string; label: string; value: ReactNode; wide?: boolean }) {
  return (
    <li className={wide ? 'year-tile-wide' : undefined}>
      <Link to={to} className="stat year-tile">
        <span className="year-tile-label">{label}</span>
        <span className="year-tile-value">{value}</span>
      </Link>
    </li>
  );
}

function SectionHead({ id, title, to }: { id: string; title: string; to: string }) {
  return (
    <h2 id={id} className="year-section-head">
      <Link to={to}>
        {title} <span aria-hidden="true">›</span>
      </Link>
    </h2>
  );
}

function GigsSection({ data }: { data: YearPageData }) {
  const { t } = useTranslation();
  const lang = useLang();
  const g = data.gigs;
  return (
    <section className="year-section" aria-labelledby="year-gigs">
      <SectionHead id="year-gigs" title={t('year.gigs.title')} to="/gigs" />
      <ul className="stats year-tiles">
        <Tile to="/gigs" label={t('year.gigs.gigCount')} value={g.gigCount} />
        <Tile to="/gigs" label={t('year.gigs.cancelledCount')} value={g.cancelledCount} />
        <Tile to="/gigs" label={t('year.gigs.soldGigsSum')} value={formatMoney(g.soldGigsSumCents, lang)} wide />
        <Tile to="/gigs" label={t('year.gigs.budgetedCosts')} value={formatMoney(g.budgetedCostsCents, lang)} />
        <Tile to="/gigs" label={t('year.gigs.actualCosts')} value={formatMoney(g.actualCostsCents, lang)} />
        <Tile to="/gigs" label={t('year.gigs.marginBudget')} value={formatMoney(g.marginBudgetCents, lang)} />
        <Tile to="/gigs" label={t('year.gigs.marginActual')} value={formatMoney(g.marginActualCents, lang)} />
      </ul>
    </section>
  );
}

/** Every partner from reference data (0 h when missing), plus any extra ids in the response. */
function hourRows(data: YearPageData, partners: Partner[] | undefined, unknown: string) {
  const totals = new Map(data.hours.partners.map((p) => [p.partnerId, p.total]));
  const rows = (partners ?? []).map((p) => ({ id: p.id, name: p.name, total: totals.get(p.id) ?? 0 }));
  for (const p of data.hours.partners) {
    if (!rows.some((r) => r.id === p.partnerId)) rows.push({ id: p.partnerId, name: unknown, total: p.total });
  }
  return rows;
}

function HoursSection({ data }: { data: YearPageData }) {
  const { t } = useTranslation();
  const lang = useLang();
  const { data: reference } = useReference();
  const rows = hourRows(data, reference?.partners, t('year.hours.unknownPartner'));
  return (
    <section className="year-section" aria-labelledby="year-hours">
      <SectionHead id="year-hours" title={t('year.hours.title')} to="/hours" />
      <ul className="stats year-tiles">
        {rows.map((r) => (
          <Tile key={r.id} to="/hours" label={r.name} value={formatHours(r.total, lang)} />
        ))}
        <Tile to="/hours" label={t('year.hours.total')} value={formatHours(data.hours.grandTotal, lang)} wide />
      </ul>
    </section>
  );
}

function BudgetSection({ data }: { data: YearPageData }) {
  const { t } = useTranslation();
  const lang = useLang();
  const b = data.budget;
  const rows = [
    [t('year.budget.expense'), b.budgetExpenseCents, b.actualExpenseCents],
    [t('year.budget.income'), b.budgetIncomeCents, b.actualIncomeCents],
  ] as const;
  return (
    <section className="year-section" aria-labelledby="year-budget">
      <SectionHead id="year-budget" title={t('year.budget.title')} to="/budget" />
      <table className="econ-table year-budget-table">
        <thead>
          <tr>
            <th scope="col">
              <span className="visually-hidden">{t('year.budget.category')}</span>
            </th>
            <th scope="col">{t('year.budget.budget')}</th>
            <th scope="col">{t('year.budget.actual')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([label, budget, actual]) => (
            <tr key={label}>
              <th scope="row">{label}</th>
              <td>
                <Link to="/budget">{formatMoney(budget, lang)}</Link>
              </td>
              <td>
                <Link to="/budget">{formatMoney(actual, lang)}</Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <ul className="stats year-tiles year-result">
        <Tile to="/budget" label={t('year.budget.yearResult')} value={formatMoney(data.yearResultCents, lang)} wide />
      </ul>
    </section>
  );
}

function UpcomingSection({ data }: { data: YearPageData }) {
  const { t } = useTranslation();
  const lang = useLang();
  return (
    <section className="year-section" aria-labelledby="year-upcoming">
      <SectionHead id="year-upcoming" title={t('year.upcoming.title')} to="/gigs" />
      {data.upcomingGigs.length === 0 ? (
        <p className="muted">{t('year.upcoming.none')}</p>
      ) : (
        <ul className="year-upcoming" aria-labelledby="year-upcoming">
          {data.upcomingGigs.map((gig) => (
            <li key={gig.id}>
              <Link to={`/gigs/${gig.id}`} className="year-upcoming-link">
                <span className="year-upcoming-date">{formatDateRange(gig.startDate, gig.endDate, lang)}</span>
                <span className="year-upcoming-name">
                  {gig.lineupName} · {gig.venue}
                </span>
                {gig.notFullyStaffed && (
                  <span className="badge badge-warn">{t('year.upcoming.notFullyStaffed')}</span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
