import { useMutation } from '@tanstack/react-query';
import { ArrowLeft, Link2, RefreshCw, RotateCcw, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ApiError } from '../../api/client';
import type { OfferDisposition, OfferEventType, OfferSource } from '../../api/enums';
import { offersApi } from '../../api/endpoints';
import type { OfferDetail, OfferUpdate } from '../../api/types';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { FieldList } from '../../components/FieldList';
import {
  InlineDate,
  InlineMoney,
  InlineSelect,
  InlineSwitch,
  InlineText,
  InlineTextarea,
} from '../../components/inline';
import { Notice } from '../../components/Notice';
import { PageHead } from '../../components/PageHead';
import { SectionLabel } from '../../components/SectionLabel';
import { StatusTag } from '../../components/StatusTag';
import { apiErrorMessage } from '../../i18n/labels';
import { useLang } from '../../i18n/useLang';
import { formatDateTime, formatDateWithWeekday } from '../../lib/format';
import { partnerOptions } from '../../reference/partners';
import { useReference } from '../../reference/useReference';
import { InlineClientSelect } from '../clients/ClientSelect';
import { OfferHistory } from './OfferHistory';
import { OfferPreview } from './OfferPreview';
import { copyToClipboard, useOfferOptions, type CopyResult } from './offerOptions';
import { ConfirmDialog, CopyResultNotice, GigCell, OfferStatusTag } from './offerParts';
import { publicOfferUrl, useApplyOffer, useOffer } from './queries';
import './offers.css';

type PageNotice =
  | { kind: 'copy'; result: CopyResult }
  | { kind: 'regenerated' | 'restored' }
  | { kind: 'error'; error: unknown };

type ActionDialog = 'regenerate' | 'delete' | null;

function BackLink() {
  const { t } = useTranslation();
  return (
    <p className="offer-back">
      <Link to="/offers">
        <ArrowLeft />
        {t('offer.back')}
      </Link>
    </p>
  );
}

/**
 * One offer (UC-029 step 3): the customer view (`OfferPreview` with the API's `preview`, the same
 * component as the public page) and the internal panel: every field in place, price, source,
 * event type, disposition, history, and the actions Copy public link, Regenerate link, Convert,
 * Delete. A deleted offer is read-only with Restore only.
 */
export function OfferPage() {
  const { id = '' } = useParams();
  const { t } = useTranslation();
  const lang = useLang();
  const navigate = useNavigate();
  const query = useOffer(id);
  const applyOffer = useApplyOffer();
  const [notice, setNotice] = useState<PageNotice | null>(null);
  const [dialog, setDialog] = useState<ActionDialog>(null);

  const restore = useMutation({
    mutationFn: () => offersApi.restore(id),
    onSuccess: (offer) => {
      void applyOffer(offer, id);
      setNotice({ kind: 'restored' });
    },
    onError: (error) => setNotice({ kind: 'error', error }),
  });

  if (query.isPending) {
    return (
      <section className="page offers-page">
        <p role="status">{t('app.loading')}</p>
      </section>
    );
  }
  if (query.isError) {
    return (
      <section className="page offers-page">
        <BackLink />
        <Notice tone="danger" role="alert">
          <p>{query.error instanceof ApiError && query.error.status === 404 ? t('offer.notFound') : apiErrorMessage(t, query.error)}</p>
        </Notice>
      </section>
    );
  }
  const offer = query.data;
  const readOnly = offer.deletedAt !== null;
  const close = () => setDialog(null);

  const actions = readOnly ? (
    <div className="offer-actions">
      <Button variant="primary" icon={RotateCcw} disabled={restore.isPending} onClick={() => restore.mutate()}>
        {t('offer.actions.restore')}
      </Button>
    </div>
  ) : (
    <div className="offer-actions" role="group" aria-label={t('offer.actions.label')}>
      <Button
        icon={Link2}
        onClick={() =>
          void copyToClipboard(publicOfferUrl(offer.sharePath)).then((result) => setNotice({ kind: 'copy', result }))
        }
      >
        {t('offer.actions.copyLink')}
      </Button>
      <Button icon={RefreshCw} onClick={() => setDialog('regenerate')}>
        {t('offer.actions.regenerate')}
      </Button>
      <GigCell offer={offer} size="md" />
      <Button variant="danger" icon={Trash2} onClick={() => setDialog('delete')}>
        {t('offer.actions.delete')}
      </Button>
    </div>
  );

  return (
    <section className="page offers-page offer-page">
      <PageHead
        title={offer.eventName}
        subtitle={
          <>
            <span className="offer-head-date">{formatDateWithWeekday(offer.eventDate, lang)}</span>
            <span className="offer-head-tags">
              <OfferStatusTag offer={offer} />
              {readOnly && <StatusTag tone="danger">{t('offers.columns.deletedAt')}</StatusTag>}
            </span>
          </>
        }
        actions={actions}
      >
        <BackLink />
      </PageHead>

      {readOnly && (
        <Notice tone="danger" role="note">
          <p>{t('offer.deletedBanner')}</p>
        </Notice>
      )}
      {notice && <PageNoticeBox notice={notice} onDismiss={() => setNotice(null)} />}

      <div className="offer-layout">
        <section className="offer-preview-col" aria-labelledby="offer-preview-title">
          <SectionLabel id="offer-preview-title">{t('offer.sections.preview')}</SectionLabel>
          <p className="muted small offer-preview-hint">{t('offer.previewHint')}</p>
          <div className="offer-preview-frame">
            <OfferPreview offer={offer.preview} titleLevel={2} />
          </div>
        </section>

        <div className="offer-panel">
          <section aria-labelledby="offer-details-title">
            <SectionLabel id="offer-details-title">{t('offer.sections.details')}</SectionLabel>
            <OfferDetailFields offer={offer} readOnly={readOnly} />
          </section>
          <section aria-labelledby="offer-internal-title">
            <SectionLabel id="offer-internal-title">{t('offer.sections.internal')}</SectionLabel>
            <OfferInternalFields offer={offer} readOnly={readOnly} />
          </section>
          <section aria-labelledby="offer-history-title">
            <SectionLabel id="offer-history-title">{t('offer.sections.history')}</SectionLabel>
            <Card as="div">
              <OfferHistory offerId={offer.id} />
            </Card>
          </section>
        </div>
      </div>

      {dialog === 'regenerate' && (
        <ConfirmDialog
          title={t('offer.actions.regenerate')}
          confirmLabel={t('offer.actions.regenerate')}
          mutationFn={() => offersApi.regenerateLink(offer.id)}
          onClose={close}
          onDone={(updated) => {
            void applyOffer(updated, offer.id);
            close();
            setNotice({ kind: 'regenerated' });
          }}
        >
          <p>{t('offer.regenerateText')}</p>
        </ConfirmDialog>
      )}
      {dialog === 'delete' && (
        <ConfirmDialog
          title={t('offer.actions.delete')}
          confirmLabel={t('offer.actions.delete')}
          danger
          mutationFn={() => offersApi.delete(offer.id)}
          onClose={close}
          onDone={() => {
            void applyOffer(null, offer.id);
            void navigate('/offers', { state: { deletedOffer: offer.eventName } });
          }}
        >
          <p>{t('offer.deleteText', { event: offer.eventName })}</p>
        </ConfirmDialog>
      )}
    </section>
  );
}

function PageNoticeBox({ notice, onDismiss }: { notice: PageNotice; onDismiss: () => void }) {
  const { t } = useTranslation();
  if (notice.kind === 'copy') return <CopyResultNotice result={notice.result} onDismiss={onDismiss} />;
  const tone = notice.kind === 'error' ? 'danger' : 'ok';
  let text;
  if (notice.kind === 'error') text = <p>{apiErrorMessage(t, notice.error)}</p>;
  else text = <p>{t(`offer.${notice.kind}`)}</p>;
  return (
    <Notice tone={tone} role={notice.kind === 'error' ? 'alert' : 'status'} className="offer-notice">
      {text}
      <Button size="sm" onClick={onDismiss}>
        {t('common.dismiss')}
      </Button>
    </Notice>
  );
}

/** One PATCH per field (NFR-8); the preview and the history follow the response. */
function useOfferPatch(offer: OfferDetail) {
  const applyOffer = useApplyOffer();
  return async (body: OfferUpdate) => {
    const updated = await offersApi.update(offer.id, body);
    await applyOffer(updated, offer.id);
    return updated;
  };
}

const toLines = (text: string | null) =>
  (text ?? '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

/** The customer-facing fields, edited in place. */
function OfferDetailFields({ offer, readOnly }: { offer: OfferDetail; readOnly: boolean }) {
  const { t } = useTranslation();
  const { data: reference } = useReference();
  const patch = useOfferPatch(offer);
  // Active partners + the current seller even if removed (UC-032).
  const sellerOptions = partnerOptions(reference?.partners, offer.sellerId);
  return (
    <Card as="div" className="offer-fields">
      <FieldList>
        <InlineClientSelect
          label={t('offer.fields.client')}
          value={offer.clientId}
          currentName={offer.clientName}
          disabled={readOnly}
          onSave={(clientId) =>
            clientId
              ? patch({ clientId })
              : Promise.reject(new ApiError(400, 'VALIDATION_ERROR', 'client required', { clientId: 'REQUIRED' }))
          }
        />
        <InlineText
          label={t('offer.fields.eventName')}
          required
          maxLength={500}
          value={offer.eventName}
          field="eventName"
          disabled={readOnly}
          onSave={(eventName) => patch({ eventName })}
        />
        <InlineDate
          label={t('offer.fields.eventDate')}
          required
          value={offer.eventDate}
          field="eventDate"
          disabled={readOnly}
          onSave={(eventDate) => patch({ eventDate })}
        />
        <InlineText
          label={t('offer.fields.venue')}
          required
          maxLength={500}
          value={offer.venue}
          field="venue"
          disabled={readOnly}
          onSave={(venue) => patch({ venue })}
        />
        <InlineText
          label={t('offer.fields.city')}
          maxLength={500}
          value={offer.city}
          field="city"
          placeholder="–"
          disabled={readOnly}
          onSave={(city) => patch({ city })}
        />
        <InlineSelect
          label={t('offer.fields.seller')}
          value={offer.sellerId}
          field="sellerId"
          options={sellerOptions}
          disabled={readOnly}
          onSave={(sellerId) => patch({ sellerId })}
        />
        <InlineTextarea
          label={t('offer.fields.lineup')}
          value={offer.lineup.length ? offer.lineup.join('\n') : null}
          field="lineup"
          rows={4}
          placeholder="–"
          hint={readOnly ? undefined : t('offer.fields.lineupHint')}
          disabled={readOnly}
          onSave={(text) => patch({ lineup: toLines(text) })}
        />
        <InlineTextarea
          label={t('offer.fields.includes')}
          value={offer.includesText}
          field="includesText"
          rows={3}
          maxLength={5000}
          placeholder="–"
          disabled={readOnly}
          onSave={(includesText) => patch({ includesText })}
        />
        <InlineSwitch
          label={t('offer.fields.showReferences')}
          value={offer.showReferences}
          field="showReferences"
          disabled={readOnly}
          onSave={(showReferences) => patch({ showReferences })}
        />
      </FieldList>
    </Card>
  );
}

/** Internal fields: price, source, event type, disposition (status follows it), created, gig. */
function OfferInternalFields({ offer, readOnly }: { offer: OfferDetail; readOnly: boolean }) {
  const { t } = useTranslation();
  const lang = useLang();
  const options = useOfferOptions();
  const patch = useOfferPatch(offer);
  return (
    <Card as="div" className="offer-fields">
      <FieldList>
        <InlineMoney
          label={t('offer.fields.price')}
          value={offer.priceCents}
          field="priceCents"
          placeholder="–"
          hint={readOnly ? undefined : t('offer.fields.priceHint')}
          disabled={readOnly}
          onSave={(priceCents) => patch({ priceCents })}
        />
        <InlineSelect<OfferSource | null>
          label={t('offer.fields.source')}
          value={offer.source}
          field="source"
          options={options.source}
          disabled={readOnly}
          onSave={(source) => patch({ source })}
        />
        <InlineSelect<OfferEventType | null>
          label={t('offer.fields.eventType')}
          value={offer.eventType}
          field="eventType"
          options={options.eventType}
          disabled={readOnly}
          onSave={(eventType) => patch({ eventType })}
        />
        <InlineSelect<OfferDisposition>
          label={t('offer.fields.disposition')}
          value={offer.disposition}
          field="disposition"
          options={options.disposition}
          disabled={readOnly}
          onSave={(disposition) => patch({ disposition })}
        />
      </FieldList>
      <dl className="offer-facts">
        <div>
          <dt className="label">{t('offer.fields.status')}</dt>
          <dd>
            <OfferStatusTag offer={offer} />
          </dd>
        </div>
        <div>
          <dt className="label">{t('offer.fields.created')}</dt>
          <dd>{formatDateTime(offer.createdAt, lang)}</dd>
        </div>
        <div>
          <dt className="label">{t('offer.fields.updated')}</dt>
          <dd>{formatDateTime(offer.updatedAt, lang)}</dd>
        </div>
      </dl>
    </Card>
  );
}
