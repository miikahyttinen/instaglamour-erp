import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { BudgetRow } from '../../api/types';
import { Button } from '../../components/Button';
import { MoneyInput } from '../../components/fields';
import { StatusTag } from '../../components/StatusTag';
import { apiErrorMessage, apiFieldErrors } from '../../i18n/labels';
import { useLang } from '../../i18n/useLang';
import { centsToInput, formatMoney } from '../../lib/format';
import { parseMoneyField } from '../../lib/moneyField';
import { AMOUNT_FIELDS, BUDGET_FIELDS, FIELD_LABEL_KEYS, useSaveBudgetRow, type AmountField } from './queries';
import { varianceClass } from './variance';

type Draft = Record<AmountField, string>;

interface Props {
  row: BudgetRow;
  categoryName: string;
  /** false = actuals-only category (e.g. fuel): no budget cells (UC-020 A2). */
  budgeted: boolean;
  onSaved: (categoryName: string) => void;
}

/** One budget category as a table row (desktop) / card (phone), edited inline and saved per row. */
export function BudgetRowEditor({ row, categoryName, budgeted, onSaved }: Props) {
  const { t } = useTranslation();
  const lang = useLang();
  const baseId = useId();
  const save = useSaveBudgetRow(row.year, row.categoryId);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [errors, setErrors] = useState<Partial<Record<AmountField, string>>>({});
  const [rowError, setRowError] = useState<string | null>(null);

  const editable = AMOUNT_FIELDS.filter((f) => budgeted || !BUDGET_FIELDS.includes(f));
  const text = (f: AmountField) => draft?.[f] ?? centsToInput(row[f], lang);
  const dirty = draft !== null;

  /** Value for live variance: typed amount when it parses, otherwise the saved one. */
  const liveCents = (f: AmountField) => {
    if (!editable.includes(f)) return 0;
    if (!draft) return row[f];
    const parsed = parseMoneyField(draft[f], lang, false);
    return parsed.error ? row[f] : (parsed.cents ?? 0);
  };
  const varianceExpense = liveCents('budgetExpenseCents') - liveCents('actualExpenseCents');
  const varianceIncome = liveCents('budgetIncomeCents') - liveCents('actualIncomeCents');

  const change = (f: AmountField, value: string) => {
    const current = draft ?? (Object.fromEntries(AMOUNT_FIELDS.map((k) => [k, text(k)])) as Draft);
    setDraft({ ...current, [f]: value });
    setErrors((e) => ({ ...e, [f]: undefined }));
    setRowError(null);
  };

  const cancel = () => {
    setDraft(null);
    setErrors({});
    setRowError(null);
  };

  const submit = () => {
    if (!draft) return;
    const body = { budgetExpenseCents: 0, budgetIncomeCents: 0, actualExpenseCents: 0, actualIncomeCents: 0 };
    const nextErrors: Partial<Record<AmountField, string>> = {};
    for (const f of editable) {
      const parsed = parseMoneyField(draft[f], lang, false);
      if (parsed.error) nextErrors[f] = t(`fields.${parsed.error}`);
      else body[f] = parsed.cents ?? 0;
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    setRowError(null);
    save.mutate(body, {
      onSuccess: () => {
        setDraft(null);
        onSaved(categoryName);
      },
      onError: (error) => {
        const fieldErrors = apiFieldErrors(t, error);
        const known = Object.fromEntries(
          Object.entries(fieldErrors).filter(([f]) => (AMOUNT_FIELDS as readonly string[]).includes(f)),
        );
        setErrors(known);
        setRowError(apiErrorMessage(t, error));
      },
    });
  };

  const moneyCell = (f: AmountField) => {
    if (!editable.includes(f)) {
      return <td key={f} className="budget-na" />;
    }
    const id = `${baseId}-${f}`;
    const errorId = `${id}-error`;
    const fieldLabel = t(FIELD_LABEL_KEYS[f]);
    return (
      <td key={f} className="num budget-input" data-label={fieldLabel}>
        <label htmlFor={id} className="visually-hidden">
          {t('budget.inputLabel', { field: fieldLabel, category: categoryName })}
        </label>
        <MoneyInput
          id={id}
          value={text(f)}
          onChange={(v) => change(f, v)}
          aria-invalid={errors[f] ? true : undefined}
          aria-describedby={errors[f] ? errorId : undefined}
          disabled={save.isPending}
        />
        {errors[f] && (
          <p id={errorId} className="field-error small">
            {errors[f]}
          </p>
        )}
      </td>
    );
  };

  return (
    <tr className={`budget-row${dirty ? ' budget-row-dirty' : ''}`}>
      <th scope="row" className="budget-category">
        <span>{categoryName}</span>
        {!budgeted && <StatusTag tone="muted">{t('budget.actualsOnly')}</StatusTag>}
      </th>
      {AMOUNT_FIELDS.map(moneyCell)}
      <td
        className={`num budget-variance ${varianceClass('expense', varianceExpense)}`}
        data-label={t('budget.varianceExpense')}
      >
        {formatMoney(varianceExpense, lang)}
      </td>
      <td
        className={`num budget-variance ${varianceClass('income', varianceIncome)}`}
        data-label={t('budget.varianceIncome')}
      >
        {formatMoney(varianceIncome, lang)}
      </td>
      <td className="budget-actions">
        <div className="budget-actions-inner">
          <Button
            variant={dirty ? 'primary' : 'ghost'}
            size="sm"
            onClick={submit}
            disabled={!dirty || save.isPending}
            aria-label={t('budget.saveRow', { category: categoryName })}
          >
            {save.isPending ? t('budget.saving') : t('budget.save')}
          </Button>
          {dirty && !save.isPending && (
            <Button size="sm" onClick={cancel} aria-label={t('budget.cancelRow', { category: categoryName })}>
              {t('budget.cancel')}
            </Button>
          )}
        </div>
        {rowError && (
          <p role="alert" className="field-error small">
            {rowError}
          </p>
        )}
      </td>
    </tr>
  );
}
