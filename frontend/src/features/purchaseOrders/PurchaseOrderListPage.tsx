import { Search } from 'lucide-react';
import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router-dom';
import { PURCHASE_ORDER_STATUSES, type PurchaseOrderStatus } from '../../api/enums';
import type { PurchaseOrder, PurchaseOrderListQuery } from '../../api/types';
import { Button } from '../../components/Button';
import { ExcelTable } from '../../components/ExcelTable';
import { useUrlTableState, type ExcelColumn } from '../../components/excelTableState';
import { PURCHASE_ORDER_PAGE_SIZE, useUrlPaging, type Paging } from '../../components/pagination';
import { Notice } from '../../components/Notice';
import { PageHead } from '../../components/PageHead';
import { SectionLabel } from '../../components/SectionLabel';
import { apiErrorMessage } from '../../i18n/labels';
import { useLang } from '../../i18n/useLang';
import { formatDate, formatMoney } from '../../lib/format';
import { NewPurchaseOrderButton } from './NewPurchaseOrderButton';
import { PoNumber, PurchaseOrderEventTable, PurchaseOrderStatusCell } from './poParts';
import { poDateTime } from './poText';
import { usePurchaseOrderEvents, usePurchaseOrderList } from './queries';
import './purchaseOrders.css';

/** Default order (UC-034): newest first. */
const DEFAULT_SORT = { key: 'created', dir: 'desc' } as const;

const byNumber = (a: PurchaseOrder, b: PurchaseOrder) => b.number.localeCompare(a.number);

/** Distinct event dates of a PO, in date order. */
function eventDates(po: PurchaseOrder): string[] {
  return [...new Set(po.lines.map((l) => l.eventStartDate))].sort();
}

/**
 * Purchase orders (UC-034): every year's POs, newest first (contract "Year is no longer global"),
 * in an Excel-style table, a search (number / freelancer), one-click Mark paid, and the log of
 * recent PO events below.
 */
export function PurchaseOrderListPage() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const tableState = useUrlTableState({ defaultSort: DEFAULT_SORT });
  const paging = useUrlPaging(PURCHASE_ORDER_PAGE_SIZE);
  const [search, setSearch] = useState(params.get('q') ?? '');
  const q = useDeferredValue(search.trim());

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

  // No year: the list and the search cover every year.
  const query: PurchaseOrderListQuery = q ? { q } : {};
  const list = usePurchaseOrderList(query);

  return (
    <section className="page purchase-orders-page">
      <PageHead title={t('pages.purchaseOrders')} actions={<NewPurchaseOrderButton />} />

      <div className="po-toolbar">
        <div className="po-search">
          <label htmlFor="po-search">{t('purchaseOrders.search')}</label>
          <div className="po-search-input">
            <Search className="po-search-icon" />
            <input
              id="po-search"
              type="search"
              value={search}
              placeholder={t('purchaseOrders.searchPlaceholder')}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
      </div>

      {list.isPending && (
        <p role="status" className="meta">
          {t('app.loading')}
        </p>
      )}
      {list.isError && (
        <Notice tone="danger" role="alert" className="po-notice">
          <p>{apiErrorMessage(t, list.error)}</p>
          <Button size="sm" onClick={() => void list.refetch()}>
            {t('app.retry')}
          </Button>
        </Notice>
      )}
      {list.data &&
        (list.data.purchaseOrders.length === 0 ? (
          <div className="po-empty">
            <p>{q ? t('purchaseOrders.emptySearch') : t('purchaseOrders.empty')}</p>
          </div>
        ) : (
          <PurchaseOrderTable orders={list.data.purchaseOrders} tableState={tableState} paging={paging} />
        ))}

      <section className="po-log" aria-labelledby="po-log-title">
        <SectionLabel id="po-log-title">{t('purchaseOrders.log.title')}</SectionLabel>
        <PurchaseOrderLog />
      </section>
    </section>
  );
}

/**
 * Excel-style table (design.md): Numero (link, card title, always shown), Freelancer, Luotu,
 * Tapahtumat, Summa, Tila. Filters on Freelancer and Tila (client-side, in the URL). From 600 px no
 * sideways scrolling: Luotu and Tapahtumat (priority 2) hide below 1100 px of table width.
 */
function PurchaseOrderTable({
  orders,
  tableState,
  paging,
}: {
  orders: PurchaseOrder[];
  tableState: ReturnType<typeof useUrlTableState>;
  paging: Paging;
}) {
  const { t } = useTranslation();
  const lang = useLang();
  const names = useMemo(() => new Map(orders.map((po) => [po.personId, po.personName])), [orders]);
  const columns: ExcelColumn<PurchaseOrder>[] = [
    {
      key: 'number',
      label: t('purchaseOrders.columns.number'),
      primary: true,
      className: 'po-col-number',
      sortValue: (po) => po.number,
      cell: (po) => (
        <Link to={`/purchase-orders/${po.id}`} className="po-link">
          <PoNumber number={po.number} />
        </Link>
      ),
    },
    {
      key: 'freelancer',
      phoneBare: true,
      label: t('purchaseOrders.columns.freelancer'),
      className: 'po-col-freelancer',
      sortValue: (po) => po.personName,
      filterValue: (po) => po.personId,
      filterLabel: (id) => names.get(id) ?? '–',
      cell: (po) => po.personName,
    },
    {
      key: 'created',
      hideOnPhone: true,
      label: t('purchaseOrders.columns.created'),
      priority: 2,
      className: 'po-col-date excel-col-fit',
      sortValue: (po) => po.createdAt,
      cell: (po) => poDateTime(t, po.createdAt, lang),
    },
    {
      key: 'events',
      label: t('purchaseOrders.columns.events'),
      priority: 2,
      className: 'po-col-events',
      sortValue: (po) => eventDates(po)[0],
      cell: (po) => eventDates(po).map((d) => formatDate(d, lang)).join(', '),
    },
    {
      key: 'total',
      phoneMain: true,
      label: t('purchaseOrders.columns.total'),
      numeric: true,
      className: 'po-col-total excel-col-fit',
      sortValue: (po) => po.totalCents,
      cell: (po) => formatMoney(po.totalCents, lang),
    },
    {
      key: 'status',
      phoneBare: true,
      label: t('purchaseOrders.columns.status'),
      className: 'po-col-status excel-col-fit',
      sortValue: (po) => PURCHASE_ORDER_STATUSES.indexOf(po.status),
      filterValue: (po) => po.status,
      filterLabel: (code) => t(`purchaseOrders.status.${code as PurchaseOrderStatus}`),
      filterCompare: (a, b) =>
        PURCHASE_ORDER_STATUSES.indexOf(a as PurchaseOrderStatus) -
        PURCHASE_ORDER_STATUSES.indexOf(b as PurchaseOrderStatus),
      cell: (po) => <PurchaseOrderStatusCell po={po} />,
    },
  ];
  return (
    <ExcelTable
      {...tableState}
      className="po-table"
      caption={t('purchaseOrders.listLabel')}
      columns={columns}
      rows={orders}
      rowKey={(po) => po.id}
      tieBreak={byNumber}
      paging={paging}
      rowClassName={(po) => `po-row-${po.status.toLowerCase()}`}
    />
  );
}

/** Recent PO events of every PO (BR-119), newest first. */
function PurchaseOrderLog() {
  const { t } = useTranslation();
  const events = usePurchaseOrderEvents();
  if (events.isPending) return <p className="meta">{t('app.loading')}</p>;
  if (events.isError) {
    return (
      <Notice tone="danger" role="alert">
        <p>{apiErrorMessage(t, events.error)}</p>
      </Notice>
    );
  }
  return <PurchaseOrderEventTable events={events.data} caption={t('purchaseOrders.log.caption')} showNumber />;
}
