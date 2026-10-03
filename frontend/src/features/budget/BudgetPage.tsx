import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { BudgetCategory } from '../../api/types';
import { useSelectedYear } from '../../auth/SignedInContext';
import { apiErrorMessage, budgetCategoryName } from '../../i18n/labels';
import { useLang } from '../../i18n/useLang';
import { formatMoney } from '../../lib/format';
import { useReference } from '../../reference/useReference';
import { BudgetRowEditor } from './BudgetRowEditor';
import { AMOUNT_FIELDS, FIELD_LABEL_KEYS, useBudget, useCopyBudget } from './queries';
import './budget.css';

type Notice = { kind: 'success' | 'error'; text: string } | null;

/** Yearly budget (UC-020): one row per active category, edited inline, with totals. */
export function BudgetPage() {
  const { t } = useTranslation();
  const lang = useLang();
  const year = useSelectedYear();
  const reference = useReference();
  const budget = useBudget(year);
  const copy = useCopyBudget(year);
  const [notice, setNotice] = useState<{ year: number; value: Notice }>({ year, value: null });
  // Notices belong to the year they were shown for.
  const currentNotice = notice.year === year ? notice.value : null;
  const show = (value: Notice) => setNotice({ year, value });

  const onCopy = () => {
    show(null);
    copy.mutate(undefined, {
      onSuccess: () => show({ kind: 'success', text: t('budget.copied', { year: year - 1 }) }),
      onError: (error) => show({ kind: 'error', text: apiErrorMessage(t, error) }),
    });
  };

  const head = (
    <div className="page-head">
      <h1>{t('pages.budget', { year })}</h1>
      <button type="button" className="btn" onClick={onCopy} disabled={copy.isPending || !budget.data}>
        {copy.isPending ? t('budget.copying') : t('budget.copy')}
      </button>
    </div>
  );

  if (budget.isError || reference.isError) {
    return (
      <section className="page">
        {head}
        <div className="notice notice-error" role="alert">
          <p>{t('app.loadFailed')}</p>
          <button
            type="button"
            className="btn btn-small"
            onClick={() => {
              if (budget.isError) void budget.refetch();
              if (reference.isError) void reference.refetch();
            }}
          >
            {t('app.retry')}
          </button>
        </div>
      </section>
    );
  }

  if (!budget.data || !reference.data) {
    return (
      <section className="page">
        {head}
        <p className="muted">{t('app.loading')}</p>
      </section>
    );
  }

  const categories = reference.data.budgetCategories;
  const order = new Map(categories.map((c, i) => [c.id, i]));
  const byId = new Map<string, BudgetCategory>(categories.map((c) => [c.id, c]));
  const rows = [...budget.data.rows].sort(
    (a, b) => (order.get(a.categoryId) ?? Infinity) - (order.get(b.categoryId) ?? Infinity),
  );
  const totals = budget.data.totals;

  return (
    <section className="page budget-page">
      {head}
      <p className="muted small">{t('budget.intro')}</p>
      <p className="muted small">{t('budget.copyHint', { year: year - 1 })}</p>
      {currentNotice && (
        <div
          className={`notice${currentNotice.kind === 'error' ? ' notice-error' : ''}`}
          role={currentNotice.kind === 'error' ? 'alert' : 'status'}
        >
          {currentNotice.text}
        </div>
      )}

      {rows.length === 0 ? (
        <p className="empty muted">{t('budget.empty')}</p>
      ) : (
        <table className="budget-table">
          <thead>
            <tr>
              <th scope="col">{t('budget.category')}</th>
              {AMOUNT_FIELDS.map((f) => (
                <th key={f} scope="col" className="num">
                  {t(FIELD_LABEL_KEYS[f])}
                </th>
              ))}
              <th scope="col" className="num">
                {t('budget.varianceExpense')}
              </th>
              <th scope="col" className="num">
                {t('budget.varianceIncome')}
              </th>
              <th scope="col">
                <span className="visually-hidden">{t('budget.actions')}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const category = byId.get(row.categoryId);
              return (
                <BudgetRowEditor
                  // Year or language change discards unsaved edits (typed text is language-specific).
                  key={`${year}:${row.categoryId}:${lang}`}
                  row={row}
                  categoryName={category ? budgetCategoryName(category, lang) : '–'}
                  budgeted={category?.budgeted ?? true}
                  onSaved={(name) => show({ kind: 'success', text: t('budget.saved', { category: name }) })}
                />
              );
            })}
          </tbody>
          <tfoot>
            <tr className="budget-row budget-totals">
              <th scope="row" className="budget-category">
                {t('budget.totals')}
              </th>
              {AMOUNT_FIELDS.map((f) => (
                <td key={f} className="num" data-label={t(FIELD_LABEL_KEYS[f])}>
                  {formatMoney(totals[f], lang)}
                </td>
              ))}
              <td className="num" data-label={t('budget.varianceExpense')}>
                {formatMoney(totals.varianceExpenseCents, lang)}
              </td>
              <td className="num" data-label={t('budget.varianceIncome')}>
                {formatMoney(totals.varianceIncomeCents, lang)}
              </td>
              <td className="budget-na" />
            </tr>
          </tfoot>
        </table>
      )}
    </section>
  );
}
