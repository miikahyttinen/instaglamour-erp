import { useMutation } from '@tanstack/react-query';
import { Ban, CalendarClock, RotateCcw, Trash2, Undo2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { gigsApi } from '../../api/endpoints';
import type { GigDetail, GigWithWarnings, Warning } from '../../api/types';
import { Button } from '../../components/Button';
import { Dialog } from '../../components/Dialog';
import { Notice } from '../../components/Notice';
import { Field } from '../../components/fields';
import { apiErrorMessage, apiFieldErrors } from '../../i18n/labels';
import { useApplyGig } from './queries';

type ActionDialog = 'move' | 'cancel' | 'uncancel' | 'delete' | null;

interface Props {
  gig: GigDetail;
  onCancelled: () => void;
  onUncancelled: () => void;
  onMoved: (warnings: Warning[]) => void;
  onRestored: () => void;
}

/** Move, Cancel / Uncancel, Delete — or Restore for a deleted gig (UC-009, 010, 012, 025). */
export function GigActions({ gig, onCancelled, onUncancelled, onMoved, onRestored }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const applyGig = useApplyGig();
  const [dialog, setDialog] = useState<ActionDialog>(null);
  const close = () => setDialog(null);

  const restore = useMutation({
    mutationFn: () => gigsApi.restore(gig.id),
    onSuccess: (restored) => {
      applyGig(restored, gig.id);
      onRestored();
    },
  });

  if (gig.deletedAt) {
    return (
      <div className="gig-actions">
        <Button
          variant="primary"
          icon={RotateCcw}
          disabled={restore.isPending}
          onClick={() => restore.mutate()}
        >
          {t('gig.restore')}
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
    <div className="gig-actions" role="group" aria-label={t('gig.actions.label')}>
      {gig.status === 'SOLD' ? (
        <>
          <Button icon={CalendarClock} onClick={() => setDialog('move')}>
            {t('gig.actions.move')}
          </Button>
          <Button icon={Ban} onClick={() => setDialog('cancel')}>
            {t('gig.actions.cancel')}
          </Button>
        </>
      ) : (
        <Button icon={Undo2} onClick={() => setDialog('uncancel')}>
          {t('gig.actions.uncancel')}
        </Button>
      )}
      <Button variant="danger" icon={Trash2} onClick={() => setDialog('delete')}>
        {t('gig.actions.delete')}
      </Button>

      {dialog === 'move' && (
        <MoveDialog
          gig={gig}
          onClose={close}
          onDone={(result) => {
            applyGig(result.gig, gig.id);
            close();
            onMoved(result.warnings);
          }}
        />
      )}
      {dialog === 'cancel' && (
        <ReasonDialog
          title={t('gig.cancelTitle')}
          intro={t('gig.cancelIntro')}
          confirmLabel={t('gig.confirmCancel')}
          mutationFn={(reason) => gigsApi.cancel(gig.id, { reason })}
          onClose={close}
          onDone={(updated) => {
            applyGig(updated ?? null, gig.id);
            close();
            onCancelled();
          }}
        />
      )}
      {dialog === 'uncancel' && (
        <ReasonDialog
          title={t('gig.uncancelTitle')}
          intro={t('gig.uncancelIntro')}
          confirmLabel={t('gig.confirmUncancel')}
          mutationFn={(reason) => gigsApi.uncancel(gig.id, { reason })}
          onClose={close}
          onDone={(updated) => {
            applyGig(updated ?? null, gig.id);
            close();
            onUncancelled();
          }}
        />
      )}
      {dialog === 'delete' && (
        <ReasonDialog
          title={t('gig.deleteTitle')}
          intro={t('gig.deleteIntro')}
          confirmLabel={t('gig.confirmDelete')}
          danger
          mutationFn={(reason) => gigsApi.delete(gig.id, { reason })}
          onClose={close}
          onDone={() => {
            applyGig(null, gig.id);
            void navigate('/gigs', { state: { notice: 'deleted' } });
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
        <p className="gig-dialog-intro">{intro}</p>
        <Field label={t('gig.reason')} error={fieldErrors.reason}>
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
  gig,
  onClose,
  onDone,
}: {
  gig: GigDetail;
  onClose: () => void;
  onDone: (result: GigWithWarnings) => void;
}) {
  const { t } = useTranslation();
  const [startDate, setStartDate] = useState(gig.startDate);
  const [endDate, setEndDate] = useState(gig.endDate ?? '');
  const [reason, setReason] = useState('');
  const [localErrors, setLocalErrors] = useState<Record<string, string>>({});
  const move = useMutation({
    mutationFn: () =>
      gigsApi.move(gig.id, {
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
    <Dialog title={t('gig.moveTitle')} onClose={onClose}>
      <form onSubmit={submit} noValidate>
        <div className="form-row">
          <Field label={t('gig.newStartDate')} error={errors.startDate}>
            {(p) => (
              <input {...p} type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            )}
          </Field>
          <Field label={t('gig.newEndDate')} error={errors.endDate}>
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
        <Field label={t('gig.reasonOptional')} error={errors.reason}>
          {(p) => <textarea {...p} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />}
        </Field>
        {move.isError && Object.keys(apiFieldErrors(t, move.error)).length === 0 && (
          <Notice tone="danger" role="alert">
            <p>{apiErrorMessage(t, move.error)}</p>
          </Notice>
        )}
        <div className="form-actions">
          <Button type="submit" variant="primary" disabled={move.isPending}>
            {t('gig.confirmMove')}
          </Button>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
        </div>
      </form>
    </Dialog>
  );
}
