import { useMutation } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import type { CostType } from '../../api/enums';
import { isMusicianRole, isPartnerOnlyType } from '../../api/enums';
import { costLinesApi } from '../../api/endpoints';
import type { CostLine, CostLineUpdate, EventDetail, EventWithWarnings, Person, Warning } from '../../api/types';
import { Button, IconButton } from '../../components/Button';
import { Dialog } from '../../components/Dialog';
import { Field, MoneyInput } from '../../components/fields';
import { InlineMoney, InlineSwitch, InlineText } from '../../components/inline';
import { Notice } from '../../components/Notice';
import { StatusTag } from '../../components/StatusTag';
import { apiErrorMessage, apiFieldErrors, costTypeLabel } from '../../i18n/labels';
import { useLang } from '../../i18n/useLang';
import { centsToInput, formatMoney } from '../../lib/format';
import { parseMoneyField } from '../../lib/moneyField';
import { useReference } from '../../reference/useReference';
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
  const [adding, setAdding] = useState(false);
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
      {event.costLines.length === 0 ? (
        <p className="table-empty">{t('costs.empty')}</p>
      ) : (
        // Hand-written .data-table (not <DataTable>): each line is its own named <tbody>, so an
        // action error can open in a full-width row right under their line.
        <div className="table-wrap">
          <table className="data-table cost-table">
            <caption className="visually-hidden">{t('event.sections.costs')}</caption>
            <thead>
              <tr>
                <th scope="col">{t('costs.type')}</th>
                <th scope="col">{t('costs.person')}</th>
                <th scope="col" className="cost-col-loadin">
                  {t('costs.loadIn')}
                </th>
                <th scope="col" className="num">
                  {t('costs.budgeted')}
                </th>
                <th scope="col">{t('event.actual')}</th>
                {!readOnly && (
                  <th scope="col">
                    <span className="visually-hidden">{t('event.actions.label')}</span>
                  </th>
                )}
              </tr>
            </thead>
            {event.costLines.map((line) => (
              <CostLineItem
                key={line.id}
                line={line}
                people={people}
                readOnly={readOnly}
                columnCount={columnCount}
                onResult={onResult}
              />
            ))}
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
      {!readOnly &&
        (adding ? (
          <AddCostLineForm
            event={event}
            people={people}
            onDone={(result) => {
              onResult(result);
              setAdding(false);
            }}
            onCancel={() => setAdding(false)}
          />
        ) : (
          <Button onClick={() => setAdding(true)}>+ {t('costs.add')}</Button>
        ))}
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
    <tbody className={paid ? 'cost-group is-paid' : 'cost-group'} aria-label={label}>
      <tr>
        <td className="cell-primary cost-type">
          <span className="cost-type-name">{typeLabel}</span>
          {po && (
            <Link
              to={`/purchase-orders/${po.id}`}
              className="tag tag-info cost-po-tag"
              title={lockedHint}
              aria-label={t('purchaseOrders.tagLabel', { number: po.number })}
            >
              {t('purchaseOrders.tag', { number: po.number })}
            </Link>
          )}
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
            <span>{personName(people, line.personId) ?? t('costs.noPersonShort')}</span>
          ) : (
            <InlinePersonSelect
              label={`${t('costs.person')}: ${label}`}
              value={line.personId}
              people={people}
              disabled={po !== null}
              partnersOnly={isPartnerOnlyType(line.type)}
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
            <span className="cost-hint">{t('costs.fuelHint')}</span>
          ) : !readOnly && !po ? (
            // Unpaid: only the button, which turns into the amount input in place (no "unpaid" tag).
            <PayControl
              inputLabel={`${t('costs.actualAmount')}: ${label}`}
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
            {po && <span className="cost-hint cost-po-hint">{lockedHint}</span>}
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

function AddCostLineForm({
  event,
  people,
  onDone,
  onCancel,
}: {
  event: EventDetail;
  people: Person[] | undefined;
  onDone: (result: EventWithWarnings) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const lang = useLang();
  const { data: reference } = useReference();
  const [type, setType] = useState<CostType | ''>('');
  const [personId, setPersonId] = useState<string | null>(null);
  const [description, setDescription] = useState('');
  const [budget, setBudget] = useState('');
  const [localErrors, setLocalErrors] = useState<Record<string, string>>({});
  const add = useMutation({
    mutationFn: () =>
      costLinesApi.create(event.id, {
        type: type as CostType,
        personId,
        description: description.trim() || null,
        budgetedCents: parseMoneyField(budget, lang, true).cents ?? 0,
      }),
    onSuccess: onDone,
  });
  const errors = { ...(add.isError ? apiFieldErrors(t, add.error) : {}), ...localErrors };

  const internalDefault = (code: CostType): number | null => {
    const s = reference?.settings;
    if (!s) return null;
    if (code === 'OFFICE') return s.officeDefaultCents;
    if (code === 'SALES') return s.salesDefaultCents;
    if (code === 'PRODUCTION') return s.productionDefaultCents;
    return null;
  };

  const partnersOnly = type !== '' && isPartnerOnlyType(type);

  const onTypeChange = (code: CostType | '') => {
    setType(code);
    // SALES / PRODUCTION: drop a chosen person who isn't an active partner (it would be rejected).
    if (code && isPartnerOnlyType(code) && personId !== null) {
      if (!selectablePeople(people, null, true).some((p) => p.id === personId)) setPersonId(null);
    }
    const fee = code ? internalDefault(code) : null;
    if (fee !== null && budget.trim() === '') setBudget(centsToInput(fee, lang));
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (!type) next.type = t('fields.REQUIRED');
    const parsed = parseMoneyField(budget, lang, true);
    if (parsed.error) next.budgetedCents = t(`fields.${parsed.error}`);
    if (type && needsDescription(type) && !description.trim()) {
      next.description = t('fields.DESCRIPTION_REQUIRED');
    }
    setLocalErrors(next);
    if (Object.keys(next).length === 0) add.mutate();
  };

  const groups: [string, readonly CostType[]][] = [
    [t('costs.groupMusician'), reference?.costTypes.musicianRoles ?? []],
    [t('costs.groupInternal'), reference?.costTypes.internalRoles ?? []],
    [t('costs.groupExpense'), reference?.costTypes.expenseCategories ?? []],
  ];

  return (
    <form className="inline-form cost-add-form" onSubmit={submit} noValidate aria-label={t('costs.addTitle')}>
      <h3 className="cost-add-title">{t('costs.addTitle')}</h3>
      <div className="form-row">
        <Field label={t('costs.type')} error={errors.type}>
          {(p) => (
            <select {...p} value={type} onChange={(e) => onTypeChange(e.target.value as CostType | '')}>
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
        </Field>
        <Field label={t('costs.person')} error={errors.personId}>
          {(p) => (
            <PersonSelect
              id={p.id}
              label={t('costs.person')}
              value={personId}
              people={people}
              partnersOnly={partnersOnly}
              onChange={setPersonId}
            />
          )}
        </Field>
      </div>
      <div className="form-row">
        <Field label={t('costs.budgeted')} error={errors.budgetedCents}>
          {(p) => <MoneyInput {...p} value={budget} onChange={setBudget} />}
        </Field>
        <Field label={t('costs.description')} error={errors.description}>
          {(p) => (
            <input {...p} type="text" value={description} onChange={(e) => setDescription(e.target.value)} />
          )}
        </Field>
      </div>
      {add.isError && Object.keys(apiFieldErrors(t, add.error)).length === 0 && (
        <Notice tone="danger" role="alert">
          <p>{apiErrorMessage(t, add.error)}</p>
        </Notice>
      )}
      <div className="form-actions">
        <Button type="submit" variant="primary" disabled={add.isPending}>
          {t('costs.add')}
        </Button>
        <Button onClick={onCancel}>{t('common.cancel')}</Button>
      </div>
    </form>
  );
}
