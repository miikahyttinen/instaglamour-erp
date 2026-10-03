import { useMutation } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { TechnicalSetup } from '../../api/enums';
import { gigsApi } from '../../api/endpoints';
import type { GigDetail, GigUpdate, GigUpdateResponse } from '../../api/types';
import { Field, MoneyInput } from '../../components/fields';
import { apiErrorMessage, apiFieldErrors } from '../../i18n/labels';
import { useLang } from '../../i18n/useLang';
import { centsToInput, formatMoney } from '../../lib/format';
import { parseMoneyField } from '../../lib/moneyField';
import { useReference } from '../../reference/useReference';
import { PartnerOptions, TechnicalSetupPicker } from './formParts';
import { useApplyGig } from './queries';

export type EditSection = 'basic' | 'price';

interface Props {
  gig: GigDetail;
  section: EditSection;
  onSaved: (result: GigUpdateResponse, before: GigDetail) => void;
  onCancel: () => void;
}

/** Edits basic info (UC-004) or price + additional sales (UC-007). Dates change via Move. */
export function GigEditForm({ gig, section, onSaved, onCancel }: Props) {
  const { t } = useTranslation();
  const lang = useLang();
  const { data: reference } = useReference();
  const applyGig = useApplyGig();
  const [lineupName, setLineupName] = useState(gig.lineupName);
  const [venue, setVenue] = useState(gig.venue);
  const [technicalSetup, setTechnicalSetup] = useState<TechnicalSetup[]>(gig.technicalSetup);
  const [sellerId, setSellerId] = useState(gig.sellerId);
  const [producerId, setProducerId] = useState(gig.producerId);
  const [notes, setNotes] = useState(gig.notes ?? '');
  const [price, setPrice] = useState(centsToInput(gig.priceCents, lang));
  const [sales, setSales] = useState(centsToInput(gig.additionalSalesCents, lang));
  const [salesDescription, setSalesDescription] = useState(gig.additionalSalesDescription ?? '');
  const [localErrors, setLocalErrors] = useState<Record<string, string>>({});

  const save = useMutation({
    mutationFn: (body: GigUpdate) => gigsApi.update(gig.id, body),
    onSuccess: (result) => {
      applyGig(result.gig, gig.id);
      onSaved(result, gig);
    },
  });
  const errors = { ...(save.isError ? apiFieldErrors(t, save.error) : {}), ...localErrors };
  const hasFieldErrors = Object.keys(errors).length > 0;

  const priceParsed = parseMoneyField(price, lang, true);
  const salesParsed = parseMoneyField(sales, lang, true);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    let body: GigUpdate;
    if (section === 'basic') {
      if (!lineupName.trim()) next.lineupName = t('fields.REQUIRED');
      if (!venue.trim()) next.venue = t('fields.REQUIRED');
      body = {
        lineupName: lineupName.trim(),
        venue: venue.trim(),
        technicalSetup,
        sellerId,
        producerId,
        notes: notes.trim() || null,
      };
    } else {
      if (priceParsed.error) next.priceCents = t(`fields.${priceParsed.error}`);
      if (salesParsed.error) next.additionalSalesCents = t(`fields.${salesParsed.error}`);
      body = {
        priceCents: priceParsed.cents ?? 0,
        additionalSalesCents: salesParsed.cents ?? 0,
        additionalSalesDescription: salesDescription.trim() || null,
        notes: notes.trim() || null,
      };
    }
    setLocalErrors(next);
    if (Object.keys(next).length === 0) save.mutate(body);
  };

  const notesField = (
    <Field label={t('gigForm.notes')} error={errors.notes} hint={t('gigForm.noCustomerData')}>
      {(p) => <textarea {...p} rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} />}
    </Field>
  );

  return (
    <form className="form edit-form" onSubmit={submit} noValidate>
      {section === 'basic' ? (
        <>
          <Field label={t('gigForm.lineupName')} error={errors.lineupName}>
            {(p) => (
              <input {...p} type="text" value={lineupName} onChange={(e) => setLineupName(e.target.value)} />
            )}
          </Field>
          <Field label={t('gigForm.venue')} error={errors.venue}>
            {(p) => <input {...p} type="text" value={venue} onChange={(e) => setVenue(e.target.value)} />}
          </Field>
          <TechnicalSetupPicker
            legend={t('gigForm.technicalSetup')}
            options={reference?.technicalSetups}
            value={technicalSetup}
            onChange={setTechnicalSetup}
            error={errors.technicalSetup}
          />
          <div className="form-row">
            <Field label={t('gigForm.seller')} error={errors.sellerId}>
              {(p) => (
                <select {...p} value={sellerId} onChange={(e) => setSellerId(e.target.value)}>
                  <PartnerOptions partners={reference?.partners} />
                </select>
              )}
            </Field>
            <Field label={t('gigForm.producer')} error={errors.producerId}>
              {(p) => (
                <select {...p} value={producerId} onChange={(e) => setProducerId(e.target.value)}>
                  <PartnerOptions partners={reference?.partners} />
                </select>
              )}
            </Field>
          </div>
          {(sellerId !== gig.sellerId || producerId !== gig.producerId) && (
            <p className="muted small">{t('gig.sellerChangeHint')}</p>
          )}
          {notesField}
        </>
      ) : (
        <>
          <div className="form-row">
            <Field label={t('gigForm.price')} error={errors.priceCents}>
              {(p) => <MoneyInput {...p} value={price} onChange={setPrice} />}
            </Field>
            <Field label={t('gigForm.additionalSales')} error={errors.additionalSalesCents}>
              {(p) => <MoneyInput {...p} value={sales} onChange={setSales} />}
            </Field>
          </div>
          <Field label={t('gigForm.additionalSalesDescription')} error={errors.additionalSalesDescription}>
            {(p) => (
              <input
                {...p}
                type="text"
                value={salesDescription}
                onChange={(e) => setSalesDescription(e.target.value)}
              />
            )}
          </Field>
          <p className="total-line">
            {t('gigForm.totalPrice')}:{' '}
            <strong>
              {formatMoney(
                priceParsed.cents !== null && salesParsed.cents !== null
                  ? priceParsed.cents + salesParsed.cents
                  : null,
                lang,
              )}
            </strong>
          </p>
          {notesField}
        </>
      )}
      {save.isError && !hasFieldErrors && (
        <p className="notice notice-error" role="alert">
          {apiErrorMessage(t, save.error)}
        </p>
      )}
      <div className="form-actions">
        <button type="submit" className="btn btn-primary" disabled={save.isPending}>
          {save.isPending ? t('common.saving') : t('common.save')}
        </button>
        <button type="button" className="btn" onClick={onCancel}>
          {t('common.cancel')}
        </button>
      </div>
    </form>
  );
}
