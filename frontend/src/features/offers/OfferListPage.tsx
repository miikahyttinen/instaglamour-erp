import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link2, Plus, RotateCcw, Search, Trash2 } from 'lucide-react';
import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import type { OfferDisposition, OfferEventType, OfferSource, OfferStatusFilter } from '../../api/enums';
import { OFFER_DISPOSITIONS, OFFER_EVENT_TYPES, OFFER_SOURCES, OFFER_STATUS_FILTERS } from '../../api/enums';
import { offersApi } from '../../api/endpoints';
import type { OfferListQuery, OfferSummary, OfferUpdate, OfferYearSummary, Partner } from '../../api/types';
import { useSelectedYear } from '../../auth/SignedInContext';
import { Button, IconButton } from '../../components/Button';
import { buttonClass } from '../../components/buttonClass';
import { DataTable, type DataTableColumn } from '../../components/DataTable';
import { InlineSelect } from '../../components/inline';
import { Notice } from '../../components/Notice';
import { StatGrid, StatTile } from '../../components/StatTile';
import { PageHead } from '../../components/PageHead';
import {
  apiErrorMessage,
  offerDispositionLabel,
  offerEventTypeLabel,
  offerSourceLabel,
} from '../../i18n/labels';
import { useLang } from '../../i18n/useLang';
import { formatDate, formatMoney, formatPercent } from '../../lib/format';
import { useReference } from '../../reference/useReference';
import { ConvertDialog } from './ConvertDialog';
import { copyToClipboard, useOfferOptions, type CopyResult } from './offerOptions';
import { ConfirmDialog, CopyResultNotice, GigCell, OfferStatusTag } from './offerParts';
import { DEFAULT_SORT, isOfferSortKey, nextSort, sortOffers, type OfferSortKey, type SortDir } from './offerSort';
import { offerKeys, publicOfferUrl, useApplyOffer, useOfferList } from './queries';
import './offers.css';

type PageNotice =
  | { kind: 'converted'; gigId: string; event: string }
  | { kind: 'alreadyConverted' }
  | { kind: 'deleted'; event: string }
  | { kind: 'restored'; id: string; event: string }
  | { kind: 'copy'; result: CopyResult }
  | { kind: 'error'; error: unknown };

type RowDialog = { kind: 'convert' | 'delete'; offer: OfferSummary } | null;

const pick = <T extends string>(list: readonly T[], value: string | null): T | '' =>
  value !== null && (list as readonly string[]).includes(value) ? (value as T) : '';

function partnerName(partners: Partner[] | undefined, id: string): string {
  return partners?.find((p) => p.id === id)?.name ?? '–';
}

/** Offers of the selected year (UC-028): figures, filters, search, sortable table, Deleted view. */
export function OfferListPage() {
  const { t } = useTranslation();
  const lang = useLang();
  const year = useSelectedYear();
  const { data: reference } = useReference();
  const partners = reference?.partners;
  const queryClient = useQueryClient();
  const applyOffer = useApplyOffer();
  const location = useLocation();
  const [params, setParams] = useSearchParams();

  const deletedView = params.get('view') === 'deleted';
  const status = pick<OfferStatusFilter>(OFFER_STATUS_FILTERS, params.get('status'));
  const sellerId = params.get('seller') ?? '';
  const disposition = pick<OfferDisposition>(OFFER_DISPOSITIONS, params.get('disposition'));
  const eventType = pick<OfferEventType>(OFFER_EVENT_TYPES, params.get('eventType'));
  const source = pick<OfferSource>(OFFER_SOURCES, params.get('source'));
  const sortKey: OfferSortKey = isOfferSortKey(params.get('sort')) ? (params.get('sort') as OfferSortKey) : DEFAULT_SORT.key;
  const sortDir: SortDir = params.get('dir') === 'desc' ? 'desc' : params.get('sort') ? 'asc' : DEFAULT_SORT.dir;
  const [search, setSearch] = useState(params.get('q') ?? '');
  const q = useDeferredValue(search.trim());

  const [notice, setNotice] = useState<PageNotice | null>(() => {
    const deleted = (location.state as { deletedOffer?: string } | null)?.deletedOffer;
    return deleted ? { kind: 'deleted', event: deleted } : null;
  });
  const [dialog, setDialog] = useState<RowDialog>(null);

  const setParam = (key: string, value: string | null) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value) next.set(key, value);
        else next.delete(key);
        return next;
      },
      { replace: true },
    );

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

  const query: OfferListQuery = deletedView
    ? { year, deleted: true, q: q || undefined }
    : {
        year,
        q: q || undefined,
        status: status || undefined,
        sellerId: sellerId || undefined,
        disposition: disposition || undefined,
        eventType: eventType || undefined,
        source: source || undefined,
      };
  const list = useOfferList(query);
  const filtered = Boolean(q || status || sellerId || disposition || eventType || source);

  const sorted = useMemo(
    () =>
      sortOffers(list.data?.offers ?? [], sortKey, sortDir, {
        seller: (o) => partnerName(partners, o.sellerId),
        source: (o) => (o.source ? offerSourceLabel(t, o.source) : null),
        eventType: (o) => (o.eventType ? offerEventTypeLabel(t, o.eventType) : null),
        disposition: (o) => offerDispositionLabel(t, o.disposition),
      }),
    [list.data, sortKey, sortDir, partners, t],
  );

  const onSort = (key: OfferSortKey) => {
    const next = nextSort({ key: sortKey, dir: sortDir }, key);
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        p.set('sort', next.key);
        p.set('dir', next.dir);
        return p;
      },
      { replace: true },
    );
  };

  const patch = async (offer: OfferSummary, body: OfferUpdate) => {
    const updated = await offersApi.update(offer.id, body);
    await applyOffer(updated, offer.id);
  };

  const copyLink = async (offer: OfferSummary) => {
    try {
      const detail = await queryClient.fetchQuery({
        queryKey: offerKeys.detail(offer.id),
        queryFn: () => offersApi.get(offer.id),
      });
      setNotice({ kind: 'copy', result: await copyToClipboard(publicOfferUrl(detail.sharePath)) });
    } catch (error) {
      setNotice({ kind: 'error', error });
    }
  };

  const restore = useMutation({
    mutationFn: (id: string) => offersApi.restore(id),
    onSuccess: (offer) => {
      void applyOffer(offer, offer.id);
      setNotice({ kind: 'restored', id: offer.id, event: offer.eventName });
    },
    onError: (error) => setNotice({ kind: 'error', error }),
  });

  const newOfferLink = (
    <Link to="/offers/new" className={buttonClass()}>
      <Plus className="btn-icon" />
      {t('offers.newOffer')}
    </Link>
  );

  return (
    <section className="page offers-page">
      <PageHead title={t('pages.offers', { year })} actions={newOfferLink} />

      {list.data && <YearFigures summary={list.data.summary} />}

      <div className="offers-toolbar">
        <div className="segmented" role="group" aria-label={t('offers.viewLabel')}>
          <button type="button" aria-pressed={!deletedView} onClick={() => setParam('view', null)}>
            {t('offers.views.active')}
          </button>
          <button type="button" aria-pressed={deletedView} onClick={() => setParam('view', 'deleted')}>
            {t('offers.views.deleted')}
          </button>
        </div>
        <div className="offers-filters">
          <div className="offers-filter-search">
            <label htmlFor="offer-search">{t('offers.search')}</label>
            <div className="offers-search-input">
              <Search className="offers-search-icon" />
              <input
                id="offer-search"
                type="search"
                value={search}
                placeholder={t('offers.searchPlaceholder')}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
          {!deletedView && (
            <>
              <FilterSelect
                id="offer-status"
                label={t('offers.columns.status')}
                value={status}
                onChange={(v) => setParam('status', v)}
                options={OFFER_STATUS_FILTERS.map((s) => ({ value: s, label: t(`offers.statusFilter.${s}`) }))}
              />
              <FilterSelect
                id="offer-seller"
                label={t('offers.columns.seller')}
                value={sellerId}
                onChange={(v) => setParam('seller', v)}
                options={(partners ?? []).map((p) => ({ value: p.id, label: p.name }))}
              />
              <FilterSelect
                id="offer-disposition"
                label={t('offers.columns.disposition')}
                value={disposition}
                onChange={(v) => setParam('disposition', v)}
                options={OFFER_DISPOSITIONS.map((d) => ({ value: d, label: offerDispositionLabel(t, d) }))}
              />
              <FilterSelect
                id="offer-event-type"
                label={t('offers.columns.eventType')}
                value={eventType}
                onChange={(v) => setParam('eventType', v)}
                options={OFFER_EVENT_TYPES.map((c) => ({ value: c, label: offerEventTypeLabel(t, c) }))}
              />
              <FilterSelect
                id="offer-source"
                label={t('offers.columns.source')}
                value={source}
                onChange={(v) => setParam('source', v)}
                options={OFFER_SOURCES.map((c) => ({ value: c, label: offerSourceLabel(t, c) }))}
              />
            </>
          )}
        </div>
      </div>

      {notice && <ListNotice notice={notice} onDismiss={() => setNotice(null)} />}

      {list.isPending && (
        <p role="status" className="meta">
          {t('app.loading')}
        </p>
      )}
      {list.isError && (
        <Notice tone="danger" role="alert" className="offer-notice">
          <p>{apiErrorMessage(t, list.error)}</p>
          <Button size="sm" onClick={() => void list.refetch()}>
            {t('app.retry')}
          </Button>
        </Notice>
      )}
      {list.data &&
        (list.data.offers.length === 0 ? (
          <div className="offers-empty">
            <p>
              {deletedView
                ? t('offers.emptyDeleted', { year })
                : filtered
                  ? t('offers.emptyFiltered')
                  : t('offers.empty', { year })}
            </p>
            {!deletedView && !filtered && newOfferLink}
          </div>
        ) : deletedView ? (
          <DeletedTable offers={sorted} pending={restore.isPending} onRestore={(id) => restore.mutate(id)} />
        ) : (
          <OfferTable
            offers={sorted}
            partners={partners}
            lang={lang}
            sortKey={sortKey}
            sortDir={sortDir}
            onSort={onSort}
            onPatch={patch}
            onConvert={(offer) => setDialog({ kind: 'convert', offer })}
            onCopy={(offer) => void copyLink(offer)}
            onDelete={(offer) => setDialog({ kind: 'delete', offer })}
          />
        ))}

      {dialog?.kind === 'convert' && (
        <ConvertDialog
          offer={dialog.offer}
          onClose={() => setDialog(null)}
          onConverted={(result) => {
            setDialog(null);
            setNotice({ kind: 'converted', gigId: result.gig.id, event: result.offer.eventName });
          }}
          onAlreadyConverted={() => {
            setDialog(null);
            setNotice({ kind: 'alreadyConverted' });
          }}
        />
      )}
      {dialog?.kind === 'delete' && (
        <ConfirmDialog
          title={t('offer.actions.delete')}
          confirmLabel={t('offer.actions.delete')}
          danger
          mutationFn={() => offersApi.delete(dialog.offer.id)}
          onClose={() => setDialog(null)}
          onDone={() => {
            const { offer } = dialog;
            setDialog(null);
            void applyOffer(null, offer.id);
            setNotice({ kind: 'deleted', event: offer.eventName });
          }}
        >
          <p>{t('offer.deleteText', { event: dialog.offer.eventName })}</p>
        </ConfirmDialog>
      )}
    </section>
  );
}

function FilterSelect({
  id,
  label,
  value,
  options,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string | null) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="offers-filter-select">
      <label htmlFor={id}>{label}</label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value || null)}>
        <option value="">{t('offers.any')}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

/** BR-106: open value and win rate of the selected year (ignores the filters). */
function YearFigures({ summary }: { summary: OfferYearSummary }) {
  const { t } = useTranslation();
  const lang = useLang();
  return (
    <StatGrid className="offers-figures">
      <StatTile
        label={t('offers.openValue')}
        value={formatMoney(summary.openValueCents, lang)}
        caption={t('offers.openValueCaption')}
      />
      <StatTile
        label={t('offers.winRate')}
        value={summary.winRatePct === null ? '–' : formatPercent(summary.winRatePct, lang)}
        caption={t('offers.winRateCaption', { won: summary.wonCount, decided: summary.decidedCount })}
      />
    </StatGrid>
  );
}

function ListNotice({ notice, onDismiss }: { notice: PageNotice; onDismiss: () => void }) {
  const { t } = useTranslation();
  if (notice.kind === 'copy') return <CopyResultNotice result={notice.result} onDismiss={onDismiss} />;
  const dismiss = (
    <Button size="sm" onClick={onDismiss}>
      {t('common.dismiss')}
    </Button>
  );
  if (notice.kind === 'error') {
    return (
      <Notice tone="danger" role="alert" className="offer-notice">
        <p>{apiErrorMessage(t, notice.error)}</p>
        {dismiss}
      </Notice>
    );
  }
  let content;
  if (notice.kind === 'converted') {
    content = (
      <p>
        {t('convert.done', { event: notice.event })} <Link to={`/gigs/${notice.gigId}`}>{t('convert.openGig')}</Link>
      </p>
    );
  } else if (notice.kind === 'alreadyConverted') {
    content = <p>{t('convert.alreadyConverted')}</p>;
  } else if (notice.kind === 'deleted') {
    content = <p>{t('offers.deleted', { event: notice.event })}</p>;
  } else {
    content = (
      <p>
        {t('offers.restored')} <Link to={`/offers/${notice.id}`}>{notice.event}</Link>
      </p>
    );
  }
  return (
    <Notice tone={notice.kind === 'alreadyConverted' ? 'warn' : 'ok'} role="status" className="offer-notice">
      {content}
      {dismiss}
    </Notice>
  );
}

interface OfferTableProps {
  offers: OfferSummary[];
  partners: Partner[] | undefined;
  lang: 'fi' | 'en';
  sortKey: OfferSortKey;
  sortDir: SortDir;
  onSort: (key: OfferSortKey) => void;
  onPatch: (offer: OfferSummary, body: OfferUpdate) => Promise<void>;
  onConvert: (offer: OfferSummary) => void;
  onCopy: (offer: OfferSummary) => void;
  onDelete: (offer: OfferSummary) => void;
}

/**
 * Excel-style table (owner decision): every column sortable, one line per row, horizontal
 * scroll with the event column pinned. Phones (< 600 px): one card per offer.
 */
function OfferTable(props: OfferTableProps) {
  const { offers, partners, lang, sortKey, sortDir, onSort, onPatch } = props;
  const { t } = useTranslation();
  const options = useOfferOptions();
  const sortable = (key: OfferSortKey) => ({
    sort: sortKey === key ? sortDir : undefined,
    onSort: () => onSort(key),
  });
  const columns: DataTableColumn<OfferSummary>[] = [
    {
      key: 'event',
      label: t('offers.columns.event'),
      primary: true,
      className: 'offer-col-event',
      ...sortable('event'),
      cell: (o) => (
        <Link to={`/offers/${o.id}`} className="offer-link">
          {o.eventName}
        </Link>
      ),
    },
    {
      key: 'client',
      label: t('offers.columns.client'),
      ...sortable('client'),
      cell: (o) => <Link to={`/clients/${o.clientId}`} className="offer-client-link">{o.clientName}</Link>,
    },
    {
      key: 'place',
      label: t('offers.columns.place'),
      ...sortable('place'),
      cell: (o) => [o.venue, o.city].filter(Boolean).join(', '),
    },
    {
      key: 'eventDate',
      label: t('offers.columns.eventDate'),
      className: 'offer-col-date',
      ...sortable('eventDate'),
      cell: (o) => formatDate(o.eventDate, lang),
    },
    {
      key: 'created',
      label: t('offers.columns.created'),
      className: 'offer-col-date',
      hideOnPhone: true,
      ...sortable('created'),
      cell: (o) => formatDate(o.createdAt.slice(0, 10), lang),
    },
    {
      key: 'price',
      label: t('offers.columns.price'),
      numeric: true,
      ...sortable('price'),
      cell: (o) => (o.priceCents === null ? '–' : formatMoney(o.priceCents, lang)),
    },
    {
      key: 'status',
      label: t('offers.columns.status'),
      ...sortable('status'),
      cell: (o) => <OfferStatusTag offer={o} />,
    },
    {
      key: 'seller',
      label: t('offers.columns.seller'),
      ...sortable('seller'),
      cell: (o) => partnerName(partners, o.sellerId),
    },
    {
      key: 'source',
      label: t('offers.columns.source'),
      className: 'offer-col-select',
      ...sortable('source'),
      cell: (o) => (
        <InlineSelect<OfferSource | null>
          label={`${t('offers.columns.source')}: ${o.eventName}`}
          hideLabel
          value={o.source}
          field="source"
          options={options.source}
          onSave={(next) => onPatch(o, { source: next })}
        />
      ),
    },
    {
      key: 'eventType',
      label: t('offers.columns.eventType'),
      className: 'offer-col-select',
      ...sortable('eventType'),
      cell: (o) => (
        <InlineSelect<OfferEventType | null>
          label={`${t('offers.columns.eventType')}: ${o.eventName}`}
          hideLabel
          value={o.eventType}
          field="eventType"
          options={options.eventType}
          onSave={(next) => onPatch(o, { eventType: next })}
        />
      ),
    },
    {
      key: 'disposition',
      label: t('offers.columns.disposition'),
      className: 'offer-col-select',
      ...sortable('disposition'),
      cell: (o) => (
        <InlineSelect<OfferDisposition>
          label={`${t('offers.columns.disposition')}: ${o.eventName}`}
          hideLabel
          value={o.disposition}
          field="disposition"
          options={options.disposition}
          onSave={(next) => onPatch(o, { disposition: next })}
        />
      ),
    },
    {
      key: 'gig',
      label: t('offers.columns.gig'),
      ...sortable('gig'),
      cell: (o) => <GigCell offer={o} onConvert={() => props.onConvert(o)} />,
    },
    {
      key: 'actions',
      label: t('offers.columns.actions'),
      className: 'offer-col-actions',
      cell: (o) => (
        <span className="offer-row-actions">
          <IconButton
            icon={Link2}
            label={t('offers.copyLinkLabel', { event: o.eventName })}
            onClick={() => props.onCopy(o)}
          />
          <IconButton
            icon={Trash2}
            label={t('offers.deleteLabel', { event: o.eventName })}
            onClick={() => props.onDelete(o)}
          />
        </span>
      ),
    },
  ];
  return (
    <DataTable
      className="offer-table"
      caption={t('offers.listLabel')}
      columns={columns}
      rows={offers}
      rowKey={(o) => o.id}
      rowClassName={(o) => `offer-row-${o.status.toLowerCase()}${o.expired ? ' offer-row-expired' : ''}`}
    />
  );
}

function DeletedTable({
  offers,
  pending,
  onRestore,
}: {
  offers: OfferSummary[];
  pending: boolean;
  onRestore: (id: string) => void;
}) {
  const { t } = useTranslation();
  const lang = useLang();
  const columns: DataTableColumn<OfferSummary>[] = [
    {
      key: 'event',
      label: t('offers.columns.event'),
      primary: true,
      cell: (o) => (
        <Link to={`/offers/${o.id}`} className="offer-link">
          {o.eventName}
        </Link>
      ),
    },
    { key: 'client', label: t('offers.columns.client'), cell: (o) => o.clientName },
    { key: 'eventDate', label: t('offers.columns.eventDate'), cell: (o) => formatDate(o.eventDate, lang) },
    {
      key: 'deletedAt',
      label: t('offers.columns.deletedAt'),
      cell: (o) => formatDate(o.deletedAt?.slice(0, 10), lang),
    },
    {
      key: 'restore',
      label: t('offers.restore'),
      className: 'offer-col-actions',
      cell: (o) => (
        <Button
          size="sm"
          icon={RotateCcw}
          disabled={pending}
          aria-label={t('offers.restoreLabel', { event: o.eventName })}
          onClick={() => onRestore(o.id)}
        >
          {t('offers.restore')}
        </Button>
      ),
    },
  ];
  return (
    <DataTable
      className="offer-deleted-table"
      caption={t('offers.views.deleted')}
      columns={columns}
      rows={offers}
      rowKey={(o) => o.id}
    />
  );
}
