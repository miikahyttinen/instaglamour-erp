import { useMutation } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import type { FieldCode, OfferEventType, OfferSource } from '../../api/enums';
import { isMusicianRole } from '../../api/enums';
import { offersApi } from '../../api/endpoints';
import type { OfferCreate } from '../../api/types';
import { useSignedInPartner } from '../../auth/SignedInContext';
import { Button } from '../../components/Button';
import { buttonClass } from '../../components/buttonClass';
import { Field, MoneyInput } from '../../components/fields';
import { Notice } from '../../components/Notice';
import { PageHead } from '../../components/PageHead';
import { SectionLabel } from '../../components/SectionLabel';
import { apiErrorMessage, apiFieldErrors, costTypeLabel } from '../../i18n/labels';
import { useLang } from '../../i18n/useLang';
import { parseMoneyField } from '../../lib/moneyField';
import { activePartners } from '../../reference/partners';
import { useReference } from '../../reference/useReference';
import { ClientSelect } from '../clients/ClientSelect';
import { PartnerOptions } from '../events/formParts';
import { useOfferOptions } from './offerOptions';
import { useApplyOffer } from './queries';
import './offers.css';

interface FormState {
  clientId: string | null;
  eventName: string;
  eventDate: string;
  venue: string;
  city: string;
  sellerId: string;
  lineup: string;
  includesText: string;
  showReferences: boolean;
  price: string;
  source: OfferSource | '';
  eventType: OfferEventType | '';
}

/** Contract field → form control that shows its error. */
const FIELD_TO_CONTROL: Record<string, keyof FormState> = {
  clientId: 'clientId',
  eventName: 'eventName',
  eventDate: 'eventDate',
  venue: 'venue',
  city: 'city',
  sellerId: 'sellerId',
  lineup: 'lineup',
  includesText: 'includesText',
  showReferences: 'showReferences',
  priceCents: 'price',
  source: 'source',
  eventType: 'eventType',
};

const lines = (text: string) =>
  text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

/**
 * New offer (UC-029 step 1–2). Seller defaults to me. "What's included" is sent only when filled:
 * empty means the server applies the setting default (contract: omitted → default). The Spotify
 * link is fixed in the backend and not entered here.
 */
export function NewOfferPage() {
  const { t } = useTranslation();
  const lang = useLang();
  const me = useSignedInPartner();
  const navigate = useNavigate();
  const applyOffer = useApplyOffer();
  const { data: reference } = useReference();
  const options = useOfferOptions();
  const [form, setForm] = useState<FormState>({
    clientId: null,
    eventName: '',
    eventDate: '',
    venue: '',
    city: '',
    sellerId: me.id,
    lineup: '',
    includesText: '',
    showReferences: false,
    price: '',
    source: '',
    eventType: '',
  });
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const create = useMutation({
    mutationFn: (body: OfferCreate) => offersApi.create(body),
    onSuccess: (offer) => {
      void applyOffer(offer, offer.id);
      void navigate(`/offers/${offer.id}`);
    },
    onError: (error) => {
      const fieldErrors: Partial<Record<keyof FormState, string>> = {};
      for (const [field, message] of Object.entries(apiFieldErrors(t, error))) {
        fieldErrors[FIELD_TO_CONTROL[field] ?? 'eventName'] = message;
      }
      setErrors(fieldErrors);
    },
  });

  const fillFromTemplate = (templateId: string) => {
    const template = reference?.lineupTemplates.find((tpl) => tpl.id === templateId);
    // The offer lists the performers: the lineup's musician-role lines (own role = its description).
    if (template) {
      const performers = template.lines.filter((line) => isMusicianRole(line.type));
      set(
        'lineup',
        performers
          .map((line) => (line.type === 'OTHER_ROLE' && line.description ? line.description : costTypeLabel(t, line.type)))
          .join('\n'),
      );
    }
  };

  const priceParsed = parseMoneyField(form.price, lang, false);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const codes: Partial<Record<keyof FormState, FieldCode>> = {};
    if (!form.clientId) codes.clientId = 'REQUIRED';
    if (!form.eventName.trim()) codes.eventName = 'REQUIRED';
    if (!form.eventDate) codes.eventDate = 'REQUIRED';
    if (!form.venue.trim()) codes.venue = 'REQUIRED';
    if (priceParsed.error) codes.price = priceParsed.error;
    const fieldErrors: Partial<Record<keyof FormState, string>> = {};
    for (const [key, code] of Object.entries(codes)) fieldErrors[key as keyof FormState] = t(`fields.${code}`);
    setErrors(fieldErrors);
    if (Object.keys(fieldErrors).length > 0) return;

    const body: OfferCreate = {
      clientId: form.clientId!,
      eventName: form.eventName.trim(),
      eventDate: form.eventDate,
      venue: form.venue.trim(),
      city: form.city.trim() || null,
      lineup: lines(form.lineup),
      showReferences: form.showReferences,
      priceCents: priceParsed.cents,
      sellerId: form.sellerId,
      source: form.source || null,
      eventType: form.eventType || null,
    };
    if (form.includesText.trim()) body.includesText = form.includesText.trim();
    create.mutate(body);
  };

  return (
    <section className="page offers-page new-offer-page">
      <PageHead title={t('newOffer.title')}>
        <p className="offer-back">
          <Link to="/offers">
            <ArrowLeft />
            {t('offer.back')}
          </Link>
        </p>
      </PageHead>
      <form className="form new-offer-form" onSubmit={onSubmit} noValidate>
        <section className="new-offer-section" aria-labelledby="new-offer-customer">
          <SectionLabel id="new-offer-customer">{t('offer.sections.details')}</SectionLabel>
          <Field label={t('offer.fields.client')} error={errors.clientId}>
            {(p) => <ClientSelect {...p} value={form.clientId} onChange={(id) => set('clientId', id)} />}
          </Field>
          <Field label={t('offer.fields.eventName')} error={errors.eventName}>
            {(p) => (
              <input {...p} type="text" maxLength={500} value={form.eventName} onChange={(e) => set('eventName', e.target.value)} />
            )}
          </Field>
          <Field label={t('offer.fields.eventDate')} error={errors.eventDate}>
            {(p) => <input {...p} type="date" value={form.eventDate} onChange={(e) => set('eventDate', e.target.value)} />}
          </Field>
          <div className="form-row">
            <Field label={t('offer.fields.venue')} error={errors.venue}>
              {(p) => (
                <input {...p} type="text" maxLength={500} value={form.venue} onChange={(e) => set('venue', e.target.value)} />
              )}
            </Field>
            <Field label={t('offer.fields.city')} error={errors.city}>
              {(p) => (
                <input {...p} type="text" maxLength={500} value={form.city} onChange={(e) => set('city', e.target.value)} />
              )}
            </Field>
          </div>
          <Field label={t('offer.fields.seller')} error={errors.sellerId}>
            {(p) => (
              <select {...p} value={form.sellerId} onChange={(e) => set('sellerId', e.target.value)}>
                <PartnerOptions partners={activePartners(reference?.partners)} />
              </select>
            )}
          </Field>
          <Field label={t('newOffer.fillFromTemplate')}>
            {(p) => (
              <select
                {...p}
                value=""
                onChange={(e) => fillFromTemplate(e.target.value)}
                disabled={!reference?.lineupTemplates.length}
              >
                <option value="">{t('newOffer.chooseTemplate')}</option>
                {reference?.lineupTemplates.map((tpl) => (
                  <option key={tpl.id} value={tpl.id}>
                    {tpl.name}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field label={t('offer.fields.lineup')} error={errors.lineup} hint={t('offer.fields.lineupHint')}>
            {(p) => <textarea {...p} rows={5} value={form.lineup} onChange={(e) => set('lineup', e.target.value)} />}
          </Field>
          <Field label={t('offer.fields.includes')} error={errors.includesText} hint={t('newOffer.includesHint')}>
            {(p) => (
              <textarea {...p} rows={4} value={form.includesText} onChange={(e) => set('includesText', e.target.value)} />
            )}
          </Field>
          <div className="field">
            <label className="switch inline-switch">
              <input
                type="checkbox"
                role="switch"
                checked={form.showReferences}
                onChange={(e) => set('showReferences', e.target.checked)}
              />
              <span>{t('offer.fields.showReferences')}</span>
            </label>
          </div>
        </section>

        <section className="new-offer-section" aria-labelledby="new-offer-internal">
          <SectionLabel id="new-offer-internal">{t('offer.sections.internal')}</SectionLabel>
          <Field label={t('offer.fields.price')} error={errors.price} hint={t('offer.fields.priceHint')}>
            {(p) => <MoneyInput {...p} value={form.price} onChange={(v) => set('price', v)} />}
          </Field>
          <div className="form-row">
            <Field label={t('offer.fields.source')} error={errors.source}>
              {(p) => (
                <select {...p} value={form.source} onChange={(e) => set('source', e.target.value as OfferSource | '')}>
                  {options.source.map((o) => (
                    <option key={o.value ?? ''} value={o.value ?? ''}>
                      {o.label}
                    </option>
                  ))}
                </select>
              )}
            </Field>
            <Field label={t('offer.fields.eventType')} error={errors.eventType}>
              {(p) => (
                <select
                  {...p}
                  value={form.eventType}
                  onChange={(e) => set('eventType', e.target.value as OfferEventType | '')}
                >
                  {options.eventType.map((o) => (
                    <option key={o.value ?? ''} value={o.value ?? ''}>
                      {o.label}
                    </option>
                  ))}
                </select>
              )}
            </Field>
          </div>
        </section>

        {create.isError && (
          <Notice tone="danger" role="alert">
            {apiErrorMessage(t, create.error)}
          </Notice>
        )}
        <div className="form-actions">
          <Button type="submit" variant="primary" disabled={create.isPending}>
            {create.isPending ? t('newOffer.creating') : t('newOffer.create')}
          </Button>
          <Link to="/offers" className={buttonClass()}>
            {t('common.cancel')}
          </Link>
        </div>
      </form>
    </section>
  );
}
