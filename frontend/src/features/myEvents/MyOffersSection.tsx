import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Button } from '../../components/Button';
import { DataTable, type DataTableColumn } from '../../components/DataTable';
import { InlineCheckbox } from '../../components/inline';
import { Notice } from '../../components/Notice';
import { SectionLabel } from '../../components/SectionLabel';
import { StatusTag } from '../../components/StatusTag';
import { apiErrorMessage } from '../../i18n/labels';
import { useLang } from '../../i18n/useLang';
import { formatDateWithWeekday } from '../../lib/format';
import { offersApi } from '../../api/endpoints';
import { useApplyOffer } from '../offers/queries';
import { myOfferHref, myOfferRows, type MyOfferRow } from './myEventText';
import { useMyOffers } from './queries';

/**
 * My gigs, second section "Tarjoukset / Offers" (owner request 2026-11-09): the partner's own
 * offers needing attention. Red tag "Sopimus tekemättä" (contract not done), blue tag "Follow-up?"
 * (follow-up). Follow-up rows have a "Follow-up tehty / Follow-up done" checkbox (revised
 * 2026-11-09, the only place it is shown): ticking it PATCHes `followUpDone: true` at once and the
 * refetched list drops the row; a failed save shows an inline error. Phone rows like the gig
 * table: line 1 = event name + tag; line 2 = date · client · venue · checkbox (above the row link).
 */
export function MyOffersSection() {
  const { t } = useTranslation();
  const lang = useLang();
  const query = useMyOffers();
  const applyOffer = useApplyOffer();
  const title = t('myEvents.offers.title');

  const saveFollowUp = async (offerId: string, followUpDone: boolean) => {
    const updated = await offersApi.update(offerId, { followUpDone });
    await applyOffer(updated, offerId);
  };

  const columns: DataTableColumn<MyOfferRow>[] = [
    {
      key: 'date',
      phoneBare: true,
      label: t('myEvents.offers.columns.date'),
      className: 'my-events-date',
      cell: ({ offer }) => formatDateWithWeekday(offer.eventDate, lang),
    },
    {
      key: 'event',
      label: t('myEvents.offers.columns.event'),
      primary: true,
      cell: (row) => (
        <Link to={myOfferHref(row)} className="my-events-link" title={row.offer.eventName}>
          {row.offer.eventName}
        </Link>
      ),
    },
    {
      key: 'client',
      phoneBare: true,
      label: t('myEvents.offers.columns.client'),
      cell: ({ offer }) => offer.clientName,
    },
    {
      key: 'venue',
      phoneBare: true,
      label: t('myEvents.offers.columns.venue'),
      cell: ({ offer }) => [offer.venue, offer.city].filter(Boolean).join(', '),
    },
    {
      key: 'tag',
      phoneEnd: true,
      label: t('myEvents.offers.columns.tag'),
      className: 'my-events-staffing',
      cell: (row) =>
        row.kind === 'contractMissing' ? (
          <StatusTag tone="danger">{t('myEvents.offers.contractMissing')}</StatusTag>
        ) : (
          <StatusTag tone="info">{t('myEvents.offers.followUp')}</StatusTag>
        ),
    },
    {
      key: 'followUpDone',
      phoneBare: true,
      label: t('myEvents.offers.followUpDone'),
      header: <span className="visually-hidden">{t('myEvents.offers.followUpDone')}</span>,
      className: 'my-offers-follow-up',
      cell: (row) =>
        row.kind === 'followUp' ? (
          <InlineCheckbox
            label={t('myEvents.offers.followUpDone')}
            value={false}
            field="followUpDone"
            onSave={(next) => saveFollowUp(row.offer.offerId, next)}
          />
        ) : null,
    },
  ];

  return (
    <section className="my-offers" aria-labelledby="my-offers-title">
      <SectionLabel id="my-offers-title">{title}</SectionLabel>
      {query.isPending && (
        <p className="meta" role="status">
          {t('app.loading')}
        </p>
      )}
      {query.isError && (
        <Notice tone="danger" role="alert">
          <p>{apiErrorMessage(t, query.error)}</p>
          <Button size="sm" onClick={() => void query.refetch()}>
            {t('app.retry')}
          </Button>
        </Notice>
      )}
      {query.data && (
        <DataTable
          columns={columns}
          rows={myOfferRows(query.data)}
          rowKey={(row) => `${row.kind}-${row.offer.offerId}`}
          caption={title}
          empty={t('myEvents.offers.empty')}
          className="my-events-table my-offers-table"
        />
      )}
    </section>
  );
}
