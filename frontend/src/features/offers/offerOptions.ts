// Select options and clipboard helper of the offer screens.
import { useTranslation } from 'react-i18next';
import type { OfferDisposition, OfferEventType, OfferSource } from '../../api/enums';
import { OFFER_DISPOSITIONS, OFFER_EVENT_TYPES, OFFER_SOURCES } from '../../api/enums';
import type { InlineSelectOption } from '../../components/inline';
import { offerDispositionLabel, offerEventTypeLabel, offerSourceLabel } from '../../i18n/labels';

/** "None" option of the optional selects. */
export const NONE_LABEL = '–';

export function useOfferOptions() {
  const { t } = useTranslation();
  const none = { value: null, label: NONE_LABEL };
  const source: InlineSelectOption<OfferSource | null>[] = [
    none,
    ...OFFER_SOURCES.map((code) => ({ value: code, label: offerSourceLabel(t, code) })),
  ];
  const eventType: InlineSelectOption<OfferEventType | null>[] = [
    none,
    ...OFFER_EVENT_TYPES.map((code) => ({ value: code, label: offerEventTypeLabel(t, code) })),
  ];
  const disposition: InlineSelectOption<OfferDisposition>[] = OFFER_DISPOSITIONS.map((code) => ({
    value: code,
    label: offerDispositionLabel(t, code),
  }));
  return { source, eventType, disposition };
}

export type CopyResult = { kind: 'copied' } | { kind: 'failed'; url: string };

/** Copies a URL to the clipboard; when the browser refuses, the caller shows it for manual copy. */
export async function copyToClipboard(url: string): Promise<CopyResult> {
  try {
    if (!navigator.clipboard?.writeText) throw new Error('no clipboard');
    await navigator.clipboard.writeText(url);
    return { kind: 'copied' };
  } catch {
    return { kind: 'failed', url };
  }
}

