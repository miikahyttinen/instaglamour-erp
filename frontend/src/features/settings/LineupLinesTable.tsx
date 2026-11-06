import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import type { CostType } from '../../api/enums';
import { isMusicianRole } from '../../api/enums';
import type { LineupLine } from '../../api/types';
import { Button, IconButton } from '../../components/Button';
import { InlineFieldFrame, InlineMoney, InlineText, useInlineSave } from '../../components/inline';
import { apiErrorMessage, apiFieldErrors, costTypeLabel } from '../../i18n/labels';
import { useLang } from '../../i18n/useLang';
import { formatMoney } from '../../lib/format';
import { parseMoneyField } from '../../lib/moneyField';
import { useReference } from '../../reference/useReference';
import {
  costTypeGroups,
  LINEUP_DESCRIPTION_MAX,
  LINEUP_LINES_MAX,
  lineNeedsDescription,
  lineupLineLabel,
  lineupTotalCents,
} from './lineupLines';

/** Changes the line list; the caller sends the whole new list (`PATCH lines`). */
export type SaveLines = (change: (lines: LineupLine[]) => LineupLine[]) => Promise<unknown>;

interface Props {
  lines: LineupLine[];
  saveLines: SaveLines;
}

/** First translated field error of a failed `PATCH lines` (keys like `lines[2].description`), else the error. */
function linesErrorMessage(t: Parameters<typeof apiErrorMessage>[0], error: unknown): string {
  return Object.values(apiFieldErrors(t, error))[0] ?? apiErrorMessage(t, error);
}

/**
 * Lineup lines (settings → lineup): the gig cost table's look and inline editing, without person,
 * load-in and paid columns. Every change saves the whole list. Order is the user's (no musician-
 * first sorting). A new line is typed into a draft row at the end, like on the gig page.
 */
export function LineupLinesTable({ lines, saveLines }: Props) {
  const { t } = useTranslation();
  const lang = useLang();
  const [draftKey, setDraftKey] = useState<number | null>(null);
  const nextDraftKey = useRef(0);
  const draftTypeRef = useRef<HTMLSelectElement>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const full = lines.length >= LINEUP_LINES_MAX;

  const addRow = () => {
    if (draftKey !== null) {
      draftTypeRef.current?.focus();
      return;
    }
    nextDraftKey.current += 1;
    setDraftKey(nextDraftKey.current);
  };

  /** Move / remove: an action, its error goes under the table. */
  const runAction = (change: (current: LineupLine[]) => LineupLine[]) => {
    setActionError(null);
    saveLines(change).catch((error: unknown) => setActionError(linesErrorMessage(t, error)));
  };

  return (
    <div className="lineup-lines">
      {lines.length === 0 && draftKey === null ? (
        <p className="table-empty">{t('settings.lineups.noLines')}</p>
      ) : (
        <div className="table-wrap">
          <table className="data-table lineup-lines-table">
            <caption className="visually-hidden">{t('settings.lineups.linesCaption')}</caption>
            <thead>
              <tr>
                <th scope="col" className="lineup-col-type">
                  {t('settings.lineups.type')}
                </th>
                <th scope="col" className="lineup-col-description">
                  {t('settings.lineups.description')}
                </th>
                <th scope="col" className="num lineup-col-amount">
                  {t('settings.lineups.defaultAmount')}
                </th>
                <th scope="col" className="lineup-col-actions">
                  <span className="visually-hidden">{t('event.actions.label')}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line, index) => (
                <LineRow
                  // Lines have no ids: the position is the identity. The fields follow the value.
                  key={index}
                  line={line}
                  index={index}
                  last={index === lines.length - 1}
                  saveLines={saveLines}
                  onAction={runAction}
                />
              ))}
              {draftKey !== null && (
                <DraftLineRow
                  key={draftKey}
                  typeRef={draftTypeRef}
                  saveLines={saveLines}
                  onDone={() => setDraftKey(null)}
                />
              )}
            </tbody>
          </table>
        </div>
      )}
      {actionError && (
        <p className="field-error" role="alert">
          {actionError}
        </p>
      )}
      <dl className="lineup-total">
        <div>
          <dt>{t('settings.lineups.total')}</dt>
          <dd>{formatMoney(lineupTotalCents(lines), lang)}</dd>
        </div>
      </dl>
      <Button
        icon={Plus}
        disabled={full}
        // With a draft open, keep the focus in it: the click only moves to its type select.
        onMouseDown={(e) => {
          if (draftKey !== null) e.preventDefault();
        }}
        onClick={addRow}
      >
        {t('settings.lineups.addLine')}
      </Button>
      {full && <p className="muted small">{t('settings.lineups.tooManyLines', { max: LINEUP_LINES_MAX })}</p>}
    </div>
  );
}

const replaceAt = (lines: LineupLine[], index: number, line: LineupLine) =>
  lines.map((l, i) => (i === index ? line : l));

function moved(lines: LineupLine[], index: number, delta: -1 | 1): LineupLine[] {
  const target = index + delta;
  if (target < 0 || target >= lines.length) return lines;
  const next = [...lines];
  [next[index], next[target]] = [next[target]!, next[index]!];
  return next;
}

interface RowProps {
  line: LineupLine;
  index: number;
  last: boolean;
  saveLines: SaveLines;
  onAction: (change: (lines: LineupLine[]) => LineupLine[]) => void;
}

function LineRow({ line, index, last, saveLines, onAction }: RowProps) {
  const { t } = useTranslation();
  const label = lineupLineLabel(t, line);
  // Each field changes only its own key of the line at this position (the newest list is used).
  const patch = (fields: Partial<LineupLine>) =>
    saveLines((current) => replaceAt(current, index, { ...current[index]!, ...fields }));

  return (
    <tr className={isMusicianRole(line.type) ? 'lineup-line is-musician' : 'lineup-line'} aria-label={label}>
      <td className="cell-primary lineup-type">
        <TypeSelect
          label={`${t('settings.lineups.type')}: ${label}`}
          value={line.type}
          validate={(type) => (lineNeedsDescription(type) && !line.description ? 'DESCRIPTION_REQUIRED' : null)}
          onSave={(type) => patch({ type })}
        />
      </td>
      <td className="lineup-description">
        <InlineText
          label={`${t('settings.lineups.description')}: ${label}`}
          hideLabel
          value={line.description}
          placeholder={t('settings.lineups.description')}
          maxLength={LINEUP_DESCRIPTION_MAX}
          validate={(description) => (lineNeedsDescription(line.type) && description === null ? 'DESCRIPTION_REQUIRED' : null)}
          onSave={(description) => patch({ description })}
        />
      </td>
      <td className="num lineup-amount">
        <InlineMoney
          label={`${t('settings.lineups.defaultAmount')}: ${label}`}
          hideLabel
          required
          value={line.defaultCents}
          onSave={(defaultCents) => patch({ defaultCents })}
        />
      </td>
      <td className="lineup-actions">
        <div className="lineup-actions-inner">
          <IconButton
            icon={ArrowUp}
            label={t('settings.lineups.moveUp', { line: label })}
            disabled={index === 0}
            onClick={() => onAction((current) => moved(current, index, -1))}
          />
          <IconButton
            icon={ArrowDown}
            label={t('settings.lineups.moveDown', { line: label })}
            disabled={last}
            onClick={() => onAction((current) => moved(current, index, 1))}
          />
          <IconButton
            icon={Trash2}
            className="lineup-remove"
            label={t('settings.lineups.removeLine', { line: label })}
            onClick={() => onAction((current) => current.filter((_, i) => i !== index))}
          />
        </div>
      </td>
    </tr>
  );
}

function TypeOptions() {
  const { t } = useTranslation();
  const { data: reference } = useReference();
  return (
    <>
      {costTypeGroups(t, reference).map(([groupLabel, codes]) => (
        <optgroup key={groupLabel} label={groupLabel}>
          {codes.map((code) => (
            <option key={code} value={code}>
              {costTypeLabel(t, code)}
            </option>
          ))}
        </optgroup>
      ))}
    </>
  );
}

/** Inline type select with the cost table's groups; saves on change. */
function TypeSelect({
  label,
  value,
  validate,
  onSave,
}: {
  label: string;
  value: CostType;
  validate: (type: CostType) => 'DESCRIPTION_REQUIRED' | null;
  onSave: (type: CostType) => Promise<unknown>;
}) {
  const state = useInlineSave<CostType>({ value, save: onSave, validate });
  return (
    <InlineFieldFrame label={label} hideLabel status={state.status} error={state.error}>
      {(control) => (
        <select
          {...control}
          value={state.draft}
          onChange={(e) => void state.commit(e.target.value as CostType)}
          onBlur={() => {
            if (state.status === 'error') void state.commit();
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') state.revert();
          }}
        >
          <TypeOptions />
        </select>
      )}
    </InlineFieldFrame>
  );
}

type DraftField = 'type' | 'description' | 'defaultCents';
type DraftErrors = Partial<Record<DraftField, string>>;

/**
 * New line typed in place (like the gig cost table's draft row): saved when the focus leaves the
 * row and the type (and the description OTHER / OTHER_ROLE need) is there; dropped when completely
 * empty; otherwise kept with the field errors. Esc and the trash button drop it.
 */
function DraftLineRow({
  typeRef,
  saveLines,
  onDone,
}: {
  typeRef: RefObject<HTMLSelectElement | null>;
  saveLines: SaveLines;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const lang = useLang();
  const [type, setType] = useState<CostType | ''>('');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [errors, setErrors] = useState<DraftErrors>({});
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const rowRef = useRef<HTMLTableRowElement>(null);
  const leaveTimer = useRef<number | undefined>(undefined);
  const label = t('settings.lineups.newLine');

  useEffect(() => {
    typeRef.current?.focus();
    return () => window.clearTimeout(leaveTimer.current);
  }, [typeRef]);

  const clearError = (field: DraftField) => {
    setErrors((prev) => {
      const next = { ...prev };
      delete next[field];
      return next;
    });
    setGeneralError(null);
  };

  const leave = () => {
    if (saving) return;
    const text = description.trim();
    if (!type && !text && !amount.trim()) {
      onDone();
      return;
    }
    const next: DraftErrors = {};
    if (!type) next.type = t('fields.REQUIRED');
    if (type && lineNeedsDescription(type) && !text) next.description = t('fields.DESCRIPTION_REQUIRED');
    if (text.length > LINEUP_DESCRIPTION_MAX) next.description = t('fields.TOO_LONG');
    // An empty amount is saved as 0 €.
    const parsed = parseMoneyField(amount, lang, false);
    if (parsed.error) next.defaultCents = t(`fields.${parsed.error}`);
    setErrors(next);
    setGeneralError(null);
    if (!type || Object.keys(next).length > 0) return;
    const line: LineupLine = { type, description: text || null, defaultCents: parsed.cents ?? 0 };
    setSaving(true);
    saveLines((current) => [...current, line]).then(
      () => onDone(),
      (error: unknown) => {
        setSaving(false);
        setGeneralError(linesErrorMessage(t, error));
      },
    );
  };

  return (
    <tr
      ref={rowRef}
      className="lineup-line lineup-draft"
      aria-label={label}
      aria-busy={saving || undefined}
      onBlur={(e) => {
        if (e.relatedTarget instanceof Node && rowRef.current?.contains(e.relatedTarget)) return;
        window.clearTimeout(leaveTimer.current);
        leaveTimer.current = window.setTimeout(() => {
          if (!rowRef.current || rowRef.current.contains(document.activeElement)) return;
          leave();
        });
      }}
      onKeyDown={(e) => {
        if (e.key !== 'Escape' || e.nativeEvent.isComposing) return;
        e.preventDefault();
        window.clearTimeout(leaveTimer.current);
        onDone();
      }}
    >
      <td className="cell-primary lineup-type">
        <InlineFieldFrame
          label={`${t('settings.lineups.type')}: ${label}`}
          hideLabel
          status={errors.type ? 'error' : saving ? 'saving' : 'idle'}
          error={errors.type ?? null}
        >
          {(control) => (
            <select
              {...control}
              ref={typeRef}
              value={type}
              disabled={saving}
              onChange={(e) => {
                setType(e.target.value as CostType | '');
                clearError('type');
              }}
            >
              <option value="">{t('costs.chooseType')}</option>
              <TypeOptions />
            </select>
          )}
        </InlineFieldFrame>
      </td>
      <td className="lineup-description">
        <InlineFieldFrame
          label={`${t('settings.lineups.description')}: ${label}`}
          hideLabel
          status={errors.description ? 'error' : 'idle'}
          error={errors.description ?? null}
        >
          {(control) => (
            <input
              {...control}
              type="text"
              autoComplete="off"
              placeholder={t('settings.lineups.description')}
              value={description}
              disabled={saving}
              onChange={(e) => {
                setDescription(e.target.value);
                clearError('description');
              }}
            />
          )}
        </InlineFieldFrame>
        {generalError && (
          <p className="field-error" role="alert">
            {generalError}
          </p>
        )}
      </td>
      <td className="num lineup-amount">
        <InlineFieldFrame
          label={`${t('settings.lineups.defaultAmount')}: ${label}`}
          hideLabel
          className="inline-numeric"
          status={errors.defaultCents ? 'error' : 'idle'}
          error={errors.defaultCents ?? null}
        >
          {(control) => (
            <span className="inline-unit">
              <input
                {...control}
                type="text"
                inputMode="decimal"
                autoComplete="off"
                value={amount}
                disabled={saving}
                onChange={(e) => {
                  setAmount(e.target.value);
                  clearError('defaultCents');
                }}
              />
              <span aria-hidden="true">€</span>
            </span>
          )}
        </InlineFieldFrame>
      </td>
      <td className="lineup-actions">
        <div className="lineup-actions-inner">
          <IconButton
            icon={Trash2}
            className="lineup-remove"
            label={t('common.remove')}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              window.clearTimeout(leaveTimer.current);
              onDone();
            }}
          />
        </div>
      </td>
    </tr>
  );
}
