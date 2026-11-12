import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, ImagePlus, Trash2, X } from 'lucide-react';
import { useState, type ChangeEvent, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiError } from '../../api/client';
import { referencesApi } from '../../api/endpoints';
import type { Id, Reference } from '../../api/types';
import { Button, IconButton } from '../../components/Button';
import { buttonClass } from '../../components/buttonClass';
import { Dialog } from '../../components/Dialog';
import { FieldList } from '../../components/FieldList';
import { Field } from '../../components/fields';
import { InlineSwitch, InlineText, InlineTextarea } from '../../components/inline';
import { Notice } from '../../components/Notice';
import { StatusTag } from '../../components/StatusTag';
import { apiErrorMessage, apiFieldErrors } from '../../i18n/labels';
import { REFERENCE_IMAGE_ACCEPT, referenceImageProblem } from './referenceImageRules';
import { ReferencePhoto } from './ReferencePhoto';
import { referenceKeys, useApplyReferences, useReferences } from './referenceQueries';
import './references.css';

const QUOTE_MAX = 5000;
const AUTHOR_MAX = 200;

type PageNotice = { tone: 'ok' | 'danger'; text: string } | null;
type ItemDialog = { kind: 'delete' | 'removePhoto'; reference: Reference } | null;
type MoveDir = 'up' | 'down';

const moveButtonId = (id: Id, dir: MoveDir) => `reference-${id}-${dir}`;

/** Translated upload error: photo-specific texts for 413 / 415 (10 MB, PNG/JPG/WebP). */
function photoErrorMessage(t: ReturnType<typeof useTranslation>['t'], error: unknown): string {
  const code = error instanceof ApiError ? error.code : null;
  if (code === 'FILE_TOO_LARGE' || code === 'UNSUPPORTED_FILE_TYPE') return t(`references.errors.${code}`);
  return apiErrorMessage(t, error);
}

/**
 * Reference register (UC-029 "References", BR-108) at /settings/references (settings tab): every field inline,
 * photo upload / replace / remove, reorder with up / down, delete with confirmation, add form.
 */
export function ReferencesPage() {
  const { t } = useTranslation();
  const query = useReferences();
  const apply = useApplyReferences();
  const queryClient = useQueryClient();
  const [notice, setNotice] = useState<PageNotice>(null);
  const [dialog, setDialog] = useState<ItemDialog>(null);

  const reorder = useMutation({
    mutationFn: (ids: Id[]) => referencesApi.reorder(ids),
    onSuccess: (list) => apply(list),
    onError: (error) => {
      apply(null);
      setNotice({ tone: 'danger', text: apiErrorMessage(t, error) });
    },
  });

  const remove = useMutation({
    mutationFn: (reference: Reference) => referencesApi.remove(reference.id).then(() => reference),
    onSuccess: (reference) => {
      apply({ removed: reference.id });
      setDialog(null);
      setNotice({ tone: 'ok', text: t('references.deleted', { author: reference.author }) });
    },
  });

  const removePhoto = useMutation({
    mutationFn: (reference: Reference) => referencesApi.removeImage(reference.id),
    onSuccess: (reference) => {
      apply(reference);
      setDialog(null);
      setNotice({ tone: 'ok', text: t('references.photoRemoved') });
    },
  });

  const list = query.data ?? [];

  const move = (reference: Reference, dir: MoveDir) => {
    const from = list.findIndex((r) => r.id === reference.id);
    const to = dir === 'up' ? from - 1 : from + 1;
    if (from < 0 || to < 0 || to >= list.length) return;
    const next = [...list];
    next.splice(to, 0, ...next.splice(from, 1));
    // Optimistic: the list moves at once; the response (or a refetch on error) settles it.
    queryClient.setQueryData<Reference[]>(referenceKeys.all, next);
    setNotice(null);
    reorder.mutate(next.map((r) => r.id));
    // Keep the keyboard on the moved item: the same button, or the other one at either end.
    requestAnimationFrame(() => {
      const same = document.getElementById(moveButtonId(reference.id, dir)) as HTMLButtonElement | null;
      const other = document.getElementById(moveButtonId(reference.id, dir === 'up' ? 'down' : 'up'));
      (same && !same.disabled ? same : other)?.focus();
    });
  };

  const openDialog = (kind: 'delete' | 'removePhoto', reference: Reference) => {
    remove.reset();
    removePhoto.reset();
    setDialog({ kind, reference });
  };

  return (
    // Settings page tab "References" (/settings/references): the settings layout has the page head.
    <div className="references-page">
      <h2 className="visually-hidden">{t('references.title')}</h2>
      <p className="settings-intro">{t('references.intro')}</p>

      {notice && (
        <Notice tone={notice.tone} role={notice.tone === 'danger' ? 'alert' : 'status'} className="references-notice">
          <p>{notice.text}</p>
        </Notice>
      )}

      {query.isPending ? (
        <p className="muted">{t('app.loading')}</p>
      ) : query.isError ? (
        <Notice tone="danger" role="alert">
          <p>{t('references.loadFailed')}</p>
        </Notice>
      ) : list.length === 0 ? (
        <p className="muted references-empty">{t('references.empty')}</p>
      ) : (
        <ol className="reference-list" aria-label={t('references.listLabel')}>
          {list.map((reference, index) => (
            <ReferenceItem
              key={reference.id}
              reference={reference}
              index={index}
              count={list.length}
              onMove={(dir) => move(reference, dir)}
              onDelete={() => openDialog('delete', reference)}
              onRemovePhoto={() => openDialog('removePhoto', reference)}
              onUploaded={apply}
            />
          ))}
        </ol>
      )}

      <section className="card reference-add" aria-labelledby="reference-add-title">
        <div className="card-head">
          <h2 id="reference-add-title" className="card-title">
            {t('references.addTitle')}
          </h2>
        </div>
        <ReferenceForm
          onCreated={(reference) => {
            apply(reference);
            setNotice({ tone: 'ok', text: t('references.added', { author: reference.author }) });
          }}
        />
      </section>

      {dialog?.kind === 'delete' && (
        <Dialog title={t('references.deleteTitle')} onClose={() => setDialog(null)}>
          <p>{t('references.deleteConfirm', { author: dialog.reference.author })}</p>
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
              onClick={() => remove.mutate(dialog.reference)}
            >
              {t('references.delete')}
            </Button>
            <Button onClick={() => setDialog(null)}>{t('common.cancel')}</Button>
          </div>
        </Dialog>
      )}
      {dialog?.kind === 'removePhoto' && (
        <Dialog title={t('references.removePhotoTitle')} onClose={() => setDialog(null)}>
          <p>{t('references.removePhotoConfirm', { author: dialog.reference.author })}</p>
          {removePhoto.isError && (
            <Notice tone="danger" role="alert">
              <p>{apiErrorMessage(t, removePhoto.error)}</p>
            </Notice>
          )}
          <div className="form-actions">
            <Button
              variant="danger"
              icon={Trash2}
              disabled={removePhoto.isPending}
              onClick={() => removePhoto.mutate(dialog.reference)}
            >
              {t('references.removePhoto')}
            </Button>
            <Button onClick={() => setDialog(null)}>{t('common.cancel')}</Button>
          </div>
        </Dialog>
      )}
    </div>
  );
}

interface ItemProps {
  reference: Reference;
  index: number;
  count: number;
  onMove: (dir: MoveDir) => void;
  onDelete: () => void;
  onRemovePhoto: () => void;
  onUploaded: (reference: Reference) => void;
}

function ReferenceItem({ reference, index, count, onMove, onDelete, onRemovePhoto, onUploaded }: ItemProps) {
  const { t } = useTranslation();
  const apply = useApplyReferences();
  const [problem, setProblem] = useState<string | null>(null);
  const headingId = `reference-${reference.id}-title`;
  const title = t('references.item', { n: index + 1 });

  const upload = useMutation({
    mutationFn: (file: File) => referencesApi.uploadImage(reference.id, file),
    onSuccess: onUploaded,
  });

  const save = (body: Parameters<typeof referencesApi.update>[1]) =>
    referencesApi.update(reference.id, body).then((updated) => apply(updated));

  const onFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    upload.reset();
    const issue = referenceImageProblem(file);
    if (issue) {
      setProblem(t(`references.errors.${issue}`));
      return;
    }
    setProblem(null);
    upload.mutate(file);
  };

  const photoError = problem ?? (upload.isError ? photoErrorMessage(t, upload.error) : null);

  return (
    <li className="reference-item">
      <section className="card reference-card" aria-labelledby={headingId}>
        <div className="reference-card-head">
          <h2 id={headingId} className="reference-card-title">
            {title}
          </h2>
          {!reference.active && <StatusTag tone="muted">{t('references.inactive')}</StatusTag>}
          <div className="reference-card-actions" role="group" aria-label={`${t('references.actionsLabel')}: ${title}`}>
            <IconButton
              id={moveButtonId(reference.id, 'up')}
              icon={ArrowUp}
              variant="ghost"
              label={t('references.moveUp')}
              disabled={index === 0}
              onClick={() => onMove('up')}
            />
            <IconButton
              id={moveButtonId(reference.id, 'down')}
              icon={ArrowDown}
              variant="ghost"
              label={t('references.moveDown')}
              disabled={index === count - 1}
              onClick={() => onMove('down')}
            />
            <IconButton icon={Trash2} variant="ghost" label={t('references.delete')} onClick={onDelete} />
          </div>
        </div>

        <div className="reference-card-body">
          <div className="reference-card-photo">
            <ReferencePhoto
              src={reference.hasImage ? referencesApi.imageUrl(reference.id, reference.imageVersion) : null}
              author={reference.author}
              className="reference-thumb"
            />
            <div className="reference-photo-actions">
              <label
                className={buttonClass({ size: 'sm', className: 'reference-upload' })}
                aria-disabled={upload.isPending || undefined}
              >
                <ImagePlus className="btn-icon" />
                <span>
                  {upload.isPending
                    ? t('references.uploading')
                    : reference.hasImage
                      ? t('references.replacePhoto')
                      : t('references.addPhoto')}
                </span>
                <input
                  type="file"
                  accept={REFERENCE_IMAGE_ACCEPT}
                  className="visually-hidden"
                  disabled={upload.isPending}
                  onChange={onFile}
                />
              </label>
              {reference.hasImage && (
                <Button size="sm" icon={X} onClick={onRemovePhoto}>
                  {t('references.removePhoto')}
                </Button>
              )}
            </div>
            <p className="meta reference-photo-allowed">{t('references.allowed')}</p>
            {photoError && (
              <Notice tone="danger" role="alert">
                <p>{photoError}</p>
              </Notice>
            )}
            {upload.isSuccess && !photoError && (
              <p className="visually-hidden" role="status">
                {t('references.photoSaved')}
              </p>
            )}
          </div>

          <FieldList className="reference-fields">
            <InlineTextarea
              label={t('references.quoteFi')}
              required
              rows={3}
              maxLength={QUOTE_MAX}
              value={reference.quoteFi}
              field="quoteFi"
              onSave={(quoteFi) => save({ quoteFi })}
            />
            <InlineTextarea
              label={t('references.quoteEn')}
              rows={3}
              maxLength={QUOTE_MAX}
              hint={t('references.quoteEnHint')}
              value={reference.quoteEn}
              field="quoteEn"
              onSave={(quoteEn) => save({ quoteEn })}
            />
            <InlineText
              label={t('references.author')}
              required
              maxLength={AUTHOR_MAX}
              value={reference.author}
              field="author"
              onSave={(author) => save({ author })}
            />
            <InlineSwitch
              label={t('references.active')}
              value={reference.active}
              field="active"
              onSave={(active) => save({ active })}
            />
          </FieldList>
        </div>
      </section>
    </li>
  );
}

/** Add a reference: FI quote and author required, EN quote optional. Active by default. */
function ReferenceForm({ onCreated }: { onCreated: (reference: Reference) => void }) {
  const { t } = useTranslation();
  const [quoteFi, setQuoteFi] = useState('');
  const [quoteEn, setQuoteEn] = useState('');
  const [author, setAuthor] = useState('');
  const [localErrors, setLocalErrors] = useState<Record<string, string>>({});
  const create = useMutation({ mutationFn: referencesApi.create });

  const serverFields = create.isError ? apiFieldErrors(t, create.error) : {};
  const errors = { ...serverFields, ...localErrors };
  const formError =
    create.isError && Object.keys(serverFields).length === 0 ? apiErrorMessage(t, create.error) : null;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (create.isPending) return;
    const missing: Record<string, string> = {};
    if (!quoteFi.trim()) missing.quoteFi = t('fields.REQUIRED');
    if (!author.trim()) missing.author = t('fields.REQUIRED');
    setLocalErrors(missing);
    if (Object.keys(missing).length > 0) return;
    create.mutate(
      { quoteFi: quoteFi.trim(), quoteEn: quoteEn.trim() || null, author: author.trim(), active: true },
      {
        onSuccess: (reference) => {
          setQuoteFi('');
          setQuoteEn('');
          setAuthor('');
          create.reset();
          onCreated(reference);
        },
      },
    );
  };

  return (
    <form className="reference-form" onSubmit={submit} noValidate>
      <Field label={t('references.quoteFi')} error={errors.quoteFi}>
        {(props) => (
          <textarea
            {...props}
            rows={3}
            maxLength={QUOTE_MAX}
            value={quoteFi}
            onChange={(e) => {
              setQuoteFi(e.target.value);
              setLocalErrors(({ quoteFi: _, ...rest }) => rest);
            }}
          />
        )}
      </Field>
      <Field label={t('references.quoteEn')} hint={t('references.quoteEnHint')} error={errors.quoteEn}>
        {(props) => (
          <textarea {...props} rows={3} maxLength={QUOTE_MAX} value={quoteEn} onChange={(e) => setQuoteEn(e.target.value)} />
        )}
      </Field>
      <Field label={t('references.author')} error={errors.author}>
        {(props) => (
          <input
            {...props}
            type="text"
            autoComplete="off"
            maxLength={AUTHOR_MAX}
            value={author}
            onChange={(e) => {
              setAuthor(e.target.value);
              setLocalErrors(({ author: _, ...rest }) => rest);
            }}
          />
        )}
      </Field>
      {formError && (
        <p className="field-error" role="alert">
          {formError}
        </p>
      )}
      <div className="form-actions">
        <Button type="submit" variant="primary" disabled={create.isPending}>
          {create.isPending ? t('common.saving') : t('references.add')}
        </Button>
      </div>
    </form>
  );
}
