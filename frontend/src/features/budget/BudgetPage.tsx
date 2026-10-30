import { Copy, RotateCw, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { BudgetCategory } from '../../api/types';
import { useSelectedYear } from '../../auth/SignedInContext';
import { Button } from '../../components/Button';
import { Dialog } from '../../components/Dialog';
import { Notice } from '../../components/Notice';
import { PageHead } from '../../components/PageHead';
import { PageYearSelector } from '../../components/PageYearSelector';
import { SectionLabel } from '../../components/SectionLabel';
import { StatGrid, StatTile } from '../../components/StatTile';
import { apiErrorMessage } from '../../i18n/labels';
import { useLang } from '../../i18n/useLang';
import { formatMoney } from '../../lib/format';
import { useReference } from '../../reference/useReference';
import { BudgetRowEditor } from './BudgetRowEditor';
import { BudgetRowForm } from './BudgetRowForm';
import {
  AMOUNT_FIELDS,
  FIELD_LABEL_KEYS,
  useBudget,
  useCopyBudget,
  useCreateBudgetRow,
  useRemoveBudgetRow,
} from './queries';
import { varianceClass } from './variance';
import './budget.css';

type Notice = { kind: 'success' | 'error'; text: string } | null;

/**
 * Yearly budget (UC-020): one row per active budget row with totals. Partners add rows (form +
 * Add), rename them in place and remove them after a confirmation (A2–A4). Money cells save on
 * blur (NFR-8); totals and variances come from the saved rows.
 */
export function BudgetPage() {
  const { t } = useTranslation();
  const lang = useLang();
  const year = useSelectedYear();
  const reference = useReference();
  const budget = useBudget(year);
  const copy = useCopyBudget(year);
  const create = useCreateBudgetRow();
  const remove = useRemoveBudgetRow();
  const [removing, setRemoving] = useState<BudgetCategory | null>(null);
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

  const onAdd = async (name: string) => {
    show(null);
    const created = await create.mutateAsync(name);
    show({ kind: 'success', text: t('budget.added', { name: created.name }) });
  };

  const closeRemove = () => {
    setRemoving(null);
    remove.reset();
  };
  const onRemoveConfirm = (category: BudgetCategory) => {
    remove.mutate(category.id, {
      onSuccess: () => {
        closeRemove();
        show({ kind: 'success', text: t('budget.removed', { name: category.name }) });
      },
    });
  };

  // A row added by another partner shows up in the budget before this session's cached reference
  // knows its name: refresh the reference once (it is otherwise loaded once per session).
  const knownIds = new Set(reference.data?.budgetCategories.map((c) => c.id) ?? []);
  const hasUnknownRow = !!reference.data && !!budget.data?.rows.some((r) => !knownIds.has(r.categoryId));
  const refetchReference = reference.refetch;
  const referenceFetching = reference.isFetching;
  useEffect(() => {
    if (hasUnknownRow && !referenceFetching) void refetchReference();
  }, [hasUnknownRow, referenceFetching, refetchReference]);

  const head = (
    <PageHead
      title={t('pages.budget', { year })}
      subtitle={t('budget.intro')}
      actions={
        <Button icon={Copy} onClick={onCopy} disabled={copy.isPending || !budget.data}>
          {copy.isPending ? t('budget.copying') : t('budget.copy')}
        </Button>
      }
    >
      <PageYearSelector />
    </PageHead>
  );

  if (budget.isError || reference.isError) {
    return (
      <section className="page budget-page">
        {head}
        <Notice tone="danger" role="alert">
          <p>{t('app.loadFailed')}</p>
          <Button
            size="sm"
            icon={RotateCw}
            onClick={() => {
              if (budget.isError) void budget.refetch();
              if (reference.isError) void reference.refetch();
            }}
          >
            {t('app.retry')}
          </Button>
        </Notice>
      </section>
    );
  }

  if (!budget.data || !reference.data) {
    return (
      <section className="page budget-page">
        {head}
        <p className="muted">{t('app.loading')}</p>
      </section>
    );
  }

  const categories = reference.data.budgetCategories;
  const order = new Map(categories.map((c, i) => [c.id, i]));
  const byId = new Map<string, BudgetCategory>(categories.map((c) => [c.id, c]));
  // Only rows the reference knows (a just-removed row disappears at once; an unknown one waits for
  // the reference refetch above), in the reference order.
  const rows = budget.data.rows
    .filter((r) => byId.has(r.categoryId))
    .sort((a, b) => order.get(a.categoryId)! - order.get(b.categoryId)!);
  const totals = budget.data.totals;
  const money = (cents: number) => formatMoney(cents, lang);

  return (
    <section className="page budget-page">
      {head}
      <p className="meta budget-hint">{t('budget.copyHint', { year: year - 1 })}</p>
      {currentNotice && (
        <Notice
          tone={currentNotice.kind === 'error' ? 'danger' : 'ok'}
          role={currentNotice.kind === 'error' ? 'alert' : 'status'}
        >
          {currentNotice.text}
        </Notice>
      )}

      {rows.length === 0 ? (
        <p className="budget-empty">{t('budget.empty')}</p>
      ) : (
        <>
          <StatGrid className="budget-stats">
            <StatTile
              label={t('budget.expenses')}
              value={money(totals.actualExpenseCents)}
              caption={t('budget.actual')}
              secondaryValue={money(totals.budgetExpenseCents)}
              secondaryCaption={t('budget.budgeted')}
            />
            <StatTile
              label={t('budget.income')}
              value={money(totals.actualIncomeCents)}
              caption={t('budget.actual')}
              secondaryValue={money(totals.budgetIncomeCents)}
              secondaryCaption={t('budget.budgeted')}
            />
            <StatTile
              label={t('budget.varianceExpense')}
              value={
                <span className={varianceClass('expense', totals.varianceExpenseCents)}>
                  {money(totals.varianceExpenseCents)}
                </span>
              }
            />
            <StatTile
              label={t('budget.varianceIncome')}
              value={
                <span className={varianceClass('income', totals.varianceIncomeCents)}>
                  {money(totals.varianceIncomeCents)}
                </span>
              }
            />
          </StatGrid>

          <SectionLabel>{t('budget.categories')}</SectionLabel>
          <div className="table-wrap budget-table-wrap">
            <table className="data-table budget-table">
              <caption className="visually-hidden">{t('pages.budget', { year })}</caption>
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
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <BudgetRowEditor
                    // A year change starts fresh fields; the cells re-format themselves on a language change.
                    key={`${year}:${row.categoryId}`}
                    row={row}
                    category={byId.get(row.categoryId)!}
                    onRemove={setRemoving}
                  />
                ))}
              </tbody>
              <tfoot>
                <tr className="budget-row budget-totals">
                  <th scope="row" className="budget-category">
                    {t('budget.totals')}
                  </th>
                  {AMOUNT_FIELDS.map((f) => (
                    <td key={f} className="num" data-label={t(FIELD_LABEL_KEYS[f])}>
                      {money(totals[f])}
                    </td>
                  ))}
                  <td
                    className={`num ${varianceClass('expense', totals.varianceExpenseCents)}`}
                    data-label={t('budget.varianceExpense')}
                  >
                    {money(totals.varianceExpenseCents)}
                  </td>
                  <td
                    className={`num ${varianceClass('income', totals.varianceIncomeCents)}`}
                    data-label={t('budget.varianceIncome')}
                  >
                    {money(totals.varianceIncomeCents)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}

      <section className="budget-add" aria-labelledby="budget-add-title">
        <SectionLabel id="budget-add-title">{t('budget.addTitle')}</SectionLabel>
        <BudgetRowForm
          pending={create.isPending}
          error={create.error}
          onSubmit={onAdd}
          onEdit={() => {
            if (create.isError) create.reset();
          }}
        />
      </section>

      {removing && (
        <Dialog title={t('budget.removeTitle')} onClose={closeRemove}>
          <p>{t('budget.removeText', { name: removing.name })}</p>
          {remove.isError && (
            <p className="notice notice-error" role="alert">
              {apiErrorMessage(t, remove.error)}
            </p>
          )}
          <div className="form-actions">
            <Button
              variant="danger"
              icon={Trash2}
              disabled={remove.isPending}
              onClick={() => onRemoveConfirm(removing)}
            >
              {remove.isPending ? t('budget.removing') : t('budget.removeConfirm')}
            </Button>
            <Button onClick={closeRemove}>{t('common.cancel')}</Button>
          </div>
        </Dialog>
      )}
    </section>
  );
}
