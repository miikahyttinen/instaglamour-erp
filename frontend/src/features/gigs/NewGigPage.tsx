import { useMutation } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import type { FieldCode, TechnicalSetup } from '../../api/enums';
import { gigsApi } from '../../api/endpoints';
import type { GigCreate } from '../../api/types';
import { useSignedInPartner } from '../../auth/SignedInContext';
import { Button } from '../../components/Button';
import { buttonClass } from '../../components/buttonClass';
import { Field, MoneyInput } from '../../components/fields';
import { Notice } from '../../components/Notice';
import { PageHead } from '../../components/PageHead';
import { SectionLabel } from '../../components/SectionLabel';
import { apiErrorMessage, apiFieldErrors, costTypeLabel } from '../../i18n/labels';
import { useLang } from '../../i18n/useLang';
import { formatMoney } from '../../lib/format';
import { parseMoneyField } from '../../lib/moneyField';
import { useReference } from '../../reference/useReference';
import { PartnerOptions, TechnicalSetupPicker } from './formParts';
import { useApplyGig } from './queries';
import './newGig.css';

const CUSTOM = 'custom';

interface FormState {
  startDate: string;
  endDate: string;
  lineup: string; // template id or CUSTOM
  lineupName: string;
  venue: string;
  technicalSetup: TechnicalSetup[];
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
  technicalSetup: 'technicalSetup',
  sellerId: 'sellerId',
  producerId: 'producerId',
  priceCents: 'price',
  additionalSalesCents: 'additionalSales',
  additionalSalesDescription: 'additionalSalesDescription',
  notes: 'notes',
};

/** New gig (UC-002). Seller and producer default to the signed-in partner. */
export function NewGigPage() {
  const { t } = useTranslation();
  const lang = useLang();
  const me = useSignedInPartner();
  const navigate = useNavigate();
  const applyGig = useApplyGig();
  const { data: reference } = useReference();
  const [form, setForm] = useState<FormState>({
    startDate: '',
    endDate: '',
    lineup: '',
    lineupName: '',
    venue: '',
    technicalSetup: [],
    sellerId: me.id,
    producerId: me.id,
    price: '',
    additionalSales: '',
    additionalSalesDescription: '',
    notes: '',
  });
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const create = useMutation({
    mutationFn: (body: GigCreate) => gigsApi.create(body),
    onSuccess: (gig) => {
      applyGig(gig, gig.id);
      void navigate(`/gigs/${gig.id}`);
    },
    onError: (error) => {
      const fieldErrors: Partial<Record<keyof FormState, string>> = {};
      for (const [field, message] of Object.entries(apiFieldErrors(t, error))) {
        fieldErrors[FIELD_TO_CONTROL[field] ?? 'notes'] = message;
      }
      setErrors(fieldErrors);
    },
  });

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

    create.mutate({
      startDate: form.startDate,
      endDate: form.endDate || null,
      lineupTemplateId: form.lineup === CUSTOM ? null : form.lineup,
      lineupName: form.lineup === CUSTOM ? form.lineupName.trim() : null,
      venue: form.venue.trim(),
      technicalSetup: form.technicalSetup,
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
      <PageHead title={t('gigForm.title')}>
        <p className="new-gig-back">
          <Link to="/gigs">
            <ArrowLeft />
            {t('gig.back')}
          </Link>
        </p>
      </PageHead>
      <form className="form new-gig-form" onSubmit={onSubmit} noValidate>
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

          <TechnicalSetupPicker
            legend={t('gigForm.technicalSetup')}
            options={reference?.technicalSetups}
            value={form.technicalSetup}
            onChange={(value) => set('technicalSetup', value)}
            error={errors.technicalSetup}
          />

          <div className="form-row">
            <Field label={t('gigForm.seller')} error={errors.sellerId}>
              {(p) => (
                <select {...p} value={form.sellerId} onChange={(e) => set('sellerId', e.target.value)}>
                  <PartnerOptions partners={reference?.partners} />
                </select>
              )}
            </Field>
            <Field label={t('gigForm.producer')} error={errors.producerId}>
              {(p) => (
                <select {...p} value={form.producerId} onChange={(e) => set('producerId', e.target.value)}>
                  <PartnerOptions partners={reference?.partners} />
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

        {create.isError && (
          <Notice tone="danger" role="alert" className="new-gig-error">
            {apiErrorMessage(t, create.error)}
          </Notice>
        )}
        <div className="form-actions new-gig-actions">
          <Button type="submit" variant="primary" disabled={create.isPending}>
            {create.isPending ? t('gigForm.creating') : t('gigForm.create')}
          </Button>
          <Link to="/gigs" className={buttonClass()}>
            {t('common.cancel')}
          </Link>
        </div>
      </form>
    </section>
  );
}
