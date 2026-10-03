import { useMutation } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { CostType } from '../api/enums';
import { isMusicianRole } from '../api/enums';
import { costLinesApi } from '../api/endpoints';
import type { CostLine, GigDetail, GigWithWarnings, Person, Warning } from '../api/types';
import { Dialog } from '../components/Dialog';
import { Field, MoneyInput } from '../components/fields';
import { apiErrorMessage, apiFieldErrors, costTypeLabel } from '../i18n/labels';
import { useLang } from '../i18n/useLang';
import { centsToInput, formatDateTime, formatMoney } from '../lib/format';
import { parseMoneyField } from '../lib/moneyField';
import { usePartner, useReference } from '../reference/useReference';
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

  return (
    <div className="cost-list">
      {gig.notFullyStaffed && (
        <p className="badge badge-warn" role="note">
          {t('gigs.notFullyStaffed')}
        </p>
      )}
      {gig.costLines.length === 0 ? (
        <p className="muted">{t('costs.empty')}</p>
      ) : (
        <ul className="cost-lines" aria-label={t('gig.sections.costs')}>
          {gig.costLines.map((line) => (
            <CostLineItem
              key={line.id}
              line={line}
              people={people}
              readOnly={readOnly}
              onResult={onResult}
            />
          ))}
        </ul>
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
          <button type="button" className="btn" onClick={() => setAdding(true)}>
            + {t('costs.add')}
          </button>
        ))}
    </div>
  );
}

interface LineProps {
  line: CostLine;
  people: Person[] | undefined;
  readOnly: boolean;
  onResult: (result: GigWithWarnings) => void;
}

function CostLineItem({ line, people, readOnly, onResult }: LineProps) {
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

  return (
    <li className={`cost-line${paid ? ' is-paid' : ''}`} aria-label={label}>
      <div className="cost-head">
        <span className="cost-type">
          <strong>{typeLabel}</strong>
          {line.description && <span className="muted"> · {line.description}</span>}
        </span>
        <span className="cost-budget">
          <span className="cell-label">{t('costs.budgeted')} </span>
          <strong>{formatMoney(line.budgetedCents, lang)}</strong>
        </span>
      </div>

      <div className="cost-body">
        <div className="cost-person">
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
        </div>

        {musician && (
          <label className="switch">
            <input
              type="checkbox"
              role="switch"
              checked={line.joinsLoadIn === true}
              disabled={readOnly || mutation.isPending}
              onChange={(e) =>
                run(() => costLinesApi.update(line.id, { joinsLoadIn: e.target.checked }))
              }
            />
            <span>{t('costs.loadIn')}</span>
          </label>
        )}

        <div className="cost-paid">
          {paid ? (
            <span className="paid-info">
              {t('costs.paidInfo', {
                amount: formatMoney(line.actualCents, lang),
                time: formatDateTime(line.paidAt, lang),
                partner: paidBy?.name ?? '–',
              })}
            </span>
          ) : line.type === 'FUEL' ? (
            <span className="muted small">{t('costs.fuelHint')}</span>
          ) : (
            <span className="muted small">{t('costs.unpaid')}</span>
          )}
        </div>
      </div>

      {mutation.isError && (
        <p className="field-error" role="alert">
          {Object.values(apiFieldErrors(t, mutation.error))[0] ?? apiErrorMessage(t, mutation.error)}
        </p>
      )}

      {!readOnly && mode === 'view' && (
        <div className="inline-actions">
          {paid ? (
            <button
              type="button"
              className="btn btn-small"
              disabled={mutation.isPending}
              onClick={() => run(() => costLinesApi.unpay(line.id))}
            >
              {t('costs.unmarkPaid')}
            </button>
          ) : (
            line.type !== 'FUEL' && (
              <button type="button" className="btn btn-small" onClick={() => setMode('pay')}>
                {t('costs.markPaid')}
              </button>
            )
          )}
          <button type="button" className="btn btn-small" onClick={() => setMode('edit')}>
            {t('common.edit')}
          </button>
          <button type="button" className="btn btn-small btn-danger" onClick={() => setMode('remove')}>
            {t('common.remove')}
          </button>
        </div>
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
      {mode === 'remove' && (
        <Dialog title={t('costs.removeTitle')} onClose={() => setMode('view')}>
          <p>{t('costs.removeConfirm', { line: label })}</p>
          {paid && (
            <p className="notice notice-error">
              {t('costs.removePaidWarning', { amount: formatMoney(line.actualCents, lang) })}
            </p>
          )}
          {mutation.isError && (
            <p className="notice notice-error" role="alert">
              {apiErrorMessage(t, mutation.error)}
            </p>
          )}
          <div className="form-actions">
            <button
              type="button"
              className="btn btn-danger-solid"
              disabled={mutation.isPending}
              onClick={() => run(() => costLinesApi.remove(line.id))}
            >
              {t('common.remove')}
            </button>
            <button type="button" className="btn" onClick={() => setMode('view')}>
              {t('common.cancel')}
            </button>
          </div>
        </Dialog>
      )}
    </li>
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
    <form className="inline-form" onSubmit={submit} noValidate>
      <Field label={t('costs.paidAmount')} error={error}>
        {(p) => <MoneyInput {...p} value={amount} onChange={setAmount} />}
      </Field>
      <div className="inline-actions">
        <button type="submit" className="btn btn-small btn-primary" disabled={pending}>
          {t('costs.confirmPaid')}
        </button>
        <button type="button" className="btn btn-small" onClick={onCancel}>
          {t('common.cancel')}
        </button>
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
    <form className="inline-form" onSubmit={submit} noValidate>
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
        <button type="submit" className="btn btn-small btn-primary" disabled={pending}>
          {t('common.save')}
        </button>
        <button type="button" className="btn btn-small" onClick={onCancel}>
          {t('common.cancel')}
        </button>
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
    <form className="inline-form add-line" onSubmit={submit} noValidate aria-label={t('costs.addTitle')}>
      <h3>{t('costs.addTitle')}</h3>
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
        <p className="notice notice-error" role="alert">
          {apiErrorMessage(t, add.error)}
        </p>
      )}
      <div className="inline-actions">
        <button type="submit" className="btn btn-primary" disabled={add.isPending}>
          {t('costs.add')}
        </button>
        <button type="button" className="btn" onClick={onCancel}>
          {t('common.cancel')}
        </button>
      </div>
    </form>
  );
}
