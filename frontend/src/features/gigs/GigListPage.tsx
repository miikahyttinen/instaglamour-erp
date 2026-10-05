import { useMutation } from '@tanstack/react-query';
import { useDeferredValue, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, RotateCcw, Search } from 'lucide-react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import type { GigDisplayStatus } from '../../api/enums';
import { gigsApi } from '../../api/endpoints';
import type { GigListQuery, GigSummary, Partner, YearGigTotals } from '../../api/types';
import { useSelectedYear } from '../../auth/SignedInContext';
import { Button } from '../../components/Button';
import { buttonClass } from '../../components/buttonClass';
import { DataTable, type DataTableColumn } from '../../components/DataTable';
import { Notice } from '../../components/Notice';
import { PageHead } from '../../components/PageHead';
import { SectionLabel } from '../../components/SectionLabel';
import { StatGrid, StatTile } from '../../components/StatTile';
import { StatusTag } from '../../components/StatusTag';
import { apiErrorMessage, gigDisplayStatus } from '../../i18n/labels';
import { useLang } from '../../i18n/useLang';
import { formatDate, formatDateRange, formatMoney, formatPercent, todayIso } from '../../lib/format';
import { useMediaQuery } from '../../lib/useMediaQuery';
import { useReference } from '../../reference/useReference';
import { GigStatusTag } from './GigStatusTag';
import { useApplyGig, useGigList } from './queries';
import './gigList.css';

type When = NonNullable<GigListQuery['when']>;
const WHENS: When[] = ['all', 'upcoming', 'past'];

/**
 * The 7-column table needs the content width of a ≥ 1200 px viewport (the sidebar takes
 * 232 px from 900 px). Below that the list is shown as cards. Same width as the `lg` grid spans.
 */
const GIG_TABLE_QUERY = '(min-width: 1200px)';

function partnerName(partners: Partner[] | undefined, id: string): string {
  return partners?.find((p) => p.id === id)?.name ?? '–';
}

/** Gigs of the selected year: year summary, filters, search, deleted view (UC-003, UC-025). */
export function GigListPage() {
  const { t } = useTranslation();
  const lang = useLang();
  const year = useSelectedYear();
  const { data: reference } = useReference();
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const deletedNotice = (location.state as { notice?: string } | null)?.notice === 'deleted';

  const deletedView = params.get('view') === 'deleted';
  const when = (WHENS as string[]).includes(params.get('when') ?? '') ? (params.get('when') as When) : 'all';
  const includeCancelled = params.get('cancelled') === '1';
  const sellerId = params.get('seller') ?? '';
  const producerId = params.get('producer') ?? '';
  const notFullyStaffed = params.get('nfs') === '1';
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

  const query: GigListQuery = deletedView
    ? { year, status: 'ALL', deleted: true, q: q || undefined }
    : {
        year,
        status: includeCancelled ? 'ALL' : 'SOLD',
        when,
        sellerId: sellerId || undefined,
        producerId: producerId || undefined,
        notFullyStaffed: notFullyStaffed || undefined,
        q: q || undefined,
      };
  const list = useGigList(query);
  const applyGig = useApplyGig();
  const restore = useMutation({
    mutationFn: (id: string) => gigsApi.restore(id),
    onSuccess: (gig) => applyGig(gig, gig.id),
  });
  const filtered =
    Boolean(q) || when !== 'all' || Boolean(sellerId) || Boolean(producerId) || notFullyStaffed;

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

        <div className="gig-filters">
          <div className="gig-filter-search">
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
          {!deletedView && (
            <>
              <div className="gig-filter-select">
                <label htmlFor="gig-seller">{t('gigs.seller')}</label>
                <select id="gig-seller" value={sellerId} onChange={(e) => setParam('seller', e.target.value)}>
                  <option value="">{t('gigs.anyone')}</option>
                  {reference?.partners.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="gig-filter-select">
                <label htmlFor="gig-producer">{t('gigs.producer')}</label>
                <select
                  id="gig-producer"
                  value={producerId}
                  onChange={(e) => setParam('producer', e.target.value)}
                >
                  <option value="">{t('gigs.anyone')}</option>
                  {reference?.partners.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}
        </div>

        {!deletedView && (
          <div className="gig-filter-flags">
            <div className="segmented" role="group" aria-label={t('gigs.whenLabel')}>
              {WHENS.map((w) => (
                <button
                  key={w}
                  type="button"
                  aria-pressed={when === w}
                  onClick={() => setParam('when', w === 'all' ? null : w)}
                >
                  {t(`gigs.when.${w}`)}
                </button>
              ))}
            </div>
            <label className="check">
              <input
                type="checkbox"
                checked={includeCancelled}
                onChange={(e) => setParam('cancelled', e.target.checked ? '1' : null)}
              />
              {t('gigs.includeCancelled')}
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={notFullyStaffed}
                onChange={(e) => setParam('nfs', e.target.checked ? '1' : null)}
              />
              {t('gigs.notFullyStaffed')}
            </label>
          </div>
        )}
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
          <GigRows gigs={list.data.gigs} partners={reference?.partners} lang={lang} />
        ))}
    </section>
  );
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

interface GigRowsProps {
  gigs: GigSummary[];
  partners: Partner[] | undefined;
  lang: 'fi' | 'en';
}

/** Wide screens (≥ 1200 px): hairline table. Narrower: cards with economics on tap. */
function GigRows(props: GigRowsProps) {
  const wide = useMediaQuery(GIG_TABLE_QUERY);
  const today = todayIso();
  const firstUpcomingId = props.gigs.find((g) => g.startDate >= today)?.id;
  const containerRef = useScrollToFirstUpcoming(firstUpcomingId);
  return (
    <div ref={containerRef} className="gig-rows-wrap">
      {wide ? (
        <GigTable {...props} firstUpcomingId={firstUpcomingId} />
      ) : (
        <GigCards {...props} firstUpcomingId={firstUpcomingId} />
      )}
    </div>
  );
}

function GigFlags({ gig, status }: { gig: GigSummary; status: GigDisplayStatus }) {
  const { t } = useTranslation();
  if (status === 'SOLD' && !gig.notFullyStaffed) return null;
  return (
    <span className="gig-flags">
      {status !== 'SOLD' && <GigStatusTag status={status} />}
      {gig.notFullyStaffed && <StatusTag tone="warn">{t('gigs.notFullyStaffed')}</StatusTag>}
    </span>
  );
}

function GigTable({ gigs, partners, lang, firstUpcomingId }: GigRowsProps & { firstUpcomingId?: string }) {
  const { t } = useTranslation();
  const columns: DataTableColumn<GigSummary>[] = [
    {
      key: 'date',
      label: t('gigs.columns.date'),
      className: 'gig-col-date',
      cell: (gig) => formatDateRange(gig.startDate, gig.endDate, lang),
    },
    {
      key: 'gig',
      label: t('gigs.columns.gig'),
      primary: true,
      className: 'gig-col-gig',
      cell: (gig) => (
        <span className="gig-main">
          <Link to={`/gigs/${gig.id}`} className="gig-link">
            {gig.lineupName} · {gig.venue}
          </Link>
          <GigFlags gig={gig} status={gigDisplayStatus(gig)} />
        </span>
      ),
    },
    {
      key: 'people',
      label: t('gigs.columns.people'),
      className: 'gig-col-people',
      cell: (gig) => (
        <>
          {partnerName(partners, gig.sellerId)} / {partnerName(partners, gig.producerId)}
        </>
      ),
    },
    {
      key: 'total',
      label: t('gigs.totalPrice'),
      numeric: true,
      className: 'gig-col-total',
      cell: (gig) => formatMoney(gig.totalPriceCents, lang),
    },
    {
      key: 'budgeted',
      label: t('gigs.budgetedCosts'),
      numeric: true,
      cell: (gig) => formatMoney(gig.budgetedCostsCents, lang),
    },
    {
      key: 'actual',
      label: t('gigs.actualCosts'),
      numeric: true,
      cell: (gig) => formatMoney(gig.actualCostsCents, lang),
    },
    {
      key: 'margin',
      label: t('gigs.marginPct'),
      numeric: true,
      cell: (gig) => (
        <>
          {formatPercent(gig.marginBudgetPct, lang)}
          <span className="gig-margin-actual">
            {t('gigs.actualShort')} {formatPercent(gig.marginActualPct, lang)}
          </span>
        </>
      ),
    },
  ];
  return (
    <DataTable
      className="gig-table"
      caption={t('gigs.listLabel')}
      columns={columns}
      rows={gigs}
      rowKey={(gig) => gig.id}
      cardsOnPhone={false}
      rowClassName={(gig) =>
        [`status-${gigDisplayStatus(gig).toLowerCase()}`, gig.id === firstUpcomingId && FIRST_UPCOMING]
          .filter(Boolean)
          .join(' ')
      }
    />
  );
}

function GigCards({ gigs, partners, lang, firstUpcomingId }: GigRowsProps & { firstUpcomingId?: string }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState<Set<string>>(new Set());

  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <ul className="gig-cards" aria-label={t('gigs.listLabel')}>
      {gigs.map((gig) => {
        const status = gigDisplayStatus(gig);
        const isOpen = open.has(gig.id);
        return (
          <li
            key={gig.id}
            className={[
              'gig-card',
              `status-${status.toLowerCase()}`,
              gig.id === firstUpcomingId && FIRST_UPCOMING,
            ]
              .filter(Boolean)
              .join(' ')}
          >
            <span className="gig-date">{formatDateRange(gig.startDate, gig.endDate, lang)}</span>
            <span className="gig-main">
              <Link to={`/gigs/${gig.id}`} className="gig-link">
                {gig.lineupName} · {gig.venue}
              </Link>
              <GigFlags gig={gig} status={status} />
            </span>
            <span className="gig-people">
              {t('gigs.seller')}: {partnerName(partners, gig.sellerId)} · {t('gigs.producer')}:{' '}
              {partnerName(partners, gig.producerId)}
            </span>
            <span className="gig-card-foot">
              <span className="gig-total">
                <span className="gig-cell-label">{t('gigs.totalPrice')}: </span>
                <span className="gig-total-value">{formatMoney(gig.totalPriceCents, lang)}</span>
              </span>
              <Button size="sm" className="gig-econ-toggle" aria-expanded={isOpen} onClick={() => toggle(gig.id)}>
                {isOpen ? t('gigs.hideEconomics') : t('gigs.showEconomics')}
              </Button>
            </span>
            {isOpen && (
              <dl className="gig-econ">
                <div>
                  <dt className="gig-cell-label">{t('gigs.budgetedCosts')}</dt>
                  <dd className="num">{formatMoney(gig.budgetedCostsCents, lang)}</dd>
                </div>
                <div>
                  <dt className="gig-cell-label">{t('gigs.actualCosts')}</dt>
                  <dd className="num">{formatMoney(gig.actualCostsCents, lang)}</dd>
                </div>
                <div>
                  <dt className="gig-cell-label">{t('gigs.marginPct')}</dt>
                  <dd className="num">
                    {formatPercent(gig.marginBudgetPct, lang)}
                    <span className="gig-margin-actual">
                      {' '}
                      ({t('gigs.actualShort')} {formatPercent(gig.marginActualPct, lang)})
                    </span>
                  </dd>
                </div>
              </dl>
            )}
          </li>
        );
      })}
    </ul>
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

