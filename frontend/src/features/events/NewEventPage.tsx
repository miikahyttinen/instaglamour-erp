import { useMutation } from '@tanstack/react-query';
import { useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import type { FieldCode, Logistics, TechnicalSetup } from '../../api/enums';
import { eventsApi } from '../../api/endpoints';
import type { EventCreate } from '../../api/types';
import { useSignedInPartner } from '../../auth/SignedInContext';
import { Button } from '../../components/Button';
import { buttonClass } from '../../components/buttonClass';
import { Field, MoneyInput } from '../../components/fields';
import { Notice } from '../../components/Notice';
import { PageHead } from '../../components/PageHead';
import { SectionLabel } from '../../components/SectionLabel';
import { apiErrorMessage, apiFieldErrors } from '../../i18n/labels';
import { useLang } from '../../i18n/useLang';
import { formatMoney } from '../../lib/format';
import { parseMoneyField } from '../../lib/moneyField';
import { partnerOptions } from '../../reference/partners';
import { useReference } from '../../reference/useReference';
import { ClientSelect } from '../clients/ClientSelect';
import { CUSTOM_LINEUP, lineupPreview } from './lineupChoice';
import { LineupOptions } from './LineupOptions';
import { NONE_LABEL, useLogisticsOptions, useTechnicalSetupOptions } from './eventOptions';
import { useApplyEvent } from './queries';
import './newEvent.css';

const CUSTOM = CUSTOM_LINEUP;

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
  contractDone: boolean;
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
  contractDone: 'contractDone',
  sellerId: 'sellerId',
  producerId: 'producerId',
  priceCents: 'price',
  additionalSalesCents: 'additionalSales',
  additionalSalesDescription: 'additionalSalesDescription',
  notes: 'notes',
};

/**
 * New event (UC-002). Seller and producer default to the signed-in partner; only active partners
 * are offered (BR-111).
 */
export function NewEventPage() {
  const { t } = useTranslation();
  const lang = useLang();
  const me = useSignedInPartner();
  const navigate = useNavigate();
  const applyEvent = useApplyEvent();
  const { data: reference } = useReference();
  const [form, setForm] = useState<FormState>(() => ({
    startDate: '',
    endDate: '',
    lineup: '',
    lineupName: '',
    venue: '',
    clientId: null,
    technicalSetup: '',
    logistics: '',
    houseTechnician: false,
    contractDone: false,
    sellerId: me.id,
    producerId: me.id,
    price: '',
    additionalSales: '',
    additionalSalesDescription: '',
    notes: '',
  }));
  // Inactive partners are not offered (BR-111); the signed-in partner is always active.
  const sellerOptions = partnerOptions(reference?.partners, me.id);
  const producerOptions = partnerOptions(reference?.partners, me.id);
  const technicalSetupOptions = useTechnicalSetupOptions(reference);
  const logisticsOptions = useLogisticsOptions(reference);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  // Double-submit guard: `isPending` only disables the button after a re-render.
  const submitting = useRef(false);
  const create = useMutation({
    mutationFn: (body: EventCreate) => eventsApi.create(body),
    onSuccess: (event) => {
      applyEvent(event, event.id);
      void navigate(`/gigs/${event.id}`);
    },
    onError: (error) => {
      submitting.current = false;
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
      contractDone: form.contractDone,
      sellerId: form.sellerId,
      producerId: form.producerId,
      priceCents: priceParsed.cents ?? 0,
      additionalSalesCents: salesParsed.cents ?? 0,
      additionalSalesDescription: form.additionalSalesDescription.trim() || null,
      notes: form.notes.trim() || null,
    });
  };

  return (
    <section className="page new-event-page">
      <PageHead title={t('eventForm.title')}>
        <p className="new-event-back">
          <Link to="/gigs">
            <ArrowLeft />
            {t('event.back')}
          </Link>
        </p>
      </PageHead>
      <form className="form new-event-form" onSubmit={onSubmit} noValidate>
        <section className="new-event-section" aria-labelledby="new-event-basic">
          <SectionLabel id="new-event-basic">{t('event.sections.basic')}</SectionLabel>
          <div className="form-row">
            <Field label={t('eventForm.startDate')} error={errors.startDate}>
              {(p) => (
                <input
                  {...p}
                  type="date"
                  value={form.startDate}
                  onChange={(e) => set('startDate', e.target.value)}
                />
              )}
            </Field>
            <Field label={t('eventForm.endDate')} error={errors.endDate} hint={t('eventForm.endDateHint')}>
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
            label={t('eventForm.lineup')}
            error={errors.lineup}
            hint={lineupPreview(t, lang, template)}
          >
            {(p) => (
              <select {...p} value={form.lineup} onChange={(e) => set('lineup', e.target.value)}>
                <LineupOptions lineups={reference?.lineupTemplates} />
              </select>
            )}
          </Field>
          {form.lineup === CUSTOM && (
            <Field label={t('eventForm.lineupName')} error={errors.lineupName}>
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

          <Field label={t('eventForm.venue')} error={errors.venue}>
            {(p) => (
              <input {...p} type="text" value={form.venue} onChange={(e) => set('venue', e.target.value)} />
            )}
          </Field>

          <Field label={t('clients.select.label')} error={errors.clientId}>
            {(p) => <ClientSelect {...p} value={form.clientId} onChange={(id) => set('clientId', id)} />}
          </Field>

          <div className="form-row">
            <Field label={t('eventForm.technicalSetup')} error={errors.technicalSetup}>
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
            <Field label={t('eventForm.logistics')} error={errors.logistics}>
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

          <div className="field new-event-switch">
            {/* Same look as InlineSwitch (`inline-switch` draws the switch). */}
            <label className="switch inline-switch">
              <input
                type="checkbox"
                role="switch"
                checked={form.houseTechnician}
                aria-invalid={errors.houseTechnician ? true : undefined}
                aria-describedby={errors.houseTechnician ? 'new-event-house-tech-error' : undefined}
                onChange={(e) => set('houseTechnician', e.target.checked)}
              />
              <span>{t('eventForm.houseTechnician')}</span>
            </label>
            {errors.houseTechnician && (
              <p id="new-event-house-tech-error" className="field-error">
                {errors.houseTechnician}
              </p>
            )}
          </div>

          <div className="field new-event-switch">
            {/* "Sopimus tehty" (owner request 2026-11-09): unchecked by default. */}
            <label className="check">
              <input
                type="checkbox"
                checked={form.contractDone}
                aria-invalid={errors.contractDone ? true : undefined}
                aria-describedby={errors.contractDone ? 'new-event-contract-error' : undefined}
                onChange={(e) => set('contractDone', e.target.checked)}
              />
              <span>{t('eventForm.contractDone')}</span>
            </label>
            {errors.contractDone && (
              <p id="new-event-contract-error" className="field-error">
                {errors.contractDone}
              </p>
            )}
          </div>

          <div className="form-row">
            <Field label={t('eventForm.seller')} error={errors.sellerId}>
              {(p) => (
                <select {...p} value={form.sellerId} onChange={(e) => set('sellerId', e.target.value)}>
                  <Options options={sellerOptions} />
                </select>
              )}
            </Field>
            <Field label={t('eventForm.producer')} error={errors.producerId}>
              {(p) => (
                <select {...p} value={form.producerId} onChange={(e) => set('producerId', e.target.value)}>
                  <Options options={producerOptions} />
                </select>
              )}
            </Field>
          </div>

          <Field label={t('eventForm.notes')} error={errors.notes}>
            {(p) => (
              <textarea {...p} rows={4} value={form.notes} onChange={(e) => set('notes', e.target.value)} />
            )}
          </Field>
        </section>

        <section className="new-event-section" aria-labelledby="new-event-price">
          <SectionLabel id="new-event-price">{t('event.sections.price')}</SectionLabel>
          <div className="form-row">
            <Field label={t('eventForm.price')} error={errors.price}>
              {(p) => <MoneyInput {...p} value={form.price} onChange={(v) => set('price', v)} />}
            </Field>
            <Field label={t('eventForm.additionalSales')} error={errors.additionalSales}>
              {(p) => (
                <MoneyInput {...p} value={form.additionalSales} onChange={(v) => set('additionalSales', v)} />
              )}
            </Field>
          </div>
          <Field label={t('eventForm.additionalSalesDescription')} error={errors.additionalSalesDescription}>
            {(p) => (
              <input
                {...p}
                type="text"
                value={form.additionalSalesDescription}
                onChange={(e) => set('additionalSalesDescription', e.target.value)}
              />
            )}
          </Field>
          <p className="new-event-total">
            {t('eventForm.totalPrice')}: <strong>{formatMoney(total, lang)}</strong>
          </p>
        </section>

        {create.isError && (
          <Notice tone="danger" role="alert" className="new-event-error">
            {apiErrorMessage(t, create.error)}
          </Notice>
        )}
        <div className="form-actions new-event-actions">
          <Button type="submit" variant="primary" disabled={create.isPending}>
            {create.isPending ? t('eventForm.creating') : t('eventForm.create')}
          </Button>
          <Link to="/gigs" className={buttonClass()}>
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
