import { useMutation } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { INVOICE_ROW_STATUSES, type InvoiceRowStatus } from '../../api/enums';
import { invoiceRowsApi } from '../../api/endpoints';
import type { EventDetail, InvoiceRow, InvoiceRowUpdate } from '../../api/types';
import { Button, IconButton } from '../../components/Button';
import { Card } from '../../components/Card';
import { Field, MoneyInput } from '../../components/fields';
import { InlineMoney, InlineSelect, InlineText } from '../../components/inline';
import { Notice } from '../../components/Notice';
import { StatusTag } from '../../components/StatusTag';
import { apiErrorMessage, apiFieldErrors, invoiceRowStatusLabel } from '../../i18n/labels';
import { useLang } from '../../i18n/useLang';
import { formatDate, formatMoney, formatTime } from '../../lib/format';
import { parseMoneyField } from '../../lib/moneyField';
import { usePartner } from '../../reference/useReference';
import { ConfirmDialog } from '../offers/offerParts';
import { InvoiceStateTag } from './EventStatusTag';
import { INVOICE_ROW_STATUS_TONE } from './eventStatusTone';
import { useApplyEvent } from './queries';

/** Contract: description 1–500 chars. */
const DESCRIPTION_MAX = 500;

interface Props {
  event: EventDetail;
  /** Deleted gig: rows shown read-only, no add / remove. */
  readOnly: boolean;
}

/**
 * "Laskutus" card under the price card (api-contract "Invoice rows", "Invoicing: one label"): the
 * gig's invoicing state tag on top, one row per invoice (description, amount, status, last change),
 * an add form, and the totals Laskutettu (sent + paid), Avoimet (sent, not paid), Maksettu (paid)
 * and Saldo (total − paid; warns when negative). Editable on upcoming, played and cancelled gigs
 * (cancellation fees can be invoiced).
 */
export function EventInvoicing({ event, readOnly }: Props) {
  const { t } = useTranslation();
  const lang = useLang();
  const applyEvent = useApplyEvent();
  const [adding, setAdding] = useState(false);
  const apply = (updated: EventDetail) => applyEvent(updated, event.id);
  const negative = event.balanceCents < 0;
  const rows = event.invoiceRows;

  return (
    <Card as="div" className="event-invoicing">
      <div className="invoice-state" role="group" aria-label={t('event.invoicing.state')}>
        <InvoiceStateTag state={event.invoiceState} />
      </div>
      {rows.length === 0 ? (
        <p className="table-empty invoice-rows-empty">{t('event.invoicing.empty')}</p>
      ) : (
        <div className="table-wrap">
          <table className="data-table data-table-cards invoice-table">
            <caption className="visually-hidden">{t('event.invoicing.rows')}</caption>
            <thead>
              <tr>
                <th scope="col">{t('event.invoicing.description')}</th>
                <th scope="col" className="num">
                  {t('event.invoicing.amount')}
                </th>
                <th scope="col">{t('event.invoicing.status')}</th>
                {!readOnly && (
                  <th scope="col">
                    <span className="visually-hidden">{t('event.actions.label')}</span>
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <InvoiceRowItem key={row.id} row={row} readOnly={readOnly} onDone={apply} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!readOnly &&
        (adding ? (
          <AddInvoiceRowForm
            event={event}
            onDone={(updated) => {
              apply(updated);
              setAdding(false);
            }}
            onCancel={() => setAdding(false)}
          />
        ) : (
          <Button className="invoice-add-button" onClick={() => setAdding(true)}>
            + {t('event.invoicing.add')}
          </Button>
        ))}

      <dl className="invoice-totals">
        <div>
          <dt>{t('event.invoicing.invoiced')}</dt>
          <dd>{formatMoney(event.invoicedCents, lang)}</dd>
        </div>
        <div>
          <dt>{t('event.invoicing.open')}</dt>
          <dd>{formatMoney(event.openCents, lang)}</dd>
        </div>
        <div>
          <dt>{t('event.invoicing.paid')}</dt>
          <dd>{formatMoney(event.paidCents, lang)}</dd>
        </div>
      </dl>
      <div
        className={`event-fields-total event-balance${negative ? ' event-balance-negative' : ''}`}
        role="group"
        aria-label={t('event.invoicing.balance')}
      >
        <span className="event-fields-total-label">{t('event.invoicing.balance')}</span>
        <strong className="event-fields-total-value">{formatMoney(event.balanceCents, lang)}</strong>
        {negative && (
          <p className="event-balance-warning" role="note">
            {t('event.invoicing.negativeBalance')}
          </p>
        )}
      </div>
    </Card>
  );
}

function useStatusOptions() {
  const { t } = useTranslation();
  return INVOICE_ROW_STATUSES.map((value) => ({ value, label: invoiceRowStatusLabel(t, value) }));
}

function InvoiceRowItem({
  row,
  readOnly,
  onDone,
}: {
  row: InvoiceRow;
  readOnly: boolean;
  onDone: (event: EventDetail) => void;
}) {
  const { t } = useTranslation();
  const lang = useLang();
  const statusBy = usePartner(row.statusBy);
  const statusOptions = useStatusOptions();
  const [removing, setRemoving] = useState(false);
  const update = async (body: InvoiceRowUpdate) => onDone(await invoiceRowsApi.update(row.id, body));
  const name = row.description;
  const statusLabel = invoiceRowStatusLabel(t, row.status);

  return (
    <tr className={`invoice-row invoice-row-${row.status.toLowerCase()}`}>
      <td className="cell-primary invoice-row-description">
        {readOnly ? (
          row.description
        ) : (
          <InlineText
            label={`${t('event.invoicing.description')}: ${name}`}
            hideLabel
            required
            value={row.description}
            maxLength={DESCRIPTION_MAX}
            field="description"
            onSave={(description) => update({ description })}
          />
        )}
      </td>
      <td className="num invoice-row-amount" data-label={t('event.invoicing.amount')}>
        {readOnly ? (
          formatMoney(row.amountCents, lang)
        ) : (
          <InlineMoney
            label={`${t('event.invoicing.amount')}: ${name}`}
            hideLabel
            required
            value={row.amountCents}
            field="amountCents"
            validate={(cents) => (cents <= 0 ? 'INVALID_VALUE' : null)}
            onSave={(amountCents) => update({ amountCents })}
          />
        )}
      </td>
      <td className="invoice-row-status-cell" data-label={t('event.invoicing.status')}>
        <div className="invoice-row-status-wrap">
          {readOnly ? (
            <StatusTag tone={INVOICE_ROW_STATUS_TONE[row.status]}>{statusLabel}</StatusTag>
          ) : (
            <InlineSelect<InvoiceRowStatus>
              label={`${t('event.invoicing.status')}: ${name}`}
              hideLabel
              className={`invoice-row-status tone-${INVOICE_ROW_STATUS_TONE[row.status]}`}
              value={row.status}
              field="status"
              options={statusOptions}
              onSave={(status) => update({ status })}
            />
          )}
          {/* Last status change (who / when); migrated or imported rows have none. */}
          {row.statusAt && (
            <span className="meta small invoice-row-changed" title={t('event.invoicing.changed')}>
              {t('event.invoicing.by', {
                name: statusBy?.name ?? '–',
                date: formatDate(row.statusAt, lang),
                time: formatTime(row.statusAt, lang),
              })}
            </span>
          )}
        </div>
      </td>
      {!readOnly && (
        <td className="invoice-row-actions">
          <IconButton
            variant="ghost"
            icon={Trash2}
            label={`${t('common.remove')}: ${name}`}
            className="invoice-row-remove"
            onClick={() => setRemoving(true)}
          />
          {removing && (
            <ConfirmDialog
              title={t('event.invoicing.removeTitle')}
              confirmLabel={t('common.remove')}
              danger
              mutationFn={() => invoiceRowsApi.remove(row.id)}
              onClose={() => setRemoving(false)}
              onDone={(updated) => {
                setRemoving(false);
                onDone(updated);
              }}
            >
              <p>
                {t('event.invoicing.removeConfirm', {
                  row: `${name} · ${formatMoney(row.amountCents, lang)} · ${statusLabel}`,
                })}
              </p>
            </ConfirmDialog>
          )}
        </td>
      )}
    </tr>
  );
}

function AddInvoiceRowForm({
  event,
  onDone,
  onCancel,
}: {
  event: EventDetail;
  onDone: (event: EventDetail) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const lang = useLang();
  const statusOptions = useStatusOptions();
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [status, setStatus] = useState<InvoiceRowStatus>('READY');
  const [localErrors, setLocalErrors] = useState<Record<string, string>>({});
  const add = useMutation({
    mutationFn: () =>
      invoiceRowsApi.create(event.id, {
        description: description.trim(),
        amountCents: parseMoneyField(amount, lang, true).cents ?? 0,
        status,
      }),
    onSuccess: onDone,
  });
  const serverFields = add.isError ? apiFieldErrors(t, add.error) : {};
  const errors = { ...serverFields, ...localErrors };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    const text = description.trim();
    if (!text) next.description = t('fields.REQUIRED');
    else if (text.length > DESCRIPTION_MAX) next.description = t('fields.TOO_LONG');
    const parsed = parseMoneyField(amount, lang, true);
    if (parsed.error) next.amountCents = t(`fields.${parsed.error}`);
    else if ((parsed.cents ?? 0) <= 0) next.amountCents = t('fields.INVALID_VALUE');
    setLocalErrors(next);
    if (Object.keys(next).length === 0) add.mutate();
  };

  return (
    <form className="inline-form invoice-add-form" onSubmit={submit} noValidate aria-label={t('event.invoicing.add')}>
      <h3 className="invoice-add-title">{t('event.invoicing.add')}</h3>
      <Field label={t('event.invoicing.description')} error={errors.description}>
        {(p) => (
          <input {...p} type="text" value={description} onChange={(e) => setDescription(e.target.value)} />
        )}
      </Field>
      <div className="form-row">
        <Field label={t('event.invoicing.amount')} error={errors.amountCents}>
          {(p) => <MoneyInput {...p} value={amount} onChange={setAmount} />}
        </Field>
        <Field label={t('event.invoicing.status')} error={errors.status}>
          {(p) => (
            <select {...p} value={status} onChange={(e) => setStatus(e.target.value as InvoiceRowStatus)}>
              {statusOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          )}
        </Field>
      </div>
      {add.isError && Object.keys(serverFields).length === 0 && (
        <Notice tone="danger" role="alert">
          <p>{apiErrorMessage(t, add.error)}</p>
        </Notice>
      )}
      <div className="form-actions">
        <Button type="submit" variant="primary" disabled={add.isPending}>
          {t('event.invoicing.add')}
        </Button>
        <Button onClick={onCancel}>{t('common.cancel')}</Button>
      </div>
    </form>
  );
}
