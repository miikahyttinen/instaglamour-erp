import { screen, waitFor, within } from '@testing-library/react';
import { http } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import type { BudgetRowUpdate } from '../../api/types';
import { formatMoney } from '../../lib/format';
import { budgetStore, resetMockBudget, setMockBudget } from '../../mocks/budgetHandlers';
import { db } from '../../mocks/data';
import { errorResponse } from '../../mocks/util';
import { server } from '../../mocks/server';
import { renderApp, signInMock } from '../../test/renderApp';

// Synthetic amounts only (BR-090).
const YEAR = 2030;
const [A, B, C] = ['201', '202', '203'].map((n) => `00000000-0000-4000-8000-000000000${n}`) as [
  string,
  string,
  string,
];
const fi = (cents: number) => formatMoney(cents, 'fi');
const en = (cents: number) => formatMoney(cents, 'en');

function seedYear() {
  setMockBudget(YEAR, A, { budgetExpenseCents: 100000, actualExpenseCents: 10000 });
  setMockBudget(YEAR, B, { budgetIncomeCents: 200000, actualIncomeCents: 100000 });
  setMockBudget(YEAR, C, { actualExpenseCents: 10000 });
}

function open(email?: string, year = YEAR) {
  const partner = signInMock(email);
  partner.selectedYear = year;
  return renderApp('/budget');
}

const rowOf = (name: string) => screen.getByRole('rowheader', { name: new RegExp(`^${name}`) }).closest('tr')!;
const variance = (row: HTMLElement) =>
  [...row.querySelectorAll('.budget-variance')].map((c) => c.textContent);
const cells = (row: HTMLElement) => within(row).getAllByRole('cell').map((c) => c.textContent);

function capturePuts() {
  const puts: { path: string; body: BudgetRowUpdate }[] = [];
  server.events.on('request:start', async ({ request }) => {
    if (request.method === 'PUT') {
      puts.push({ path: new URL(request.url).pathname, body: (await request.clone().json()) as BudgetRowUpdate });
    }
  });
  return puts;
}

beforeEach(() => {
  resetMockBudget();
  server.events.removeAllListeners();
});

describe('budget page', () => {
  it('shows one row per category with budget, actual, variance and totals', async () => {
    seedYear();
    open();
    expect(await screen.findByRole('heading', { name: 'Budjetti 2030' })).toBeInTheDocument();
    await screen.findByRole('rowheader', { name: /^Kategoria A/ });

    const bodyRows = within(screen.getAllByRole('rowgroup')[1]!).getAllByRole('row');
    expect(bodyRows.map((r) => within(r).getByRole('rowheader').textContent)).toEqual([
      'Kategoria A',
      'Kategoria B',
      'Kategoria CVain toteuma',
    ]);

    expect(screen.getByLabelText('Budjetti, kulut, Kategoria A')).toHaveValue('1000,00');
    expect(screen.getByLabelText('Toteuma, kulut, Kategoria A')).toHaveValue('100,00');
    expect(screen.getByLabelText('Budjetti, tulot, Kategoria B')).toHaveValue('2000,00');
    expect(screen.getByLabelText('Toteuma, tulot, Kategoria B')).toHaveValue('1000,00');

    // Variance = budget − actual (BR-060)
    expect(variance(rowOf('Kategoria A'))).toEqual([fi(90000), fi(0)]);
    expect(variance(rowOf('Kategoria B'))).toEqual([fi(0), fi(100000)]);
    expect(variance(rowOf('Kategoria C'))).toEqual([fi(-10000), fi(0)]);

    const totals = rowOf('Yhteensä');
    expect(cells(totals)).toEqual([
      fi(100000), // budget expense
      fi(200000), // budget income
      fi(20000), // actual expense
      fi(100000), // actual income
      fi(80000), // variance expense
      fi(100000), // variance income
      '',
    ]);
  });

  it('uses English category names and texts for an English partner', async () => {
    seedYear();
    open('partner.b@example.com');
    expect(await screen.findByRole('heading', { name: 'Budget 2030' })).toBeInTheDocument();
    await screen.findByRole('rowheader', { name: /^Category A/ });
    expect(screen.getByLabelText('Budget, expense, Category A')).toHaveValue('1000.00');
    expect(cells(rowOf('Total'))[0]).toBe(en(100000));
    expect(screen.getByRole('button', { name: 'Copy budget from previous year' })).toBeInTheDocument();
  });

  it('actuals-only categories have no budget cells', async () => {
    seedYear();
    open();
    await screen.findByRole('rowheader', { name: /^Kategoria C/ });
    expect(screen.queryByLabelText('Budjetti, kulut, Kategoria C')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Budjetti, tulot, Kategoria C')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Toteuma, kulut, Kategoria C')).toHaveValue('100,00');
    expect(screen.getByLabelText('Toteuma, tulot, Kategoria C')).toBeInTheDocument();
    expect(within(rowOf('Kategoria C')).getByText('Vain toteuma')).toBeInTheDocument();
  });

  it('edits a row inline in euros and saves it as cents', async () => {
    seedYear();
    const puts = capturePuts();
    const { user } = open();
    const input = await screen.findByLabelText('Budjetti, kulut, Kategoria A');
    const save = screen.getByRole('button', { name: 'Tallenna Kategoria A' });
    expect(save).toBeDisabled();

    await user.clear(input);
    await user.type(input, '3 000');
    // Live variance while typing
    expect(variance(rowOf('Kategoria A'))).toEqual([fi(290000), fi(0)]);
    await user.click(save);

    expect(await screen.findByRole('status')).toHaveTextContent('Tallennettu: Kategoria A.');
    expect(puts).toEqual([
      {
        path: `/api/budget/${YEAR}/${A}`,
        body: { budgetExpenseCents: 300000, budgetIncomeCents: 0, actualExpenseCents: 10000, actualIncomeCents: 0 },
      },
    ]);
    expect(budgetStore.get(`${YEAR}:${A}`)?.budgetExpenseCents).toBe(300000);
    expect(screen.getByLabelText('Budjetti, kulut, Kategoria A')).toHaveValue('3000,00');
    expect(cells(rowOf('Yhteensä'))[0]).toBe(fi(300000));
    expect(cells(rowOf('Yhteensä'))[4]).toBe(fi(280000));
    expect(screen.getByRole('button', { name: 'Tallenna Kategoria A' })).toBeDisabled();
  });

  it('saves an actuals-only row with zero budget fields; empty input counts as 0', async () => {
    seedYear();
    const puts = capturePuts();
    const { user } = open();
    const input = await screen.findByLabelText('Toteuma, kulut, Kategoria C');
    await user.clear(input);
    await user.type(input, '10');
    await user.click(screen.getByRole('button', { name: 'Tallenna Kategoria C' }));
    await screen.findByRole('status');
    expect(puts[0]!.body).toEqual({
      budgetExpenseCents: 0,
      budgetIncomeCents: 0,
      actualExpenseCents: 1000,
      actualIncomeCents: 0,
    });
  });

  it('rejects negative and invalid amounts without saving', async () => {
    seedYear();
    const puts = capturePuts();
    const { user } = open();
    const expense = await screen.findByLabelText('Toteuma, kulut, Kategoria A');
    const income = screen.getByLabelText('Toteuma, tulot, Kategoria A');
    await user.clear(expense);
    await user.type(expense, '-10');
    await user.clear(income);
    await user.type(income, 'abc');
    await user.click(screen.getByRole('button', { name: 'Tallenna Kategoria A' }));

    expect(screen.getByText('Summa ei voi olla negatiivinen.')).toBeInTheDocument();
    expect(screen.getByText('Virheellinen arvo.')).toBeInTheDocument();
    expect(expense).toHaveAttribute('aria-invalid', 'true');
    expect(puts).toEqual([]);
  });

  it('shows translated server errors, never the server message', async () => {
    seedYear();
    server.use(
      http.put('/api/budget/:year/:categoryId', () =>
        errorResponse(400, 'VALIDATION_ERROR', 'Internal English text', { actualIncomeCents: 'NEGATIVE_AMOUNT' }),
      ),
    );
    const { user } = open();
    const input = await screen.findByLabelText('Toteuma, tulot, Kategoria B');
    await user.clear(input);
    await user.type(input, '10');
    await user.click(screen.getByRole('button', { name: 'Tallenna Kategoria B' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Tarkista lomakkeen tiedot.');
    expect(screen.getByText('Summa ei voi olla negatiivinen.')).toBeInTheDocument();
    expect(screen.queryByText(/Internal English text/)).not.toBeInTheDocument();
  });

  it('cancel discards unsaved edits', async () => {
    seedYear();
    const { user } = open();
    const input = await screen.findByLabelText('Budjetti, tulot, Kategoria B');
    await user.clear(input);
    await user.type(input, '10');
    await user.click(screen.getByRole('button', { name: 'Peru muutokset: Kategoria B' }));
    expect(screen.getByLabelText('Budjetti, tulot, Kategoria B')).toHaveValue('2000,00');
    expect(screen.getByRole('button', { name: 'Tallenna Kategoria B' })).toBeDisabled();
  });

  it('copies budget numbers (not actuals) from the previous year', async () => {
    seedYear();
    setMockBudget(YEAR + 1, C, { actualExpenseCents: 1000 });
    const { user } = open(undefined, YEAR + 1);
    await screen.findByLabelText('Budjetti, kulut, Kategoria A');
    expect(screen.getByLabelText('Budjetti, kulut, Kategoria A')).toHaveValue('0,00');

    await user.click(screen.getByRole('button', { name: 'Kopioi budjetti edellisestä vuodesta' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Budjetti kopioitu vuodesta 2030.');
    expect(screen.getByLabelText('Budjetti, kulut, Kategoria A')).toHaveValue('1000,00');
    expect(screen.getByLabelText('Budjetti, tulot, Kategoria B')).toHaveValue('2000,00');
    // Actuals untouched: previous year's actuals are not copied, this year's stay.
    expect(screen.getByLabelText('Toteuma, kulut, Kategoria A')).toHaveValue('0,00');
    expect(screen.getByLabelText('Toteuma, kulut, Kategoria C')).toHaveValue('10,00');
  });

  it('shows the BUDGET_NOT_EMPTY message when the year already has budget numbers', async () => {
    seedYear();
    const { user } = open();
    await screen.findByLabelText('Budjetti, kulut, Kategoria A');
    await user.click(screen.getByRole('button', { name: 'Kopioi budjetti edellisestä vuodesta' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Vuodelle on jo budjettilukuja.');
    expect(screen.getByLabelText('Budjetti, kulut, Kategoria A')).toHaveValue('1000,00');
  });

  it('follows the selected year', async () => {
    seedYear();
    const { user } = open();
    await screen.findByLabelText('Budjetti, kulut, Kategoria A');
    await user.click(screen.getByRole('button', { name: 'Seuraava vuosi' }));
    expect(await screen.findByRole('heading', { name: 'Budjetti 2031' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText('Budjetti, kulut, Kategoria A')).toHaveValue('0,00'));
    expect(db.partners[0]!.selectedYear).toBe(YEAR + 1);
  });

  it('renders each row as a labelled card on phones (cells carry their labels)', async () => {
    seedYear();
    open();
    await screen.findByRole('rowheader', { name: /^Kategoria A/ });
    const rowA = rowOf('Kategoria A');
    expect(rowA).toHaveClass('budget-row');
    const labels = within(rowA)
      .getAllByRole('cell')
      .map((c) => c.getAttribute('data-label'))
      .filter(Boolean);
    expect(labels).toEqual([
      'Budjetti, kulut',
      'Budjetti, tulot',
      'Toteuma, kulut',
      'Toteuma, tulot',
      'Poikkeama, kulut',
      'Poikkeama, tulot',
    ]);
  });

  it('shows a load error with retry', async () => {
    server.use(http.get('/api/budget', () => errorResponse(500, 'VALIDATION_ERROR', 'x')));
    open();
    expect(await screen.findByRole('alert')).toHaveTextContent('Tietojen lataus epäonnistui.');
  });
});
