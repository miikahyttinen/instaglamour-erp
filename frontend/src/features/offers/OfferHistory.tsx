import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import type { Id } from '../../api/types';
import { Notice } from '../../components/Notice';
import { apiErrorMessage, offerHistoryTypeLabel } from '../../i18n/labels';
import { useLang } from '../../i18n/useLang';
import { formatDateTime } from '../../lib/format';
import { useReference } from '../../reference/useReference';
import { useClientList } from '../clients/queries';
import { offerEventLines } from './offerHistoryText';
import { useOfferHistory } from './queries';

/** Read-only offer history, newest first (UC-029 AC-2: disposition history visible). */
export function OfferHistory({ offerId }: { offerId: Id }) {
  const { t } = useTranslation();
  const lang = useLang();
  const { data: reference } = useReference();
  const { data: clients } = useClientList();
  const history = useOfferHistory(offerId);
  if (history.isPending) return <p role="status">{t('app.loading')}</p>;
  if (history.isError) {
    return (
      <Notice tone="danger" role="alert">
        <p>{apiErrorMessage(t, history.error)}</p>
      </Notice>
    );
  }
  if (history.data.length === 0) return <p className="muted">{t('offerHistory.empty')}</p>;
  const ctx = { partners: reference?.partners, clients };
  return (
    <ol className="history-list offer-history" aria-label={t('offer.sections.history')}>
      {history.data.map((event) => {
        const partner = reference?.partners.find((p) => p.id === event.partnerId)?.name ?? '–';
        return (
          <li key={event.id} className="history-item">
            <div className="history-title">
              <strong className="history-event">{offerHistoryTypeLabel(t, event.type)}</strong>
              <span className="meta history-meta">
                {formatDateTime(event.at, lang)} · {partner}
              </span>
            </div>
            {offerEventLines(t, lang, event, ctx).map((line, i) => (
              <p key={i} className="history-line">
                {line}
              </p>
            ))}
            {event.type === 'CONVERTED' && event.details?.gigId && (
              <p className="history-line">
                {t('offerHistory.gigCreated')} <Link to={`/gigs/${event.details.gigId}`}>{t('offerHistory.openGig')}</Link>
              </p>
            )}
          </li>
        );
      })}
    </ol>
  );
}
