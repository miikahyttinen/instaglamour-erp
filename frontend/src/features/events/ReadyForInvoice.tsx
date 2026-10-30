import { useMutation } from '@tanstack/react-query';
import { ReceiptText, Undo2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { eventsApi } from '../../api/endpoints';
import type { EventDetail } from '../../api/types';
import { Button } from '../../components/Button';
import { Notice } from '../../components/Notice';
import { StatusTag } from '../../components/StatusTag';
import { apiErrorMessage, isReadyForInvoice } from '../../i18n/labels';
import { useLang } from '../../i18n/useLang';
import { formatDate, formatTime } from '../../lib/format';
import { usePartner } from '../../reference/useReference';
import { ConfirmDialog } from '../offers/offerParts';
import { useApplyEvent } from './queries';

/**
 * "Valmis laskutukseen" on the gig page (api-contract 2026-10-31), set by hand.
 * Not set: a button (upcoming and played gigs). Set: a green tag with who / when and "Peru"
 * (confirm → DELETE). Cancelled gigs show nothing; a deleted gig shows the tag read-only.
 */
export function ReadyForInvoice({ event }: { event: EventDetail }) {
  const { t } = useTranslation();
  const lang = useLang();
  const applyEvent = useApplyEvent();
  const partner = usePartner(event.readyForInvoiceBy);
  const [confirming, setConfirming] = useState(false);
  const mark = useMutation({
    mutationFn: () => eventsApi.markReadyForInvoice(event.id),
    onSuccess: (updated) => applyEvent(updated, event.id),
  });

  const deleted = event.deletedAt !== null;
  if (event.status === 'CANCELLED') return null;

  if (!isReadyForInvoice(event)) {
    if (deleted) return null;
    return (
      <div className="event-ready-for-invoice">
        <Button icon={ReceiptText} disabled={mark.isPending} onClick={() => mark.mutate()}>
          {t('event.readyForInvoice.mark')}
        </Button>
        {mark.isError && (
          <Notice tone="danger" role="alert">
            <p>{apiErrorMessage(t, mark.error)}</p>
          </Notice>
        )}
      </div>
    );
  }

  return (
    <div className="event-ready-for-invoice">
      <StatusTag tone="ok">{t('event.readyForInvoice.label')}</StatusTag>
      <span className="meta event-ready-for-invoice-by">
        {t('event.readyForInvoice.by', {
          name: partner?.name ?? '–',
          date: formatDate(event.readyForInvoiceAt, lang),
          time: formatTime(event.readyForInvoiceAt, lang),
        })}
      </span>
      {!deleted && (
        <Button size="sm" icon={Undo2} onClick={() => setConfirming(true)}>
          {t('event.readyForInvoice.undo')}
        </Button>
      )}
      {confirming && (
        <ConfirmDialog
          title={t('event.readyForInvoice.undoTitle')}
          confirmLabel={t('event.readyForInvoice.confirmUndo')}
          mutationFn={() => eventsApi.clearReadyForInvoice(event.id)}
          onClose={() => setConfirming(false)}
          onDone={(updated) => {
            applyEvent(updated, event.id);
            setConfirming(false);
          }}
        >
          <p>{t('event.readyForInvoice.undoIntro')}</p>
        </ConfirmDialog>
      )}
    </div>
  );
}
