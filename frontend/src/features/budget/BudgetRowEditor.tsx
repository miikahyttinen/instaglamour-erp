import { useLayoutEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { BudgetRow, BudgetRowUpdate } from '../../api/types';
import { InlineMoney } from '../../components/inline';
import { StatusTag } from '../../components/StatusTag';
import { useLang } from '../../i18n/useLang';
import { centsToInput, formatMoney } from '../../lib/format';
import { AMOUNT_FIELDS, BUDGET_FIELDS, FIELD_LABEL_KEYS, useSaveBudgetRow, type AmountField } from './queries';
import { varianceClass } from './variance';

interface Props {
  row: BudgetRow;
  categoryName: string;
  /** false = actuals-only category (e.g. fuel): no budget cells, budget sent as 0 (UC-020 A2). */
  budgeted: boolean;
}

/**
 * One budget category as a table row (desktop) / card (phone). Each money cell is edited in
 * place and saves on blur / Enter (NFR-8) by PUTting the whole row; no Save/Cancel buttons.
 */
export function BudgetRowEditor({ row, categoryName, budgeted }: Props) {
  const { t } = useTranslation();
  const lang = useLang();
  const save = useSaveBudgetRow(row.year, row.categoryId);
  const editable = AMOUNT_FIELDS.filter((f) => budgeted || !BUDGET_FIELDS.includes(f));

  // PUT replaces the whole row, so cell saves run one after another and each one sends the
  // newest value of every cell (a cell saved while another is in flight must not undo it).
  const savedRef = useRef(row);
  const pendingRef = useRef<Partial<Record<AmountField, number>>>({});
  const queueRef = useRef<Promise<unknown>>(Promise.resolve());
  useLayoutEffect(() => {
    savedRef.current = row;
  }, [row]);

  const saveCell = (f: AmountField, cents: number) => {
    pendingRef.current[f] = cents;
    const run = async () => {
      const body: BudgetRowUpdate = {
        budgetExpenseCents: 0,
        budgetIncomeCents: 0,
        actualExpenseCents: 0,
        actualIncomeCents: 0,
      };
      for (const k of editable) body[k] = pendingRef.current[k] ?? savedRef.current[k];
      try {
        savedRef.current = await save.mutateAsync(body);
      } finally {
        // Saved, or failed (the cell keeps its typed text and retries on the next blur).
        if (pendingRef.current[f] === cents) delete pendingRef.current[f];
      }
    };
    const result = queueRef.current.then(run, run);
    queueRef.current = result.catch(() => undefined);
    return result;
  };

  const moneyCell = (f: AmountField) => {
    if (!editable.includes(f)) {
      return <td key={f} className="budget-na" />;
    }
    const fieldLabel = t(FIELD_LABEL_KEYS[f]);
    return (
      <td key={f} className="num budget-input" data-label={fieldLabel}>
        <InlineMoney
          label={t('budget.inputLabel', { field: fieldLabel, category: categoryName })}
          hideLabel
          field={f}
          value={row[f]}
          placeholder={centsToInput(0, lang)}
          onSave={(cents) => saveCell(f, cents ?? 0)}
        />
      </td>
    );
  };

  const varianceExpense = row.varianceExpenseCents;
  const varianceIncome = row.varianceIncomeCents;
  return (
    <tr className="budget-row">
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
    </tr>
  );
}
