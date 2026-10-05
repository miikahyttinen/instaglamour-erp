import { Trash2 } from 'lucide-react';
import { useLayoutEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { BudgetCategory, BudgetRow, BudgetRowUpdate } from '../../api/types';
import { IconButton } from '../../components/Button';
import { InlineMoney, InlineText } from '../../components/inline';
import { useLang } from '../../i18n/useLang';
import { centsToInput, formatMoney } from '../../lib/format';
import { AMOUNT_FIELDS, FIELD_LABEL_KEYS, useRenameBudgetRow, useSaveBudgetRow, type AmountField } from './queries';
import { varianceClass } from './variance';

interface Props {
  row: BudgetRow;
  category: BudgetCategory;
  /** Opens the remove confirmation for this row (UC-020 A4). */
  onRemove: (category: BudgetCategory) => void;
}

const MAX_NAME = 500;

/**
 * One budget row as a table row (desktop) / card (phone). The name and each money cell are edited
 * in place and save on blur / Enter (NFR-8): the name with PATCH /api/budget-categories/{id}, the
 * money cells by PUTting the whole year row. Every row has budget and actual cells (UC-020 AC-4).
 */
export function BudgetRowEditor({ row, category, onRemove }: Props) {
  const { t } = useTranslation();
  const lang = useLang();
  const save = useSaveBudgetRow(row.year, row.categoryId);
  const rename = useRenameBudgetRow();
  const categoryName = category.name;

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
      for (const k of AMOUNT_FIELDS) body[k] = pendingRef.current[k] ?? savedRef.current[k];
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
        <span className="budget-category-cell">
          <InlineText
            className="budget-name"
            label={t('budget.rowNameOf', { name: categoryName })}
            hideLabel
            required
            maxLength={MAX_NAME}
            field="name"
            value={categoryName}
            onSave={(name) => rename.mutateAsync({ id: category.id, name })}
          />
          <IconButton
            icon={Trash2}
            className="budget-remove"
            label={t('budget.removeOf', { name: categoryName })}
            onClick={() => onRemove(category)}
          />
        </span>
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
