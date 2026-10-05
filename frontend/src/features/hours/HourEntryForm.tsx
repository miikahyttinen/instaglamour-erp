import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { HourEntry } from '../../api/types';
import { Button } from '../../components/Button';
import { Dialog } from '../../components/Dialog';
import { Field } from '../../components/fields';
import { apiErrorMessage, apiFieldErrors } from '../../i18n/labels';
import { todayIso } from '../../lib/format';
import { validateHourForm, type HourFormValues } from './hoursLogic';
import { useCreateHourEntry } from './queries';

interface Props {
  onClose: () => void;
  onSaved: (entry: HourEntry) => void;
}

/**
 * Add an own hour entry (UC-018). Date defaults to today. Existing entries are edited inline in
 * `HourEntryList` (NFR-8), not here.
 */
export function HourEntryForm({ onClose, onSaved }: Props) {
  const { t } = useTranslation();
  const mutation = useCreateHourEntry();
  const [values, setValues] = useState<HourFormValues>(() => ({
    date: todayIso(),
    comment: '',
    hours: '',
  }));
  const [clientErrors, setClientErrors] = useState<Record<string, string>>({});

  const serverErrors = mutation.isError ? apiFieldErrors(t, mutation.error) : {};
  const errors = { ...serverErrors, ...clientErrors };
  const generalError =
    mutation.isError && Object.keys(serverErrors).length === 0
      ? apiErrorMessage(t, mutation.error)
      : null;

  const set = (key: keyof HourFormValues) => (value: string) => {
    setValues((v) => ({ ...v, [key]: value }));
    if (mutation.isError) mutation.reset();
    setClientErrors((e) => {
      const next = { ...e };
      delete next[key];
      return next;
    });
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const { fields, body } = validateHourForm(values);
    const translated: Record<string, string> = {};
    for (const [key, code] of Object.entries(fields)) translated[key] = t(`fields.${code}`);
    setClientErrors(translated);
    if (!body) return;
    mutation.reset();
    mutation.mutate(body, { onSuccess: onSaved });
  };

  return (
    <Dialog title={t('hours.addTitle')} onClose={onClose}>
      <form className="form" onSubmit={submit} noValidate>
        <Field label={t('hours.date')} error={errors.date}>
          {(props) => (
            <input
              type="date"
              value={values.date}
              onChange={(e) => set('date')(e.target.value)}
              required
              {...props}
            />
          )}
        </Field>
        <Field label={t('hours.comment')} error={errors.comment}>
          {(props) => (
            <input
              type="text"
              value={values.comment}
              maxLength={500}
              onChange={(e) => set('comment')(e.target.value)}
              required
              {...props}
            />
          )}
        </Field>
        <Field label={t('hours.hours')} error={errors.hours} hint={t('hours.hoursHint')}>
          {(props) => (
            <input
              type="text"
              inputMode="decimal"
              autoComplete="off"
              className="hours-input"
              value={values.hours}
              onChange={(e) => set('hours')(e.target.value)}
              required
              {...props}
            />
          )}
        </Field>
        {generalError && (
          <p className="notice notice-error" role="alert">
            {generalError}
          </p>
        )}
        <div className="form-actions">
          <Button type="submit" variant="primary" disabled={mutation.isPending}>
            {mutation.isPending ? t('common.saving') : t('common.save')}
          </Button>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
        </div>
      </form>
    </Dialog>
  );
}
