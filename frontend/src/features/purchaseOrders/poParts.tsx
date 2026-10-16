import { useMutation } from '@tanstack/react-query';
import { CircleCheck } from 'lucide-react';
import { Fragment } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { isApiError } from '../../api/client';
import { purchaseOrdersApi } from '../../api/endpoints';
import type { PurchaseOrder, PurchaseOrderEvent } from '../../api/types';
import { Button } from '../../components/Button';
import { DataTable, type DataTableColumn } from '../../components/DataTable';
import { StatusTag } from '../../components/StatusTag';
import { useLang } from '../../i18n/useLang';
import { formatDate, formatTime } from '../../lib/format';
import { useReference } from '../../reference/useReference';
import { poActorName, poDateTime, poErrorMessage, poEventText } from './poText';
import { useApplyPurchaseOrder } from './queries';

/**
 * A PO number that may wrap after its dashes (F-010): long freelancer names make long numbers
 * (`PERSON-WITH-A-LONG-NAME-0001`). `<wbr>` keeps the text (and accessible name) unchanged.
 */
export function PoNumber({ number }: { number: string }) {
  const parts = number.split('-');
  return (
    <>
      {parts.map((part, i) => (
        <Fragment key={i}>
          {part}
          {i < parts.length - 1 && (
            <>
              -<wbr />
            </>
          )}
        </Fragment>
      ))}
    </>
  );
}

/** PAID → green "Maksettu <date> klo <time>"; CANCELLED → grey "Peruttu"; OPEN → "Avoin". */
export function PurchaseOrderStatusTag({ po }: { po: PurchaseOrder }) {
  const { t } = useTranslation();
  const lang = useLang();
  if (po.status === 'PAID') {
    return (
      <StatusTag tone="ok" className="po-status-tag">
        {t('purchaseOrders.paidLabel', { date: formatDate(po.paidAt, lang), time: formatTime(po.paidAt, lang) })}
      </StatusTag>
    );
  }
  if (po.status === 'CANCELLED') {
    return (
      <StatusTag tone="muted" className="po-status-tag">
        {t('purchaseOrders.cancelledLabel')}
      </StatusTag>
    );
  }
  return (
    <StatusTag tone="info" className="po-status-tag">
      {t('purchaseOrders.status.OPEN')}
    </StatusTag>
  );
}

/**
 * Tila cell of the list (UC-034 step 2): an open PO gets a one-click "Merkitse maksetuksi"
 * button, which turns into the paid label; failures show a message under it.
 */
export function PurchaseOrderStatusCell({ po }: { po: PurchaseOrder }) {
  const { t } = useTranslation();
  const apply = useApplyPurchaseOrder();
  const pay = useMutation({
    mutationFn: () => purchaseOrdersApi.pay(po.id),
    onSuccess: (updated) => apply(updated),
    onError: (error) => {
      if (isApiError(error) && error.code === 'INVALID_STATUS_TRANSITION') apply(null);
    },
  });
  if (po.status !== 'OPEN') return <PurchaseOrderStatusTag po={po} />;
  return (
    <span className="po-status-cell">
      <Button
        size="sm"
        icon={CircleCheck}
        disabled={pay.isPending}
        aria-label={t('purchaseOrders.markPaidLabel', { number: po.number })}
        onClick={() => pay.mutate()}
      >
        {t('purchaseOrders.markPaid')}
      </Button>
      {pay.isError && (
        <span className="field-error po-status-error" role="alert">
          {poErrorMessage(t, pay.error)}
        </span>
      )}
    </span>
  );
}

/** Events table: list-page log (with PO number links) and the PO page history (without). */
export function PurchaseOrderEventTable({
  events,
  caption,
  showNumber,
}: {
  events: PurchaseOrderEvent[];
  caption: string;
  showNumber: boolean;
}) {
  const { t } = useTranslation();
  const lang = useLang();
  const { data: reference } = useReference();
  const columns: DataTableColumn<PurchaseOrderEvent>[] = [
    {
      key: 'time',
      label: t('purchaseOrders.log.time'),
      className: 'po-col-time',
      cell: (e) => poDateTime(t, e.at, lang),
    },
    ...(showNumber
      ? [
          {
            key: 'number',
            label: t('purchaseOrders.log.number'),
            primary: true,
            className: 'po-col-number',
            cell: (e: PurchaseOrderEvent) => (
              <Link to={`/purchase-orders/${e.purchaseOrderId}`} className="po-link">
                <PoNumber number={e.number} />
              </Link>
            ),
          },
        ]
      : []),
    {
      key: 'event',
      label: t('purchaseOrders.log.event'),
      primary: !showNumber,
      cell: (e) => poEventText(t, e),
    },
    {
      key: 'actor',
      label: t('purchaseOrders.log.actor'),
      cell: (e) => poActorName(t, reference?.partners, e.partnerId),
    },
  ];
  return (
    <DataTable
      className="po-event-table"
      caption={caption}
      columns={columns}
      rows={events}
      rowKey={(e) => e.id}
      empty={<p className="table-empty">{t('purchaseOrders.log.empty')}</p>}
    />
  );
}
