import { useMutation } from '@tanstack/react-query';
import { ArrowLeft, Ban, CircleCheck, Undo2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { isApiError } from '../../api/client';
import { purchaseOrdersApi } from '../../api/endpoints';
import type { PurchaseOrder, PurchaseOrderLine } from '../../api/types';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { DataTable, type DataTableColumn } from '../../components/DataTable';
import { Dialog } from '../../components/Dialog';
import { Field } from '../../components/fields';
import { Notice } from '../../components/Notice';
import { PageHead } from '../../components/PageHead';
import { SectionLabel } from '../../components/SectionLabel';
import { apiErrorMessage, apiFieldErrors, costTypeLabel } from '../../i18n/labels';
import { useLang } from '../../i18n/useLang';
import { formatDate, formatMoney } from '../../lib/format';
import { usePartner } from '../../reference/useReference';
import { PurchaseOrderEventTable, PurchaseOrderStatusTag } from './poParts';
import { poDateTime, poErrorMessage } from './poText';
import { useApplyPurchaseOrder, usePurchaseOrder, usePurchaseOrderHistory } from './queries';
import './purchaseOrders.css';

/** Contract: cancel reason ≤ 500 chars. */
const REASON_MAX = 500;

type DialogKind = 'unpay' | 'cancel' | null;

function BackLink() {
  const { t } = useTranslation();
  return (
    <p className="po-back">
      <Link to="/purchase-orders">
        <ArrowLeft />
        {t('purchaseOrders.page.back')}
      </Link>
    </p>
  );
}

/** One purchase order (UC-034 step 5): facts, fee lines, Mark paid / Unmark paid / Cancel, history. */
export function PurchaseOrderPage() {
  const { id = '' } = useParams();
  const { t } = useTranslation();
  const query = usePurchaseOrder(id);

  if (query.isPending) {
    return (
      <section className="page">
        <p role="status">{t('app.loading')}</p>
      </section>
    );
  }
  if (query.isError) {
    return (
      <section className="page purchase-orders-page po-page">
        <BackLink />
        <Notice tone="danger" role="alert">
          <p>{apiErrorMessage(t, query.error)}</p>
        </Notice>
      </section>
    );
  }
  return <PurchaseOrderView po={query.data} />;
}

function PurchaseOrderView({ po }: { po: PurchaseOrder }) {
  const { t } = useTranslation();
  const lang = useLang();
  const apply = useApplyPurchaseOrder();
  const [dialog, setDialog] = useState<DialogKind>(null);
  const paidBy = usePartner(po.paidBy);
  const cancelledBy = usePartner(po.cancelledBy);

  const onError = (error: unknown) => {
    if (isApiError(error) && error.code === 'INVALID_STATUS_TRANSITION') apply(null);
  };
  const pay = useMutation({ mutationFn: () => purchaseOrdersApi.pay(po.id), onSuccess: apply, onError });

  const actions =
    po.status === 'OPEN' ? (
      <div className="po-actions" role="group" aria-label={t('purchaseOrders.page.actions')}>
        <Button variant="primary" icon={CircleCheck} disabled={pay.isPending} onClick={() => pay.mutate()}>
          {t('purchaseOrders.markPaid')}
        </Button>
        <Button variant="danger" icon={Ban} onClick={() => setDialog('cancel')}>
          {t('purchaseOrders.cancel')}
        </Button>
      </div>
    ) : po.status === 'PAID' ? (
      <div className="po-actions" role="group" aria-label={t('purchaseOrders.page.actions')}>
        <Button icon={Undo2} onClick={() => setDialog('unpay')}>
          {t('purchaseOrders.unmarkPaid')}
        </Button>
      </div>
    ) : null;

  return (
    <section className="page purchase-orders-page po-page">
      <PageHead title={po.number} subtitle={<PurchaseOrderStatusTag po={po} />} actions={actions}>
        <BackLink />
      </PageHead>

      {pay.isError && (
        <Notice tone="danger" role="alert" className="po-notice">
          <p>{poErrorMessage(t, pay.error)}</p>
        </Notice>
      )}

      <div className="po-layout">
        <Card as="div" className="po-facts-card">
          <dl className="po-facts">
            <div>
              <dt>{t('purchaseOrders.page.freelancer')}</dt>
              <dd>
                <Link to={`/people/${po.personId}`}>{po.personName}</Link>
              </dd>
            </div>
            <div>
              <dt>{t('purchaseOrders.page.created')}</dt>
              <dd>{poDateTime(t, po.createdAt, lang)}</dd>
            </div>
            <div>
              <dt>{t('purchaseOrders.page.lineCount')}</dt>
              <dd className="num">{po.lines.length}</dd>
            </div>
            <div>
              <dt>{t('purchaseOrders.page.total')}</dt>
              <dd className="num po-total">{formatMoney(po.totalCents, lang)}</dd>
            </div>
            {po.status === 'PAID' && (
              <div>
                <dt>{t('purchaseOrders.page.paid')}</dt>
                <dd>
                  {poDateTime(t, po.paidAt, lang)} · {paidBy?.name ?? '–'}
                </dd>
              </div>
            )}
            {po.status === 'CANCELLED' && (
              <>
                <div>
                  <dt>{t('purchaseOrders.page.cancelled')}</dt>
                  <dd>
                    {poDateTime(t, po.cancelledAt, lang)} · {cancelledBy?.name ?? '–'}
                  </dd>
                </div>
                <div>
                  <dt>{t('purchaseOrders.page.cancelReason')}</dt>
                  <dd className="po-reason">{po.cancelReason ?? '–'}</dd>
                </div>
              </>
            )}
          </dl>
        </Card>

        <section aria-labelledby="po-lines-title">
          <SectionLabel id="po-lines-title">{t('purchaseOrders.page.lines')}</SectionLabel>
          <LinesTable po={po} />
        </section>

        <section aria-labelledby="po-history-title">
          <SectionLabel id="po-history-title">{t('purchaseOrders.page.history')}</SectionLabel>
          <PoHistory id={po.id} />
        </section>
      </div>

      {dialog === 'unpay' && <UnpayDialog po={po} onClose={() => setDialog(null)} />}
      {dialog === 'cancel' && <CancelDialog po={po} onClose={() => setDialog(null)} />}
    </section>
  );
}

function LinesTable({ po }: { po: PurchaseOrder }) {
  const { t } = useTranslation();
  const lang = useLang();
  const role = (l: PurchaseOrderLine) =>
    l.description ? `${costTypeLabel(t, l.type)} · ${l.description}` : costTypeLabel(t, l.type);
  const columns: DataTableColumn<PurchaseOrderLine>[] = [
    {
      key: 'date',
      label: t('purchaseOrders.lines.date'),
      primary: true,
      className: 'po-col-date',
      cell: (l) => formatDate(l.eventStartDate, lang),
    },
    { key: 'venue', phoneBare: true, label: t('purchaseOrders.lines.venue'), cell: (l) => l.eventVenue },
    { key: 'lineup', phoneBare: true, label: t('purchaseOrders.lines.lineup'), cell: (l) => l.eventLineupName },
    { key: 'role', phoneBare: true, label: t('purchaseOrders.lines.role'), cell: role },
    {
      key: 'amount',
      phoneMain: true,
      label: t('purchaseOrders.lines.amount'),
      numeric: true,
      cell: (l) => formatMoney(l.amountCents, lang),
    },
    {
      key: 'event',
      phoneBare: true,
      label: t('purchaseOrders.lines.event'),
      cell: (l) => (
        <Link to={`/gigs/${l.eventId}`} aria-label={`${t('purchaseOrders.lines.openEvent')}: ${l.eventVenue}`}>
          {t('purchaseOrders.lines.openEvent')}
        </Link>
      ),
    },
  ];
  return (
    <DataTable
      className="po-lines-table"
      caption={t('purchaseOrders.page.linesCaption')}
      columns={columns}
      rows={po.lines}
      rowKey={(l) => l.costLineId}
      footer={
        <tr className="po-lines-total">
          <td colSpan={4} data-label={t('purchaseOrders.lines.total')}>
            {t('purchaseOrders.lines.total')}
          </td>
          <td className="num" data-label={t('purchaseOrders.lines.total')}>
            {formatMoney(po.totalCents, lang)}
          </td>
          <td aria-hidden="true" />
        </tr>
      }
    />
  );
}

function PoHistory({ id }: { id: string }) {
  const { t } = useTranslation();
  const history = usePurchaseOrderHistory(id);
  if (history.isPending) return <p className="meta">{t('app.loading')}</p>;
  if (history.isError) {
    return (
      <Notice tone="danger" role="alert">
        <p>{apiErrorMessage(t, history.error)}</p>
      </Notice>
    );
  }
  return (
    <PurchaseOrderEventTable events={history.data} caption={t('purchaseOrders.page.history')} showNumber={false} />
  );
}

function UnpayDialog({ po, onClose }: { po: PurchaseOrder; onClose: () => void }) {
  const { t } = useTranslation();
  const apply = useApplyPurchaseOrder();
  const unpay = useMutation({
    mutationFn: () => purchaseOrdersApi.unpay(po.id),
    onSuccess: (updated) => {
      apply(updated);
      onClose();
    },
    onError: (error) => {
      if (isApiError(error) && error.code === 'INVALID_STATUS_TRANSITION') apply(null);
    },
  });
  return (
    <Dialog title={t('purchaseOrders.unpayTitle')} onClose={onClose}>
      <p>{t('purchaseOrders.unpayConfirm', { number: po.number })}</p>
      {unpay.isError && (
        <Notice tone="danger" role="alert">
          <p>{poErrorMessage(t, unpay.error)}</p>
        </Notice>
      )}
      <div className="form-actions">
        <Button variant="primary" icon={Undo2} disabled={unpay.isPending} onClick={() => unpay.mutate()}>
          {t('purchaseOrders.unmarkPaid')}
        </Button>
        <Button onClick={onClose}>{t('common.cancel')}</Button>
      </div>
    </Dialog>
  );
}

/** Reason required (BR-117); confirm stays disabled until one is given. */
function CancelDialog({ po, onClose }: { po: PurchaseOrder; onClose: () => void }) {
  const { t } = useTranslation();
  const apply = useApplyPurchaseOrder();
  const [reason, setReason] = useState('');
  const cancel = useMutation({
    mutationFn: (value: string) => purchaseOrdersApi.cancel(po.id, { reason: value }),
    onSuccess: (updated) => {
      apply(updated);
      onClose();
    },
    onError: (error) => {
      if (isApiError(error) && error.code === 'INVALID_STATUS_TRANSITION') apply(null);
    },
  });
  const fieldErrors = cancel.isError ? apiFieldErrors(t, cancel.error) : {};
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (reason.trim()) cancel.mutate(reason.trim());
  };
  return (
    <Dialog title={t('purchaseOrders.cancelTitle')} onClose={onClose}>
      <form onSubmit={submit} noValidate>
        <p className="po-dialog-intro">{t('purchaseOrders.cancelIntro')}</p>
        <Field label={t('purchaseOrders.reason')} error={fieldErrors.reason}>
          {(p) => (
            <textarea
              {...p}
              rows={3}
              required
              maxLength={REASON_MAX}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          )}
        </Field>
        {cancel.isError && !fieldErrors.reason && (
          <Notice tone="danger" role="alert">
            <p>{poErrorMessage(t, cancel.error)}</p>
          </Notice>
        )}
        <div className="form-actions">
          <Button type="submit" variant="danger" disabled={!reason.trim() || cancel.isPending}>
            {t('purchaseOrders.confirmCancel')}
          </Button>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
        </div>
      </form>
    </Dialog>
  );
}
