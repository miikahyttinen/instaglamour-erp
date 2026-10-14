import { useId, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { isApiError } from '../../api/client';
import type { FieldCode } from '../../api/enums';
import type { Person } from '../../api/types';
import { useSignedInPartner } from '../../auth/SignedInContext';
import { Button } from '../../components/Button';
import { Dialog } from '../../components/Dialog';
import { Field } from '../../components/fields';
import { InlineText } from '../../components/inline';
import { Notice as NoticeMessage } from '../../components/Notice';
import { StatusTag } from '../../components/StatusTag';
import { allowedEmailDomain } from '../../config';
import { apiErrorMessage } from '../../i18n/labels';
import type { Notice } from './Notices';
import { checkPartnerEmail, EMAIL_MAX, isPartner } from './partnerRules';
import { useRemovePartner, useSetPartner } from './queries';

/** "Osakas" tag for the people list and the person page header. */
export function PartnerTag() {
  const { t } = useTranslation();
  return <StatusTag tone="info">{t('people.partner.tag')}</StatusTag>;
}

/** Email-specific texts for REQUIRED / INVALID_VALUE / DUPLICATE (others: the generic text). */
function emailMessages(t: TFunction, domain: string | null): Partial<Record<FieldCode, string>> {
  return {
    REQUIRED: t('people.partner.emailErrors.REQUIRED'),
    INVALID_VALUE: domain
      ? t('people.partner.emailErrors.INVALID_VALUE', { domain })
      : t('people.partner.emailErrors.INVALID_VALUE_GENERIC'),
    DUPLICATE: t('people.partner.emailErrors.DUPLICATE'),
  };
}

function emailHint(t: TFunction, domain: string | null): string {
  return domain ? t('people.partner.emailHint', { domain }) : t('people.partner.emailHintGeneric');
}

interface Props {
  person: Person;
  onNotice: (notice: Notice) => void;
}

/**
 * Partner status on the person page (UC-032): "Osakas" switch; on → email form (dialog), off →
 * confirmation ("sign-in stops immediately"). An active partner's email is edited in place. The
 * signed-in partner's own switch is disabled (BR-112). Render inside a `FieldList`.
 */
export function PartnerStatus({ person, onNotice }: Props) {
  const { t } = useTranslation();
  const me = useSignedInPartner();
  const isMe = me.personId === person.id;
  const active = isPartner(person);
  const domain = allowedEmailDomain();
  const setPartner = useSetPartner(isMe);
  const [dialog, setDialog] = useState<'grant' | 'remove' | null>(null);
  const hintId = useId();

  const hint = active && isMe ? t('people.partner.selfNote') : active ? null : t('people.partner.offHint');

  return (
    <>
      <div className={`inline-field inline-check partner-switch${isMe && active ? ' is-disabled' : ''}`}>
        <div className="inline-control">
          <label className="switch inline-switch">
            <input
              type="checkbox"
              role="switch"
              checked={active}
              disabled={isMe && active}
              aria-describedby={hint ? hintId : undefined}
              // Nothing changes here: on opens the email form, off the confirmation.
              onChange={() => setDialog(active ? 'remove' : 'grant')}
            />
            <span>{t('people.partner.label')}</span>
          </label>
        </div>
        {hint && (
          <p id={hintId} className="muted small field-hint">
            {hint}
          </p>
        )}
      </div>

      {active && person.partner && (
        <InlineText
          label={t('people.partner.email')}
          type="email"
          required
          maxLength={EMAIL_MAX}
          field="email"
          hint={emailHint(t, domain)}
          value={person.partner.email}
          validate={(email) => checkPartnerEmail(email, domain)}
          fieldMessages={emailMessages(t, domain)}
          onSave={(email) => setPartner.mutateAsync({ id: person.id, email })}
        />
      )}

      {dialog === 'grant' && (
        <GrantDialog
          person={person}
          isMe={isMe}
          onClose={() => setDialog(null)}
          onDone={(name) => {
            setDialog(null);
            onNotice({ text: t('people.partner.granted', { name }), warnings: [] });
          }}
        />
      )}
      {dialog === 'remove' && (
        <RemoveDialog
          person={person}
          onClose={() => setDialog(null)}
          onDone={(name) => {
            setDialog(null);
            onNotice({ text: t('people.partner.removed', { name }), warnings: [] });
          }}
        />
      )}
    </>
  );
}

interface DialogProps {
  person: Person;
  onClose: () => void;
  onDone: (name: string) => void;
}

/** Switch on: asks for the Google email, then PUT /api/people/{id}/partner. */
function GrantDialog({ person, isMe, onClose, onDone }: DialogProps & { isMe: boolean }) {
  const { t } = useTranslation();
  const domain = allowedEmailDomain();
  const save = useSetPartner(isMe);
  // A removed partner keeps its email: offer it again.
  const [email, setEmail] = useState(person.partner?.email ?? '');
  const [clientError, setClientError] = useState<FieldCode | null>(null);

  const messages = emailMessages(t, domain);
  const serverCode = isApiError(save.error) ? save.error.fields.email : undefined;
  const code = clientError ?? serverCode ?? null;
  const fieldError = code ? (messages[code] ?? t(`fields.${code}`)) : undefined;
  const otherError = save.error && !serverCode && !clientError ? apiErrorMessage(t, save.error) : null;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const value = email.trim();
    const invalid = checkPartnerEmail(value, domain);
    setClientError(invalid);
    if (invalid) return;
    save.mutate({ id: person.id, email: value }, { onSuccess: (p) => onDone(p.name) });
  };

  return (
    <Dialog title={t('people.partner.grantTitle', { name: person.name })} onClose={onClose}>
      <form className="form partner-dialog" onSubmit={submit} noValidate>
        <p className="muted">{t('people.partner.offHint')}</p>
        <Field label={t('people.partner.email')} hint={emailHint(t, domain)} error={fieldError}>
          {(p) => (
            <input
              {...p}
              type="email"
              autoComplete="off"
              maxLength={EMAIL_MAX}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          )}
        </Field>
        {otherError && (
          <NoticeMessage tone="danger" role="alert">
            {otherError}
          </NoticeMessage>
        )}
        <div className="form-actions">
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button type="submit" variant="primary" disabled={save.isPending}>
            {save.isPending ? t('common.saving') : t('people.partner.grant')}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

/** Switch off: confirmation, then DELETE /api/people/{id}/partner (409 messages shown here). */
function RemoveDialog({ person, onClose, onDone }: DialogProps) {
  const { t } = useTranslation();
  const remove = useRemovePartner();
  return (
    <Dialog title={t('people.partner.removeTitle', { name: person.name })} onClose={onClose}>
      <div className="partner-dialog">
        <NoticeMessage tone="warn">
          <p>
            <strong>{t('people.partner.removeWarning')}</strong>
          </p>
        </NoticeMessage>
        <p className="muted">{t('people.partner.removeDetail')}</p>
        {remove.error && (
          <NoticeMessage tone="danger" role="alert">
            {apiErrorMessage(t, remove.error)}
          </NoticeMessage>
        )}
        <div className="form-actions">
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button
            variant="danger"
            disabled={remove.isPending}
            onClick={() => remove.mutate(person.id, { onSuccess: (p) => onDone(p.name) })}
          >
            {t('people.partner.remove')}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
