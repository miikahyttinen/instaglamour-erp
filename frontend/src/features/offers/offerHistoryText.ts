import type { TFunction } from 'i18next';
import type { Language, OfferDisposition, OfferEventType, OfferSource } from '../../api/enums';
import type { ClientListItem, OfferEvent, Partner } from '../../api/types';
import { offerDispositionLabel, offerEventTypeLabel, offerSourceLabel } from '../../i18n/labels';
import { formatDate, formatMoney } from '../../lib/format';

export interface Ctx {
  partners: Partner[] | undefined;
  clients: ClientListItem[] | undefined;
}

/** Human-readable value of a changed offer field (BR-103). */
export function formatOfferValue(t: TFunction, lang: Language, field: string, value: unknown, ctx: Ctx): string {
  if (value === null || value === undefined || value === '') return '–';
  if (Array.isArray(value)) return value.length === 0 ? '–' : value.map(String).join(' / ');
  if (typeof value === 'boolean') return value ? t('history.yes') : t('history.no');
  switch (field) {
    case 'priceCents':
      return typeof value === 'number' ? formatMoney(value, lang) : String(value);
    case 'eventDate':
      return formatDate(String(value), lang);
    case 'sellerId':
      return ctx.partners?.find((p) => p.id === value)?.name ?? '–';
    case 'clientId':
      return ctx.clients?.find((c) => c.id === value)?.name ?? '–';
    case 'source':
      return offerSourceLabel(t, value as OfferSource);
    case 'eventType':
      return offerEventTypeLabel(t, value as OfferEventType);
    case 'disposition':
      return offerDispositionLabel(t, value as OfferDisposition);
    default:
      return String(value);
  }
}

/** Detail lines of one event; missing or unknown details give no lines. */
export function offerEventLines(t: TFunction, lang: Language, event: OfferEvent, ctx: Ctx): string[] {
  const details = event.details ?? {};
  if (event.type === 'UPDATED') {
    return (details.changes ?? []).map((c) =>
      t('history.change', {
        field: t(`offerField.${c.field}`, { defaultValue: c.field }),
        from: formatOfferValue(t, lang, c.field, c.from, ctx),
        to: formatOfferValue(t, lang, c.field, c.to, ctx),
      }),
    );
  }
  if (event.type === 'DISPOSITION_CHANGED' && details.from && details.to) {
    return [
      t('history.change', {
        field: t('offerField.disposition'),
        from: offerDispositionLabel(t, details.from),
        to: offerDispositionLabel(t, details.to),
      }),
    ];
  }
  return [];
}
