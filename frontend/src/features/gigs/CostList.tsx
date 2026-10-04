import { useMutation } from '@tanstack/react-query';
import { CircleCheck, Pencil, Trash2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { CostType } from '../../api/enums';
import { isMusicianRole } from '../../api/enums';
import { costLinesApi } from '../../api/endpoints';
import type { CostLine, GigDetail, GigWithWarnings, Person, Warning } from '../../api/types';
import { Button, IconButton } from '../../components/Button';
import { Dialog } from '../../components/Dialog';
import { Field, MoneyInput } from '../../components/fields';
import { Notice } from '../../components/Notice';
import { StatusTag } from '../../components/StatusTag';
import { apiErrorMessage, apiFieldErrors, costTypeLabel } from '../../i18n/labels';
import { useLang } from '../../i18n/useLang';
import { centsToInput, formatDateTime, formatMoney } from '../../lib/format';
import { parseMoneyField } from '../../lib/moneyField';
import { usePartner, useReference } from '../../reference/useReference';
import { PersonSelect } from './PersonSelect';
import { personName, useApplyGig } from './queries';

interface Props {
  gig: GigDetail;
  people: Person[] | undefined;
  readOnly: boolean;
  onWarnings: (warnings: Warning[]) => void;
}

const needsDescription = (type: CostType) => type === 'OTHER' || type === 'OTHER_ROLE';

/** One list of fees and expenses with staffing, load-in switch and payments (UC-005). */
export function CostList({ gig, people, readOnly, onWarnings }: Props) {
  const { t } = useTranslation();
  const lang = useLang();
  const [adding, setAdding] = useState(false);
  const applyGig = useApplyGig();
  const onResult = (result: GigWithWarnings) => {
    applyGig(result.gig, gig.id);
    onWarnings(result.warnings);
  };
  const columnCount = readOnly ? 5 : 6;

  return (
    <div className="cost-list">
      {gig.notFullyStaffed && (
        <p className="cost-staffing" role="note">
          <StatusTag tone="warn">{t('gigs.notFullyStaffed')}</StatusTag>
        </p>
      )}
      {gig.costLines.length === 0 ? (
        <p className="table-empty">{t('costs.empty')}</p>
      ) : (
        // Hand-written .data-table (not <DataTable>): each line is its own named <tbody>, so the
        // inline pay / edit forms can open in a full-width row right under their line.
        <div className="table-wrap">
          <table className="data-table data-table-cards cost-table">
            <caption className="visually-hidden">{t('gig.sections.costs')}</caption>
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
                <th scope="col">{t('gig.actual')}</th>
                {!readOnly && (
                  <th scope="col">
                    <span className="visually-hidden">{t('gig.actions.label')}</span>
                  </th>
                )}
              </tr>
            </thead>
            {gig.costLines.map((line) => (
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
          <dd>{formatMoney(gig.budgetedCostsCents, lang)}</dd>
        </div>
        <div>
          <dt>{t('costs.totalActual')}</dt>
          <dd>{formatMoney(gig.actualCostsCents, lang)}</dd>
        </div>
      </dl>
      {!readOnly &&
        (adding ? (
          <AddCostLineForm
            gig={gig}
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
  onResult: (result: GigWithWarnings) => void;
}

function CostLineItem({ line, people, readOnly, columnCount, onResult }: LineProps) {
  const { t } = useTranslation();
  const lang = useLang();
  const paidBy = usePartner(line.paidBy);
  const [mode, setMode] = useState<'view' | 'edit' | 'pay' | 'remove'>('view');
  const typeLabel = costTypeLabel(t, line.type);
  const label = line.description ? `${typeLabel} (${line.description})` : typeLabel;
  const paid = line.paidAt !== null;
  const musician = isMusicianRole(line.type);

  const mutation = useMutation({
    mutationFn: (action: () => Promise<GigWithWarnings>) => action(),
    onSuccess: (result) => {
      onResult(result);
      setMode('view');
    },
  });
  const run = (action: () => Promise<GigWithWarnings>) => mutation.mutate(action);
  const hasExtraRow = mutation.isError || mode === 'pay' || mode === 'edit';

  return (
    <tbody className={paid ? 'cost-group is-paid' : 'cost-group'} aria-label={label}>
      <tr>
        <td className="cell-primary cost-type">
          <span className="cost-type-name">{typeLabel}</span>
          {line.description && <span className="cost-type-description"> · {line.description}</span>}
        </td>

        <td className="cost-person" data-label={t('costs.person')}>
          {readOnly ? (
            <span>{personName(people, line.personId) ?? t('costs.noPersonShort')}</span>
          ) : (
            <PersonSelect
              label={`${t('costs.person')}: ${label}`}
              value={line.personId}
              people={people}
              disabled={mutation.isPending}
              onChange={(personId) => run(() => costLinesApi.update(line.id, { personId }))}
            />
          )}
        </td>

        <td className={musician ? 'cost-loadin' : 'cost-loadin is-empty'}>
          {musician && (
            <label className="switch cost-switch">
              <input
                type="checkbox"
                role="switch"
                checked={line.joinsLoadIn === true}
                disabled={readOnly || mutation.isPending}
                onChange={(e) => {
                  const joinsLoadIn = e.target.checked;
                  run(() => costLinesApi.update(line.id, { joinsLoadIn }));
                }}
              />
              <span className="cost-switch-text">{t('costs.loadIn')}</span>
            </label>
          )}
        </td>

        <td className="num cost-budget" data-label={t('costs.budgeted')}>
          {formatMoney(line.budgetedCents, lang)}
        </td>

        <td className="cost-paid" data-label={t('gig.actual')}>
          {paid ? (
            <span className="paid-info">
              <CircleCheck className="paid-icon" />
              <span>
                {t('costs.paidInfo', {
                  amount: formatMoney(line.actualCents, lang),
                  time: formatDateTime(line.paidAt, lang),
                  partner: paidBy?.name ?? '–',
                })}
              </span>
            </span>
          ) : line.type === 'FUEL' ? (
            <span className="cost-hint">{t('costs.fuelHint')}</span>
          ) : (
            <StatusTag>{t('costs.unpaid')}</StatusTag>
          )}
        </td>

        {!readOnly && (
          <td className="cost-actions">
            {mode === 'view' && (
              <div className="cost-actions-inner">
                {paid ? (
                  <Button
                    size="sm"
                    disabled={mutation.isPending}
                    onClick={() => run(() => costLinesApi.unpay(line.id))}
                  >
                    {t('costs.unmarkPaid')}
                  </Button>
                ) : (
                  line.type !== 'FUEL' && (
                    <Button size="sm" onClick={() => setMode('pay')}>
                      {t('costs.markPaid')}
                    </Button>
                  )
                )}
                <IconButton
                  variant="ghost"
                  icon={Pencil}
                  label={t('common.edit')}
                  onClick={() => setMode('edit')}
                />
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
            {mode === 'pay' && (
              <PayForm
                line={line}
                pending={mutation.isPending}
                onSubmit={(actualCents) => run(() => costLinesApi.pay(line.id, { actualCents }))}
                onCancel={() => setMode('view')}
              />
            )}
            {mode === 'edit' && (
              <EditLineForm
                line={line}
                pending={mutation.isPending}
                onSubmit={(body) => run(() => costLinesApi.update(line.id, body))}
                onCancel={() => setMode('view')}
              />
            )}
          </td>
        </tr>
      )}
    </tbody>
  );
}

function PayForm({
  line,
  pending,
  onSubmit,
  onCancel,
}: {
  line: CostLine;
  pending: boolean;
  onSubmit: (actualCents: number) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const lang = useLang();
  const [amount, setAmount] = useState(centsToInput(line.budgetedCents, lang));
  const [error, setError] = useState<string>();
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const parsed = parseMoneyField(amount, lang, true);
    if (parsed.error) return setError(t(`fields.${parsed.error}`));
    onSubmit(parsed.cents ?? 0);
  };
  return (
    <form className="cost-inline-form cost-pay-form" onSubmit={submit} noValidate>
      <Field label={t('costs.paidAmount')} error={error}>
        {(p) => <MoneyInput {...p} value={amount} onChange={setAmount} />}
      </Field>
      <div className="inline-actions">
        <Button type="submit" size="sm" variant="primary" disabled={pending}>
          {t('costs.confirmPaid')}
        </Button>
        <Button size="sm" onClick={onCancel}>
          {t('common.cancel')}
        </Button>
      </div>
    </form>
  );
}

function EditLineForm({
  line,
  pending,
  onSubmit,
  onCancel,
}: {
  line: CostLine;
  pending: boolean;
  onSubmit: (body: { description: string | null; budgetedCents: number }) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const lang = useLang();
  const [description, setDescription] = useState(line.description ?? '');
  const [budget, setBudget] = useState(centsToInput(line.budgetedCents, lang));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const parsed = parseMoneyField(budget, lang, true);
    const next: Record<string, string> = {};
    if (parsed.error) next.budget = t(`fields.${parsed.error}`);
    if (needsDescription(line.type) && !description.trim()) {
      next.description = t('fields.DESCRIPTION_REQUIRED');
    }
    setErrors(next);
    if (Object.keys(next).length === 0) {
      onSubmit({ description: description.trim() || null, budgetedCents: parsed.cents ?? 0 });
    }
  };
  return (
    <form className="cost-inline-form" onSubmit={submit} noValidate>
      <div className="form-row">
        <Field label={t('costs.budgeted')} error={errors.budget}>
          {(p) => <MoneyInput {...p} value={budget} onChange={setBudget} />}
        </Field>
        <Field label={t('costs.description')} error={errors.description}>
          {(p) => (
            <input {...p} type="text" value={description} onChange={(e) => setDescription(e.target.value)} />
          )}
        </Field>
      </div>
      <div className="inline-actions">
        <Button type="submit" size="sm" variant="primary" disabled={pending}>
          {t('common.save')}
        </Button>
        <Button size="sm" onClick={onCancel}>
          {t('common.cancel')}
        </Button>
      </div>
    </form>
  );
}

function AddCostLineForm({
  gig,
  people,
  onDone,
  onCancel,
}: {
  gig: GigDetail;
  people: Person[] | undefined;
  onDone: (result: GigWithWarnings) => void;
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
      costLinesApi.create(gig.id, {
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

  const onTypeChange = (code: CostType | '') => {
    setType(code);
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
            <PersonSelect id={p.id} label={t('costs.person')} value={personId} people={people} onChange={setPersonId} />
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
