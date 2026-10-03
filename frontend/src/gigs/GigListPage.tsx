import { useMutation } from '@tanstack/react-query';
import { useDeferredValue, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { gigsApi } from '../api/endpoints';
import type { GigListQuery, GigSummary, Partner, YearGigTotals } from '../api/types';
import { useSelectedYear } from '../auth/SignedInContext';
import { apiErrorMessage, gigDisplayStatus, gigStatusLabel } from '../i18n/labels';
import { useLang } from '../i18n/useLang';
import { formatDate, formatDateRange, formatMoney, formatPercent, todayIso } from '../lib/format';
import { useReference } from '../reference/useReference';
import { useApplyGig, useGigList } from './queries';
import { StatusBadge } from './StatusBadge';

type When = NonNullable<GigListQuery['when']>;
const WHENS: When[] = ['all', 'upcoming', 'past'];

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

  return (
    <section className="page gig-list-page">
      <div className="page-head">
        <h1>{t('pages.gigs', { year })}</h1>
        <Link to="/gigs/new" className="btn btn-primary">
          {t('gigs.newGig')}
        </Link>
      </div>

      {deletedNotice && (
        <p className="notice" role="status">
          {t('gig.notice.deleted')}
        </p>
      )}

      {list.data && <YearSummary totals={list.data.yearSummary} />}

      <div className="segmented view-switch" role="group" aria-label={t('gigs.viewLabel')}>
        <button type="button" aria-pressed={!deletedView} onClick={() => setParam('view', null)}>
          {t('gigs.views.active')}
        </button>
        <button type="button" aria-pressed={deletedView} onClick={() => setParam('view', 'deleted')}>
          {t('gigs.views.deleted')}
        </button>
      </div>

      <div className="filters">
        <div className="field filter-search">
          <label htmlFor="gig-search">{t('gigs.search')}</label>
          <input
            id="gig-search"
            type="search"
            value={search}
            placeholder={t('gigs.searchPlaceholder')}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {!deletedView && (
          <>
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
            <div className="filter-row">
              <div className="field">
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
              <div className="field">
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
            </div>
            <div className="filter-checks">
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
          </>
        )}
      </div>

      {deletedView && restore.isError && (
        <p className="notice notice-error" role="alert">
          {apiErrorMessage(t, restore.error)}
        </p>
      )}
      {deletedView && restore.isSuccess && (
        <p className="notice" role="status">
          {t('gigs.restored')}{' '}
          <Link to={`/gigs/${restore.data.id}`}>
            {restore.data.lineupName} · {restore.data.venue}
          </Link>
        </p>
      )}

      {list.isPending && <p role="status">{t('app.loading')}</p>}
      {list.isError && (
        <div className="notice notice-error" role="alert">
          {apiErrorMessage(t, list.error)}{' '}
          <button type="button" className="btn" onClick={() => void list.refetch()}>
            {t('app.retry')}
          </button>
        </div>
      )}
      {list.data &&
        (list.data.gigs.length === 0 ? (
          <div className="empty">
            <p>
              {deletedView
                ? t('gigs.emptyDeleted', { year })
                : filtered
                  ? t('gigs.emptyFiltered')
                  : t('gigs.empty', { year })}
            </p>
            {!deletedView && !filtered && (
              <Link to="/gigs/new" className="btn btn-primary">
                {t('gigs.newGig')}
              </Link>
            )}
          </div>
        ) : deletedView ? (
          <DeletedList gigs={list.data.gigs} onRestore={(id) => restore.mutate(id)} pending={restore.isPending} />
        ) : (
          <GigRows gigs={list.data.gigs} partners={reference?.partners} lang={lang} />
        ))}
    </section>
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
    <section className="year-summary" aria-label={t('gigs.summaryTitle')}>
      <dl className="stats">
        {items.map(([label, value]) => (
          <div key={label} className="stat">
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      {totals.cancelledCount > 0 && (
        <p className="muted small">{t('gigs.cancelledCount', { count: totals.cancelledCount })}</p>
      )}
    </section>
  );
}

function GigRows({
  gigs,
  partners,
  lang,
}: {
  gigs: GigSummary[];
  partners: Partner[] | undefined;
  lang: 'fi' | 'en';
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState<Set<string>>(new Set());
  const firstUpcomingRef = useRef<HTMLLIElement>(null);
  const today = todayIso();
  const firstUpcomingId = gigs.find((g) => g.startDate >= today)?.id;

  // Scroll to today on first render (UC-003 step 1).
  const scrolled = useRef(false);
  useEffect(() => {
    if (scrolled.current || !firstUpcomingRef.current) return;
    scrolled.current = true;
    if (typeof firstUpcomingRef.current.scrollIntoView === 'function') {
      firstUpcomingRef.current.scrollIntoView({ block: 'center' });
    }
  }, [firstUpcomingId]);

  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <>
      <div className="gig-row gig-row-head" aria-hidden="true">
        <span>{t('gigs.columns.date')}</span>
        <span>{t('gigs.columns.gig')}</span>
        <span>{t('gigs.columns.people')}</span>
        <span className="num">{t('gigs.totalPrice')}</span>
        <span className="num">{t('gigs.budgetedCosts')}</span>
        <span className="num">{t('gigs.actualCosts')}</span>
        <span className="num">{t('gigs.marginPct')}</span>
      </div>
      <ul className="gig-rows" aria-label={t('gigs.listLabel')}>
        {gigs.map((gig) => {
          const status = gigDisplayStatus(gig);
          const isOpen = open.has(gig.id);
          return (
            <li
              key={gig.id}
              ref={gig.id === firstUpcomingId ? firstUpcomingRef : undefined}
              className={`gig-row gig-card status-${status.toLowerCase()}`}
            >
              <span className="gig-date">{formatDateRange(gig.startDate, gig.endDate, lang)}</span>
              <span className="gig-main">
                <Link to={`/gigs/${gig.id}`} className="gig-link">
                  {gig.lineupName} · {gig.venue}
                </Link>
                <span className="gig-flags">
                  {status !== 'SOLD' && <StatusBadge status={status} />}
                  {gig.notFullyStaffed && (
                    <span className="badge badge-warn">{t('gigs.notFullyStaffed')}</span>
                  )}
                </span>
              </span>
              <span className="gig-people muted small">
                {t('gigs.seller')}: {partnerName(partners, gig.sellerId)} · {t('gigs.producer')}:{' '}
                {partnerName(partners, gig.producerId)}
              </span>
              <span className="num gig-total">
                <span className="cell-label">{t('gigs.totalPrice')}: </span>
                {formatMoney(gig.totalPriceCents, lang)}
              </span>
              <button
                type="button"
                className="btn btn-small econ-toggle"
                aria-expanded={isOpen}
                onClick={() => toggle(gig.id)}
              >
                {isOpen ? t('gigs.hideEconomics') : t('gigs.showEconomics')}
              </button>
              <dl className={`gig-econ${isOpen ? ' open' : ''}`}>
                <div>
                  <dt className="cell-label">{t('gigs.budgetedCosts')}</dt>
                  <dd className="num">{formatMoney(gig.budgetedCostsCents, lang)}</dd>
                </div>
                <div>
                  <dt className="cell-label">{t('gigs.actualCosts')}</dt>
                  <dd className="num">{formatMoney(gig.actualCostsCents, lang)}</dd>
                </div>
                <div>
                  <dt className="cell-label">{t('gigs.marginPct')}</dt>
                  <dd className="num">
                    {formatPercent(gig.marginBudgetPct, lang)}
                    <span className="muted small">
                      {' '}
                      ({t('gigs.actualShort')} {formatPercent(gig.marginActualPct, lang)})
                    </span>
                  </dd>
                </div>
              </dl>
            </li>
          );
        })}
      </ul>
    </>
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
    <>
      <ul className="gig-rows deleted-rows" aria-label={t('gigs.views.deleted')}>
        {gigs.map((gig) => (
          <li key={gig.id} className="gig-card deleted-row">
            <span className="gig-date">{formatDateRange(gig.startDate, gig.endDate, lang)}</span>
            <span className="gig-main">
              <Link to={`/gigs/${gig.id}`} className="gig-link">
                {gig.lineupName} · {gig.venue}
              </Link>
              <span className="muted small">
                {gigStatusLabel(t, gigDisplayStatus(gig))} ·{' '}
                {t('gigs.deletedAt', { date: formatDate(gig.deletedAt, lang) })}
              </span>
            </span>
            <button
              type="button"
              className="btn"
              disabled={pending}
              onClick={() => onRestore(gig.id)}
              aria-label={`${t('gigs.restore')}: ${gig.lineupName} · ${gig.venue}`}
            >
              {t('gigs.restore')}
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}
