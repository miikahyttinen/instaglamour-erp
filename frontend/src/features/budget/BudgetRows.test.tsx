import { screen, waitFor, within } from '@testing-library/react';
import { http } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import type { ReferenceData } from '../../api/types';
import { formatMoney } from '../../lib/format';
import { setMockBudget } from '../../mocks/budgetHandlers';
import { budgetAmounts } from '../../mocks/budgetStore';
import { db } from '../../mocks/data';
import { server } from '../../mocks/server';
import { errorResponse } from '../../mocks/util';
import { referenceKey } from '../../reference/useReference';
import { renderApp, signInMock } from '../../test/renderApp';

// Partner-managed budget rows (UC-020 A2–A4, E2). Synthetic names and amounts only (BR-090).
const YEAR = 2030;
const [A, B] = ['201', '202'].map((n) => `00000000-0000-4000-8000-000000000${n}`) as [string, string];
const fi = (cents: number) => formatMoney(cents, 'fi');

function open(email?: string, year = YEAR) {
  const partner = signInMock(email);
  partner.selectedYear = year;
  return renderApp('/budget');
}

const nameField = (name: string) => screen.getByRole('textbox', { name: `Rivin nimi, ${name}` });
const findNameField = (name: string) => screen.findByRole('textbox', { name: `Rivin nimi, ${name}` });
const bodyRowNames = () =>
  within(screen.getAllByRole('rowgroup')[1]!)
    .getAllByRole('row')
    .map((r) => (within(r).getAllByRole('textbox')[0] as HTMLInputElement).value);
const totalsCells = () =>
  within(screen.getByRole('rowheader', { name: 'Yhteensä' }).closest('tr')!)
    .getAllByRole('cell')
    .map((c) => c.textContent);

function captureRowRequests() {
  const requests: { method: string; path: string; body: unknown }[] = [];
  server.events.on('request:start', async ({ request }) => {
    const path = new URL(request.url).pathname;
    if (!path.startsWith('/api/budget-categories')) return;
    const body = request.method === 'DELETE' ? null : ((await request.clone().json()) as unknown);
    requests.push({ method: request.method, path, body });
  });
  return requests;
}

beforeEach(() => {
  server.events.removeAllListeners();
});

describe('budget rows: add (A2)', () => {
  it('adds a row with a trimmed name; it appears in the table with zeros and the form clears', async () => {
    const requests = captureRowRequests();
    const { user } = open();
    await findNameField('Category A');

    const input = screen.getByRole('textbox', { name: 'Rivin nimi' });
    await user.type(input, '  Category D  ');
    await user.click(screen.getByRole('button', { name: 'Lisää rivi' }));

    expect(await findNameField('Category D')).toHaveValue('Category D');
    expect(requests).toEqual([{ method: 'POST', path: '/api/budget-categories', body: { name: 'Category D' } }]);
    expect(bodyRowNames()).toEqual(['Category A', 'Category B', 'Category C', 'Category D']);
    expect(screen.getByLabelText('Budjetti, kulut, Category D')).toHaveValue('0,00');
    expect(screen.getByLabelText('Toteuma, tulot, Category D')).toHaveValue('0,00');
    expect(input).toHaveValue('');
    expect(screen.getByText('Rivi Category D lisätty.')).toHaveAttribute('role', 'status');
  });

  it('Enter in the name field adds the row', async () => {
    const { user } = open();
    await findNameField('Category A');
    await user.type(screen.getByRole('textbox', { name: 'Rivin nimi' }), 'Category E{Enter}');
    expect(await findNameField('Category E')).toBeInTheDocument();
  });

  it('empty name → REQUIRED, nothing sent (E2)', async () => {
    const requests = captureRowRequests();
    const { user } = open();
    await findNameField('Category A');
    await user.type(screen.getByRole('textbox', { name: 'Rivin nimi' }), '   ');
    await user.click(screen.getByRole('button', { name: 'Lisää rivi' }));
    expect(await screen.findByText('Pakollinen tieto.')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Rivin nimi' })).toHaveAttribute('aria-invalid', 'true');
    expect(requests).toEqual([]);
  });

  it('duplicate name (case-insensitive) → translated DUPLICATE, nothing saved (E2)', async () => {
    const { user } = open();
    await findNameField('Category A');
    const input = screen.getByRole('textbox', { name: 'Rivin nimi' });
    await user.type(input, 'category a');
    await user.click(screen.getByRole('button', { name: 'Lisää rivi' }));

    expect(await screen.findByText('Nimi on jo käytössä.')).toBeInTheDocument();
    expect(input).toHaveValue('category a'); // typed value stays
    expect(db.reference.budgetCategories).toHaveLength(3);
    expect(bodyRowNames()).toEqual(['Category A', 'Category B', 'Category C']);

    // Typing clears the error.
    await user.type(input, 'x');
    expect(screen.queryByText('Nimi on jo käytössä.')).not.toBeInTheDocument();
  });

  it('shows DUPLICATE in English for an English partner and never the server message', async () => {
    server.use(
      http.post('/api/budget-categories', () =>
        errorResponse(400, 'VALIDATION_ERROR', 'Internal English text', { name: 'DUPLICATE' }),
      ),
    );
    const { user } = open('partner.b@example.com');
    await screen.findByRole('textbox', { name: 'Row name, Category A' });
    await user.type(screen.getByRole('textbox', { name: 'Row name' }), 'Category X');
    await user.click(screen.getByRole('button', { name: 'Add row' }));
    expect(await screen.findByText('This name is already in use.')).toBeInTheDocument();
    expect(screen.queryByText(/Internal English text/)).not.toBeInTheDocument();
  });

  it('a new row appears in every year (A2)', async () => {
    const { user } = open();
    await findNameField('Category A');
    await user.type(screen.getByRole('textbox', { name: 'Rivin nimi' }), 'Category D{Enter}');
    await findNameField('Category D');
    await user.click(screen.getByRole('button', { name: 'Seuraava vuosi' }));
    expect(await screen.findByRole('heading', { name: 'Budjetti 2031' })).toBeInTheDocument();
    await waitFor(() => expect(bodyRowNames()).toEqual(['Category A', 'Category B', 'Category C', 'Category D']));
  });
});

describe('budget rows: rename (A3)', () => {
  it('saves the name on blur with PATCH; unchanged names are not sent', async () => {
    const requests = captureRowRequests();
    const { user } = open();
    const field = await findNameField('Category B');

    await user.click(field);
    await user.click(document.body); // unchanged → nothing sent
    expect(requests).toEqual([]);

    await user.clear(field);
    await user.type(field, 'Category B2');
    expect(requests).toEqual([]); // typing alone sends nothing
    await user.click(document.body);

    await waitFor(() =>
      expect(requests).toEqual([{ method: 'PATCH', path: `/api/budget-categories/${B}`, body: { name: 'Category B2' } }]),
    );
    expect(await findNameField('Category B2')).toHaveValue('Category B2');
    expect(db.reference.budgetCategories.find((c) => c.id === B)?.name).toBe('Category B2');
    // Money cell labels follow the new name.
    expect(screen.getByLabelText('Budjetti, kulut, Category B2')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Poista rivi Category B2' })).toBeInTheDocument();
  });

  it('Enter saves; Esc restores the saved name', async () => {
    const requests = captureRowRequests();
    const { user } = open();
    const field = await findNameField('Category A');
    await user.clear(field);
    await user.type(field, 'Something{Escape}');
    expect(field).toHaveValue('Category A');
    expect(requests).toEqual([]);

    await user.clear(field);
    await user.type(field, 'Category A1{Enter}');
    await waitFor(() => expect(requests).toHaveLength(1));
    expect(requests[0]!.body).toEqual({ name: 'Category A1' });
  });

  it('empty name → REQUIRED, not sent; duplicate → DUPLICATE from the server, name not changed (E2)', async () => {
    const requests = captureRowRequests();
    const { user } = open();
    const field = await findNameField('Category A');
    await user.clear(field);
    await user.click(document.body);
    expect(await screen.findByText('Pakollinen tieto.')).toBeInTheDocument();
    expect(requests).toEqual([]);

    await user.type(field, 'CATEGORY C');
    await user.click(document.body);
    expect(await screen.findByText('Nimi on jo käytössä.')).toBeInTheDocument();
    expect(field).toHaveAttribute('aria-invalid', 'true');
    expect(field).toHaveValue('CATEGORY C'); // typed value stays for a retry
    expect(db.reference.budgetCategories.find((c) => c.id === A)?.name).toBe('Category A');
  });
});

describe('budget rows: remove (A4)', () => {
  it('asks for confirmation; cancel keeps the row', async () => {
    const requests = captureRowRequests();
    const { user } = open();
    await findNameField('Category A');
    await user.click(screen.getByRole('button', { name: 'Poista rivi Category A' }));
    const dialog = screen.getByRole('dialog', { name: 'Poistetaanko rivi?' });
    expect(dialog).toHaveTextContent('Rivi Category A poistuu kaikilta vuosilta ja summista. Sen luvut säilyvät.');
    await user.click(within(dialog).getByRole('button', { name: 'Peruuta' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(requests).toEqual([]);
    expect(bodyRowNames()).toEqual(['Category A', 'Category B', 'Category C']);
  });

  it('removes the row from the table and totals; its values are kept', async () => {
    setMockBudget(YEAR, A, { budgetExpenseCents: 100000, actualExpenseCents: 10000 });
    setMockBudget(YEAR, B, { budgetExpenseCents: 50000 });
    const requests = captureRowRequests();
    const { user } = open();
    await findNameField('Category A');
    expect(totalsCells()[0]).toBe(fi(150000));

    await user.click(screen.getByRole('button', { name: 'Poista rivi Category A' }));
    const dialog = screen.getByRole('dialog', { name: 'Poistetaanko rivi?' });
    await user.click(within(dialog).getByRole('button', { name: 'Poista' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(requests).toEqual([{ method: 'DELETE', path: `/api/budget-categories/${A}`, body: null }]);
    expect(screen.queryByRole('textbox', { name: 'Rivin nimi, Category A' })).not.toBeInTheDocument();
    expect(bodyRowNames()).toEqual(['Category B', 'Category C']);
    await waitFor(() => expect(totalsCells()[0]).toBe(fi(50000)));
    expect(screen.getByText('Rivi Category A poistettu.')).toHaveAttribute('role', 'status');
    // Soft delete: the stored values stay.
    expect(budgetAmounts(db.budget, YEAR, A)).toMatchObject({ budgetExpenseCents: 100000, actualExpenseCents: 10000 });
  });

  it('shows a translated error in the dialog when removing fails', async () => {
    server.use(http.delete('/api/budget-categories/:id', () => errorResponse(404, 'NOT_FOUND', 'Internal text')));
    const { user } = open();
    await findNameField('Category C');
    await user.click(screen.getByRole('button', { name: 'Poista rivi Category C' }));
    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Poista' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Tietoa ei löytynyt.');
    expect(screen.queryByText('Internal text')).not.toBeInTheDocument();
  });
});

describe('budget rows: empty state and caches', () => {
  it('shows "add your first row" and the add form when there are no rows', async () => {
    db.reference.budgetCategories = [];
    const { user } = open();
    expect(await screen.findByText('Budjetissa ei ole vielä rivejä. Lisää ensimmäinen rivi.')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();

    await user.type(screen.getByRole('textbox', { name: 'Rivin nimi' }), 'Category A{Enter}');
    expect(await screen.findByRole('textbox', { name: 'Rivin nimi, Category A' })).toBeInTheDocument();
    expect(screen.queryByText(/Lisää ensimmäinen rivi/)).not.toBeInTheDocument();
  });

  it('removing the last row shows the empty state', async () => {
    db.reference.budgetCategories = db.reference.budgetCategories.slice(0, 1);
    const { user } = open();
    await findNameField('Category A');
    await user.click(screen.getByRole('button', { name: 'Poista rivi Category A' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Poista' }));
    expect(await screen.findByText('Budjetissa ei ole vielä rivejä. Lisää ensimmäinen rivi.')).toBeInTheDocument();
  });

  it('refreshes the reference cache and year data after add, rename and remove', async () => {
    const { user, queryClient } = open();
    await findNameField('Category A');
    // Year page data cached from earlier navigation.
    queryClient.setQueryData(['years', YEAR], { stale: true });
    const names = () => queryClient.getQueryData<ReferenceData>(referenceKey)?.budgetCategories.map((c) => c.name);
    const yearInvalidated = () => queryClient.getQueryState(['years', YEAR])?.isInvalidated;

    await user.type(screen.getByRole('textbox', { name: 'Rivin nimi' }), 'Category D{Enter}');
    await waitFor(() => expect(names()).toEqual(['Category A', 'Category B', 'Category C', 'Category D']));
    expect(yearInvalidated()).toBe(true);

    queryClient.setQueryData(['years', YEAR], { stale: true });
    const field = nameField('Category D');
    await user.clear(field);
    await user.type(field, 'Category E{Enter}');
    await waitFor(() => expect(names()).toEqual(['Category A', 'Category B', 'Category C', 'Category E']));
    expect(yearInvalidated()).toBe(true);

    queryClient.setQueryData(['years', YEAR], { stale: true });
    await user.click(screen.getByRole('button', { name: 'Poista rivi Category E' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Poista' }));
    await waitFor(() => expect(names()).toEqual(['Category A', 'Category B', 'Category C']));
    expect(yearInvalidated()).toBe(true);
  });

  it('a row added elsewhere (unknown to the cached reference) shows up after the reference refetch', async () => {
    const { queryClient } = open();
    await findNameField('Category A');
    // Another partner adds a row; then this page refetches the budget.
    db.reference.budgetCategories = [...db.reference.budgetCategories, { id: 'other-row', name: 'Category Z' }];
    await queryClient.invalidateQueries({ queryKey: ['budget'] });
    expect(await findNameField('Category Z')).toBeInTheDocument();
    expect(bodyRowNames()).toEqual(['Category A', 'Category B', 'Category C', 'Category Z']);
  });
});
