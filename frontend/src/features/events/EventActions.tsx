import { useMutation } from '@tanstack/react-query';
import { Ban, CalendarClock, RotateCcw, Trash2, Undo2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { eventsApi } from '../../api/endpoints';
import type { EventDetail, EventWithWarnings, Warning } from '../../api/types';
import { Button } from '../../components/Button';
import { Dialog } from '../../components/Dialog';
import { Notice } from '../../components/Notice';
import { Field } from '../../components/fields';
import { apiErrorMessage, apiFieldErrors } from '../../i18n/labels';
import { useApplyEvent } from './queries';

type ActionDialog = 'move' | 'cancel' | 'uncancel' | 'delete' | null;

interface Props {
  event: EventDetail;
  onCancelled: () => void;
  onUncancelled: () => void;
  onMoved: (warnings: Warning[]) => void;
  onRestored: () => void;
}

/** Move, Cancel / Uncancel, Delete — or Restore for a deleted event (UC-009, 010, 012, 025). */
export function EventActions({ event, onCancelled, onUncancelled, onMoved, onRestored }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const applyEvent = useApplyEvent();
  const [dialog, setDialog] = useState<ActionDialog>(null);
  const close = () => setDialog(null);

  const restore = useMutation({
    mutationFn: () => eventsApi.restore(event.id),
    onSuccess: (restored) => {
      applyEvent(restored, event.id);
      onRestored();
    },
  });

  if (event.deletedAt) {
    return (
      <div className="event-actions">
        <Button
          variant="primary"
          icon={RotateCcw}
          disabled={restore.isPending}
          onClick={() => restore.mutate()}
        >
          {t('event.restore')}
        </Button>
        {restore.isError && (
          <Notice tone="danger" role="alert">
            <p>{apiErrorMessage(t, restore.error)}</p>
          </Notice>
        )}
      </div>
    );
  }

  return (
    <div className="event-actions" role="group" aria-label={t('event.actions.label')}>
      {event.status === 'SOLD' ? (
        <>
          <Button icon={CalendarClock} onClick={() => setDialog('move')}>
            {t('event.actions.move')}
          </Button>
          <Button icon={Ban} onClick={() => setDialog('cancel')}>
            {t('event.actions.cancel')}
          </Button>
        </>
      ) : (
        <Button icon={Undo2} onClick={() => setDialog('uncancel')}>
          {t('event.actions.uncancel')}
        </Button>
      )}
      <Button variant="danger" icon={Trash2} onClick={() => setDialog('delete')}>
        {t('event.actions.delete')}
      </Button>

      {dialog === 'move' && (
        <MoveDialog
          event={event}
          onClose={close}
          onDone={(result) => {
            applyEvent(result.event, event.id);
            close();
            onMoved(result.warnings);
          }}
        />
      )}
      {dialog === 'cancel' && (
        <ReasonDialog
          title={t('event.cancelTitle')}
          intro={t('event.cancelIntro')}
          confirmLabel={t('event.confirmCancel')}
          mutationFn={(reason) => eventsApi.cancel(event.id, { reason })}
          onClose={close}
          onDone={(updated) => {
            applyEvent(updated ?? null, event.id);
            close();
            onCancelled();
          }}
        />
      )}
      {dialog === 'uncancel' && (
        <ReasonDialog
          title={t('event.uncancelTitle')}
          intro={t('event.uncancelIntro')}
          confirmLabel={t('event.confirmUncancel')}
          mutationFn={(reason) => eventsApi.uncancel(event.id, { reason })}
          onClose={close}
          onDone={(updated) => {
            applyEvent(updated ?? null, event.id);
            close();
            onUncancelled();
          }}
        />
      )}
      {dialog === 'delete' && (
        <ReasonDialog
          title={t('event.deleteTitle')}
          intro={t('event.deleteIntro')}
          confirmLabel={t('event.confirmDelete')}
          danger
          mutationFn={(reason) => eventsApi.delete(event.id, { reason })}
          onClose={close}
          onDone={() => {
            applyEvent(null, event.id);
            void navigate('/events', { state: { notice: 'deleted' } });
          }}
        />
      )}
    </div>
  );
}

interface ReasonDialogProps<T> {
  title: string;
  intro: string;
  confirmLabel: string;
  danger?: boolean;
  mutationFn: (reason: string) => Promise<T>;
  onClose: () => void;
  onDone: (result: T) => void;
}

/** Asks for a required reason; confirm stays disabled until one is given (BR-011, BR-018). */
function ReasonDialog<T>({
  title,
  intro,
  confirmLabel,
  danger,
  mutationFn,
  onClose,
  onDone,
}: ReasonDialogProps<T>) {
  const { t } = useTranslation();
  const [reason, setReason] = useState('');
  const mutation = useMutation({ mutationFn, onSuccess: onDone });
  const fieldErrors = mutation.isError ? apiFieldErrors(t, mutation.error) : {};
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (reason.trim()) mutation.mutate(reason.trim());
  };
  return (
    <Dialog title={title} onClose={onClose}>
      <form onSubmit={submit} noValidate>
        <p className="event-dialog-intro">{intro}</p>
        <Field label={t('event.reason')} error={fieldErrors.reason}>
          {(p) => (
            <textarea {...p} rows={3} required value={reason} onChange={(e) => setReason(e.target.value)} />
          )}
        </Field>
        {mutation.isError && !fieldErrors.reason && (
          <Notice tone="danger" role="alert">
            <p>{apiErrorMessage(t, mutation.error)}</p>
          </Notice>
        )}
        <div className="form-actions">
          <Button
            type="submit"
            variant={danger ? 'danger' : 'primary'}
            disabled={!reason.trim() || mutation.isPending}
          >
            {confirmLabel}
          </Button>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
        </div>
      </form>
    </Dialog>
  );
}

function MoveDialog({
  event,
  onClose,
  onDone,
}: {
  event: EventDetail;
  onClose: () => void;
  onDone: (result: EventWithWarnings) => void;
}) {
  const { t } = useTranslation();
  const [startDate, setStartDate] = useState(event.startDate);
  const [endDate, setEndDate] = useState(event.endDate ?? '');
  const [reason, setReason] = useState('');
  const [localErrors, setLocalErrors] = useState<Record<string, string>>({});
  const move = useMutation({
    mutationFn: () =>
      eventsApi.move(event.id, {
        startDate,
        endDate: endDate || null,
        ...(reason.trim() ? { reason: reason.trim() } : {}),
      }),
    onSuccess: onDone,
  });
  const errors = { ...(move.isError ? apiFieldErrors(t, move.error) : {}), ...localErrors };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (!startDate) next.startDate = t('fields.REQUIRED');
    else if (endDate && endDate < startDate) next.endDate = t('fields.END_BEFORE_START');
    setLocalErrors(next);
    if (Object.keys(next).length === 0) move.mutate();
  };

  return (
    <Dialog title={t('event.moveTitle')} onClose={onClose}>
      <form onSubmit={submit} noValidate>
        <div className="form-row">
          <Field label={t('event.newStartDate')} error={errors.startDate}>
            {(p) => (
              <input {...p} type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            )}
          </Field>
          <Field label={t('event.newEndDate')} error={errors.endDate}>
            {(p) => (
              <input
                {...p}
                type="date"
                value={endDate}
                min={startDate || undefined}
                onChange={(e) => setEndDate(e.target.value)}
              />
            )}
          </Field>
        </div>
        <Field label={t('event.reasonOptional')} error={errors.reason}>
          {(p) => <textarea {...p} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />}
        </Field>
        {move.isError && Object.keys(apiFieldErrors(t, move.error)).length === 0 && (
          <Notice tone="danger" role="alert">
            <p>{apiErrorMessage(t, move.error)}</p>
          </Notice>
        )}
        <div className="form-actions">
          <Button type="submit" variant="primary" disabled={move.isPending}>
            {t('event.confirmMove')}
          </Button>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
        </div>
      </form>
    </Dialog>
  );
}
