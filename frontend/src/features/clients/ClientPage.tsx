import { Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ApiError } from '../../api/client';
import type { Client, EventSummary, OfferSummary } from '../../api/types';
import { Button } from '../../components/Button';
import { DataTable, type DataTableColumn } from '../../components/DataTable';
import { Dialog } from '../../components/Dialog';
import { FieldList } from '../../components/FieldList';
import { InlineText, InlineTextarea } from '../../components/inline';
import { Notice } from '../../components/Notice';
import { PageHead } from '../../components/PageHead';
import { SectionLabel } from '../../components/SectionLabel';
import { StatusTag } from '../../components/StatusTag';
import { apiErrorMessage, eventDisplayStatus, offerDispositionLabel, offerStatusLabel } from '../../i18n/labels';
import { useLang } from '../../i18n/useLang';
import { formatDate, formatDateRange, formatMoney } from '../../lib/format';
import { EventStatusTag } from '../events/EventStatusTag';
import { useClient, useDeleteClient, useUpdateClient } from './queries';
import './clients.css';

/**
 * One client (UC-027 step 3): name and notes edited in place (A1), the client's events and offers
 * of all years (newest first, linking to their pages) and delete with confirmation (A3, E2).
 */
export function ClientPage() {
  const { t } = useTranslation();
  const { id = '' } = useParams();
  const query = useClient(id);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const backLink = (
    <p className="back-link">
      <Link to="/clients">{t('clients.back')}</Link>
    </p>
  );

  if (query.isPending) {
    return (
      <section className="page clients-page">
        {backLink}
        <p role="status" className="meta">
          {t('app.loading')}
        </p>
      </section>
    );
  }
  if (query.isError) {
    const notFound = query.error instanceof ApiError && query.error.status === 404;
    return (
      <section className="page clients-page">
        {backLink}
        <Notice tone="danger" role="alert" className="clients-load-error">
          <p>{notFound ? t('clients.notFound') : apiErrorMessage(t, query.error)}</p>
          {!notFound && (
            <Button size="sm" onClick={() => void query.refetch()}>
              {t('app.retry')}
            </Button>
          )}
        </Notice>
      </section>
    );
  }

  const { client, events, offers } = query.data;
  return (
    <section className="page clients-page">
      <PageHead
        title={client.name}
        actions={
          <Button variant="danger" icon={Trash2} onClick={() => setConfirmDelete(true)}>
            {t('clients.delete')}
          </Button>
        }
      >
        {backLink}
      </PageHead>

      <ClientFields client={client} />

      <section className="client-section" aria-labelledby="client-events-title">
        <SectionLabel id="client-events-title">{t('clients.events.title')}</SectionLabel>
        <ClientEvents events={events} />
      </section>

      <section className="client-section" aria-labelledby="client-offers-title">
        <SectionLabel id="client-offers-title">{t('clients.offers.title')}</SectionLabel>
        <ClientOffers offers={offers} />
      </section>

      {confirmDelete && <DeleteDialog client={client} onClose={() => setConfirmDelete(false)} />}
    </section>
  );
}

/** Name and notes, one PATCH per field (NFR-8). Empty or duplicate name → field error (E1). */
function ClientFields({ client }: { client: Client }) {
  const { t } = useTranslation();
  const update = useUpdateClient();
  return (
    <FieldList className="client-fields">
      <InlineText
        label={t('clients.name')}
        required
        maxLength={500}
        value={client.name}
        field="name"
        onSave={(name) => update.mutateAsync({ id: client.id, body: { name } })}
      />
      <InlineTextarea
        label={t('clients.notes')}
        value={client.notes}
        maxLength={5000}
        rows={3}
        placeholder="–"
        field="notes"
        onSave={(notes) => update.mutateAsync({ id: client.id, body: { notes } })}
      />
    </FieldList>
  );
}

function ClientEvents({ events }: { events: EventSummary[] }) {
  const { t } = useTranslation();
  const lang = useLang();
  const columns: DataTableColumn<EventSummary>[] = [
    {
      key: 'date',
      label: t('clients.events.date'),
      primary: true,
      className: 'client-col-date',
      cell: (event) => (
        <Link to={`/gigs/${event.id}`}>{formatDateRange(event.startDate, event.endDate, lang)}</Link>
      ),
    },
    { key: 'lineup', label: t('clients.events.lineup'), cell: (event) => event.lineupName },
    { key: 'venue', label: t('clients.events.venue'), cell: (event) => event.venue },
    {
      key: 'status',
      label: t('clients.events.status'),
      cell: (event) => <EventStatusTag status={eventDisplayStatus(event)} />,
    },
    {
      key: 'total',
      label: t('clients.events.totalPrice'),
      numeric: true,
      cell: (event) => formatMoney(event.totalPriceCents, lang),
    },
  ];
  return (
    <DataTable
      className="client-events"
      caption={t('clients.events.caption')}
      columns={columns}
      rows={events}
      rowKey={(event) => event.id}
      empty={<p className="empty">{t('clients.events.empty')}</p>}
    />
  );
}

const OFFER_TONE = { OPEN: 'info', ACCEPTED: 'ok', REJECTED: 'danger' } as const;

function ClientOffers({ offers }: { offers: OfferSummary[] }) {
  const { t } = useTranslation();
  const lang = useLang();
  const columns: DataTableColumn<OfferSummary>[] = [
    {
      key: 'date',
      label: t('clients.offers.eventDate'),
      className: 'client-col-date',
      cell: (offer) => formatDate(offer.eventDate, lang),
    },
    {
      key: 'event',
      label: t('clients.offers.event'),
      primary: true,
      cell: (offer) => <Link to={`/offers/${offer.id}`}>{offer.eventName}</Link>,
    },
    {
      key: 'status',
      label: t('clients.offers.status'),
      cell: (offer) => (
        <span className="client-offer-status">
          <StatusTag tone={OFFER_TONE[offer.status]}>{offerStatusLabel(t, offer.status)}</StatusTag>
          {offer.expired && <StatusTag tone="warn">{t('clients.offers.expired')}</StatusTag>}
          {offer.status === 'REJECTED' && (
            <span className="muted small">{offerDispositionLabel(t, offer.disposition)}</span>
          )}
        </span>
      ),
    },
    {
      key: 'price',
      label: t('clients.offers.price'),
      numeric: true,
      cell: (offer) => (offer.priceCents === null ? '–' : formatMoney(offer.priceCents, lang)),
    },
  ];
  return (
    <DataTable
      className="client-offers"
      caption={t('clients.offers.caption')}
      columns={columns}
      rows={offers}
      rowKey={(offer) => offer.id}
      empty={<p className="empty">{t('clients.offers.empty')}</p>}
    />
  );
}

/** Delete with confirmation (A3). Linked events/offers → 409 CLIENT_IN_USE message (E2, BR-101). */
function DeleteDialog({ client, onClose }: { client: Client; onClose: () => void }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const remove = useDeleteClient();
  const inUse = remove.error instanceof ApiError && remove.error.code === 'CLIENT_IN_USE';
  return (
    <Dialog title={t('clients.deleteTitle')} onClose={onClose}>
      <p>{t('clients.deleteConfirm', { name: client.name })}</p>
      {remove.isError && (
        <Notice tone="danger" role="alert">
          <p>{inUse ? t('clients.deleteInUse') : apiErrorMessage(t, remove.error)}</p>
        </Notice>
      )}
      <div className="form-actions">
        <Button
          variant="danger"
          disabled={remove.isPending || inUse}
          onClick={() =>
            remove.mutate(client.id, {
              onSuccess: () => void navigate('/clients', { state: { deletedClient: client.name } }),
            })
          }
        >
          {t('clients.delete')}
        </Button>
        <Button onClick={onClose}>{t('common.cancel')}</Button>
      </div>
    </Dialog>
  );
}
