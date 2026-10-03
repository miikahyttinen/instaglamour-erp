import { useMutation } from '@tanstack/react-query';
import { useRef, useState, type ChangeEvent, type MouseEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { attachmentsApi } from '../api/endpoints';
import type { Attachment, GigDetail } from '../api/types';
import { Dialog } from '../components/Dialog';
import { mocksEnabled } from '../config';
import { apiErrorMessage } from '../i18n/labels';
import { useLang } from '../i18n/useLang';
import { formatDateTime } from '../lib/format';
import { usePartner } from '../reference/useReference';
import { ATTACHMENT_ACCEPT, attachmentProblem } from './attachmentRules';
import { useApplyGig } from './queries';

function formatSize(bytes: number, lang: 'fi' | 'en'): string {
  const locale = lang === 'fi' ? 'fi-FI' : 'en-GB';
  if (bytes < 1024 * 1024) {
    return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(Math.max(1, bytes / 1024))} kB`;
  }
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(bytes / 1024 / 1024)} MB`;
}

/**
 * With mocks on, the download is answered by the in-page mock, which can't serve a plain
 * navigation. Fetch it and open a blob URL instead.
 */
async function openViaFetch(url: string): Promise<void> {
  const response = await fetch(url, { credentials: 'same-origin' });
  const blob = await response.blob();
  window.open(URL.createObjectURL(blob), '_blank', 'noopener');
}

interface Props {
  gig: GigDetail;
  readOnly: boolean;
}

/** Upload (files or phone camera), open/download and remove attachments (UC-008). */
export function Attachments({ gig, readOnly }: Props) {
  const { t } = useTranslation();
  const applyGig = useApplyGig();
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [removing, setRemoving] = useState<Attachment | null>(null);

  const refresh = () => applyGig(null, gig.id);
  const upload = useMutation({
    mutationFn: (file: File) => attachmentsApi.upload(gig.id, file),
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: (id: string) => attachmentsApi.remove(id),
    onSuccess: () => {
      setRemoving(null);
      refresh();
    },
  });

  const onFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const issue = attachmentProblem(file);
    upload.reset();
    if (issue) {
      setProblem(t(`errors.${issue}`));
      return;
    }
    setProblem(null);
    upload.mutate(file);
  };

  return (
    <div className="attachments">
      {gig.attachments.length === 0 ? (
        <p className="muted">{t('attachments.empty')}</p>
      ) : (
        <ul className="attachment-list" aria-label={t('gig.sections.attachments')}>
          {gig.attachments.map((a) => (
            <AttachmentRow
              key={a.id}
              attachment={a}
              readOnly={readOnly}
              onRemove={() => {
                remove.reset();
                setRemoving(a);
              }}
            />
          ))}
        </ul>
      )}

      {!readOnly && (
        <div className="upload">
          <input
            ref={fileRef}
            id={`upload-${gig.id}`}
            type="file"
            accept={ATTACHMENT_ACCEPT}
            className="visually-hidden"
            onChange={onFile}
            aria-label={t('attachments.upload')}
          />
          <input
            ref={cameraRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="visually-hidden"
            onChange={onFile}
            aria-label={t('attachments.takePhoto')}
            tabIndex={-1}
          />
          <div className="inline-actions">
            <button
              type="button"
              className="btn"
              disabled={upload.isPending}
              onClick={() => fileRef.current?.click()}
            >
              {upload.isPending ? t('attachments.uploading') : t('attachments.upload')}
            </button>
            <button
              type="button"
              className="btn camera-btn"
              disabled={upload.isPending}
              onClick={() => cameraRef.current?.click()}
            >
              {t('attachments.takePhoto')}
            </button>
          </div>
          <p className="muted small">{t('attachments.allowed')}</p>
          {(problem || upload.isError) && (
            <p className="notice notice-error" role="alert">
              {problem ?? apiErrorMessage(t, upload.error)}
            </p>
          )}
          {upload.isSuccess && (
            <p className="notice" role="status">
              {t('attachments.uploaded', { filename: upload.data.filename })}
            </p>
          )}
        </div>
      )}

      {removing && (
        <Dialog title={t('attachments.removeTitle')} onClose={() => setRemoving(null)}>
          <p>{t('attachments.removeConfirm', { filename: removing.filename })}</p>
          {remove.isError && (
            <p className="notice notice-error" role="alert">
              {apiErrorMessage(t, remove.error)}
            </p>
          )}
          <div className="form-actions">
            <button
              type="button"
              className="btn btn-danger-solid"
              disabled={remove.isPending}
              onClick={() => remove.mutate(removing.id)}
            >
              {t('common.remove')}
            </button>
            <button type="button" className="btn" onClick={() => setRemoving(null)}>
              {t('common.cancel')}
            </button>
          </div>
        </Dialog>
      )}
    </div>
  );
}

function AttachmentRow({
  attachment,
  readOnly,
  onRemove,
}: {
  attachment: Attachment;
  readOnly: boolean;
  onRemove: () => void;
}) {
  const { t } = useTranslation();
  const lang = useLang();
  const uploader = usePartner(attachment.uploadedBy);
  const url = attachmentsApi.downloadUrl(attachment.id);
  const onOpen = (e: MouseEvent<HTMLAnchorElement>) => {
    if (!mocksEnabled()) return;
    e.preventDefault();
    void openViaFetch(url);
  };
  return (
    <li className="attachment">
      <a href={url} target="_blank" rel="noopener noreferrer" onClick={onOpen} className="attachment-name">
        {attachment.filename}
      </a>
      <span className="muted small">
        {formatSize(attachment.sizeBytes, lang)} ·{' '}
        {t('attachments.uploadedBy', {
          name: uploader?.name ?? '–',
          date: formatDateTime(attachment.uploadedAt, lang),
        })}
      </span>
      {!readOnly && (
        <button
          type="button"
          className="btn btn-small btn-danger"
          onClick={onRemove}
          aria-label={`${t('common.remove')}: ${attachment.filename}`}
        >
          {t('common.remove')}
        </button>
      )}
    </li>
  );
}
