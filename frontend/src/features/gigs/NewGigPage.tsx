import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft } from 'lucide-react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { isApiError } from '../../api/client';
import type { FieldCode, Language, Logistics, TechnicalSetup } from '../../api/enums';
import { gigsApi, offersApi } from '../../api/endpoints';
import type { GigCreate, Id } from '../../api/types';
import { useSignedInPartner } from '../../auth/SignedInContext';
import { Button } from '../../components/Button';
import { buttonClass } from '../../components/buttonClass';
import { Field, MoneyInput } from '../../components/fields';
import { Notice } from '../../components/Notice';
import { PageHead } from '../../components/PageHead';
import { SectionLabel } from '../../components/SectionLabel';
import { apiErrorMessage, apiFieldErrors, costTypeLabel } from '../../i18n/labels';
import { useLang } from '../../i18n/useLang';
import { centsToInput, formatMoney } from '../../lib/format';
import { parseMoneyField } from '../../lib/moneyField';
import { partnerOptions } from '../../reference/partners';
import { useReference } from '../../reference/useReference';
import { ClientSelect } from '../clients/ClientSelect';
import { offerKeys, useApplyConvert, useOffer } from '../offers/queries';
import { NONE_LABEL, useLogisticsOptions, useTechnicalSetupOptions } from './gigOptions';
import { useApplyGig } from './queries';
import './newGig.css';

const CUSTOM = 'custom';

interface FormState {
  startDate: string;
  endDate: string;
  lineup: string; // template id or CUSTOM
  lineupName: string;
  venue: string;
  clientId: string | null;
  technicalSetup: TechnicalSetup | '';
  logistics: Logistics | '';
  houseTechnician: boolean;
  sellerId: string;
  producerId: string;
  price: string;
  additionalSales: string;
  additionalSalesDescription: string;
  notes: string;
}

/** Contract field → form control that shows its error. */
const FIELD_TO_CONTROL: Record<string, keyof FormState> = {
  startDate: 'startDate',
  endDate: 'endDate',
  lineupTemplateId: 'lineup',
  lineupName: 'lineupName',
  venue: 'venue',
  clientId: 'clientId',
  technicalSetup: 'technicalSetup',
  logistics: 'logistics',
  houseTechnician: 'houseTechnician',
  sellerId: 'sellerId',
  producerId: 'producerId',
  priceCents: 'price',
  additionalSalesCents: 'additionalSales',
  additionalSalesDescription: 'additionalSalesDescription',
  notes: 'notes',
};

/** Draft (GigCreate) from GET /api/offers/{id}/gig-draft → form values (UC-031). */
function formFromDraft(draft: GigCreate, lang: Language): FormState {
  return {
    startDate: draft.startDate,
    endDate: draft.endDate ?? '',
    lineup: draft.lineupTemplateId ?? CUSTOM,
    lineupName: draft.lineupName ?? '',
    venue: draft.venue,
    clientId: draft.clientId ?? null,
    technicalSetup: draft.technicalSetup ?? '',
    logistics: draft.logistics ?? '',
    houseTechnician: draft.houseTechnician ?? false,
    sellerId: draft.sellerId,
    producerId: draft.producerId,
    price: centsToInput(draft.priceCents, lang),
    additionalSales: draft.additionalSalesCents ? centsToInput(draft.additionalSalesCents, lang) : '',
    additionalSalesDescription: draft.additionalSalesDescription ?? '',
    notes: draft.notes ?? '',
  };
}

/**
 * New gig (UC-002). With `?fromOffer=<id>` the same form converts an offer (UC-031): it is
 * prefilled from the offer's gig draft (BR-105), shows a review notice and submits to
 * POST /api/offers/{id}/convert.
 */
export function NewGigPage() {
  const [params] = useSearchParams();
  const fromOffer = params.get('fromOffer');
  return fromOffer ? <ConvertOfferPage key={fromOffer} offerId={fromOffer} /> : <GigForm />;
}

function ConvertOfferPage({ offerId }: { offerId: Id }) {
  const { t } = useTranslation();
  const lang = useLang();
  const offer = useOffer(offerId);
  const draft = useQuery({
    queryKey: [...offerKeys.detail(offerId), 'gig-draft'],
    queryFn: () => offersApi.gigDraft(offerId),
    // Always fresh: the offer may have changed since the last visit.
    staleTime: 0,
    gcTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
  });
  if (draft.data) {
    return (
      <GigForm
        initial={formFromDraft(draft.data, lang)}
        convert={{ offerId, eventName: offer.data?.eventName ?? null }}
      />
    );
  }
  return (
    <section className="page new-gig-page">
      <PageHead title={t('convert.title')}>
        <BackToOffer offerId={offerId} />
      </PageHead>
      {draft.isError &&
        (isApiError(draft.error) && draft.error.code === 'ALREADY_CONVERTED' ? (
          <AlreadyConverted gigId={offer.data?.gigId ?? null} />
        ) : (
          <Notice tone="danger" role="alert" className="new-gig-error">
            <p>{t('convert.loadError')}</p>
            <p>{apiErrorMessage(t, draft.error)}</p>
          </Notice>
        ))}
      {draft.isPending && <p className="muted">{t('app.loading')}</p>}
    </section>
  );
}

function BackToOffer({ offerId }: { offerId: Id }) {
  const { t } = useTranslation();
  return (
    <p className="new-gig-back">
      <Link to={`/offers/${offerId}`}>
        <ArrowLeft />
        {t('convert.backToOffer')}
      </Link>
    </p>
  );
}

/** 409 ALREADY_CONVERTED (UC-031 E1): message + link to the existing gig. */
function AlreadyConverted({ gigId }: { gigId: Id | null }) {
  const { t } = useTranslation();
  return (
    <Notice tone="warn" role="alert" className="new-gig-error">
      <p>
        {t('convert.alreadyConverted')}
        {gigId && (
          <>
            {' '}
            <Link to={`/gigs/${gigId}`}>{t('convert.openGig')}</Link>
          </>
        )}
      </p>
    </Notice>
  );
}

interface GigFormProps {
  /** Prefilled values (convert mode); default: empty, seller and producer = signed-in partner. */
  initial?: FormState;
  /** Convert mode (UC-031): submit converts the offer instead of POST /api/gigs. */
  convert?: { offerId: Id; eventName: string | null };
}

function GigForm({ initial, convert }: GigFormProps) {
  const { t } = useTranslation();
  const lang = useLang();
  const me = useSignedInPartner();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const applyGig = useApplyGig();
  const applyConvert = useApplyConvert();
  const { data: reference } = useReference();
  const offer = useOffer(convert?.offerId ?? null);
  const [form, setForm] = useState<FormState>(
    () =>
      initial ?? {
        startDate: '',
        endDate: '',
        lineup: '',
        lineupName: '',
        venue: '',
        clientId: null,
        technicalSetup: '',
        logistics: '',
        houseTechnician: false,
        sellerId: me.id,
        producerId: me.id,
        price: '',
        additionalSales: '',
        additionalSalesDescription: '',
        notes: '',
      },
  );
  // Inactive partners are not offered (BR-111), except a prefilled value (convert mode).
  const [prefilled] = useState(() => ({ sellerId: form.sellerId, producerId: form.producerId }));
  const sellerOptions = partnerOptions(reference?.partners, prefilled.sellerId);
  const producerOptions = partnerOptions(reference?.partners, prefilled.producerId);
  const technicalSetupOptions = useTechnicalSetupOptions(reference);
  const logisticsOptions = useLogisticsOptions(reference);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  // Double-submit guard (UC-031 AC-3): `isPending` only disables the button after a re-render.
  const submitting = useRef(false);
  const create = useMutation({
    mutationFn: async (body: GigCreate) => {
      if (!convert) return gigsApi.create(body);
      const result = await offersApi.convert(convert.offerId, body);
      void applyConvert(result.offer);
      return result.gig;
    },
    onSuccess: (gig) => {
      applyGig(gig, gig.id);
      void navigate(`/gigs/${gig.id}`);
    },
    onError: (error) => {
      submitting.current = false;
      if (convert && isApiError(error) && error.code === 'ALREADY_CONVERTED') {
        // Converted meanwhile (E1): refetch the offer for the gig link.
        void queryClient.invalidateQueries({ queryKey: offerKeys.all });
      }
      const fieldErrors: Partial<Record<keyof FormState, string>> = {};
      for (const [field, message] of Object.entries(apiFieldErrors(t, error))) {
        fieldErrors[FIELD_TO_CONTROL[field] ?? 'notes'] = message;
      }
      setErrors(fieldErrors);
    },
  });
  const alreadyConverted =
    convert !== undefined && isApiError(create.error) && create.error.code === 'ALREADY_CONVERTED';
  const cancelTo = convert ? `/offers/${convert.offerId}` : '/gigs';

  const template = reference?.lineupTemplates.find((tpl) => tpl.id === form.lineup);
  const priceParsed = parseMoneyField(form.price, lang, true);
  const salesParsed = parseMoneyField(form.additionalSales, lang, false);
  const total =
    priceParsed.cents !== null ? priceParsed.cents + (salesParsed.cents ?? 0) : null;

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const codes: Partial<Record<keyof FormState, FieldCode>> = {};
    if (!form.startDate) codes.startDate = 'REQUIRED';
    if (form.endDate && form.startDate && form.endDate < form.startDate) {
      codes.endDate = 'END_BEFORE_START';
    }
    if (!form.lineup) codes.lineup = 'REQUIRED';
    if (form.lineup === CUSTOM && !form.lineupName.trim()) codes.lineupName = 'REQUIRED';
    if (!form.venue.trim()) codes.venue = 'REQUIRED';
    if (!form.sellerId) codes.sellerId = 'REQUIRED';
    if (!form.producerId) codes.producerId = 'REQUIRED';
    if (priceParsed.error) codes.price = priceParsed.error;
    if (salesParsed.error) codes.additionalSales = salesParsed.error;
    const fieldErrors: Partial<Record<keyof FormState, string>> = {};
    for (const [key, code] of Object.entries(codes)) {
      fieldErrors[key as keyof FormState] = t(`fields.${code}`);
    }
    setErrors(fieldErrors);
    if (Object.keys(fieldErrors).length > 0) return;
    if (submitting.current) return;
    submitting.current = true;

    create.mutate({
      startDate: form.startDate,
      endDate: form.endDate || null,
      lineupTemplateId: form.lineup === CUSTOM ? null : form.lineup,
      lineupName: form.lineup === CUSTOM ? form.lineupName.trim() : null,
      venue: form.venue.trim(),
      clientId: form.clientId,
      technicalSetup: form.technicalSetup || null,
      logistics: form.logistics || null,
      houseTechnician: form.houseTechnician,
      sellerId: form.sellerId,
      producerId: form.producerId,
      priceCents: priceParsed.cents ?? 0,
      additionalSalesCents: salesParsed.cents ?? 0,
      additionalSalesDescription: form.additionalSalesDescription.trim() || null,
      notes: form.notes.trim() || null,
    });
  };

  return (
    <section className="page new-gig-page">
      <PageHead title={convert ? t('convert.title') : t('gigForm.title')}>
        {convert ? (
          <BackToOffer offerId={convert.offerId} />
        ) : (
          <p className="new-gig-back">
            <Link to="/gigs">
              <ArrowLeft />
              {t('gig.back')}
            </Link>
          </p>
        )}
      </PageHead>
      <form className="form new-gig-form" onSubmit={onSubmit} noValidate>
        {convert && (
          <Notice tone="warn" role="note" className="new-gig-review">
            <p>
              <strong>{t('convert.review')}</strong>
            </p>
            <p>
              <span className="label">{t('convert.fromOffer')}:</span>{' '}
              <Link to={`/offers/${convert.offerId}`}>{convert.eventName ?? offer.data?.eventName ?? '…'}</Link>
            </p>
          </Notice>
        )}
        <section className="new-gig-section" aria-labelledby="new-gig-basic">
          <SectionLabel id="new-gig-basic">{t('gig.sections.basic')}</SectionLabel>
          <div className="form-row">
            <Field label={t('gigForm.startDate')} error={errors.startDate}>
              {(p) => (
                <input
                  {...p}
                  type="date"
                  value={form.startDate}
                  onChange={(e) => set('startDate', e.target.value)}
                />
              )}
            </Field>
            <Field label={t('gigForm.endDate')} error={errors.endDate} hint={t('gigForm.endDateHint')}>
              {(p) => (
                <input
                  {...p}
                  type="date"
                  value={form.endDate}
                  min={form.startDate || undefined}
                  onChange={(e) => set('endDate', e.target.value)}
                />
              )}
            </Field>
          </div>

          <Field
            label={t('gigForm.lineup')}
            error={errors.lineup}
            hint={
              template
                ? t('gigForm.templateRoles', {
                    roles: template.roles.map((r) => costTypeLabel(t, r.role)).join(', '),
                  })
                : undefined
            }
          >
            {(p) => (
              <select {...p} value={form.lineup} onChange={(e) => set('lineup', e.target.value)}>
                <option value="">{t('gigForm.chooseLineup')}</option>
                {reference?.lineupTemplates.map((tpl) => (
                  <option key={tpl.id} value={tpl.id}>
                    {tpl.name}
                  </option>
                ))}
                <option value={CUSTOM}>{t('gigForm.customLineup')}</option>
              </select>
            )}
          </Field>
          {form.lineup === CUSTOM && (
            <Field label={t('gigForm.lineupName')} error={errors.lineupName}>
              {(p) => (
                <input
                  {...p}
                  type="text"
                  value={form.lineupName}
                  onChange={(e) => set('lineupName', e.target.value)}
                />
              )}
            </Field>
          )}

          <Field label={t('gigForm.venue')} error={errors.venue}>
            {(p) => (
              <input {...p} type="text" value={form.venue} onChange={(e) => set('venue', e.target.value)} />
            )}
          </Field>

          <Field label={t('clients.select.label')} error={errors.clientId}>
            {(p) => <ClientSelect {...p} value={form.clientId} onChange={(id) => set('clientId', id)} />}
          </Field>

          <div className="form-row">
            <Field label={t('gigForm.technicalSetup')} error={errors.technicalSetup}>
              {(p) => (
                <select
                  {...p}
                  value={form.technicalSetup}
                  onChange={(e) => set('technicalSetup', e.target.value as TechnicalSetup | '')}
                >
                  <option value="">{NONE_LABEL}</option>
                  {technicalSetupOptions.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              )}
            </Field>
            <Field label={t('gigForm.logistics')} error={errors.logistics}>
              {(p) => (
                <select
                  {...p}
                  value={form.logistics}
                  onChange={(e) => set('logistics', e.target.value as Logistics | '')}
                >
                  <option value="">{NONE_LABEL}</option>
                  {logisticsOptions.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              )}
            </Field>
          </div>

          <div className="field new-gig-switch">
            {/* Same look as InlineSwitch (`inline-switch` draws the switch). */}
            <label className="switch inline-switch">
              <input
                type="checkbox"
                role="switch"
                checked={form.houseTechnician}
                aria-invalid={errors.houseTechnician ? true : undefined}
                aria-describedby={errors.houseTechnician ? 'new-gig-house-tech-error' : undefined}
                onChange={(e) => set('houseTechnician', e.target.checked)}
              />
              <span>{t('gigForm.houseTechnician')}</span>
            </label>
            {errors.houseTechnician && (
              <p id="new-gig-house-tech-error" className="field-error">
                {errors.houseTechnician}
              </p>
            )}
          </div>

          <div className="form-row">
            <Field label={t('gigForm.seller')} error={errors.sellerId}>
              {(p) => (
                <select {...p} value={form.sellerId} onChange={(e) => set('sellerId', e.target.value)}>
                  <Options options={sellerOptions} />
                </select>
              )}
            </Field>
            <Field label={t('gigForm.producer')} error={errors.producerId}>
              {(p) => (
                <select {...p} value={form.producerId} onChange={(e) => set('producerId', e.target.value)}>
                  <Options options={producerOptions} />
                </select>
              )}
            </Field>
          </div>

          <Field label={t('gigForm.notes')} error={errors.notes} hint={t('gigForm.noCustomerData')}>
            {(p) => (
              <textarea {...p} rows={4} value={form.notes} onChange={(e) => set('notes', e.target.value)} />
            )}
          </Field>
        </section>

        <section className="new-gig-section" aria-labelledby="new-gig-price">
          <SectionLabel id="new-gig-price">{t('gig.sections.price')}</SectionLabel>
          <div className="form-row">
            <Field label={t('gigForm.price')} error={errors.price}>
              {(p) => <MoneyInput {...p} value={form.price} onChange={(v) => set('price', v)} />}
            </Field>
            <Field label={t('gigForm.additionalSales')} error={errors.additionalSales}>
              {(p) => (
                <MoneyInput {...p} value={form.additionalSales} onChange={(v) => set('additionalSales', v)} />
              )}
            </Field>
          </div>
          <Field label={t('gigForm.additionalSalesDescription')} error={errors.additionalSalesDescription}>
            {(p) => (
              <input
                {...p}
                type="text"
                value={form.additionalSalesDescription}
                onChange={(e) => set('additionalSalesDescription', e.target.value)}
              />
            )}
          </Field>
          <p className="new-gig-total">
            {t('gigForm.totalPrice')}: <strong>{formatMoney(total, lang)}</strong>
          </p>
        </section>

        {alreadyConverted ? (
          <AlreadyConverted gigId={offer.data?.gigId ?? null} />
        ) : (
          create.isError && (
            <Notice tone="danger" role="alert" className="new-gig-error">
              {apiErrorMessage(t, create.error)}
            </Notice>
          )
        )}
        <div className="form-actions new-gig-actions">
          <Button type="submit" variant="primary" disabled={create.isPending || alreadyConverted}>
            {create.isPending ? t('gigForm.creating') : t('gigForm.create')}
          </Button>
          <Link to={cancelTo} className={buttonClass()}>
            {t('common.cancel')}
          </Link>
        </div>
      </form>
    </section>
  );
}

function Options({ options }: { options: { value: string; label: string }[] }) {
  return (
    <>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </>
  );
}
