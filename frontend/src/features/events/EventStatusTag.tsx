import { useTranslation } from 'react-i18next';
import type { EventDisplayStatus, InvoiceCoverage, PaymentState } from '../../api/enums';
import { StatusTag } from '../../components/StatusTag';
import { eventStatusLabel, invoiceCoverageLabel, paymentStateLabel } from '../../i18n/labels';
import { EVENT_DELETED_TONE, EVENT_STATUS_TONE, INVOICE_COVERAGE_TONE, PAYMENT_STATE_TONE, ROWS_TO_INVOICE_TONE } from './eventStatusTone';

/** Event status (Upcoming / Played / Cancelled) as a shared `StatusTag`. */
export function EventStatusTag({ status }: { status: EventDisplayStatus }) {
  const { t } = useTranslation();
  return <StatusTag tone={EVENT_STATUS_TONE[status]}>{eventStatusLabel(t, status)}</StatusTag>;
}

/** Invoicing coverage as a colour tag; NONE is a plain dash (accessible text "–"). */
export function InvoiceCoverageTag({ coverage }: { coverage: InvoiceCoverage }) {
  const { t } = useTranslation();
  if (coverage === 'NONE') return <span className="invoice-status-none">–</span>;
  return (
    <StatusTag tone={INVOICE_COVERAGE_TONE[coverage]} className="invoice-status-tag invoice-coverage-tag">
      {invoiceCoverageLabel(t, coverage)}
    </StatusTag>
  );
}

/** Payment state as a colour tag; NONE is a plain dash (accessible text "–"). */
export function PaymentStateTag({ state }: { state: PaymentState }) {
  const { t } = useTranslation();
  if (state === 'NONE') return <span className="invoice-status-none">–</span>;
  return (
    <StatusTag tone={PAYMENT_STATE_TONE[state]} className="invoice-status-tag payment-state-tag">
      {paymentStateLabel(t, state)}
    </StatusTag>
  );
}

/** Keikat table: the gig has READY rows (`readyCents > 0`) — blue, replaces the coverage tag. */
export function RowsToInvoiceTag() {
  const { t } = useTranslation();
  return (
    <StatusTag tone={ROWS_TO_INVOICE_TONE} className="invoice-status-tag rows-to-invoice-tag">
      {t('events.columns.rowsToInvoice')}
    </StatusTag>
  );
}

/**
 * Both invoicing tags of a gig, coverage on line 1 and payment on line 2 (list "Laskutus" cell,
 * phone cards, gig page Laskutus card). `rowsToInvoice` (Keikat table only, readyCents > 0) shows
 * "Laskutettavia rivejä" on line 1 instead of the coverage. Lines are block spans (styles.css).
 */
export function InvoicingTags({
  coverage,
  payment,
  rowsToInvoice = false,
}: {
  coverage: InvoiceCoverage;
  payment: PaymentState;
  rowsToInvoice?: boolean;
}) {
  return (
    <span className="invoicing-tags">
      <span className="invoicing-tags-coverage">
        {rowsToInvoice ? <RowsToInvoiceTag /> : <InvoiceCoverageTag coverage={coverage} />}
      </span>
      <span className="invoicing-tags-payment">
        <PaymentStateTag state={payment} />
      </span>
    </span>
  );
}

/** "Deleted" tag for a soft-deleted event. */
export function EventDeletedTag() {
  const { t } = useTranslation();
  return <StatusTag tone={EVENT_DELETED_TONE}>{t('events.views.deleted')}</StatusTag>;
}
