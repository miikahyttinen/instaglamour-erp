import { ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import type { Language } from '../../api/enums';
import type { EventSummary, Partner, YearPage as YearPageData } from '../../api/types';
import { useSelectedYear } from '../../auth/SignedInContext';
import { Button } from '../../components/Button';
import { DataTable, type DataTableColumn } from '../../components/DataTable';
import { MiniBars } from '../../components/MiniBars';
import { Notice } from '../../components/Notice';
import { PageHead } from '../../components/PageHead';
import { PageYearSelector } from '../../components/PageYearSelector';
import { SectionLabel } from '../../components/SectionLabel';
import { StatusTag } from '../../components/StatusTag';
import { apiErrorMessage } from '../../i18n/labels';
import { useLang } from '../../i18n/useLang';
import { formatDateRange, formatHours, formatMoney } from '../../lib/format';
import { useReference } from '../../reference/useReference';
import { useYearPage } from './queries';
import './YearPage.css';

/** Year page (UC-022): the selected year at a glance. Home route `/`. */
export function YearPage() {
  const { t } = useTranslation();
  const lang = useLang();
  const year = useSelectedYear();
  const query = useYearPage(year);
  const data = query.data;

  return (
    <section className="page year-page">
      <PageHead
        title={t('pages.year', { year })}
        subtitle={
          data &&
          t('year.summary', { events: data.events.eventCount, hours: formatHours(data.hours.grandTotal, lang) })
        }
        actions={
          data && (
            <LinkTile
              to="/budget"
              label={t('year.budget.yearResult')}
              value={formatMoney(data.yearResultCents, lang)}
              className="year-result"
            />
          )
        }
      >
        <PageYearSelector />
      </PageHead>
      {query.isPending && (
        <p className="muted" role="status">
          {t('app.loading')}
        </p>
      )}
      {query.isError && (
        <Notice tone="danger" role="alert">
          <p>{apiErrorMessage(t, query.error)}</p>
          <Button size="sm" onClick={() => void query.refetch()}>
            {t('app.retry')}
          </Button>
        </Notice>
      )}
      {data && <YearContent data={data} />}
    </section>
  );
}

function YearContent({ data }: { data: YearPageData }) {
  return (
    <div className="year-layout">
      <EventsSection data={data} />
      <HoursSection data={data} />
      <BudgetSection data={data} />
      <UpcomingSection data={data} />
    </div>
  );
}

/**
 * Stat tile that is a link (the shared StatTile is a region, not a link). Same classes as
 * StatTile; `year-fig*` classes mark each label/value pair (also used by the tests).
 */
function LinkTile({
  to,
  label,
  value,
  className,
  children,
}: {
  to: string;
  label: string;
  value: ReactNode;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <Link to={to} className={['stat-tile year-tile year-fig', className].filter(Boolean).join(' ')}>
      <span className="label year-fig-label">{label}</span>
      <span className="stat-tile-value year-fig-value">{value}</span>
      {children}
    </Link>
  );
}

/** Smaller second figure inside a tile: value + mono caption. */
function Secondary({ label, value }: { label: string; value: ReactNode }) {
  return (
    <span className="stat-tile-secondary year-fig">
      <span className="stat-tile-secondary-value year-fig-value">{value}</span>
      <span className="meta year-fig-label">{label}</span>
    </span>
  );
}

/**
 * Caption + figure on one line, caption first (so the tile's accessible name reads
 * "Budjetti 3 000 €"); in a narrow tile the figure wraps under its caption.
 */
function LabelledFigure({ label, value }: { label: string; value: ReactNode }) {
  return (
    <span className="stat-tile-secondary year-fig year-labelled-fig">
      <span className="meta year-fig-label">{label}</span>
      <span className="stat-tile-secondary-value year-fig-value">{value}</span>
    </span>
  );
}

function SectionHead({ id, title, to }: { id: string; title: string; to: string }) {
  return (
    <SectionLabel id={id} className="year-section-head">
      <Link to={to}>
        {title}
        <ChevronRight className="year-section-chevron" />
      </Link>
    </SectionLabel>
  );
}

/** Budget vs actual as two mini bars (actual highlighted). */
function budgetBars(budgetLabel: string, actualLabel: string, budget: number, actual: number, lang: Language) {
  return [
    { label: budgetLabel, value: budget, valueText: formatMoney(budget, lang) },
    { label: actualLabel, value: actual, valueText: formatMoney(actual, lang), current: true },
  ];
}

function EventsSection({ data }: { data: YearPageData }) {
  const { t } = useTranslation();
  const lang = useLang();
  const g = data.events;
  const budget = t('year.budget.budget');
  const actual = t('year.budget.actual');
  return (
    <section className="year-section year-events" aria-labelledby="year-events">
      <SectionHead id="year-events" title={t('year.events.title')} to="/gigs" />
      <div className="stat-grid year-tiles">
        <LinkTile to="/gigs" label={t('year.events.eventCount')} value={g.eventCount}>
          <Secondary label={t('year.events.cancelledCount')} value={g.cancelledCount} />
        </LinkTile>
        <LinkTile to="/gigs" label={t('year.events.soldEventsSum')} value={formatMoney(g.soldEventsSumCents, lang)} />
        {/* Costs: one tile, budget and actual as equal labelled figures. */}
        <Link to="/gigs" className="stat-tile year-tile year-costs">
          <span className="label">{t('year.events.costs')}</span>
          <LabelledFigure label={budget} value={formatMoney(g.budgetedCostsCents, lang)} />
          <LabelledFigure label={actual} value={formatMoney(g.actualCostsCents, lang)} />
          <div className="stat-tile-bars">
            <MiniBars
              label={t('year.events.costsChart')}
              bars={budgetBars(budget, actual, g.budgetedCostsCents, g.actualCostsCents, lang)}
              compact
            />
          </div>
        </Link>
        <LinkTile to="/gigs" label={t('year.events.marginBudget')} value={formatMoney(g.marginBudgetCents, lang)}>
          <Secondary label={t('year.events.marginActual')} value={formatMoney(g.marginActualCents, lang)} />
          <div className="stat-tile-bars">
            <MiniBars
              label={t('year.events.marginChart')}
              bars={budgetBars(budget, actual, g.marginBudgetCents, g.marginActualCents, lang)}
              compact
            />
          </div>
        </LinkTile>
      </div>
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
  const max = Math.max(0, ...rows.map((r) => r.total));
  return (
    <section className="year-section year-hours" aria-labelledby="year-hours">
      <SectionHead id="year-hours" title={t('year.hours.title')} to="/hours" />
      <LinkTile to="/hours" label={t('year.hours.total')} value={formatHours(data.hours.grandTotal, lang)}>
        <span className="year-partners">
          {rows.map((r) => (
            <span key={r.id} className="year-partner year-fig">
              <span className="year-partner-name year-fig-label">{r.name}</span>
              <span className="year-partner-hours year-fig-value">{formatHours(r.total, lang)}</span>
              <span className="year-partner-track" aria-hidden="true">
                <span
                  className="year-partner-bar"
                  style={{ width: `${max > 0 ? (Math.max(0, r.total) / max) * 100 : 0}%` }}
                />
              </span>
            </span>
          ))}
        </span>
      </LinkTile>
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
    <section className="year-section year-budget" aria-labelledby="year-budget">
      <SectionHead id="year-budget" title={t('year.budget.title')} to="/budget" />
      <div className="table-wrap">
        <table className="data-table year-budget-table">
          <caption className="visually-hidden">{t('year.budget.title')}</caption>
          <thead>
            <tr>
              <th scope="col">
                <span className="visually-hidden">{t('year.budget.category')}</span>
              </th>
              <th scope="col" className="num">
                {t('year.budget.budget')}
              </th>
              <th scope="col" className="num">
                {t('year.budget.actual')}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([label, budget, actual]) => (
              <tr key={label}>
                <th scope="row">{label}</th>
                <td className="num">
                  <Link to="/budget">{formatMoney(budget, lang)}</Link>
                </td>
                <td className="num">
                  <Link to="/budget">{formatMoney(actual, lang)}</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function UpcomingSection({ data }: { data: YearPageData }) {
  const { t } = useTranslation();
  const lang = useLang();
  const columns: DataTableColumn<EventSummary>[] = [
    {
      key: 'date',
      phoneBare: true,
      label: t('year.upcoming.date'),
      className: 'year-upcoming-date',
      cell: (event) => formatDateRange(event.startDate, event.endDate, lang),
    },
    {
      key: 'event',
      label: t('year.upcoming.event'),
      primary: true,
      cell: (event) => (
        <Link to={`/gigs/${event.id}`} className="year-upcoming-link">
          {event.lineupName} · {event.venue}
        </Link>
      ),
    },
    {
      key: 'staffing',
      phoneBare: true,
      label: t('year.upcoming.staffing'),
      className: 'year-upcoming-staffing',
      cell: (event) => event.notFullyStaffed && <StatusTag tone="warn">{t('year.upcoming.notFullyStaffed')}</StatusTag>,
    },
  ];
  return (
    <section className="year-section year-upcoming" aria-labelledby="year-upcoming">
      <SectionHead id="year-upcoming" title={t('year.upcoming.title')} to="/gigs" />
      <DataTable
        columns={columns}
        rows={data.upcomingEvents}
        rowKey={(event) => event.id}
        caption={t('year.upcoming.title')}
        empty={t('year.upcoming.none')}
        className="year-upcoming-table"
      />
    </section>
  );
}
