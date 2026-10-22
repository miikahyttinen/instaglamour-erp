// Shared components of the offer screens: status tag, gig cell, copy-link notice, confirm dialog.
import { useMutation } from '@tanstack/react-query';
import { useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import type { OfferSummary } from '../../api/types';
import { Button } from '../../components/Button';
import { buttonClass } from '../../components/buttonClass';
import { Dialog } from '../../components/Dialog';
import { Notice } from '../../components/Notice';
import { StatusTag } from '../../components/StatusTag';
import { apiErrorMessage, offerStatusLabel } from '../../i18n/labels';
import type { CopyResult } from './offerOptions';
import { canConvertOffer, offerDisplayStatus } from './offerStatus';

const TONE = { OPEN: 'info', EXPIRED: 'warn', ACCEPTED: 'ok', REJECTED: 'danger' } as const;

/** Status incl. expired (BR-102): Open (info) · Expired (warn) · Accepted (ok) · Rejected (danger, red). */
export function OfferStatusTag({ offer }: { offer: Pick<OfferSummary, 'status' | 'expired'> }) {
  const { t } = useTranslation();
  const status = offerDisplayStatus(offer);
  return (
    <StatusTag tone={TONE[status]}>
      {status === 'EXPIRED' ? t('offers.expired') : offerStatusLabel(t, status)}
    </StatusTag>
  );
}

/** Result line of Copy public link: confirmation, or the URL in a read-only field. */
export function CopyResultNotice({ result, onDismiss }: { result: CopyResult; onDismiss: () => void }) {
  const { t } = useTranslation();
  return (
    <Notice tone={result.kind === 'copied' ? 'ok' : 'warn'} role="status" className="offer-notice">
      {result.kind === 'copied' ? (
        <p>{t('offer.copied')}</p>
      ) : (
        <div className="offer-copy-fallback">
          <p>{t('offer.copyFailed')}</p>
          <input
            type="text"
            readOnly
            aria-label={t('offer.fields.publicLink')}
            value={result.url}
            onFocus={(e) => e.currentTarget.select()}
          />
        </div>
      )}
      <Button size="sm" onClick={onDismiss}>
        {t('common.dismiss')}
      </Button>
    </Notice>
  );
}

interface ConfirmDialogProps<T> {
  title: string;
  children: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  mutationFn: () => Promise<T>;
  onClose: () => void;
  onDone: (result: T) => void;
  /** Error handling before the generic message (return true when handled). */
  onError?: (error: unknown) => boolean;
}

/**
 * Yes/no confirmation that runs one request; confirm is disabled while it runs (no double submit).
 * The guard is a ref set synchronously in the click handler (F-007): React Query publishes
 * `isPending` only after a render, so a second click in the same frame would otherwise send a
 * second request. The guard is released on error so the user can retry.
 */
export function ConfirmDialog<T>({
  title,
  children,
  confirmLabel,
  danger,
  mutationFn,
  onClose,
  onDone,
  onError,
}: ConfirmDialogProps<T>) {
  const { t } = useTranslation();
  const [handled, setHandled] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const mutation = useMutation({
    mutationFn,
    onSuccess: onDone,
    onError: (error) => {
      submittingRef.current = false;
      setSubmitting(false);
      setHandled(onError?.(error) ?? false);
    },
  });
  const confirm = () => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    mutation.mutate();
  };
  return (
    <Dialog title={title} onClose={onClose}>
      <div className="offer-dialog-body">{children}</div>
      {mutation.isError && !handled && (
        <Notice tone="danger" role="alert">
          <p>{apiErrorMessage(t, mutation.error)}</p>
        </Notice>
      )}
      <div className="form-actions">
        <Button
          variant={danger ? 'danger' : 'primary'}
          disabled={submitting || mutation.isPending}
          onClick={confirm}
        >
          {confirmLabel}
        </Button>
        <Button onClick={onClose}>{t('common.cancel')}</Button>
      </div>
    </Dialog>
  );
}

/**
 * Gig column / action: the gig link once converted, else Convert (UC-031) when the offer can be
 * converted (BR-109: accepted, event date today or later). Otherwise nothing: "–" in the table,
 * no action on the offer page. `size="md"` is the page-head action (full-size button look); the
 * table uses the small one.
 */
export function GigCell({
  offer,
  onConvert,
  size = 'sm',
}: {
  offer: OfferSummary;
  onConvert: () => void;
  size?: 'sm' | 'md';
}) {
  const { t } = useTranslation();
  if (offer.gigId) {
    return (
      <Link
        to={`/gigs/${offer.gigId}`}
        className={size === 'md' ? buttonClass() : 'offer-gig-link'}
        aria-label={t('convert.gigLinkLabel', { event: offer.eventName })}
      >
        {t('convert.gigLink')}
      </Link>
    );
  }
  if (!canConvertOffer(offer)) return size === 'md' ? null : <>–</>;
  // UC-031: opens the convert modal (ConvertDialog).
  return (
    <Button size={size} onClick={onConvert} aria-label={t('convert.buttonLabel', { event: offer.eventName })}>
      {t('convert.button')}
    </Button>
  );
}
