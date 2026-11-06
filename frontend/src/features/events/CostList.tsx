import { useMutation } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import { useEffect, useRef, useState, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import type { CostType } from '../../api/enums';
import { isMusicianRole } from '../../api/enums';
import { costLinesApi } from '../../api/endpoints';
import type {
  CostLine,
  CostLineCreate,
  CostLineUpdate,
  EventDetail,
  EventWithWarnings,
  Person,
  Warning,
} from '../../api/types';
import { Button, IconButton } from '../../components/Button';
import { Dialog } from '../../components/Dialog';
import { InlineFieldFrame, InlineMoney, InlineSwitch, InlineText } from '../../components/inline';
import { Notice } from '../../components/Notice';
import { StatusTag } from '../../components/StatusTag';
import { apiErrorMessage, apiFieldErrors, costTypeLabel } from '../../i18n/labels';
import { useLang } from '../../i18n/useLang';
import { formatMoney } from '../../lib/format';
import { parseMoneyField } from '../../lib/moneyField';
import { useReference } from '../../reference/useReference';
import { orderCostLines } from './costLineOrder';
import { EventPurchaseOrder } from './EventPurchaseOrder';
import { selectablePeople } from './personOptions';
import { InlinePersonSelect, PersonSelect } from './PersonSelect';
import { PayControl } from './PayControl';
import { personName, useApplyEvent } from './queries';

interface Props {
  event: EventDetail;
  people: Person[] | undefined;
  readOnly: boolean;
  onWarnings: (warnings: Warning[]) => void;
}

const needsDescription = (type: CostType) => type === 'OTHER' || type === 'OTHER_ROLE';
/** Contract: description strings up to 5000 chars (TOO_LONG). */
const DESCRIPTION_MAX = 5000;

/** One list of fees and expenses with staffing, load-in switch and payments (UC-005). */
export function CostList({ event, people, readOnly, onWarnings }: Props) {
  const { t } = useTranslation();
  const lang = useLang();
  // The new line being typed in (TASK-179): a draft row at the end of the table, UI-only until
  // saved. A new key mounts a fresh draft.
  const [draftKey, setDraftKey] = useState<number | null>(null);
  const nextDraftKey = useRef(0);
  const draftTypeRef = useRef<HTMLSelectElement>(null);
  const addRow = () => {
    if (draftKey !== null) {
      draftTypeRef.current?.focus();
      return;
    }
    nextDraftKey.current += 1;
    setDraftKey(nextDraftKey.current);
  };
  const applyEvent = useApplyEvent();
  const onResult = (result: EventWithWarnings) => {
    applyEvent(result.event, event.id);
    onWarnings(result.warnings);
  };
  const columnCount = readOnly ? 5 : 6;

  return (
    <div className="cost-list">
      {!readOnly && <EventPurchaseOrder event={event} people={people} />}
      {event.notFullyStaffed && (
        <p className="cost-staffing" role="note">
          <StatusTag tone="warn">{t('events.notFullyStaffed')}</StatusTag>
        </p>
      )}
      {event.costLines.length === 0 && draftKey === null ? (
        <p className="table-empty">{t('costs.empty')}</p>
      ) : (
        // Hand-written .data-table (not <DataTable>): each line is its own named <tbody>, so an
        // action error can open in a full-width row right under their line.
        <div className="table-wrap">
          <table className="data-table cost-table">
            <caption className="visually-hidden">{t('event.sections.costs')}</caption>
            <thead>
              <tr>
                <th scope="col" className="cost-col-type">
                  {t('costs.type')}
                </th>
                <th scope="col" className="cost-col-person">
                  {t('costs.person')}
                </th>
                <th scope="col" className="cost-col-loadin">
                  {t('costs.loadIn')}
                </th>
                <th scope="col" className="num cost-col-budget">
                  {t('costs.budgeted')}
                </th>
                <th scope="col" className="num cost-col-paid">
                  {t('event.actual')}
                </th>
                {!readOnly && (
                  <th scope="col" className="cost-col-actions">
                    <span className="visually-hidden">{t('event.actions.label')}</span>
                  </th>
                )}
              </tr>
            </thead>
            {orderCostLines(event.costLines).map((line) => (
              <CostLineItem
                key={line.id}
                line={line}
                people={people}
                readOnly={readOnly}
                columnCount={columnCount}
                onResult={onResult}
              />
            ))}
            {!readOnly && draftKey !== null && (
              <DraftCostRow
                key={draftKey}
                event={event}
                people={people}
                columnCount={columnCount}
                typeRef={draftTypeRef}
                onSaved={(result) => {
                  onResult(result);
                  setDraftKey(null);
                }}
                onDiscard={() => setDraftKey(null)}
              />
            )}
          </table>
        </div>
      )}
      <dl className="cost-totals">
        <div>
          <dt>{t('costs.totalBudgeted')}</dt>
          <dd>{formatMoney(event.budgetedCostsCents, lang)}</dd>
        </div>
        <div>
          <dt>{t('costs.totalActual')}</dt>
          <dd>{formatMoney(event.actualCostsCents, lang)}</dd>
        </div>
      </dl>
      {!readOnly && (
        <Button
          // With a draft open, keep the focus in it: the click only moves to its type select.
          onMouseDown={(e) => {
            if (draftKey !== null) e.preventDefault();
          }}
          onClick={addRow}
        >
          + {t('costs.add')}
        </Button>
      )}
    </div>
  );
}

interface LineProps {
  line: CostLine;
  people: Person[] | undefined;
  readOnly: boolean;
  columnCount: number;
  onResult: (result: EventWithWarnings) => void;
}

function CostLineItem({ line, people, readOnly, columnCount, onResult }: LineProps) {
  const { t } = useTranslation();
  const lang = useLang();
  const [mode, setMode] = useState<'view' | 'remove'>('view');
  const typeLabel = costTypeLabel(t, line.type);
  const label = line.description ? `${typeLabel} (${line.description})` : typeLabel;
  const paid = line.paidAt !== null;
  const musician = isMusicianRole(line.type);
  // BR-118: on an open / paid purchase order the person, amounts, load-in and paid state are
  // locked (change the PO first); the description stays editable.
  const po = line.purchaseOrder;
  const lockedHint = po ? t('purchaseOrders.lockedHint', { number: po.number }) : undefined;

  // Remove is an action; the fields below save themselves (NFR-8).
  const mutation = useMutation({
    mutationFn: (action: () => Promise<EventWithWarnings>) => action(),
    onSuccess: (result) => {
      onResult(result);
      setMode('view');
    },
  });
  const run = (action: () => Promise<EventWithWarnings>) => mutation.mutate(action);
  const update = async (body: CostLineUpdate) => onResult(await costLinesApi.update(line.id, body));
  const hasExtraRow = mutation.isError && mode !== 'remove';
  const paidCell = useRef<HTMLTableCellElement>(null);
  // Marked paid with Enter: keep the keyboard focus on the amount that replaced the pay input.
  const focusPaidAmount = useRef(false);
  // Unmarked paid with Enter (amount cleared / 0): keep the focus on the "Mark paid" button.
  const focusPayButton = useRef(false);
  useEffect(() => {
    if (paid && focusPaidAmount.current) {
      focusPaidAmount.current = false;
      paidCell.current?.querySelector('input')?.focus();
    } else if (!paid && focusPayButton.current) {
      focusPayButton.current = false;
      paidCell.current?.querySelector('button')?.focus();
    }
  }, [paid]);

  return (
    <tbody
      className={['cost-group', musician && 'is-musician', paid && 'is-paid', po && 'has-po']
        .filter(Boolean)
        .join(' ')}
      aria-label={label}
    >
      <tr>
        <td className="cell-primary cost-type">
          <span className="cost-type-name" title={typeLabel}>
            {typeLabel}
          </span>
          {/* Read-only: no actions column, so the PO tag stays next to the type. */}
          {po && readOnly && <PurchaseOrderTag po={po} />}
          {readOnly ? (
            line.description && <span className="cost-type-description"> · {line.description}</span>
          ) : (
            <InlineText
              label={`${t('costs.description')}: ${label}`}
              hideLabel
              className="cost-description"
              value={line.description}
              placeholder={t('costs.description')}
              maxLength={DESCRIPTION_MAX}
              field="description"
              validate={(description) =>
                needsDescription(line.type) && description === null ? 'DESCRIPTION_REQUIRED' : null
              }
              onSave={(description) => update({ description })}
            />
          )}
        </td>

        <td className="cost-person" data-label={t('costs.person')} title={lockedHint}>
          {readOnly ? (
            <span className="cost-person-name">{personName(people, line.personId) ?? t('costs.noPersonShort')}</span>
          ) : (
            <InlinePersonSelect
              label={`${t('costs.person')}: ${label}`}
              value={line.personId}
              people={people}
              disabled={po !== null}
              type={line.type}
              onSave={(personId) => update({ personId })}
            />
          )}
        </td>

        <td className={musician ? 'cost-loadin' : 'cost-loadin is-empty'} title={musician ? lockedHint : undefined}>
          {musician && (
            <InlineSwitch
              label={t('costs.loadIn')}
              className="cost-loadin-switch"
              value={line.joinsLoadIn === true}
              disabled={readOnly || po !== null}
              field="joinsLoadIn"
              onSave={(joinsLoadIn) => update({ joinsLoadIn })}
            />
          )}
        </td>

        <td className="num cost-budget" data-label={t('costs.budgeted')} title={lockedHint}>
          {readOnly ? (
            formatMoney(line.budgetedCents, lang)
          ) : (
            <InlineMoney
              label={`${t('costs.budgeted')}: ${label}`}
              hideLabel
              required
              value={line.budgetedCents}
              disabled={po !== null}
              field="budgetedCents"
              onSave={(budgetedCents) => update({ budgetedCents })}
            />
          )}
        </td>

        <td ref={paidCell} className="cost-paid" data-label={t('event.actual')} title={lockedHint}>
          {paid && !readOnly && !po ? (
            // Paid: the amount stays editable (POST pay on a paid line updates the amount only).
            // Clearing it or entering 0 unmarks the line paid (POST unpay, TASK-178).
            <div className="cost-paid-edit">
              <InlineMoney
                label={`${t('costs.actualAmount')}: ${label}`}
                hideLabel
                value={line.actualCents}
                field="actualCents"
                onSave={async (actualCents) => {
                  if (actualCents === null || actualCents === 0) {
                    // Saved with Enter: keep the keyboard on the "Mark paid" button that replaces it.
                    const viaEnter = paidCell.current?.contains(document.activeElement) ?? false;
                    const result = await costLinesApi.unpay(line.id);
                    focusPayButton.current = viaEnter;
                    onResult(result);
                    return;
                  }
                  onResult(await costLinesApi.pay(line.id, { actualCents }));
                }}
              />
            </div>
          ) : paid ? (
            // Read-only: just the amount; who / when is in the gig log.
            <span className="cost-paid-amount">{formatMoney(line.actualCents, lang)}</span>
          ) : line.type === 'FUEL' ? (
            // Fuel is an estimate: never marked paid, so the cell stays empty (TASK-180).
            null
          ) : !readOnly && !po ? (
            // Unpaid: only the button, which turns into the amount input in place (no "unpaid" tag).
            <PayControl
              inputLabel={`${t('costs.actualAmount')}: ${label}`}
              buttonLabel={t('costs.markPaidLabel', { line: label })}
              initialCents={line.budgetedCents}
              onPay={async (actualCents, via) => {
                const result = await costLinesApi.pay(line.id, { actualCents });
                focusPaidAmount.current = via === 'enter';
                onResult(result);
              }}
            />
          ) : (
            <StatusTag>{t('costs.unpaid')}</StatusTag>
          )}
        </td>

        {!readOnly && (
          <td className="cost-actions">
            {/* BR-118: on a purchase order the PO tag (title = lock hint) replaces the remove button. */}
            {po && <PurchaseOrderTag po={po} />}
            {!po && (
              <div className="cost-actions-inner">
                <IconButton
                  variant="ghost"
                  icon={Trash2}
                  label={t('common.remove')}
                  className="cost-remove"
                  onClick={() => setMode('remove')}
                />
              </div>
            )}
            {mode === 'remove' && (
              <Dialog title={t('costs.removeTitle')} onClose={() => setMode('view')}>
                <p>{t('costs.removeConfirm', { line: label })}</p>
                {paid && (
                  <Notice tone="danger">
                    <p>{t('costs.removePaidWarning', { amount: formatMoney(line.actualCents, lang) })}</p>
                  </Notice>
                )}
                {mutation.isError && (
                  <Notice tone="danger" role="alert">
                    <p>{apiErrorMessage(t, mutation.error)}</p>
                  </Notice>
                )}
                <div className="form-actions">
                  <Button
                    variant="danger"
                    icon={Trash2}
                    disabled={mutation.isPending}
                    onClick={() => run(() => costLinesApi.remove(line.id))}
                  >
                    {t('common.remove')}
                  </Button>
                  <Button onClick={() => setMode('view')}>{t('common.cancel')}</Button>
                </div>
              </Dialog>
            )}
          </td>
        )}
      </tr>

      {hasExtraRow && (
        <tr className="cost-extra-row">
          <td colSpan={columnCount}>
            {mutation.isError && (
              <p className="field-error" role="alert">
                {Object.values(apiFieldErrors(t, mutation.error))[0] ?? apiErrorMessage(t, mutation.error)}
              </p>
            )}
          </td>
        </tr>
      )}
    </tbody>
  );
}

interface DraftProps {
  event: EventDetail;
  people: Person[] | undefined;
  columnCount: number;
  /** The type select, so "Add line" can focus an existing draft. */
  typeRef: RefObject<HTMLSelectElement | null>;
  onSaved: (result: EventWithWarnings) => void;
  onDiscard: () => void;
}

type DraftField = 'type' | 'personId' | 'description' | 'budgetedCents';
type DraftErrors = Partial<Record<DraftField, string>>;

/**
 * New cost line typed in place (TASK-179). `type` can't be changed after create, so the row lives
 * only in the UI until the focus leaves it: then it is saved (POST) when the type (and the
 * description OTHER / OTHER_ROLE need) is there, dropped when it is completely empty, and
 * otherwise kept with the field errors. Esc and the trash button drop it.
 */
function DraftCostRow({ event, people, columnCount, typeRef, onSaved, onDiscard }: DraftProps) {
  const { t } = useTranslation();
  const lang = useLang();
  const { data: reference } = useReference();
  const [type, setType] = useState<CostType | ''>('');
  const [personId, setPersonId] = useState<string | null>(null);
  const [description, setDescription] = useState('');
  const [budget, setBudget] = useState('');
  const [errors, setErrors] = useState<DraftErrors>({});
  const [generalError, setGeneralError] = useState<string | null>(null);
  const rowRef = useRef<HTMLTableSectionElement>(null);
  const leaveTimer = useRef<number | undefined>(undefined);
  const label = t('costs.addTitle');

  const add = useMutation({
    mutationFn: (body: CostLineCreate) => costLinesApi.create(event.id, body),
    onSuccess: onSaved,
    onError: (error) => {
      const fieldErrors: DraftErrors = apiFieldErrors(t, error);
      setErrors(fieldErrors);
      setGeneralError(Object.keys(fieldErrors).length === 0 ? apiErrorMessage(t, error) : null);
    },
  });

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

  const onTypeChange = (code: CostType | '') => {
    setType(code);
    clearError('type');
    // Drop a chosen person the new type doesn't offer: not an active partner on SALES /
    // PRODUCTION (it would be rejected), or without the role on a musician line (TASK-185).
    if (personId !== null && !selectablePeople(people, null, code).some((p) => p.id === personId)) {
      setPersonId(null);
    }
  };

  /** The focus left the row: save, drop (completely empty) or show what is missing. */
  const leave = () => {
    if (add.isPending) return;
    const text = description.trim();
    if (!type && personId === null && !text && !budget.trim()) {
      onDiscard();
      return;
    }
    const next: DraftErrors = {};
    if (!type) next.type = t('fields.REQUIRED');
    if (type && needsDescription(type) && !text) next.description = t('fields.DESCRIPTION_REQUIRED');
    if (text.length > DESCRIPTION_MAX) next.description = t('fields.TOO_LONG');
    // An empty budget is saved as 0 €.
    const parsed = parseMoneyField(budget, lang, false);
    if (parsed.error) next.budgetedCents = t(`fields.${parsed.error}`);
    setErrors(next);
    setGeneralError(null);
    if (!type || Object.keys(next).length > 0) return;
    add.mutate({ type, personId, description: text || null, budgetedCents: parsed.cents ?? 0 });
  };

  const groups: [string, readonly CostType[]][] = [
    [t('costs.groupMusician'), reference?.costTypes.musicianRoles ?? []],
    [t('costs.groupInternal'), reference?.costTypes.internalRoles ?? []],
    [t('costs.groupExpense'), reference?.costTypes.expenseCategories ?? []],
  ];

  return (
    <tbody
      ref={rowRef}
      className="cost-group cost-draft"
      aria-label={label}
      aria-busy={add.isPending || undefined}
      onBlur={(e) => {
        if (e.relatedTarget instanceof Node && rowRef.current?.contains(e.relatedTarget)) return;
        // Decide once the focus has settled: a control swapped inside the row (e.g. the
        // new-person name input) keeps the focus in the row.
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
        onDiscard();
      }}
    >
      <tr>
        <td className="cell-primary cost-type">
          <InlineFieldFrame
            label={`${t('costs.type')}: ${label}`}
            hideLabel
            status={errors.type ? 'error' : add.isPending ? 'saving' : 'idle'}
            error={errors.type ?? null}
          >
            {(control) => (
              <select
                {...control}
                ref={typeRef}
                value={type}
                disabled={add.isPending}
                onChange={(e) => onTypeChange(e.target.value as CostType | '')}
              >
                <option value="">{t('costs.chooseType')}</option>
                {groups.map(([groupLabel, codes]) => (
                  <optgroup key={groupLabel} label={groupLabel}>
                    {codes.map((code) => (
                      <option key={code} value={code}>
                        {costTypeLabel(t, code)}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            )}
          </InlineFieldFrame>
          <InlineFieldFrame
            label={`${t('costs.description')}: ${label}`}
            hideLabel
            className="cost-description"
            status={errors.description ? 'error' : 'idle'}
            error={errors.description ?? null}
          >
            {(control) => (
              <input
                {...control}
                type="text"
                autoComplete="off"
                placeholder={t('costs.description')}
                value={description}
                disabled={add.isPending}
                onChange={(e) => {
                  setDescription(e.target.value);
                  clearError('description');
                }}
              />
            )}
          </InlineFieldFrame>
        </td>

        <td className="cost-person" data-label={t('costs.person')}>
          <PersonSelect
            label={`${t('costs.person')}: ${label}`}
            value={personId}
            people={people}
            type={type}
            error={errors.personId}
            onChange={(id) => {
              setPersonId(id);
              clearError('personId');
            }}
          />
        </td>

        <td className="cost-loadin is-empty" />

        <td className="num cost-budget" data-label={t('costs.budgeted')}>
          <InlineFieldFrame
            label={`${t('costs.budgeted')}: ${label}`}
            hideLabel
            className="inline-numeric"
            status={errors.budgetedCents ? 'error' : 'idle'}
            error={errors.budgetedCents ?? null}
          >
            {(control) => (
              <span className="inline-unit">
                <input
                  {...control}
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  value={budget}
                  disabled={add.isPending}
                  onChange={(e) => {
                    setBudget(e.target.value);
                    clearError('budgetedCents');
                  }}
                />
                <span aria-hidden="true">€</span>
              </span>
            )}
          </InlineFieldFrame>
        </td>

        <td className="cost-paid cost-draft-paid" />

        <td className="cost-actions">
          <div className="cost-actions-inner">
            <IconButton
              variant="ghost"
              icon={Trash2}
              label={t('common.remove')}
              className="cost-remove"
              // Keep the focus in the row (Safari doesn't focus buttons on click): the click drops
              // the draft; leaving the row first must not save it.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                window.clearTimeout(leaveTimer.current);
                onDiscard();
              }}
            />
          </div>
        </td>
      </tr>

      {generalError && (
        <tr className="cost-extra-row">
          <td colSpan={columnCount}>
            <p className="field-error" role="alert">
              {generalError}
            </p>
          </td>
        </tr>
      )}
    </tbody>
  );
}

/** BR-118: "PO <number>" tag linking to the purchase order; its title explains the lock. */
function PurchaseOrderTag({ po }: { po: NonNullable<CostLine['purchaseOrder']> }) {
  const { t } = useTranslation();
  return (
    <Link
      to={`/purchase-orders/${po.id}`}
      className="tag tag-info cost-po-tag"
      title={t('purchaseOrders.lockedHint', { number: po.number })}
      aria-label={t('purchaseOrders.tagLabel', { number: po.number })}
    >
      {t('purchaseOrders.tag', { number: po.number })}
    </Link>
  );
}
