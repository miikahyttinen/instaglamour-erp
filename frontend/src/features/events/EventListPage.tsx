import { useMutation } from '@tanstack/react-query';
import { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, RotateCcw, Search } from 'lucide-react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { INVOICE_STATES, type EventDisplayStatus, type InvoiceState } from '../../api/enums';
import { eventsApi } from '../../api/endpoints';
import type { EventListQuery, EventSummary, Partner, YearEventTotals } from '../../api/types';
import { useSelectedYear } from '../../auth/SignedInContext';
import { Button } from '../../components/Button';
import { buttonClass } from '../../components/buttonClass';
import { ExcelTable } from '../../components/ExcelTable';
import {
  useUrlTableState,
  type ExcelColumn,
  type ExcelTableState,
  type TableFilters,
} from '../../components/excelTableState';
import { Notice } from '../../components/Notice';
import { PageHead } from '../../components/PageHead';
import { PageYearSelector } from '../../components/PageYearSelector';
import { SectionLabel } from '../../components/SectionLabel';
import { StatGrid, StatTile } from '../../components/StatTile';
import { StatusTag } from '../../components/StatusTag';
import { apiErrorMessage, eventDisplayStatus, invoiceStateLabel } from '../../i18n/labels';
import { useLang } from '../../i18n/useLang';
import { formatDate, formatDateRange, formatMoney, formatPercent } from '../../lib/format';
import { useReference } from '../../reference/useReference';
import { EventStatusTag, InvoiceStateTag } from './EventStatusTag';
import { useApplyEvent, useEventList } from './queries';
import './eventList.css';

/** Order of the status filter values and of the status sort. */
const EVENT_DISPLAY_STATUSES: EventDisplayStatus[] = ['SOLD', 'PLAYED', 'CANCELLED'];
/** UC-003 AC-1: the list opens with the SOLD events (sold + played); cancelled via the Tila filter. */
const DEFAULT_STATUS_FILTER: EventDisplayStatus[] = ['SOLD', 'PLAYED'];
/** Default order (UC-003 step 1, TASK-192): by date, newest / future first. */
const DEFAULT_SORT = { key: 'date', dir: 'desc' } as const;

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
 * Events of the selected year (UC-003, UC-025): year summary (unfiltered), search, Excel-style table
 * with column filters (ExcelTable; filters and sort in the URL, client-side over the year's
 * events), Deleted view.
 */
export function EventListPage() {
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

  // The column filters are client-side over all of the year's events (design.md); only the search
  // goes to the API.
  const query: EventListQuery = deletedView
    ? { year, status: 'ALL', deleted: true, q: q || undefined }
    : { year, status: 'ALL', q: q || undefined };
  const list = useEventList(query);
  const applyEvent = useApplyEvent();
  const restore = useMutation({
    mutationFn: (id: string) => eventsApi.restore(id),
    onSuccess: (event) => applyEvent(event, event.id),
  });
  const filtered = Boolean(q);

  const newEventLink = (
    <Link to="/gigs/new" className={buttonClass({ className: 'event-new-link' })}>
      <Plus className="btn-icon" />
      {t('events.newEvent')}
    </Link>
  );

  return (
    <section className="page event-list-page">
      <PageHead
        title={t('pages.events', { year })}
        subtitle={list.data ? <YearSubtitle totals={list.data.yearSummary} /> : undefined}
        actions={newEventLink}
      >
        <PageYearSelector />
      </PageHead>

      {deletedNotice && <Notice role="status">{t('event.notice.deleted')}</Notice>}

      {list.data && <YearSummary totals={list.data.yearSummary} />}

      <div className="event-toolbar">
        <div className="segmented event-view-switch" role="group" aria-label={t('events.viewLabel')}>
          <button type="button" aria-pressed={!deletedView} onClick={() => setParam('view', null)}>
            {t('events.views.active')}
          </button>
          <button type="button" aria-pressed={deletedView} onClick={() => setParam('view', 'deleted')}>
            {t('events.views.deleted')}
          </button>
        </div>

        {/* The column filters live in the table headers (ExcelTable); the search stays here. */}
        <div className="event-search">
          <label htmlFor="event-search">{t('events.search')}</label>
          <div className="event-search-input">
            <Search className="event-search-icon" />
            <input
              id="event-search"
              type="search"
              value={search}
              placeholder={t('events.searchPlaceholder')}
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
          {t('events.restored')}{' '}
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
        <Notice tone="danger" role="alert" className="event-list-error">
          {apiErrorMessage(t, list.error)}{' '}
          <Button size="sm" onClick={() => void list.refetch()}>
            {t('app.retry')}
          </Button>
        </Notice>
      )}
      {list.data &&
        (list.data.events.length === 0 ? (
          <div className="event-empty">
            <p>
              {deletedView
                ? t('events.emptyDeleted', { year })
                : filtered
                  ? t('events.emptyFiltered')
                  : t('events.empty', { year })}
            </p>
            {!deletedView && !filtered && newEventLink}
          </div>
        ) : deletedView ? (
          <DeletedList events={list.data.events} onRestore={(id) => restore.mutate(id)} pending={restore.isPending} />
        ) : (
          <EventTable events={list.data.events} partners={reference?.partners} lang={lang} tableState={tableState} />
        ))}
    </section>
  );
}

/**
 * URL marker `f.allStatuses=1`: the user chose "every status" (no Tila filter). Without it a URL
 * with no status filter means the default (F-008). Not a column, so the table ignores it.
 */
const ALL_STATUSES_KEY = 'allStatuses';

/**
 * UC-003 AC-1: the list opens with the SOLD events (Myyty + Soitettu); "Näytä myös perutut" is now
 * the Tila filter. A URL without a status filter (a plain /events link) shows the default status
 * filter, which is not written to the URL. An explicit choice is always in the URL, so it survives
 * a reload and a shared link (F-008): narrowed values as `f.status=…` as usual, and "every status"
 * ("Valitse kaikki", ticking the rest, "Tyhjennä suodattimet") as the marker `f.allStatuses=1`.
 * The table never sees the marker: for it, "every status" is simply no status filter.
 */
function useDefaultStatusFilter(state: ExcelTableState): ExcelTableState {
  const { filters, onFiltersChange } = state;
  const effective = useMemo(() => {
    const { [ALL_STATUSES_KEY]: allStatuses, ...rest } = filters;
    if (rest.status !== undefined || allStatuses !== undefined) return rest;
    return { ...rest, status: DEFAULT_STATUS_FILTER };
  }, [filters]);
  const change = useCallback(
    (next: TableFilters) => {
      const { [ALL_STATUSES_KEY]: _marker, ...rest } = next;
      void _marker;
      onFiltersChange(rest.status === undefined ? { ...rest, [ALL_STATUSES_KEY]: ['1'] } : rest);
    },
    [onFiltersChange],
  );
  return { ...state, filters: effective, onFiltersChange: change };
}

/** Mono line under the page title: event count and sold events sum. */
function YearSubtitle({ totals }: { totals: YearEventTotals }) {
  const { t } = useTranslation();
  const lang = useLang();
  return (
    <>
      {`${t('events.eventCount')} ${totals.eventCount} · ${t('events.soldEventsSum')} ${formatMoney(totals.soldEventsSumCents, lang)}`}
    </>
  );
}

function YearSummary({ totals }: { totals: YearEventTotals }) {
  const { t } = useTranslation();
  const lang = useLang();
  const items: [string, string][] = [
    [t('events.eventCount'), String(totals.eventCount)],
    [t('events.soldEventsSum'), formatMoney(totals.soldEventsSumCents, lang)],
    [t('events.budgetedCosts'), formatMoney(totals.budgetedCostsCents, lang)],
    [t('events.actualCosts'), formatMoney(totals.actualCostsCents, lang)],
    [t('events.marginBudget'), formatMoney(totals.marginBudgetCents, lang)],
    [t('events.marginActual'), formatMoney(totals.marginActualCents, lang)],
  ];
  return (
    <section className="event-year-summary" aria-labelledby="event-year-summary-title">
      <SectionLabel id="event-year-summary-title">{t('events.summaryTitle')}</SectionLabel>
      <StatGrid className="event-stat-grid">
        {items.map(([label, value]) => (
          <StatTile key={label} label={label} value={value} />
        ))}
      </StatGrid>
      {totals.cancelledCount > 0 && (
        <p className="meta event-cancelled-count">{t('events.cancelledCount', { count: totals.cancelledCount })}</p>
      )}
    </section>
  );
}

/** Ties in the event table (and the order without a sort): start date, then lineup, then venue. */
function eventTieBreak(a: EventSummary, b: EventSummary): number {
  return (
    a.startDate.localeCompare(b.startDate) ||
    a.lineupName.localeCompare(b.lineupName) ||
    a.venue.localeCompare(b.venue)
  );
}

interface EventTableProps {
  events: EventSummary[];
  partners: Partner[] | undefined;
  lang: 'fi' | 'en';
  tableState: ExcelTableState;
}

/**
 * Date or date range for the table, never breaking inside a date. The text is the same as
 * `formatDateRange`.
 */
function TableDateRange({ start, end, lang }: { start: string; end: string | null; lang: 'fi' | 'en' }) {
  if (!end || end === start) return <span className="event-date-part">{formatDate(start, lang)}</span>;
  // One wrapper, so a phone card (flex row: label | value) keeps the range together.
  return (
    <span className="event-date-range">
      <span className="event-date-part">{formatDate(start, lang)}–</span>
      <span className="event-date-part">{formatDate(end, lang)}</span>
    </span>
  );
}

/**
 * Excel-style table (UC-003 change 2026-10-14, design.md "Excel-style tables"), the same component
 * and look as the offer list: every column sortable, filter icons on the coded / text columns. From
 * 600 px it fills the width without scrolling sideways; columns with priority 2 / 3 are hidden on
 * narrower tables (TASK-147: 1 lineup, date, venue, status, total, margin · 2 client, invoicing,
 * seller, staffing · 3 producer, budgeted, actual costs; TASK-192: no balance column, it is on the gig page). Phones (< 600 px): one compact
 * row per event (line 1: lineup, status tag … invoicing tag, total at the right edge; line 2: date, venue, client, staffing, margin values without a label) + the "Suodattimet" sheet.
 */
function EventTable({ events, partners, lang, tableState }: EventTableProps) {
  const { t } = useTranslation();
  const clientNames = useMemo(
    () => new Map(events.filter((g) => g.clientId).map((g) => [g.clientId!, g.clientName ?? '–'])),
    [events],
  );
  const statusLabel = (s: EventDisplayStatus) => t(`eventStatus.${s}`);

  const columns: ExcelColumn<EventSummary>[] = [
    {
      key: 'lineup',
      label: t('events.columns.lineup'),
      primary: true,
      className: 'event-col-lineup',
      sortValue: (g) => g.lineupName,
      filterValue: (g) => g.lineupName,
      cell: (g) => (
        <Link to={`/gigs/${g.id}`} className="event-link" title={g.lineupName}>
          {g.lineupName}{' '}
          {/* The venue has its own column; the link name stays "Lineup · Venue" (unique per event). */}
          <span className="visually-hidden">· {g.venue}</span>
        </Link>
      ),
    },
    {
      key: 'date',
      phoneBare: true,
      label: t('events.columns.date'),
      className: 'event-col-date excel-col-fit',
      sortValue: (g) => g.startDate,
      cell: (g) => <TableDateRange start={g.startDate} end={g.endDate} lang={lang} />,
    },
    {
      key: 'venue',
      phoneBare: true,
      label: t('events.columns.venue'),
      sortValue: (g) => g.venue,
      filterValue: (g) => g.venue,
      cell: (g) => g.venue,
    },
    {
      key: 'client',
      phoneBare: true, // phone rows: the client name alone, no "Asiakas" label
      label: t('clients.eventColumn'),
      priority: 2,
      className: 'event-col-client',
      sortValue: (g) => g.clientName,
      filterValue: (g) => g.clientId,
      filterLabel: (id) => clientNames.get(id) ?? '–',
      cell: (g) =>
        g.clientId ? (
          <Link to={`/clients/${g.clientId}`} className="event-client-link">
            {g.clientName ?? '–'}
          </Link>
        ) : (
          '–'
        ),
    },
    {
      key: 'status',
      phoneInline: true, // phone rows: line 1, between the lineup and the total
      label: t('events.columns.status'),
      className: 'excel-col-fit',
      sortValue: (g) => EVENT_DISPLAY_STATUSES.indexOf(eventDisplayStatus(g)),
      filterValue: (g) => eventDisplayStatus(g),
      filterLabel: (v) => statusLabel(v as EventDisplayStatus),
      filterCompare: byCodeOrder(EVENT_DISPLAY_STATUSES),
      cell: (g) => <EventStatusTag status={eventDisplayStatus(g)} />,
    },
    {
      // "Laskutus": one tag = the gig's next invoicing action (api-contract "Invoicing: one label").
      key: 'invoiceState',
      phoneEnd: true, // phone rows: line 1, right before the total at the right edge
      label: t('events.columns.invoiceState'),
      priority: 2,
      className: 'event-col-invoice excel-col-fit',
      sortValue: (g) => INVOICE_STATES.indexOf(g.invoiceState),
      filterValue: (g) => g.invoiceState,
      filterLabel: (v) => invoiceStateLabel(t, v as InvoiceState),
      filterCompare: byCodeOrder(INVOICE_STATES),
      cell: (g) => <InvoiceStateTag state={g.invoiceState} />,
    },
    {
      key: 'staffing',
      phoneBare: true,
      label: t('events.notFullyStaffed'),
      priority: 2,
      className: 'event-col-staffing excel-col-fit',
      sortValue: (g) => (g.notFullyStaffed ? 0 : 1),
      filterValue: (g) => (g.notFullyStaffed ? 'yes' : 'no'),
      filterLabel: (v) => t(v === 'yes' ? 'events.staffingFilter.yes' : 'events.staffingFilter.no'),
      filterCompare: byCodeOrder(['yes', 'no']),
      cell: (g) =>
        g.notFullyStaffed ? <StatusTag tone="warn">{t('events.notFullyStaffed')}</StatusTag> : <span aria-hidden="true">–</span>,
    },
    {
      key: 'seller',
      hideOnPhone: true,
      label: t('events.seller'),
      priority: 2,
      sortValue: (g) => partnerName(partners, g.sellerId),
      filterValue: (g) => g.sellerId,
      filterLabel: (id) => partnerName(partners, id),
      cell: (g) => partnerName(partners, g.sellerId),
    },
    {
      key: 'producer',
      hideOnPhone: true,
      label: t('events.producer'),
      priority: 3,
      sortValue: (g) => partnerName(partners, g.producerId),
      filterValue: (g) => g.producerId,
      filterLabel: (id) => partnerName(partners, id),
      cell: (g) => partnerName(partners, g.producerId),
    },
    {
      key: 'total',
      phoneMain: true,
      label: t('events.totalPrice'),
      numeric: true,
      className: 'event-col-total excel-col-fit',
      sortValue: (g) => g.totalPriceCents,
      cell: (g) => formatMoney(g.totalPriceCents, lang),
    },
    {
      key: 'budgeted',
      hideOnPhone: true,
      label: t('events.budgetedCosts'),
      className: 'excel-col-fit',
      priority: 3,
      numeric: true,
      sortValue: (g) => g.budgetedCostsCents,
      cell: (g) => formatMoney(g.budgetedCostsCents, lang),
    },
    {
      key: 'actual',
      hideOnPhone: true,
      label: t('events.actualCosts'),
      className: 'excel-col-fit',
      priority: 3,
      numeric: true,
      sortValue: (g) => g.actualCostsCents,
      cell: (g) => formatMoney(g.actualCostsCents, lang),
    },
    {
      key: 'margin',
      phoneBare: true, // phone rows: just the values ("10,0 % tot. 12,0 %"), no "Kate-%" label
      label: t('events.marginPct'),
      numeric: true,
      className: 'event-col-margin',
      sortValue: (g) => g.marginBudgetPct,
      // Each percentage stays on one line; the actual one is always on its own line under the budget.
      cell: (g) => (
        <span>
          <span className="event-margin-budget">{formatPercent(g.marginBudgetPct, lang)}</span>
          <span className="event-margin-actual">
            {' '}
            {t('events.actualShort')} {formatPercent(g.marginActualPct, lang)}
          </span>
        </span>
      ),
    },
  ];

  // Newest first by default (TASK-192); the page opens at the top (TASK-191: no scroll to the first
  // upcoming). A sort on an unknown / removed column (e.g. an old `?sort=balance`) uses the default.
  const sortable = columns.some((c) => c.sortValue && c.key === tableState.sort?.key);
  const state = sortable ? tableState : { ...tableState, sort: DEFAULT_SORT };
  return (
    <div className="event-rows-wrap">
      <ExcelTable
        {...state}
        className="event-table"
        caption={t('events.listLabel')}
        columns={columns}
        rows={events}
        rowKey={(g) => g.id}
        tieBreak={eventTieBreak}
        emptyFiltered={t('events.emptyColumnFiltered')}
        rowClassName={(g) => `status-${eventDisplayStatus(g).toLowerCase()}`}
      />
    </div>
  );
}

function DeletedList({
  events,
  onRestore,
  pending,
}: {
  events: EventSummary[];
  onRestore: (id: string) => void;
  pending: boolean;
}) {
  const { t } = useTranslation();
  const lang = useLang();
  return (
    <ul className="event-deleted-list" aria-label={t('events.views.deleted')}>
      {events.map((event) => (
        <li key={event.id} className="event-deleted-row">
          <span className="event-date">{formatDateRange(event.startDate, event.endDate, lang)}</span>
          <span className="event-main">
            <Link to={`/gigs/${event.id}`} className="event-link">
              {event.lineupName} · {event.venue}
            </Link>
            <span className="event-deleted-meta">
              <EventStatusTag status={eventDisplayStatus(event)} />
              <span className="meta">{t('events.deletedAt', { date: formatDate(event.deletedAt, lang) })}</span>
            </span>
          </span>
          <Button
            size="sm"
            icon={RotateCcw}
            className="event-restore"
            disabled={pending}
            onClick={() => onRestore(event.id)}
            aria-label={`${t('events.restore')}: ${event.lineupName} · ${event.venue}`}
          >
            {t('events.restore')}
          </Button>
        </li>
      ))}
    </ul>
  );
}

