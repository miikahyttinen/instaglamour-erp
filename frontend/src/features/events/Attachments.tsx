import { useMutation } from '@tanstack/react-query';
import { Camera, FileText, Trash2, Upload } from 'lucide-react';
import { useRef, useState, type ChangeEvent, type MouseEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { attachmentsApi } from '../../api/endpoints';
import type { Attachment, EventDetail } from '../../api/types';
import { Button, IconButton } from '../../components/Button';
import { Dialog } from '../../components/Dialog';
import { Notice } from '../../components/Notice';
import { mocksEnabled } from '../../config';
import { apiErrorMessage } from '../../i18n/labels';
import { useLang } from '../../i18n/useLang';
import { formatDateTime } from '../../lib/format';
import { usePartner } from '../../reference/useReference';
import { ATTACHMENT_ACCEPT, attachmentProblem } from './attachmentRules';
import { useApplyEvent } from './queries';

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
  event: EventDetail;
  readOnly: boolean;
}

/** Upload (files or phone camera), open/download and remove attachments (UC-008). */
export function Attachments({ event, readOnly }: Props) {
  const { t } = useTranslation();
  const applyEvent = useApplyEvent();
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [removing, setRemoving] = useState<Attachment | null>(null);

  const refresh = () => applyEvent(null, event.id);
  const upload = useMutation({
    mutationFn: (file: File) => attachmentsApi.upload(event.id, file),
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
      {event.attachments.length === 0 ? (
        <p className="muted">{t('attachments.empty')}</p>
      ) : (
        <ul className="attachment-list" aria-label={t('event.sections.attachments')}>
          {event.attachments.map((a) => (
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
            id={`upload-${event.id}`}
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
          <div className="attachment-upload-actions">
            <Button icon={Upload} disabled={upload.isPending} onClick={() => fileRef.current?.click()}>
              {upload.isPending ? t('attachments.uploading') : t('attachments.upload')}
            </Button>
            <Button
              icon={Camera}
              className="camera-btn"
              disabled={upload.isPending}
              onClick={() => cameraRef.current?.click()}
            >
              {t('attachments.takePhoto')}
            </Button>
          </div>
          <p className="meta attachment-allowed">{t('attachments.allowed')}</p>
          {(problem || upload.isError) && (
            <Notice tone="danger" role="alert">
              <p>{problem ?? apiErrorMessage(t, upload.error)}</p>
            </Notice>
          )}
          {upload.isSuccess && (
            <Notice tone="ok" role="status">
              <p>{t('attachments.uploaded', { filename: upload.data.filename })}</p>
            </Notice>
          )}
        </div>
      )}

      {removing && (
        <Dialog title={t('attachments.removeTitle')} onClose={() => setRemoving(null)}>
          <p>{t('attachments.removeConfirm', { filename: removing.filename })}</p>
          {remove.isError && (
            <Notice tone="danger" role="alert">
              <p>{apiErrorMessage(t, remove.error)}</p>
            </Notice>
          )}
          <div className="form-actions">
            <Button
              variant="danger"
              icon={Trash2}
              disabled={remove.isPending}
              onClick={() => remove.mutate(removing.id)}
            >
              {t('common.remove')}
            </Button>
            <Button onClick={() => setRemoving(null)}>{t('common.cancel')}</Button>
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
      <FileText className="attachment-icon" />
      <div className="attachment-text">
        <a href={url} target="_blank" rel="noopener noreferrer" onClick={onOpen} className="attachment-name">
          {attachment.filename}
        </a>
        <span className="meta attachment-meta">
          {formatSize(attachment.sizeBytes, lang)} ·{' '}
          {t('attachments.uploadedBy', {
            name: uploader?.name ?? '–',
            date: formatDateTime(attachment.uploadedAt, lang),
          })}
        </span>
      </div>
      {!readOnly && (
        <IconButton
          variant="ghost"
          icon={Trash2}
          className="attachment-remove"
          onClick={onRemove}
          label={`${t('common.remove')}: ${attachment.filename}`}
        />
      )}
    </li>
  );
}
