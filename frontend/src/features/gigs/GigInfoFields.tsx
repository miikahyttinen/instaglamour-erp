import { useTranslation } from 'react-i18next';
import type { Logistics, TechnicalSetup } from '../../api/enums';
import { gigsApi } from '../../api/endpoints';
import type { GigDetail, GigUpdate, GigUpdateResponse, Id } from '../../api/types';
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
import { useReference } from '../../reference/useReference';
import { NONE_LABEL, useLogisticsOptions, useTechnicalSetupOptions } from './gigOptions';
import { useApplyGig } from './queries';

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
  gig: GigDetail;
  /** Deleted gig: every field is shown disabled (muted value). */
  readOnly: boolean;
}

/** One PATCH per field (NFR-8); the page cache, history and year data follow the response. */
function useGigPatch(gig: GigDetail) {
  const applyGig = useApplyGig();
  return async (body: GigUpdate): Promise<GigUpdateResponse> => {
    const result = await gigsApi.update(gig.id, body);
    applyGig(result.gig, gig.id);
    return result;
  };
}

/** Basic info edited in place (UC-004). Dates change via Move. */
export function GigBasicFields({
  gig,
  readOnly,
  onPartnerSaved,
}: Props & {
  /** Seller/producer saved: the page names the moved Sales / Production lines (BR-027). */
  onPartnerSaved: (result: GigUpdateResponse, before: GigDetail) => void;
}) {
  const { t } = useTranslation();
  const { data: reference } = useReference();
  const patch = useGigPatch(gig);
  const technicalSetupOptions = useTechnicalSetupOptions(reference);
  const logisticsOptions = useLogisticsOptions(reference);

  const partnerOptions = (current: Id) => {
    const partners = reference?.partners ?? [];
    const options = partners.map((p) => ({ value: p.id, label: p.name }));
    return partners.some((p) => p.id === current) ? options : [{ value: current, label: '–' }, ...options];
  };
  const savePartner = (body: GigUpdate) => {
    const before = gig;
    return patch(body).then((result) => onPartnerSaved(result, before));
  };

  return (
    <Card as="div" className="gig-fields">
      <FieldList>
        <InlineText
          label={t('gigForm.lineupName')}
          required
          value={gig.lineupName}
          field="lineupName"
          disabled={readOnly}
          onSave={(lineupName) => patch({ lineupName })}
        />
        <InlineText
          label={t('gigForm.venue')}
          required
          value={gig.venue}
          field="venue"
          disabled={readOnly}
          onSave={(venue) => patch({ venue })}
        />
        <InlineSelect<TechnicalSetup | null>
          label={t('gigForm.technicalSetup')}
          value={gig.technicalSetup}
          field="technicalSetup"
          disabled={readOnly}
          options={withCurrent([{ value: null, label: NONE_LABEL }, ...technicalSetupOptions], gig.technicalSetup)}
          onSave={(technicalSetup) => patch({ technicalSetup })}
        />
        <InlineSelect<Logistics | null>
          label={t('gigForm.logistics')}
          value={gig.logistics}
          field="logistics"
          disabled={readOnly}
          options={withCurrent([{ value: null, label: NONE_LABEL }, ...logisticsOptions], gig.logistics)}
          onSave={(logistics) => patch({ logistics })}
        />
        <InlineSwitch
          label={t('gigForm.houseTechnician')}
          value={gig.houseTechnician}
          field="houseTechnician"
          disabled={readOnly}
          onSave={(houseTechnician) => patch({ houseTechnician })}
        />
        <InlineSelect
          label={t('gigForm.seller')}
          value={gig.sellerId}
          field="sellerId"
          disabled={readOnly}
          options={partnerOptions(gig.sellerId)}
          onSave={(sellerId) => savePartner({ sellerId })}
        />
        <InlineSelect
          label={t('gigForm.producer')}
          value={gig.producerId}
          field="producerId"
          disabled={readOnly}
          options={partnerOptions(gig.producerId)}
          onSave={(producerId) => savePartner({ producerId })}
        />
        {!readOnly && <p className="muted small gig-fields-note">{t('gig.sellerChangeHint')}</p>}
        <InlineTextarea
          label={t('gigForm.notes')}
          value={gig.notes}
          field="notes"
          rows={3}
          placeholder="–"
          hint={readOnly ? undefined : t('gigForm.noCustomerData')}
          disabled={readOnly}
          onSave={(notes) => patch({ notes })}
        />
      </FieldList>
    </Card>
  );
}

/** Price and additional sales edited in place (UC-007); also on cancelled gigs (UC-010). */
export function GigPriceFields({ gig, readOnly }: Props) {
  const { t } = useTranslation();
  const lang = useLang();
  const patch = useGigPatch(gig);
  return (
    <Card as="div" className="gig-fields">
      <FieldList>
        <InlineMoney
          label={t('gigForm.price')}
          required
          value={gig.priceCents}
          field="priceCents"
          disabled={readOnly}
          onSave={(priceCents) => patch({ priceCents })}
        />
        <InlineMoney
          label={t('gigForm.additionalSales')}
          required
          value={gig.additionalSalesCents}
          field="additionalSalesCents"
          disabled={readOnly}
          onSave={(additionalSalesCents) => patch({ additionalSalesCents })}
        />
        <InlineText
          label={t('gigForm.additionalSalesDescription')}
          value={gig.additionalSalesDescription}
          field="additionalSalesDescription"
          placeholder="–"
          disabled={readOnly}
          onSave={(additionalSalesDescription) => patch({ additionalSalesDescription })}
        />
        <div className="gig-fields-total" role="group" aria-label={t('gigForm.totalPrice')}>
          <span className="gig-fields-total-label">{t('gigForm.totalPrice')}</span>
          <strong className="gig-fields-total-value">{formatMoney(gig.totalPriceCents, lang)}</strong>
        </div>
      </FieldList>
    </Card>
  );
}
