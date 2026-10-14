import { useMutation } from '@tanstack/react-query';
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, RotateCcw, Search } from 'lucide-react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import type { GigDisplayStatus } from '../../api/enums';
import { gigsApi } from '../../api/endpoints';
import type { GigListQuery, GigSummary, Partner, YearGigTotals } from '../../api/types';
import { useSelectedYear } from '../../auth/SignedInContext';
import { Button } from '../../components/Button';
import { buttonClass } from '../../components/buttonClass';
import { ExcelTable } from '../../components/ExcelTable';
import {
  applyTableState,
  useUrlTableState,
  type ExcelColumn,
  type ExcelTableState,
  type TableFilters,
} from '../../components/excelTableState';
import { Notice } from '../../components/Notice';
import { PageHead } from '../../components/PageHead';
import { SectionLabel } from '../../components/SectionLabel';
import { StatGrid, StatTile } from '../../components/StatTile';
import { StatusTag } from '../../components/StatusTag';
import { apiErrorMessage, gigDisplayStatus } from '../../i18n/labels';
import { useLang } from '../../i18n/useLang';
import { formatDate, formatDateRange, formatMoney, formatPercent, todayIso } from '../../lib/format';
import { useReference } from '../../reference/useReference';
import { GigStatusTag } from './GigStatusTag';
import { useApplyGig, useGigList } from './queries';
import './gigList.css';

/** Order of the status filter values and of the status sort. */
const GIG_DISPLAY_STATUSES: GigDisplayStatus[] = ['SOLD', 'PLAYED', 'CANCELLED'];
/** UC-003 AC-1: the list opens with the SOLD gigs (sold + played); cancelled via the Tila filter. */
const DEFAULT_STATUS_FILTER: GigDisplayStatus[] = ['SOLD', 'PLAYED'];
/** Default order (UC-003 step 1): by date. */
const DEFAULT_SORT = { key: 'date', dir: 'asc' } as const;

/** Filter values in the order of a code list (unknown values last). */
const byCodeOrder =
  (codes: readonly string[]) =>
  (a: string, b: string): number => {
    const ia = codes.indexOf(a);
    const ib = codes.indexOf(b);
    return (ia < 0 ? codes.length : ia) - (ib < 0 ? codes.length : ib);
  };

function partnerName(partners: Partner[] | undefined, id: string): string {
  return partners?.find((p) => p.id === id)?.name ?? '–';
}

/**
 * Gigs of the selected year (UC-003, UC-025): year summary (unfiltered), search, Excel-style table
 * with column filters (ExcelTable; filters and sort in the URL, client-side over the year's
 * gigs), Deleted view.
 */
export function GigListPage() {
  const { t } = useTranslation();
  const lang = useLang();
  const year = useSelectedYear();
  const { data: reference } = useReference();
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  // Read once: the table state updates replace the history entry, which drops `location.state`.
  const [deletedNotice] = useState(() => (location.state as { notice?: string } | null)?.notice === 'deleted');

  const deletedView = params.get('view') === 'deleted';
  const urlTableState = useUrlTableState({ defaultSort: DEFAULT_SORT });
  const tableState = useDefaultStatusFilter(urlTableState);
  const [search, setSearch] = useState(params.get('q') ?? '');
  const q = useDeferredValue(search.trim());

  const setParam = (key: string, value: string | null) => {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value) next.set(key, value);
        else next.delete(key);
        return next;
      },
      { replace: true },
    );
  };

  useEffect(() => {
    if ((params.get('q') ?? '') === q) return;
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (q) next.set('q', q);
        else next.delete('q');
        return next;
      },
      { replace: true },
    );
  }, [q, params, setParams]);

  // The column filters are client-side over all of the year's gigs (design.md); only the search
  // goes to the API.
  const query: GigListQuery = deletedView
    ? { year, status: 'ALL', deleted: true, q: q || undefined }
    : { year, status: 'ALL', q: q || undefined };
  const list = useGigList(query);
  const applyGig = useApplyGig();
  const restore = useMutation({
    mutationFn: (id: string) => gigsApi.restore(id),
    onSuccess: (gig) => applyGig(gig, gig.id),
  });
  const filtered = Boolean(q);

  const newGigLink = (
    <Link to="/gigs/new" className={buttonClass({ className: 'gig-new-link' })}>
      <Plus className="btn-icon" />
      {t('gigs.newGig')}
    </Link>
  );

  return (
    <section className="page gig-list-page">
      <PageHead
        title={t('pages.gigs', { year })}
        subtitle={list.data ? <YearSubtitle totals={list.data.yearSummary} /> : undefined}
        actions={newGigLink}
      />

      {deletedNotice && <Notice role="status">{t('gig.notice.deleted')}</Notice>}

      {list.data && <YearSummary totals={list.data.yearSummary} />}

      <div className="gig-toolbar">
        <div className="segmented gig-view-switch" role="group" aria-label={t('gigs.viewLabel')}>
          <button type="button" aria-pressed={!deletedView} onClick={() => setParam('view', null)}>
            {t('gigs.views.active')}
          </button>
          <button type="button" aria-pressed={deletedView} onClick={() => setParam('view', 'deleted')}>
            {t('gigs.views.deleted')}
          </button>
        </div>

        {/* The column filters live in the table headers (ExcelTable); the search stays here. */}
        <div className="gig-search">
          <label htmlFor="gig-search">{t('gigs.search')}</label>
          <div className="gig-search-input">
            <Search className="gig-search-icon" />
            <input
              id="gig-search"
              type="search"
              value={search}
              placeholder={t('gigs.searchPlaceholder')}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
      </div>

      {deletedView && restore.isError && (
        <Notice tone="danger" role="alert">
          {apiErrorMessage(t, restore.error)}
        </Notice>
      )}
      {deletedView && restore.isSuccess && (
        <Notice tone="ok" role="status">
          {t('gigs.restored')}{' '}
          <Link to={`/gigs/${restore.data.id}`}>
            {restore.data.lineupName} · {restore.data.venue}
          </Link>
        </Notice>
      )}

      {list.isPending && (
        <p role="status" className="meta">
          {t('app.loading')}
        </p>
      )}
      {list.isError && (
        <Notice tone="danger" role="alert" className="gig-list-error">
          {apiErrorMessage(t, list.error)}{' '}
          <Button size="sm" onClick={() => void list.refetch()}>
            {t('app.retry')}
          </Button>
        </Notice>
      )}
      {list.data &&
        (list.data.gigs.length === 0 ? (
          <div className="gig-empty">
            <p>
              {deletedView
                ? t('gigs.emptyDeleted', { year })
                : filtered
                  ? t('gigs.emptyFiltered')
                  : t('gigs.empty', { year })}
            </p>
            {!deletedView && !filtered && newGigLink}
          </div>
        ) : deletedView ? (
          <DeletedList gigs={list.data.gigs} onRestore={(id) => restore.mutate(id)} pending={restore.isPending} />
        ) : (
          <GigTable gigs={list.data.gigs} partners={reference?.partners} lang={lang} tableState={tableState} />
        ))}
    </section>
  );
}

/**
 * UC-003 AC-1: the list opens with the SOLD gigs (Myyty + Soitettu); "Näytä myös perutut" is now
 * the Tila filter. While the URL has no status filter and nobody has changed the filters on this
 * visit, the table shows the default status filter (not written to the URL, so a plain /gigs link
 * stays the default view). After the first filter change the URL alone counts, so "Valitse
 * kaikki" / "Tyhjennä suodattimet" really show every status.
 */
function useDefaultStatusFilter(state: ExcelTableState): ExcelTableState {
  const [touched, setTouched] = useState(false);
  const { filters, onFiltersChange } = state;
  const effective = useMemo(
    () => (touched || filters.status !== undefined ? filters : { ...filters, status: DEFAULT_STATUS_FILTER }),
    [touched, filters],
  );
  const change = useCallback(
    (next: TableFilters) => {
      setTouched(true);
      onFiltersChange(next);
    },
    [onFiltersChange],
  );
  return { ...state, filters: effective, onFiltersChange: change };
}

/** Mono line under the page title: gig count and sold gigs sum. */
function YearSubtitle({ totals }: { totals: YearGigTotals }) {
  const { t } = useTranslation();
  const lang = useLang();
  return (
    <>
      {`${t('gigs.gigCount')} ${totals.gigCount} · ${t('gigs.soldGigsSum')} ${formatMoney(totals.soldGigsSumCents, lang)}`}
    </>
  );
}

function YearSummary({ totals }: { totals: YearGigTotals }) {
  const { t } = useTranslation();
  const lang = useLang();
  const items: [string, string][] = [
    [t('gigs.gigCount'), String(totals.gigCount)],
    [t('gigs.soldGigsSum'), formatMoney(totals.soldGigsSumCents, lang)],
    [t('gigs.budgetedCosts'), formatMoney(totals.budgetedCostsCents, lang)],
    [t('gigs.actualCosts'), formatMoney(totals.actualCostsCents, lang)],
    [t('gigs.marginBudget'), formatMoney(totals.marginBudgetCents, lang)],
    [t('gigs.marginActual'), formatMoney(totals.marginActualCents, lang)],
  ];
  return (
    <section className="gig-year-summary" aria-labelledby="gig-year-summary-title">
      <SectionLabel id="gig-year-summary-title">{t('gigs.summaryTitle')}</SectionLabel>
      <StatGrid className="gig-stat-grid">
        {items.map(([label, value]) => (
          <StatTile key={label} label={label} value={value} />
        ))}
      </StatGrid>
      {totals.cancelledCount > 0 && (
        <p className="meta gig-cancelled-count">{t('gigs.cancelledCount', { count: totals.cancelledCount })}</p>
      )}
    </section>
  );
}

const FIRST_UPCOMING = 'is-first-upcoming';

/** Scrolls the first upcoming gig into view once (UC-003 step 1). */
function useScrollToFirstUpcoming(firstUpcomingId: string | undefined) {
  const containerRef = useRef<HTMLDivElement>(null);
  const scrolled = useRef(false);
  useEffect(() => {
    const target = containerRef.current?.querySelector(`.${FIRST_UPCOMING}`);
    if (scrolled.current || !target) return;
    scrolled.current = true;
    if (typeof target.scrollIntoView === 'function') {
      target.scrollIntoView({ block: 'center' });
    }
  }, [firstUpcomingId]);
  return containerRef;
}

/** Ties in the gig table (and the order without a sort): start date, then lineup, then venue. */
function gigTieBreak(a: GigSummary, b: GigSummary): number {
  return (
    a.startDate.localeCompare(b.startDate) ||
    a.lineupName.localeCompare(b.lineupName) ||
    a.venue.localeCompare(b.venue)
  );
}

interface GigTableProps {
  gigs: GigSummary[];
  partners: Partner[] | undefined;
  lang: 'fi' | 'en';
  tableState: ExcelTableState;
}

/**
 * Date or date range for the table, never breaking inside a date. The text is the same as
 * `formatDateRange`.
 */
function TableDateRange({ start, end, lang }: { start: string; end: string | null; lang: 'fi' | 'en' }) {
  if (!end || end === start) return <span className="gig-date-part">{formatDate(start, lang)}</span>;
  // One wrapper, so a phone card (flex row: label | value) keeps the range together.
  return (
    <span className="gig-date-range">
      <span className="gig-date-part">{formatDate(start, lang)}–</span>
      <span className="gig-date-part">{formatDate(end, lang)}</span>
    </span>
  );
}

/**
 * Excel-style table (UC-003 change 2026-10-14, design.md "Excel-style tables"), the same component
 * and look as the offer list: every column sortable, filter icons on the coded / text columns, one
 * line per row from 600 px with the lineup column pinned on horizontal scroll. Phones (< 600 px):
 * one card per gig + the "Suodattimet" sheet. Scrolls the first upcoming visible gig into view.
 */
function GigTable({ gigs, partners, lang, tableState }: GigTableProps) {
  const { t } = useTranslation();
  const clientNames = useMemo(
    () => new Map(gigs.filter((g) => g.clientId).map((g) => [g.clientId!, g.clientName ?? '–'])),
    [gigs],
  );
  const statusLabel = (s: GigDisplayStatus) => t(`gigStatus.${s}`);

  const columns: ExcelColumn<GigSummary>[] = [
    {
      key: 'lineup',
      label: t('gigs.columns.lineup'),
      primary: true,
      className: 'gig-col-lineup',
      sortValue: (g) => g.lineupName,
      filterValue: (g) => g.lineupName,
      cell: (g) => (
        <Link to={`/gigs/${g.id}`} className="gig-link">
          {g.lineupName}{' '}
          {/* The venue has its own column; the link name stays "Lineup · Venue" (unique per gig). */}
          <span className="visually-hidden">· {g.venue}</span>
        </Link>
      ),
    },
    {
      key: 'date',
      label: t('gigs.columns.date'),
      className: 'gig-col-date',
      sortValue: (g) => g.startDate,
      cell: (g) => <TableDateRange start={g.startDate} end={g.endDate} lang={lang} />,
    },
    {
      key: 'venue',
      label: t('gigs.columns.venue'),
      sortValue: (g) => g.venue,
      filterValue: (g) => g.venue,
      cell: (g) => g.venue,
    },
    {
      key: 'client',
      label: t('clients.gigColumn'),
      sortValue: (g) => g.clientName,
      filterValue: (g) => g.clientId,
      filterLabel: (id) => clientNames.get(id) ?? '–',
      cell: (g) =>
        g.clientId ? (
          <Link to={`/clients/${g.clientId}`} className="gig-client-link">
            {g.clientName ?? '–'}
          </Link>
        ) : (
          '–'
        ),
    },
    {
      key: 'status',
      label: t('gigs.columns.status'),
      sortValue: (g) => GIG_DISPLAY_STATUSES.indexOf(gigDisplayStatus(g)),
      filterValue: (g) => gigDisplayStatus(g),
      filterLabel: (v) => statusLabel(v as GigDisplayStatus),
      filterCompare: byCodeOrder(GIG_DISPLAY_STATUSES),
      cell: (g) => <GigStatusTag status={gigDisplayStatus(g)} />,
    },
    {
      key: 'staffing',
      label: t('gigs.notFullyStaffed'),
      className: 'gig-col-staffing',
      sortValue: (g) => (g.notFullyStaffed ? 0 : 1),
      filterValue: (g) => (g.notFullyStaffed ? 'yes' : 'no'),
      filterLabel: (v) => t(v === 'yes' ? 'gigs.staffingFilter.yes' : 'gigs.staffingFilter.no'),
      filterCompare: byCodeOrder(['yes', 'no']),
      cell: (g) =>
        g.notFullyStaffed ? <StatusTag tone="warn">{t('gigs.notFullyStaffed')}</StatusTag> : <span aria-hidden="true">–</span>,
    },
    {
      key: 'seller',
      label: t('gigs.seller'),
      sortValue: (g) => partnerName(partners, g.sellerId),
      filterValue: (g) => g.sellerId,
      filterLabel: (id) => partnerName(partners, id),
      cell: (g) => partnerName(partners, g.sellerId),
    },
    {
      key: 'producer',
      label: t('gigs.producer'),
      sortValue: (g) => partnerName(partners, g.producerId),
      filterValue: (g) => g.producerId,
      filterLabel: (id) => partnerName(partners, id),
      cell: (g) => partnerName(partners, g.producerId),
    },
    {
      key: 'total',
      label: t('gigs.totalPrice'),
      numeric: true,
      className: 'gig-col-total',
      sortValue: (g) => g.totalPriceCents,
      cell: (g) => formatMoney(g.totalPriceCents, lang),
    },
    {
      key: 'budgeted',
      label: t('gigs.budgetedCosts'),
      numeric: true,
      sortValue: (g) => g.budgetedCostsCents,
      cell: (g) => formatMoney(g.budgetedCostsCents, lang),
    },
    {
      key: 'actual',
      label: t('gigs.actualCosts'),
      numeric: true,
      sortValue: (g) => g.actualCostsCents,
      cell: (g) => formatMoney(g.actualCostsCents, lang),
    },
    {
      key: 'margin',
      label: t('gigs.marginPct'),
      numeric: true,
      sortValue: (g) => g.marginBudgetPct,
      cell: (g) => (
        <span>
          {formatPercent(g.marginBudgetPct, lang)}
          <span className="gig-margin-actual">
            {' '}
            {t('gigs.actualShort')} {formatPercent(g.marginActualPct, lang)}
          </span>
        </span>
      ),
    },
  ];

  // UC-003 step 1: scroll to the first upcoming gig among the rows shown.
  const today = todayIso();
  const visible = useMemo(
    () => applyTableState(gigs, columns, tableState, gigTieBreak),
    // `columns` is rebuilt each render; the rows only depend on the data and the state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [gigs, tableState.sort, tableState.filters],
  );
  const firstUpcomingId = visible.find((g) => g.startDate >= today)?.id;
  const containerRef = useScrollToFirstUpcoming(firstUpcomingId);

  return (
    <div ref={containerRef} className="gig-rows-wrap">
      <ExcelTable
        {...tableState}
        className="gig-table"
        caption={t('gigs.listLabel')}
        columns={columns}
        rows={gigs}
        rowKey={(g) => g.id}
        tieBreak={gigTieBreak}
        emptyFiltered={t('gigs.emptyColumnFiltered')}
        rowClassName={(g) =>
          [`status-${gigDisplayStatus(g).toLowerCase()}`, g.id === firstUpcomingId && FIRST_UPCOMING]
            .filter(Boolean)
            .join(' ')
        }
      />
    </div>
  );
}

function DeletedList({
  gigs,
  onRestore,
  pending,
}: {
  gigs: GigSummary[];
  onRestore: (id: string) => void;
  pending: boolean;
}) {
  const { t } = useTranslation();
  const lang = useLang();
  return (
    <ul className="gig-deleted-list" aria-label={t('gigs.views.deleted')}>
      {gigs.map((gig) => (
        <li key={gig.id} className="gig-deleted-row">
          <span className="gig-date">{formatDateRange(gig.startDate, gig.endDate, lang)}</span>
          <span className="gig-main">
            <Link to={`/gigs/${gig.id}`} className="gig-link">
              {gig.lineupName} · {gig.venue}
            </Link>
            <span className="gig-deleted-meta">
              <GigStatusTag status={gigDisplayStatus(gig)} />
              <span className="meta">{t('gigs.deletedAt', { date: formatDate(gig.deletedAt, lang) })}</span>
            </span>
          </span>
          <Button
            size="sm"
            icon={RotateCcw}
            className="gig-restore"
            disabled={pending}
            onClick={() => onRestore(gig.id)}
            aria-label={`${t('gigs.restore')}: ${gig.lineupName} · ${gig.venue}`}
          >
            {t('gigs.restore')}
          </Button>
        </li>
      ))}
    </ul>
  );
}

