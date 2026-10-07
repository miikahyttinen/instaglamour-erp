import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { isApiError } from '../../api/client';
import { offersApi } from '../../api/endpoints';
import type { OfferConvertResponse, OfferSummary } from '../../api/types';
import { useLang } from '../../i18n/useLang';
import { formatDateWithWeekday, formatMoney } from '../../lib/format';
import { useReference } from '../../reference/useReference';
import { ConfirmDialog } from './offerParts';
import { offerKeys, useApplyConvert } from './queries';

interface Props {
  offer: OfferSummary;
  onClose: () => void;
  onConverted: (result: OfferConvertResponse) => void;
  /** 409 ALREADY_CONVERTED: the caller refetches and shows the gig link instead (E1). */
  onAlreadyConverted: () => void;
}

/**
 * Convert to gig (UC-031 A1): shows what will be created per BR-105 (date, venue + city, client,
 * price, seller = producer, custom lineup = event name). Confirm is disabled while the request
 * runs, so a double click sends one request (AC-3).
 */
export function ConvertDialog({ offer, onClose, onConverted, onAlreadyConverted }: Props) {
  const { t } = useTranslation();
  const lang = useLang();
  const queryClient = useQueryClient();
  const applyConvert = useApplyConvert();
  const { data: reference } = useReference();
  const seller = reference?.partners.find((p) => p.id === offer.sellerId)?.name ?? '–';
  const rows: [string, string][] = [
    [t('convert.date'), formatDateWithWeekday(offer.eventDate, lang)],
    [t('convert.venue'), [offer.venue, offer.city].filter(Boolean).join(', ')],
    [t('convert.client'), offer.clientName],
    [t('convert.lineup'), offer.eventName],
    [t('convert.price'), formatMoney(offer.priceCents ?? 0, lang)],
    [t('convert.seller'), seller],
  ];
  return (
    <ConfirmDialog
      title={t('convert.title')}
      confirmLabel={t('convert.confirm')}
      mutationFn={() => offersApi.convert(offer.id)}
      onClose={onClose}
      onDone={(result) => {
        void applyConvert(result.offer);
        onConverted(result);
      }}
      onError={(error) => {
        if (isApiError(error) && error.code === 'ALREADY_CONVERTED') {
          void queryClient.invalidateQueries({ queryKey: offerKeys.all });
          onAlreadyConverted();
          return true;
        }
        return false;
      }}
    >
      <p className="offer-dialog-intro">{t('convert.intro')}</p>
      <dl className="offer-convert-facts">
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt className="label">{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </ConfirmDialog>
  );
}
