import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link2, Plus, Quote, RotateCcw, Search, Trash2 } from 'lucide-react';
import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import type { OfferDisposition, OfferEventType, OfferSource } from '../../api/enums';
import { OFFER_DISPOSITIONS, OFFER_EVENT_TYPES, OFFER_SOURCES } from '../../api/enums';
import { offersApi } from '../../api/endpoints';
import type { OfferListQuery, OfferSummary, OfferUpdate, OfferYearSummary, Partner } from '../../api/types';
import { useSelectedYear } from '../../auth/SignedInContext';
import { Button, IconButton } from '../../components/Button';
import { buttonClass } from '../../components/buttonClass';
import { DataTable, type DataTableColumn } from '../../components/DataTable';
import { ExcelTable } from '../../components/ExcelTable';
import { useUrlTableState, type ExcelColumn, type ExcelTableState } from '../../components/excelTableState';
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
import { OFFER_DISPLAY_STATUSES, offerDisplayStatus, offerTieBreak, type OfferDisplayStatus } from './offerStatus';
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

/** Default order of the offer table (UC-028): event date ascending. */
const DEFAULT_SORT = { key: 'eventDate', dir: 'asc' } as const;

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
 * Offers of the selected year (UC-028): figures, search, Excel-style table with column filters
 * (ExcelTable; filters and sort in the URL, client-side), Deleted view.
 */
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
  const tableState = useUrlTableState({ defaultSort: DEFAULT_SORT });
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

  // The column filters are client-side (design.md); only the search goes to the API.
  const query: OfferListQuery = deletedView ? { year, deleted: true, q: q || undefined } : { year, q: q || undefined };
  const list = useOfferList(query);
  const deletedRows = useMemo(() => [...(list.data?.offers ?? [])].sort(offerTieBreak), [list.data]);

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
  const headActions = (
    <>
      <Link to="/offers/references" className={buttonClass()}>
        <Quote className="btn-icon" />
        {t('references.open')}
      </Link>
      {newOfferLink}
    </>
  );

  return (
    <section className="page page-wide offers-page">
      <PageHead title={t('pages.offers', { year })} actions={headActions} />

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
        <div className="offers-search">
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
                : q
                  ? t('offers.emptyFiltered')
                  : t('offers.empty', { year })}
            </p>
            {!deletedView && !q && newOfferLink}
          </div>
        ) : deletedView ? (
          <DeletedTable offers={deletedRows} pending={restore.isPending} onRestore={(id) => restore.mutate(id)} />
        ) : (
          <OfferTable
            offers={list.data.offers}
            partners={partners}
            lang={lang}
            tableState={tableState}
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
  tableState: ExcelTableState;
  onPatch: (offer: OfferSummary, body: OfferUpdate) => Promise<void>;
  onConvert: (offer: OfferSummary) => void;
  onCopy: (offer: OfferSummary) => void;
  onDelete: (offer: OfferSummary) => void;
}

/**
 * Excel-style table (UC-028, design.md "Excel-style tables"): every column sortable, filter icons
 * on the coded / text columns. From 600 px it fills the width without scrolling sideways; columns
 * with priority 2 / 3 are hidden on narrower tables (TASK-147: 1 event, date, client, price,
 * status, actions · 2 place, seller, disposition, gig · 3 created, source, event type).
 * Phones (< 600 px): one card per offer + the "Suodattimet" sheet.
 */
function OfferTable(props: OfferTableProps) {
  const { offers, partners, lang, tableState, onPatch } = props;
  const { t } = useTranslation();
  const options = useOfferOptions();
  const clientNames = useMemo(() => new Map(offers.map((o) => [o.clientId, o.clientName])), [offers]);
  const statusLabel = (s: OfferDisplayStatus) => t(`offers.statusFilter.${s}`);
  const sourceLabel = (o: OfferSummary) => (o.source ? offerSourceLabel(t, o.source) : null);
  const eventTypeLabel = (o: OfferSummary) => (o.eventType ? offerEventTypeLabel(t, o.eventType) : null);
  const place = (o: OfferSummary) => [o.venue, o.city].filter(Boolean).join(', ');

  const columns: ExcelColumn<OfferSummary>[] = [
    {
      key: 'event',
      label: t('offers.columns.event'),
      primary: true,
      className: 'offer-col-event',
      sortValue: (o) => o.eventName,
      cell: (o) => (
        <Link to={`/offers/${o.id}`} className="offer-link">
          {o.eventName}
        </Link>
      ),
    },
    {
      key: 'client',
      label: t('offers.columns.client'),
      sortValue: (o) => o.clientName,
      filterValue: (o) => o.clientId,
      filterLabel: (id) => clientNames.get(id) ?? '–',
      cell: (o) => <Link to={`/clients/${o.clientId}`} className="offer-client-link">{o.clientName}</Link>,
    },
    {
      key: 'place',
      label: t('offers.columns.place'),
      priority: 2,
      sortValue: place,
      filterValue: place,
      cell: place,
    },
    {
      key: 'eventDate',
      label: t('offers.columns.eventDate'),
      className: 'offer-col-date excel-col-fit',
      sortValue: (o) => o.eventDate,
      cell: (o) => formatDate(o.eventDate, lang),
    },
    {
      key: 'created',
      label: t('offers.columns.created'),
      priority: 3,
      className: 'offer-col-date excel-col-fit',
      hideOnPhone: true,
      sortValue: (o) => o.createdAt,
      cell: (o) => formatDate(o.createdAt.slice(0, 10), lang),
    },
    {
      key: 'price',
      label: t('offers.columns.price'),
      className: 'excel-col-fit',
      numeric: true,
      sortValue: (o) => o.priceCents,
      cell: (o) => (o.priceCents === null ? '–' : formatMoney(o.priceCents, lang)),
    },
    {
      key: 'status',
      label: t('offers.columns.status'),
      className: 'excel-col-fit',
      sortValue: (o) => OFFER_DISPLAY_STATUSES.indexOf(offerDisplayStatus(o)),
      filterValue: (o) => offerDisplayStatus(o),
      filterLabel: (v) => statusLabel(v as OfferDisplayStatus),
      filterCompare: byCodeOrder(OFFER_DISPLAY_STATUSES),
      cell: (o) => <OfferStatusTag offer={o} />,
    },
    {
      key: 'seller',
      label: t('offers.columns.seller'),
      priority: 2,
      sortValue: (o) => partnerName(partners, o.sellerId),
      filterValue: (o) => o.sellerId,
      filterLabel: (id) => partnerName(partners, id),
      cell: (o) => partnerName(partners, o.sellerId),
    },
    {
      key: 'source',
      label: t('offers.columns.source'),
      priority: 3,
      className: 'offer-col-select',
      sortValue: sourceLabel,
      filterValue: (o) => o.source,
      filterLabel: (code) => offerSourceLabel(t, code as OfferSource),
      filterCompare: byCodeOrder(OFFER_SOURCES),
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
      priority: 3,
      className: 'offer-col-select',
      sortValue: eventTypeLabel,
      filterValue: (o) => o.eventType,
      filterLabel: (code) => offerEventTypeLabel(t, code as OfferEventType),
      filterCompare: byCodeOrder(OFFER_EVENT_TYPES),
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
      priority: 2,
      className: 'offer-col-select',
      sortValue: (o) => offerDispositionLabel(t, o.disposition),
      filterValue: (o) => o.disposition,
      filterLabel: (code) => offerDispositionLabel(t, code as OfferDisposition),
      filterCompare: byCodeOrder(OFFER_DISPOSITIONS),
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
      className: 'excel-col-fit',
      priority: 2,
      sortValue: (o) => (o.gigId ? 1 : 0),
      filterValue: (o) => (o.gigId ? 'yes' : 'no'),
      filterLabel: (v) => t(v === 'yes' ? 'offers.gigFilter.yes' : 'offers.gigFilter.no'),
      filterCompare: byCodeOrder(['yes', 'no']),
      cell: (o) => <GigCell offer={o} onConvert={() => props.onConvert(o)} />,
    },
    {
      key: 'actions',
      label: t('offers.columns.actions'),
      className: 'offer-col-actions excel-col-fit',
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
    <ExcelTable
      {...tableState}
      className="offer-table"
      caption={t('offers.listLabel')}
      columns={columns}
      rows={offers}
      rowKey={(o) => o.id}
      tieBreak={offerTieBreak}
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
