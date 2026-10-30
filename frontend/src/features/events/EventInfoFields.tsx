import { useTranslation } from 'react-i18next';
import type { Logistics, TechnicalSetup } from '../../api/enums';
import { eventsApi } from '../../api/endpoints';
import type { EventDetail, EventUpdate, EventUpdateResponse } from '../../api/types';
import {
  InlineMoney,
  InlineSelect,
  InlineSwitch,
  InlineText,
  InlineTextarea,
  type InlineSelectOption,
} from '../../components/inline';
import { Card } from '../../components/Card';
import { FieldList } from '../../components/FieldList';
import { useLang } from '../../i18n/useLang';
import { formatMoney } from '../../lib/format';
import { partnerOptions } from '../../reference/partners';
import { useReference } from '../../reference/useReference';
import { InlineClientSelect } from '../clients/ClientSelect';
import { NONE_LABEL, useLogisticsOptions, useTechnicalSetupOptions } from './eventOptions';
import { useApplyEvent } from './queries';

/** InlineSelect needs the current value among its options; an unknown code is shown as-is. */
function withCurrent<V extends string | null>(
  options: InlineSelectOption<V>[],
  current: V,
): InlineSelectOption<V>[] {
  return options.some((o) => o.value === current)
    ? options
    : [...options, { value: current, label: String(current) }];
}

interface Props {
  event: EventDetail;
  /** Deleted event: every field is shown disabled (muted value). */
  readOnly: boolean;
}

/** One PATCH per field (NFR-8); the page cache, history and year data follow the response. */
function useEventPatch(event: EventDetail) {
  const applyEvent = useApplyEvent();
  return async (body: EventUpdate): Promise<EventUpdateResponse> => {
    const result = await eventsApi.update(event.id, body);
    applyEvent(result.event, event.id);
    return result;
  };
}

/** Basic info edited in place (UC-004). Dates change via Move. */
export function EventBasicFields({
  event,
  readOnly,
  onPartnerSaved,
}: Props & {
  /** Seller/producer saved: the page names the moved Sales / Production lines (BR-027). */
  onPartnerSaved: (result: EventUpdateResponse, before: EventDetail) => void;
}) {
  const { t } = useTranslation();
  const { data: reference } = useReference();
  const patch = useEventPatch(event);
  const technicalSetupOptions = useTechnicalSetupOptions(reference);
  const logisticsOptions = useLogisticsOptions(reference);

  // Active partners only (BR-111), plus the event's current one if removed so it still shows.
  const sellerOptions = partnerOptions(reference?.partners, event.sellerId);
  const producerOptions = partnerOptions(reference?.partners, event.producerId);
  const savePartner = (body: EventUpdate) => {
    const before = event;
    return patch(body).then((result) => onPartnerSaved(result, before));
  };

  return (
    <Card as="div" className="event-fields">
      <FieldList>
        <InlineText
          label={t('eventForm.lineupName')}
          required
          value={event.lineupName}
          field="lineupName"
          disabled={readOnly}
          onSave={(lineupName) => patch({ lineupName })}
        />
        <InlineText
          label={t('eventForm.venue')}
          required
          value={event.venue}
          field="venue"
          disabled={readOnly}
          onSave={(venue) => patch({ venue })}
        />
        <InlineClientSelect
          label={t('clients.select.label')}
          value={event.clientId}
          currentName={event.clientName}
          disabled={readOnly}
          onSave={(clientId) => patch({ clientId })}
        />
        <InlineSelect<TechnicalSetup | null>
          label={t('eventForm.technicalSetup')}
          value={event.technicalSetup}
          field="technicalSetup"
          disabled={readOnly}
          options={withCurrent([{ value: null, label: NONE_LABEL }, ...technicalSetupOptions], event.technicalSetup)}
          onSave={(technicalSetup) => patch({ technicalSetup })}
        />
        <InlineSelect<Logistics | null>
          label={t('eventForm.logistics')}
          value={event.logistics}
          field="logistics"
          disabled={readOnly}
          options={withCurrent([{ value: null, label: NONE_LABEL }, ...logisticsOptions], event.logistics)}
          onSave={(logistics) => patch({ logistics })}
        />
        <InlineSwitch
          label={t('eventForm.houseTechnician')}
          value={event.houseTechnician}
          field="houseTechnician"
          disabled={readOnly}
          onSave={(houseTechnician) => patch({ houseTechnician })}
        />
        <InlineSelect
          label={t('eventForm.seller')}
          value={event.sellerId}
          field="sellerId"
          disabled={readOnly}
          options={sellerOptions}
          onSave={(sellerId) => savePartner({ sellerId })}
        />
        <InlineSelect
          label={t('eventForm.producer')}
          value={event.producerId}
          field="producerId"
          disabled={readOnly}
          options={producerOptions}
          onSave={(producerId) => savePartner({ producerId })}
        />
        {!readOnly && <p className="muted small event-fields-note">{t('event.sellerChangeHint')}</p>}
        <InlineTextarea
          label={t('eventForm.notes')}
          value={event.notes}
          field="notes"
          rows={3}
          placeholder="–"
          hint={readOnly ? undefined : t('eventForm.noCustomerData')}
          disabled={readOnly}
          onSave={(notes) => patch({ notes })}
        />
      </FieldList>
    </Card>
  );
}

/** Price and additional sales edited in place (UC-007); also on cancelled events (UC-010). */
export function EventPriceFields({ event, readOnly }: Props) {
  const { t } = useTranslation();
  const lang = useLang();
  const patch = useEventPatch(event);
  return (
    <Card as="div" className="event-fields">
      <FieldList>
        <InlineMoney
          label={t('eventForm.price')}
          required
          value={event.priceCents}
          field="priceCents"
          disabled={readOnly}
          onSave={(priceCents) => patch({ priceCents })}
        />
        <InlineMoney
          label={t('eventForm.additionalSales')}
          required
          value={event.additionalSalesCents}
          field="additionalSalesCents"
          disabled={readOnly}
          onSave={(additionalSalesCents) => patch({ additionalSalesCents })}
        />
        <InlineText
          label={t('eventForm.additionalSalesDescription')}
          value={event.additionalSalesDescription}
          field="additionalSalesDescription"
          placeholder="–"
          disabled={readOnly}
          onSave={(additionalSalesDescription) => patch({ additionalSalesDescription })}
        />
        <div className="event-fields-total" role="group" aria-label={t('eventForm.totalPrice')}>
          <span className="event-fields-total-label">{t('eventForm.totalPrice')}</span>
          <strong className="event-fields-total-value">{formatMoney(event.totalPriceCents, lang)}</strong>
        </div>
      </FieldList>
    </Card>
  );
}
