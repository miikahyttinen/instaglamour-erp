import { FileText } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import type { Id } from '../../api/types';
import { useOffer } from '../offers/queries';

/**
 * "From offer: <event>" on an event converted from an offer (UC-031 step 3). The event name comes
 * from the offer; while it loads (or if it can't be read) the link shows "Offers".
 */
export function EventOfferLink({ offerId }: { offerId: Id }) {
  const { t } = useTranslation();
  const offer = useOffer(offerId);
  return (
    <p className="event-offer-link">
      <FileText aria-hidden="true" />
      <span className="label">{t('convert.fromOffer')}:</span>{' '}
      <Link to={`/offers/${offerId}`}>{offer.data?.eventName ?? t('offer.back')}</Link>
    </p>
  );
}
