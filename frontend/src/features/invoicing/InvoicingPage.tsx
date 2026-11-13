import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import type { InvoiceListRow } from '../../api/types';
import { Button } from '../../components/Button';
import { ExcelTable } from '../../components/ExcelTable';
import { useLocalTableState, type ExcelColumn } from '../../components/excelTableState';
import { INVOICE_ROW_PAGE_SIZE, useUrlPaging, type Paging } from '../../components/pagination';
import { Notice } from '../../components/Notice';
import { PageHead } from '../../components/PageHead';
import { StatusTag } from '../../components/StatusTag';
import { apiErrorMessage, invoiceRowStatusLabel } from '../../i18n/labels';
import { useLang } from '../../i18n/useLang';
import { formatDate, formatMoney } from '../../lib/format';
import { INVOICE_ROW_STATUS_TONE } from '../events/eventStatusTone';
import { useInvoiceRows } from './queries';
import './invoicing.css';

/**
 * Laskutus / Invoicing (api-contract "Laskutus page: all invoice rows"): every invoice row of
 * every non-deleted gig in API order (not sent first, newest first), 100 rows per page. Read-only:
 * a row's status is changed on its gig page (the gig link).
 */
export function InvoicingPage() {
  const { t } = useTranslation();
  const list = useInvoiceRows();
  const paging = useUrlPaging(INVOICE_ROW_PAGE_SIZE);

  return (
    <section className="page invoicing-page">
      <PageHead title={t('pages.invoicing')} />

      {list.isPending && (
        <p role="status" className="meta">
          {t('app.loading')}
        </p>
      )}
      {list.isError && (
        <Notice tone="danger" role="alert" className="invoicing-notice">
          <p>{apiErrorMessage(t, list.error)}</p>
          <Button size="sm" onClick={() => void list.refetch()}>
            {t('app.retry')}
          </Button>
        </Notice>
      )}
      {list.data && <InvoiceRowTable rows={list.data} paging={paging} />}
    </section>
  );
}

/**
 * Columns: Tila, Luotu, Asiakas, Keikka (date + lineup name, link), Kuvaus (+ "Automaattinen"),
 * Summa, Laskutustiedot (clamped). Nothing is sortable or filterable: the API order is the order.
 * From 600 px no sideways scrolling (Luotu hides below 1100 px of table width). Phones: line 1 =
 * client + status tag, line 2 = gig date · description · amount, Laskutustiedot under them.
 */
function InvoiceRowTable({ rows, paging }: { rows: InvoiceListRow[]; paging: Paging }) {
  const { t } = useTranslation();
  const lang = useLang();
  // No sort, no filters: kept local (nothing to put in the URL besides the page).
  const tableState = useLocalTableState();
  const columns: ExcelColumn<InvoiceListRow>[] = [
    {
      key: 'status',
      phoneMain: true,
      label: t('invoicing.columns.status'),
      className: 'inv-col-status excel-col-fit',
      cell: (r) => <StatusTag tone={INVOICE_ROW_STATUS_TONE[r.status]}>{invoiceRowStatusLabel(t, r.status)}</StatusTag>,
    },
    {
      key: 'created',
      hideOnPhone: true,
      priority: 2,
      label: t('invoicing.columns.created'),
      className: 'inv-col-created excel-col-fit',
      cell: (r) => formatDate(r.createdAt, lang),
    },
    {
      key: 'client',
      primary: true,
      label: t('invoicing.columns.client'),
      className: 'inv-col-client',
      cell: (r) => r.clientName ?? '–',
    },
    {
      key: 'gig',
      phoneBare: true,
      label: t('invoicing.columns.gig'),
      className: 'inv-col-gig',
      cell: (r) => (
        <Link to={`/gigs/${r.eventId}`} className="inv-gig-link" title={`${r.eventLineupName} · ${r.eventVenue}`}>
          <span className="inv-gig-date">{formatDate(r.eventStartDate, lang)}</span>{' '}
          <span className="inv-gig-name">{r.eventLineupName}</span>
        </Link>
      ),
    },
    {
      key: 'description',
      phoneBare: true,
      label: t('invoicing.columns.description'),
      className: 'inv-col-description',
      cell: (r) => (
        <>
          <span className="inv-description">{r.description}</span>
          {r.auto && (
            <span className="meta small inv-auto" title={t('invoicing.autoTitle')}>
              {t('invoicing.auto')}
            </span>
          )}
        </>
      ),
    },
    {
      key: 'amount',
      phoneBare: true,
      numeric: true,
      label: t('invoicing.columns.amount'),
      className: 'inv-col-amount excel-col-fit',
      cell: (r) => formatMoney(r.amountCents, lang),
    },
    {
      key: 'details',
      phoneBare: true,
      label: t('invoicing.columns.details'),
      className: 'inv-col-details',
      cell: (r) => (r.invoicingDetails ? <ClampedText text={r.invoicingDetails} /> : <span className="muted">–</span>),
    },
  ];
  return (
    <ExcelTable
      {...tableState}
      className="invoicing-table"
      caption={t('invoicing.listLabel')}
      columns={columns}
      rows={rows}
      rowKey={(r) => r.id}
      paging={paging}
      empty={<p>{t('invoicing.empty')}</p>}
      rowClassName={(r) => `inv-row-${r.status.toLowerCase()}`}
    />
  );
}

/**
 * Multi-line "Laskutustiedot": clamped to a few lines (CSS), full text in the title; when the text
 * is cut, a "Näytä kaikki / Näytä vähemmän" toggle opens it in place (also on touch screens).
 */
function ClampedText({ text }: { text: string }) {
  const { t } = useTranslation();
  const id = useId();
  const ref = useRef<HTMLParagraphElement>(null);
  const [open, setOpen] = useState(false);
  const [cut, setCut] = useState(false);

  // Measured while closed (the observer also fires once when it starts). Without ResizeObserver
  // there is no toggle; the title still has the full text.
  useEffect(() => {
    const el = ref.current;
    if (!el || open || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => setCut(el.scrollHeight > el.clientHeight + 1));
    observer.observe(el);
    return () => observer.disconnect();
  }, [text, open]);

  return (
    <div className="inv-details">
      <p ref={ref} id={id} className={['inv-details-text', open && 'is-open'].filter(Boolean).join(' ')} title={text}>
        {text}
      </p>
      {(cut || open) && (
        <button
          type="button"
          className="inv-details-toggle"
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? t('invoicing.showLess') : t('invoicing.showMore')}
        </button>
      )}
    </div>
  );
}
