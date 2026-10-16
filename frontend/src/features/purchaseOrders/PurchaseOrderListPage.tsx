import { Search } from 'lucide-react';
import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router-dom';
import { PURCHASE_ORDER_STATUSES, type PurchaseOrderStatus } from '../../api/enums';
import type { PurchaseOrder, PurchaseOrderListQuery } from '../../api/types';
import { useSelectedYear } from '../../auth/SignedInContext';
import { Button } from '../../components/Button';
import { ExcelTable } from '../../components/ExcelTable';
import { useUrlTableState, type ExcelColumn } from '../../components/excelTableState';
import { Notice } from '../../components/Notice';
import { PageHead } from '../../components/PageHead';
import { SectionLabel } from '../../components/SectionLabel';
import { apiErrorMessage } from '../../i18n/labels';
import { useLang } from '../../i18n/useLang';
import { formatDate, formatMoney } from '../../lib/format';
import { PurchaseOrderEventTable, PurchaseOrderStatusCell } from './poParts';
import { poDateTime } from './poText';
import { usePurchaseOrderEvents, usePurchaseOrderList } from './queries';
import './purchaseOrders.css';

/** Default order (UC-034): newest first. */
const DEFAULT_SORT = { key: 'created', dir: 'desc' } as const;

const byNumber = (a: PurchaseOrder, b: PurchaseOrder) => b.number.localeCompare(a.number);

/** Distinct gig dates of a PO, in date order. */
function gigDates(po: PurchaseOrder): string[] {
  return [...new Set(po.lines.map((l) => l.gigStartDate))].sort();
}

/**
 * Purchase orders (UC-034): the selected year's POs (year of creation) in an Excel-style table,
 * a search over every year (number / freelancer), one-click Mark paid, and the log of recent
 * PO events below.
 */
export function PurchaseOrderListPage() {
  const { t } = useTranslation();
  const year = useSelectedYear();
  const [params, setParams] = useSearchParams();
  const tableState = useUrlTableState({ defaultSort: DEFAULT_SORT });
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

  // BR-119: a search covers every year, so the year is not sent with it.
  const query: PurchaseOrderListQuery = q ? { q } : { year };
  const list = usePurchaseOrderList(query);

  return (
    <section className="page purchase-orders-page">
      <PageHead title={q ? t('purchaseOrders.listLabel') : t('pages.purchaseOrders', { year })} />

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
              aria-describedby={q ? 'po-search-hint' : undefined}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          {q && (
            <p id="po-search-hint" className="meta po-search-hint">
              {t('purchaseOrders.searchAllYears')}
            </p>
          )}
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
            <p>{q ? t('purchaseOrders.emptySearch') : t('purchaseOrders.empty', { year })}</p>
          </div>
        ) : (
          <PurchaseOrderTable orders={list.data.purchaseOrders} tableState={tableState} />
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
 * Keikat, Summa, Tila. Filters on Freelancer and Tila (client-side, in the URL). From 600 px no
 * sideways scrolling: Luotu and Keikat (priority 2) hide below 1100 px of table width.
 */
function PurchaseOrderTable({
  orders,
  tableState,
}: {
  orders: PurchaseOrder[];
  tableState: ReturnType<typeof useUrlTableState>;
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
          {po.number}
        </Link>
      ),
    },
    {
      key: 'freelancer',
      label: t('purchaseOrders.columns.freelancer'),
      sortValue: (po) => po.personName,
      filterValue: (po) => po.personId,
      filterLabel: (id) => names.get(id) ?? '–',
      cell: (po) => po.personName,
    },
    {
      key: 'created',
      label: t('purchaseOrders.columns.created'),
      priority: 2,
      className: 'po-col-date excel-col-fit',
      sortValue: (po) => po.createdAt,
      cell: (po) => poDateTime(t, po.createdAt, lang),
    },
    {
      key: 'gigs',
      label: t('purchaseOrders.columns.gigs'),
      priority: 2,
      className: 'po-col-gigs',
      sortValue: (po) => gigDates(po)[0],
      cell: (po) => gigDates(po).map((d) => formatDate(d, lang)).join(', '),
    },
    {
      key: 'total',
      label: t('purchaseOrders.columns.total'),
      numeric: true,
      className: 'po-col-total excel-col-fit',
      sortValue: (po) => po.totalCents,
      cell: (po) => formatMoney(po.totalCents, lang),
    },
    {
      key: 'status',
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
