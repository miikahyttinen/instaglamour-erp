import { useQueryClient } from '@tanstack/react-query';
import { Link2, RefreshCw } from 'lucide-react';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { peopleApi } from '../../api/endpoints';
import type { Id } from '../../api/types';
import { Button } from '../../components/Button';
import { Notice } from '../../components/Notice';
import { SectionLabel } from '../../components/SectionLabel';
import { isApiError } from '../../api/client';
import { apiErrorMessage } from '../../i18n/labels';
import { ConfirmDialog } from '../offers/offerParts';
import { copyToClipboard } from '../offers/offerOptions';
import { freelancerKeys, freelancerUrl, useFreelancerLink } from './queries';
import './freelancerLink.css';

/** BR-113: 409 when the person is an active partner (the page normally hides the section). */
const isPersonIsPartner = (error: unknown) => isApiError(error) && error.code === 'PERSON_IS_PARTNER';

type LinkNotice = { kind: 'copied' } | { kind: 'copyFailed' } | { kind: 'regenerated' };

/**
 * "Freelancer-linkki" on the person page (UC-034 A4, BR-113): the full public link, copy, and
 * regenerate (confirm: the old link stops working at once).
 */
export function FreelancerLinkSection({ personId, active }: { personId: Id; active: boolean }) {
  const { t } = useTranslation();
  const ids = useId();
  const queryClient = useQueryClient();
  const query = useFreelancerLink(personId);
  const [notice, setNotice] = useState<LinkNotice | null>(null);
  const [confirming, setConfirming] = useState(false);
  const url = query.data ? freelancerUrl(query.data.sharePath) : '';

  return (
    <section className="freelancer-link" aria-labelledby={`${ids}-title`}>
      <SectionLabel id={`${ids}-title`}>{t('freelancerLink.title')}</SectionLabel>
      <p className="muted small freelancer-link-hint">{t('freelancerLink.hint')}</p>
      {!active && <p className="small">{t('freelancerLink.inactive')}</p>}
      {query.isPending && <p className="muted">{t('app.loading')}</p>}
      {query.isError && isPersonIsPartner(query.error) && (
        <p className="muted small">{t('errors.PERSON_IS_PARTNER')}</p>
      )}
      {query.isError && !isPersonIsPartner(query.error) && (
        <Notice tone="danger" role="alert">
          <p>{apiErrorMessage(t, query.error)}</p>
          <Button size="sm" onClick={() => void query.refetch()}>
            {t('app.retry')}
          </Button>
        </Notice>
      )}
      {query.data && (
        <div className="freelancer-link-row">
          <input
            type="text"
            readOnly
            className="freelancer-link-url mono"
            aria-label={t('freelancerLink.field')}
            value={url}
            onFocus={(e) => e.currentTarget.select()}
          />
          <div className="freelancer-link-actions">
            <Button
              icon={Link2}
              onClick={() =>
                void copyToClipboard(url).then((result) =>
                  setNotice({ kind: result.kind === 'copied' ? 'copied' : 'copyFailed' }),
                )
              }
            >
              {t('freelancerLink.copy')}
            </Button>
            <Button icon={RefreshCw} onClick={() => setConfirming(true)}>
              {t('freelancerLink.regenerate')}
            </Button>
          </div>
        </div>
      )}
      {notice && (
        <Notice tone={notice.kind === 'copyFailed' ? 'warn' : 'ok'} role="status">
          <p>{t(`freelancerLink.${notice.kind}`)}</p>
        </Notice>
      )}
      {confirming && (
        <ConfirmDialog
          title={t('freelancerLink.regenerate')}
          confirmLabel={t('freelancerLink.regenerate')}
          mutationFn={() => peopleApi.regenerateFreelancerLink(personId)}
          onClose={() => setConfirming(false)}
          onDone={(link) => {
            queryClient.setQueryData(freelancerKeys.link(personId), link);
            setConfirming(false);
            setNotice({ kind: 'regenerated' });
          }}
        >
          <p>{t('freelancerLink.regenerateText')}</p>
        </ConfirmDialog>
      )}
    </section>
  );
}
