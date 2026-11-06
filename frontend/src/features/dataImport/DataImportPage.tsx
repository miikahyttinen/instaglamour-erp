import { CheckCircle2, FileJson, Upload } from 'lucide-react';
import { useId, useRef, useState, type DragEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { isApiError } from '../../api/client';
import { IMPORT_DATA_TYPES, type ImportDataType, type ImportRun, type ImportSummary } from '../../api/types';
import { Button } from '../../components/Button';
import { buttonClass } from '../../components/buttonClass';
import { DataTable, type DataTableColumn } from '../../components/DataTable';
import { Dialog } from '../../components/Dialog';
import { Notice } from '../../components/Notice';
import { SectionLabel } from '../../components/SectionLabel';
import { apiErrorMessage } from '../../i18n/labels';
import { useLang } from '../../i18n/useLang';
import { formatDateTime } from '../../lib/format';
import { useReference } from '../../reference/useReference';
import {
  formatFileSize,
  importErrors,
  readImportFile,
  summaryTotals,
  type ChosenFile,
  type FileProblem,
} from './importLogic';
import { useImportCheck, useImportRuns, useRunImport } from './queries';
import './dataImport.css';

/** Problem with the last action: a translated message, or the server's list of file errors. */
type Problem = { message: string } | { errors: string[] };

/**
 * Data import (UC-035): choose a seed-format JSON file → Check (dry run, counts per data type)
 * → Import (confirm) → result; the import history below. Import is enabled only after a
 * successful check of the file that is chosen now.
 */
export function DataImportPage() {
  const { t } = useTranslation();
  const lang = useLang();
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const nextKey = useRef(1);
  const [file, setFile] = useState<ChosenFile | null>(null);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [checked, setChecked] = useState<{ key: number; summary: ImportSummary } | null>(null);
  const [imported, setImported] = useState<ImportSummary | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [dragging, setDragging] = useState(false);
  const check = useImportCheck();
  const runImport = useRunImport();
  const busy = check.isPending || runImport.isPending;

  async function choose(chosen: File | undefined) {
    if (!chosen) return;
    const key = nextKey.current++;
    setChecked(null);
    setImported(null);
    setProblem(null);
    setFile(null);
    const result = await readImportFile(chosen, key);
    if (key !== nextKey.current - 1) return; // a newer file was chosen meanwhile
    if (result.ok) setFile(result.file);
    else setProblem({ message: t(`dataImport.${result.problem satisfies FileProblem}`) });
  }

  function failure(error: unknown): Problem {
    const errors = importErrors(error);
    if (errors) return { errors };
    if (isApiError(error) && error.code === 'FILE_TOO_LARGE') return { message: t('dataImport.serverTooLarge') };
    return { message: apiErrorMessage(t, error) };
  }

  function onCheck() {
    if (!file) return;
    setProblem(null);
    setImported(null);
    setChecked(null);
    check.mutate(
      { document: file.document, filename: file.name },
      {
        onSuccess: (data) => setChecked({ key: file.key, summary: data.summary }),
        onError: (error) => setProblem(failure(error)),
      },
    );
  }

  function onImport() {
    if (!file) return;
    setConfirming(false);
    setProblem(null);
    runImport.mutate(
      { document: file.document, filename: file.name },
      {
        onSuccess: (data) => {
          setChecked(null); // check again before importing again
          setImported(data.summary);
        },
        onError: (error) => setProblem(failure(error)),
      },
    );
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    if (busy) return;
    void choose(e.dataTransfer.files[0]);
  }

  const canImport = !!file && checked?.key === file.key && !busy;
  const totals = imported ? summaryTotals(imported) : null;

  return (
    // Settings page tab "Data import" (/settings/import): the settings layout has the page head.
    <div className="import-page">
      <h2 className="visually-hidden">{t('pages.dataImport')}</h2>
      <p className="settings-intro">{t('dataImport.intro')}</p>

      <section className="import-section" aria-labelledby="import-file-title">
        <SectionLabel id="import-file-title">{t('dataImport.fileTitle')}</SectionLabel>
        <div
          className={['import-drop', dragging && 'is-dragging'].filter(Boolean).join(' ')}
          data-testid="import-drop"
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
        >
          <input
            ref={inputRef}
            id={inputId}
            className="visually-hidden"
            type="file"
            accept=".json,application/json"
            disabled={busy}
            onChange={(e) => {
              void choose(e.target.files?.[0]);
              e.target.value = ''; // the same file can be chosen again
            }}
          />
          <label htmlFor={inputId} className={buttonClass({ className: "import-choose" })}>
            <Upload className="btn-icon" />
            {t('dataImport.chooseFile')}
          </label>
          <span className="meta">{t('dataImport.dropHint')}</span>
          <p className="import-file" aria-live="polite">
            {file ? (
              <>
                <FileJson aria-hidden="true" />
                {t('dataImport.fileInfo', { name: file.name, size: formatFileSize(file.size, lang) })}
              </>
            ) : (
              <span className="muted">{t('dataImport.noFile')}</span>
            )}
          </p>
        </div>

        <div className="form-actions import-actions">
          <Button onClick={onCheck} disabled={!file || busy}>
            {check.isPending ? t('dataImport.checking') : t('dataImport.check')}
          </Button>
          <Button variant="primary" icon={Upload} onClick={() => setConfirming(true)} disabled={!canImport}>
            {runImport.isPending ? t('dataImport.importing') : t('dataImport.import')}
          </Button>
        </div>
      </section>

      {problem && <ProblemNotice problem={problem} />}

      {checked && file && checked.key === file.key && (
        <section className="import-section" aria-labelledby="import-check-title">
          <SectionLabel id="import-check-title">{t('dataImport.checkTitle')}</SectionLabel>
          <Notice tone="info" role="status">
            <p>{t('dataImport.checkDone')}</p>
          </Notice>
          <SummaryTable summary={checked.summary} mode="check" caption={t('dataImport.checkCaption')} />
        </section>
      )}

      {imported && totals && (
        <section className="import-section" aria-labelledby="import-result-title">
          <SectionLabel id="import-result-title">{t('dataImport.resultTitle')}</SectionLabel>
          <Notice tone="ok" role="status">
            <p>
              <CheckCircle2 aria-hidden="true" className="import-ok-icon" />
              {t('dataImport.importDone', { ...totals })}
            </p>
          </Notice>
          <SummaryTable summary={imported} mode="result" caption={t('dataImport.resultCaption')} />
        </section>
      )}

      <ImportHistory />

      {confirming && file && (
        <Dialog title={t('dataImport.confirmTitle')} onClose={() => setConfirming(false)}>
          <div className="import-confirm">
            <p>{t('dataImport.confirmText')}</p>
            <p className="meta">{t('dataImport.confirmFile', { name: file.name })}</p>
            <div className="form-actions">
              <Button onClick={() => setConfirming(false)}>{t('common.cancel')}</Button>
              <Button variant="primary" icon={Upload} onClick={onImport}>
                {t('dataImport.import')}
              </Button>
            </div>
          </div>
        </Dialog>
      )}
    </div>
  );
}

function ProblemNotice({ problem }: { problem: Problem }) {
  const { t } = useTranslation();
  if ('message' in problem) {
    return (
      <Notice tone="danger" role="alert" className="import-problem">
        <p>{problem.message}</p>
      </Notice>
    );
  }
  return (
    <Notice tone="danger" role="alert" className="import-problem">
      <p>
        <strong>{t('dataImport.errorsTitle')}</strong> {t('dataImport.errorsCount', { count: problem.errors.length })}
      </p>
      <ul className="import-errors" aria-label={t('dataImport.errorsTitle')} tabIndex={0}>
        {problem.errors.map((error, i) => (
          <li key={i}>{error}</li>
        ))}
      </ul>
    </Notice>
  );
}

const PAST = { create: 'created', update: 'updated', skip: 'skipped' } as const;

interface SummaryRow {
  type: ImportDataType;
  created: number;
  updated: number;
  skipped: number;
}

/** Counts per data type: "Create / Update / Skip" for a check, "Created / …" for a result. */
function SummaryTable({
  summary,
  mode,
  caption,
}: {
  summary: ImportSummary;
  mode: 'check' | 'result';
  caption: string;
}) {
  const { t } = useTranslation();
  const rows: SummaryRow[] = IMPORT_DATA_TYPES.map((type) => ({
    type,
    ...(summary[type] ?? { created: 0, updated: 0, skipped: 0 }),
  }));
  const totals = summaryTotals(summary);
  const label = (key: 'create' | 'update' | 'skip') =>
    t(`dataImport.columns.${mode === 'check' ? key : PAST[key]}`);
  const columns: DataTableColumn<SummaryRow>[] = [
    { key: 'type', label: t('dataImport.columns.type'), primary: true, cell: (r) => t(`dataImport.types.${r.type}`) },
    { key: 'created', label: label('create'), numeric: true, cell: (r) => r.created },
    { key: 'updated', label: label('update'), numeric: true, cell: (r) => r.updated },
    { key: 'skipped', label: label('skip'), numeric: true, cell: (r) => r.skipped },
  ];
  return (
    <DataTable
      className="import-summary"
      caption={caption}
      columns={columns}
      rows={rows}
      rowKey={(r) => r.type}
      footer={
        <tr className="import-total">
          <th scope="row">{t('dataImport.total')}</th>
          <td className="num" data-label={label('create')}>
            {totals.created}
          </td>
          <td className="num" data-label={label('update')}>
            {totals.updated}
          </td>
          <td className="num" data-label={label('skip')}>
            {totals.skipped}
          </td>
        </tr>
      }
    />
  );
}

function ImportHistory() {
  const { t } = useTranslation();
  const lang = useLang();
  const runs = useImportRuns();
  const reference = useReference();
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());

  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const partnerName = (id: string) => reference.data?.partners.find((p) => p.id === id)?.name ?? '–';

  const columns: DataTableColumn<ImportRun>[] = [
    { key: 'at', label: t('dataImport.history.at'), primary: true, cell: (r) => formatDateTime(r.at, lang) },
    { key: 'partner', label: t('dataImport.history.partner'), cell: (r) => partnerName(r.partnerId) },
    {
      key: 'filename',
      label: t('dataImport.history.filename'),
      className: 'import-filename',
      cell: (r) => r.filename ?? t('dataImport.history.noFilename'),
    },
    { key: 'created', label: t('dataImport.columns.created'), numeric: true, cell: (r) => summaryTotals(r.summary).created },
    { key: 'updated', label: t('dataImport.columns.updated'), numeric: true, cell: (r) => summaryTotals(r.summary).updated },
    { key: 'skipped', label: t('dataImport.columns.skipped'), numeric: true, cell: (r) => summaryTotals(r.summary).skipped },
    {
      key: 'details',
      label: t('dataImport.history.details'),
      className: 'import-details',
      cell: (r) => <RunDetails run={r} open={open.has(r.id)} onToggle={() => toggle(r.id)} />,
    },
  ];

  return (
    <section className="import-section" aria-labelledby="import-history-title">
      <SectionLabel id="import-history-title">{t('dataImport.history.title')}</SectionLabel>
      {runs.isPending && (
        <p role="status" className="meta">
          {t('app.loading')}
        </p>
      )}
      {runs.isError && (
        <Notice tone="danger" role="alert">
          <p>{apiErrorMessage(t, runs.error)}</p>
          <Button size="sm" onClick={() => void runs.refetch()}>
            {t('app.retry')}
          </Button>
        </Notice>
      )}
      {runs.data && (
        <DataTable
          className="import-history"
          caption={t('dataImport.history.caption')}
          columns={columns}
          rows={runs.data}
          rowKey={(r) => r.id}
          empty={<p className="empty">{t('dataImport.history.empty')}</p>}
        />
      )}
    </section>
  );
}

function RunDetails({ run, open, onToggle }: { run: ImportRun; open: boolean; onToggle: () => void }) {
  const { t } = useTranslation();
  const lang = useLang();
  const listId = useId();
  const lines = IMPORT_DATA_TYPES.flatMap((type) => {
    const c = run.summary[type];
    return c && c.created + c.updated + c.skipped > 0 ? [{ type, ...c }] : [];
  });
  return (
    <>
      <Button size="sm" aria-expanded={open} aria-controls={open ? listId : undefined} onClick={onToggle}>
        {open ? t('dataImport.history.hide') : t('dataImport.history.show')}
      </Button>
      {open && (
        <ul id={listId} className="import-run-details" aria-label={t('dataImport.history.detailsCaption', { time: formatDateTime(run.at, lang) })}>
          {lines.length === 0 ? (
            <li>–</li>
          ) : (
            lines.map((l) => (
              <li key={l.type}>
                {t('dataImport.history.detailLine', {
                  type: t(`dataImport.types.${l.type}`),
                  created: l.created,
                  updated: l.updated,
                  skipped: l.skipped,
                })}
              </li>
            ))
          )}
        </ul>
      )}
    </>
  );
}
