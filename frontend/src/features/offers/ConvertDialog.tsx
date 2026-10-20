import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { isApiError } from '../../api/client';
import type { FieldCode, Language } from '../../api/enums';
import { offersApi } from '../../api/endpoints';
import type { GigCreate, Id, OfferConvertResponse, OfferSummary, ReferenceData } from '../../api/types';
import { Button } from '../../components/Button';
import { Dialog } from '../../components/Dialog';
import { Field, MoneyInput } from '../../components/fields';
import { Notice } from '../../components/Notice';
import { StatusTag } from '../../components/StatusTag';
import { apiErrorMessage, apiFieldErrors } from '../../i18n/labels';
import { useLang } from '../../i18n/useLang';
import { centsToInput } from '../../lib/format';
import { parseMoneyField } from '../../lib/moneyField';
import { partnerOptions } from '../../reference/partners';
import { useReference } from '../../reference/useReference';
import { ClientSelect } from '../clients/ClientSelect';
import { offerKeys, useApplyConvert, useOffer } from './queries';

interface Props {
  offer: Pick<OfferSummary, 'id' | 'eventName'>;
  onClose: () => void;
  /** 201: the caller closes the dialog and shows the notice with the gig link. */
  onConverted: (result: OfferConvertResponse) => void;
}

interface FormState {
  startDate: string;
  lineupName: string;
  venue: string;
  clientId: Id | null;
  price: string;
  sellerId: Id;
  producerId: Id;
}

const DRAFT = 'gig-draft';

type Errors = Partial<Record<keyof FormState, string>>;

/** Contract field (GigCreate) → modal field that shows its error; others go to the notice. */
const FIELD_TO_CONTROL: Record<string, keyof FormState> = {
  startDate: 'startDate',
  lineupName: 'lineupName',
  lineupTemplateId: 'lineupName',
  venue: 'venue',
  clientId: 'clientId',
  priceCents: 'price',
  sellerId: 'sellerId',
  producerId: 'producerId',
};

function formFromDraft(draft: GigCreate, lang: Language, reference: ReferenceData | undefined): FormState {
  const templateName = reference?.lineupTemplates.find((tpl) => tpl.id === draft.lineupTemplateId)?.name;
  return {
    startDate: draft.startDate,
    lineupName: draft.lineupName ?? templateName ?? '',
    venue: draft.venue,
    clientId: draft.clientId ?? null,
    price: centsToInput(draft.priceCents, lang),
    sellerId: draft.sellerId,
    producerId: draft.producerId,
  };
}

/**
 * Convert to gig (UC-031): a small modal prefilled from `GET /api/offers/{id}/gig-draft`
 * (BR-105) with the key fields editable and a yellow review tag. Confirm sends the draft merged
 * with the edited fields to `POST /api/offers/{id}/convert`. The other gig fields are edited
 * later on the gig page.
 */
export function ConvertDialog({ offer, onClose, onConverted }: Props) {
  const { t } = useTranslation();
  const draft = useQuery({
    queryKey: [...offerKeys.detail(offer.id), DRAFT],
    queryFn: () => offersApi.gigDraft(offer.id),
    // Always fresh: the offer may have changed since the dialog was last opened.
    staleTime: 0,
    gcTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const alreadyConverted = isApiError(draft.error) && draft.error.code === 'ALREADY_CONVERTED';

  return (
    <Dialog title={t('convert.title')} onClose={onClose}>
      {draft.data ? (
        <ConvertForm offer={offer} draft={draft.data} onClose={onClose} onConverted={onConverted} />
      ) : (
        <>
          {draft.isPending && <p className="muted">{t('app.loading')}</p>}
          {alreadyConverted && <AlreadyConverted offerId={offer.id} />}
          {draft.isError && !alreadyConverted && (
            <Notice tone="danger" role="alert">
              <p>{t('convert.loadError')}</p>
              <p>{apiErrorMessage(t, draft.error)}</p>
            </Notice>
          )}
          <div className="form-actions">
            <Button onClick={onClose}>{t('common.cancel')}</Button>
          </div>
        </>
      )}
    </Dialog>
  );
}

/** 409 ALREADY_CONVERTED (UC-031 E1): message + link to the existing gig (from the refetched offer). */
function AlreadyConverted({ offerId }: { offerId: Id }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const offer = useOffer(offerId);
  useEffect(() => {
    // Converted elsewhere: refresh the offer (for the link; the row / page show "Keikka →" too).
    // Not the draft itself: refetching it would remount this notice and loop.
    void queryClient.invalidateQueries({
      queryKey: offerKeys.all,
      predicate: (query) => query.queryKey.at(-1) !== DRAFT,
    });
  }, [queryClient]);
  const gigId = offer.data?.gigId ?? null;
  return (
    <Notice tone="warn" role="alert">
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

function ConvertForm({
  offer,
  draft,
  onClose,
  onConverted,
}: Props & { draft: GigCreate }) {
  const { t } = useTranslation();
  const lang = useLang();
  const applyConvert = useApplyConvert();
  const { data: reference } = useReference();
  const [form, setForm] = useState<FormState>(() => formFromDraft(draft, lang, reference));
  const [errors, setErrors] = useState<Errors>({});
  // Inactive partners are not offered (BR-111), except the prefilled value.
  const sellerOptions = partnerOptions(reference?.partners, draft.sellerId);
  const producerOptions = partnerOptions(reference?.partners, draft.producerId);
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));
  // The dialog focused Cancel while the draft loaded; move focus to the first field.
  const firstField = useRef<HTMLInputElement>(null);
  useEffect(() => firstField.current?.focus(), []);

  // Double-submit guard (AC-3): `isPending` only disables the button after a re-render.
  const submitting = useRef(false);
  const convert = useMutation({
    mutationFn: (body: GigCreate) => offersApi.convert(offer.id, body),
    onSuccess: (result) => {
      void applyConvert(result.offer);
      onConverted(result);
    },
    onError: (error) => {
      submitting.current = false;
      const fieldErrors: Errors = {};
      for (const [field, message] of Object.entries(apiFieldErrors(t, error))) {
        const control = FIELD_TO_CONTROL[field];
        if (control) fieldErrors[control] = message;
      }
      setErrors(fieldErrors);
    },
  });
  const alreadyConverted = isApiError(convert.error) && convert.error.code === 'ALREADY_CONVERTED';
  // A 400 on a field the modal doesn't show (or a non-field error) goes to the notice.
  const unshownError =
    convert.isError &&
    !alreadyConverted &&
    Object.keys(apiFieldErrors(t, convert.error)).every((field) => !FIELD_TO_CONTROL[field]);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (submitting.current || alreadyConverted) return;
    const price = parseMoneyField(form.price, lang, true);
    const lineupName = form.lineupName.trim();
    const codes: Partial<Record<keyof FormState, FieldCode>> = {};
    if (!form.startDate) codes.startDate = 'REQUIRED';
    if (!lineupName && !draft.lineupTemplateId) codes.lineupName = 'REQUIRED';
    if (!form.venue.trim()) codes.venue = 'REQUIRED';
    if (!form.sellerId) codes.sellerId = 'REQUIRED';
    if (!form.producerId) codes.producerId = 'REQUIRED';
    if (price.error) codes.price = price.error;
    const fieldErrors: Errors = {};
    for (const [key, code] of Object.entries(codes)) fieldErrors[key as keyof FormState] = t(`fields.${code}`);
    setErrors(fieldErrors);
    if (Object.keys(fieldErrors).length > 0) return;
    submitting.current = true;
    convert.mutate({
      ...draft,
      startDate: form.startDate,
      lineupName: lineupName || null,
      venue: form.venue.trim(),
      clientId: form.clientId,
      priceCents: price.cents ?? 0,
      sellerId: form.sellerId,
      producerId: form.producerId,
    });
  };

  return (
    <form className="offer-convert-form" onSubmit={onSubmit} noValidate>
      <p className="offer-convert-review" role="note">
        <StatusTag tone="warn">{t('convert.review')}</StatusTag>
      </p>
      <div className="form-row">
        <Field label={t('gigForm.startDate')} error={errors.startDate}>
          {(p) => (
            <input
              {...p}
              ref={firstField}
              type="date"
              value={form.startDate} onChange={(e) => set('startDate', e.target.value)} />
          )}
        </Field>
        <Field label={t('gigForm.price')} error={errors.price}>
          {(p) => <MoneyInput {...p} value={form.price} onChange={(v) => set('price', v)} />}
        </Field>
      </div>
      <Field label={t('gigForm.lineup')} error={errors.lineupName}>
        {(p) => (
          <input {...p} type="text" value={form.lineupName} onChange={(e) => set('lineupName', e.target.value)} />
        )}
      </Field>
      <Field label={t('gigForm.venue')} error={errors.venue}>
        {(p) => <input {...p} type="text" value={form.venue} onChange={(e) => set('venue', e.target.value)} />}
      </Field>
      <Field label={t('clients.select.label')} error={errors.clientId}>
        {(p) => <ClientSelect {...p} value={form.clientId} onChange={(id) => set('clientId', id)} />}
      </Field>
      <div className="form-row">
        <Field label={t('gigForm.seller')} error={errors.sellerId}>
          {(p) => (
            <select {...p} value={form.sellerId} onChange={(e) => set('sellerId', e.target.value)}>
              {sellerOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label={t('gigForm.producer')} error={errors.producerId}>
          {(p) => (
            <select {...p} value={form.producerId} onChange={(e) => set('producerId', e.target.value)}>
              {producerOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          )}
        </Field>
      </div>
      {alreadyConverted && <AlreadyConverted offerId={offer.id} />}
      {unshownError && (
        <Notice tone="danger" role="alert">
          <p>{apiErrorMessage(t, convert.error)}</p>
        </Notice>
      )}
      <div className="form-actions">
        <Button type="submit" variant="primary" disabled={convert.isPending || alreadyConverted}>
          {convert.isPending ? t('convert.converting') : t('convert.button')}
        </Button>
        <Button onClick={onClose}>{t('common.cancel')}</Button>
      </div>
    </form>
  );
}
