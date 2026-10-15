import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { http } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { HourEntry } from '../../api/types';
import { db } from '../../mocks/data';
import { hoursStateWith } from '../../mocks/hoursStore';
import { server } from '../../mocks/server';
import { errorResponse } from '../../mocks/util';
import { renderApp, signInMock } from '../../test/renderApp';

const YEAR = 2030;
const NBSP = String.fromCharCode(0xa0);
/** Normalises Intl's non-breaking spaces for text matching. */
const text = (el: Element) => (el.textContent ?? '').split(NBSP).join(' ').trim();

function entries(): HourEntry[] {
  const [a, b] = db.partners;
  return [
    { id: 'e1', partnerId: a!.id, date: `${YEAR}-01-08`, comment: 'Planning', hours: 2 },
    { id: 'e2', partnerId: a!.id, date: `${YEAR}-01-20`, comment: 'Admin', hours: 1.5 },
    { id: 'e3', partnerId: a!.id, date: `${YEAR}-03-12`, comment: 'Rehearsal', hours: 0.75 },
    { id: 'e4', partnerId: a!.id, date: `${YEAR - 1}-12-30`, comment: 'Old year', hours: 5 },
    { id: 'e5', partnerId: b!.id, date: `${YEAR}-03-01`, comment: 'Sound check', hours: 4 },
    { id: 'e6', partnerId: b!.id, date: `${YEAR}-03-15`, comment: 'Meeting', hours: 1.25 },
  ];
}

function signInForYear() {
  const partner = signInMock();
  partner.selectedYear = YEAR;
  return partner;
}

/** Body rows as cell values (an inline field's input value, else the cell text). */
const bodyRows = (table: HTMLElement) =>
  [...table.querySelectorAll('tbody tr')].map((tr) =>
    [...tr.querySelectorAll('td')]
      .filter((td) => !td.classList.contains('hours-col-actions'))
      .map((td) => td.querySelector('input')?.value ?? text(td)),
  );
/** One column's values, top to bottom. */
const column = (table: HTMLElement, index: number) => bodyRows(table).map((r) => r[index]);
const totalOf = (table: HTMLElement) => text(within(table).getByTestId('hours-table-total'));

beforeEach(() => {
  db.hours = hoursStateWith(entries());
});

describe('my hours (UC-018)', () => {
  const myTable = () => screen.findByRole('table', { name: `Omat tunnit ${YEAR}` });

  it('shows own entries of the year as one flat table, oldest first, with a total row', async () => {
    signInForYear();
    renderApp('/hours');
    expect(await screen.findByRole('heading', { name: `Tunnit ${YEAR}` })).toBeInTheDocument();
    const table = await myTable();
    const headers = within(table)
      .getAllByRole('columnheader')
      .map((th) => text(th));
    expect(headers).toEqual(['Päivä', 'Kommentti', 'Tunnit', 'Toiminnot']);
    expect(bodyRows(table)).toEqual([
      [`${YEAR}-01-08`, 'Planning', '2'],
      [`${YEAR}-01-20`, 'Admin', '1,5'],
      [`${YEAR}-03-12`, 'Rehearsal', '0,75'],
    ]);
    const totalRow = within(table).getByRole('rowheader', { name: 'Yhteensä' }).closest('tr')!;
    expect(totalRow.closest('tfoot')).not.toBeNull();
    expect(totalOf(table)).toBe('4,25 h');
    expect(text(screen.getByTestId('hours-year-total'))).toBe('4,25 h');
    expect(screen.getByText('Kirjauksia: 3')).toBeInTheDocument();
    // Flat: no month groups, no expand/collapse, no charts; other years and partners not shown.
    expect(screen.queryByRole('region', { name: 'Maaliskuu' })).not.toBeInTheDocument();
    expect(document.querySelector('.hours-page [aria-expanded]')).toBeNull();
    expect(document.querySelector('.mini-bars')).toBeNull();
    expect(screen.queryByDisplayValue('Old year')).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue('Sound check')).not.toBeInTheDocument();
  });

  it('sorts by clicking a column header (aria-sort asc/desc)', async () => {
    signInForYear();
    const { user } = renderApp('/hours');
    const table = await myTable();
    const dateHeader = within(table).getByRole('columnheader', { name: 'Päivä' });
    const hoursHeader = within(table).getByRole('columnheader', { name: 'Tunnit' });
    expect(dateHeader).toHaveAttribute('aria-sort', 'ascending');
    expect(hoursHeader).toHaveAttribute('aria-sort', 'none');

    await user.click(within(dateHeader).getByRole('button', { name: 'Päivä' }));
    expect(dateHeader).toHaveAttribute('aria-sort', 'descending');
    expect(column(table, 1)).toEqual(['Rehearsal', 'Admin', 'Planning']);

    await user.click(within(hoursHeader).getByRole('button', { name: 'Tunnit' }));
    expect(hoursHeader).toHaveAttribute('aria-sort', 'ascending');
    expect(dateHeader).toHaveAttribute('aria-sort', 'none');
    expect(column(table, 2)).toEqual(['0,75', '1,5', '2']);
    await user.click(within(hoursHeader).getByRole('button', { name: 'Tunnit' }));
    expect(column(table, 2)).toEqual(['2', '1,5', '0,75']);

    await user.click(within(table).getByRole('button', { name: 'Kommentti' }));
    expect(column(table, 1)).toEqual(['Admin', 'Planning', 'Rehearsal']);
    expect(totalOf(table)).toBe('4,25 h');
  });

  it('adds an entry with today as default date and 0.25-step hours', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date(YEAR, 1, 14, 12) });
    signInForYear();
    const { user } = renderApp('/hours');
    const table = await myTable();

    await user.click(screen.getByRole('button', { name: 'Lisää tunnit' }));
    const dialog = screen.getByRole('dialog', { name: 'Uusi tuntikirjaus' });
    expect(within(dialog).getByLabelText('Päivämäärä')).toHaveValue(`${YEAR}-02-14`);
    await user.type(within(dialog).getByLabelText('Kommentti'), 'Admin work');
    await user.type(within(dialog).getByLabelText('Tunnit'), '1,25');
    await user.click(within(dialog).getByRole('button', { name: 'Tallenna' }));

    await waitFor(() => expect(column(table, 1)).toEqual(['Planning', 'Admin', 'Admin work', 'Rehearsal']));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(text(screen.getByTestId('hours-year-total'))).toBe('5,5 h');
    expect(totalOf(table)).toBe('5,5 h');
    const saved = db.hours.entries.find((e) => e.comment === 'Admin work');
    expect(saved).toMatchObject({ date: `${YEAR}-02-14`, hours: 1.25, partnerId: db.partners[0]!.id });
    vi.useRealTimers();
  });

  it('shows translated REQUIRED and INVALID_HOURS errors and does not save', async () => {
    signInForYear();
    const { user } = renderApp('/hours');
    await myTable();
    const before = db.hours.entries.length;

    await user.click(screen.getByRole('button', { name: 'Lisää tunnit' }));
    const dialog = screen.getByRole('dialog');
    await user.type(within(dialog).getByLabelText('Tunnit'), '1,3');
    await user.click(within(dialog).getByRole('button', { name: 'Tallenna' }));

    expect(within(dialog).getByText('Pakollinen tieto.')).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Kommentti')).toHaveAttribute('aria-invalid', 'true');
    expect(within(dialog).getByLabelText('Tunnit')).toHaveAttribute('aria-invalid', 'true');
    expect(within(dialog).getByText('Tunnit 0,25–24 neljännestunnin tarkkuudella.')).toBeInTheDocument();
    expect(db.hours.entries).toHaveLength(before);
  });

  it('translates field codes from the server and never shows its message', async () => {
    server.use(
      http.post('/api/hours', () =>
        errorResponse(400, 'VALIDATION_ERROR', 'Server says no', { hours: 'INVALID_HOURS', comment: 'REQUIRED' }),
      ),
    );
    signInForYear().language = 'en';
    const { user } = renderApp('/hours');
    await screen.findByRole('table', { name: `My hours ${YEAR}` });
    await user.click(screen.getByRole('button', { name: 'Add hours' }));
    const dialog = screen.getByRole('dialog');
    await user.type(within(dialog).getByLabelText('Comment'), 'Admin');
    await user.type(within(dialog).getByLabelText('Hours'), '2');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    expect(await within(dialog).findByText('Hours must be 0.25–24 in quarter-hour steps.')).toBeInTheDocument();
    expect(within(dialog).getByText('Required.')).toBeInTheDocument();
    expect(screen.queryByText('Server says no')).not.toBeInTheDocument();
  });

  it('has no Edit button or edit dialog: own entries are edited in place', async () => {
    signInForYear();
    renderApp('/hours');
    const table = await myTable();
    expect(screen.queryByRole('button', { name: /Muokkaa/ })).not.toBeInTheDocument();
    expect(within(table).getByRole('textbox', { name: `Kommentti: 12.3.${YEAR} Rehearsal` })).toHaveValue(
      'Rehearsal',
    );
    expect(within(table).getByRole('textbox', { name: `Tunnit: 12.3.${YEAR} Rehearsal` })).toHaveValue('0,75');
    expect(within(table).getByLabelText(`Päivämäärä: 12.3.${YEAR} Rehearsal`)).toHaveValue(`${YEAR}-03-12`);
    expect(within(table).getByRole('button', { name: `Poista: 12.3.${YEAR} Rehearsal` })).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('gives own rows with the same date and comment unique field names', async () => {
    const [a] = db.partners;
    db.hours = hoursStateWith([
      { id: 'd1', partnerId: a!.id, date: `${YEAR}-01-08`, comment: 'Planning', hours: 2 },
      { id: 'd2', partnerId: a!.id, date: `${YEAR}-01-08`, comment: 'Planning', hours: 1 },
    ]);
    signInForYear();
    renderApp('/hours');
    const table = await myTable();
    expect(within(table).getByRole('textbox', { name: `Tunnit: 8.1.${YEAR} Planning (1)` })).toHaveValue('2');
    expect(within(table).getByRole('textbox', { name: `Tunnit: 8.1.${YEAR} Planning (2)` })).toHaveValue('1');
    expect(within(table).getByRole('button', { name: `Poista: 8.1.${YEAR} Planning (2)` })).toBeInTheDocument();
  });

  it('saves hours on blur with one PATCH and updates the total row and year total', async () => {
    const bodies: unknown[] = [];
    server.events.on('request:start', async ({ request }) => {
      if (request.method === 'PATCH') bodies.push(await request.clone().json());
    });
    signInForYear();
    const { user } = renderApp('/hours');
    const table = await myTable();
    const hours = within(table).getByRole('textbox', { name: /^Tunnit: .* Rehearsal$/ });
    await user.clear(hours);
    await user.type(hours, '2,5');
    expect(bodies).toHaveLength(0);
    await user.click(document.body);

    await waitFor(() => expect(totalOf(table)).toBe('6 h'));
    expect(text(screen.getByTestId('hours-year-total'))).toBe('6 h');
    expect(db.hours.entries.find((e) => e.id === 'e3')?.hours).toBe(2.5);
    expect(bodies).toEqual([{ hours: 2.5 }]);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    server.events.removeAllListeners();
  });

  it('Enter saves the comment; Esc restores the saved value without sending', async () => {
    signInForYear();
    const { user } = renderApp('/hours');
    const table = await myTable();
    const comment = within(table).getByRole('textbox', { name: /^Kommentti: .* Planning$/ });
    await user.clear(comment);
    await user.type(comment, 'Planning session{Enter}');
    await waitFor(() => expect(db.hours.entries.find((e) => e.id === 'e1')?.comment).toBe('Planning session'));

    const admin = within(table).getByRole('textbox', { name: /^Kommentti: .* Admin$/ });
    await user.type(admin, ' changed');
    await user.keyboard('{Escape}');
    expect(admin).toHaveValue('Admin');
    await user.click(document.body);
    expect(db.hours.entries.find((e) => e.id === 'e2')?.comment).toBe('Admin');
  });

  it('shows INVALID_HOURS / REQUIRED under the field and does not send', async () => {
    signInForYear();
    const { user } = renderApp('/hours');
    const table = await myTable();
    const hours = within(table).getByRole('textbox', { name: /^Tunnit: .* Rehearsal$/ });
    await user.clear(hours);
    await user.type(hours, '1,3');
    await user.click(document.body);
    expect(within(table).getByText('Tunnit 0,25–24 neljännestunnin tarkkuudella.')).toBeInTheDocument();
    expect(hours).toHaveAttribute('aria-invalid', 'true');
    expect(hours).toHaveValue('1,3');

    const comment = within(table).getByRole('textbox', { name: /^Kommentti: .* Rehearsal$/ });
    await user.clear(comment);
    await user.click(document.body);
    expect(within(table).getByText('Pakollinen tieto.')).toBeInTheDocument();
    expect(db.hours.entries.find((e) => e.id === 'e3')).toMatchObject({ hours: 0.75, comment: 'Rehearsal' });
  });

  it('shows a translated server field error under the inline field', async () => {
    server.use(
      http.patch('/api/hours/:id', () =>
        errorResponse(400, 'VALIDATION_ERROR', 'Server says no', { hours: 'INVALID_HOURS' }),
      ),
    );
    signInForYear().language = 'en';
    const { user } = renderApp('/hours');
    const table = await screen.findByRole('table', { name: `My hours ${YEAR}` });
    const hours = within(table).getByRole('textbox', { name: /^Hours: .* Rehearsal$/ });
    await user.clear(hours);
    await user.type(hours, '2{Enter}');
    expect(await within(table).findByText('Hours must be 0.25–24 in quarter-hour steps.')).toBeInTheDocument();
    expect(screen.queryByText('Server says no')).not.toBeInTheDocument();
    expect(hours).toHaveValue('2');
  });

  it('changing the date re-sorts the table', async () => {
    signInForYear();
    const { user } = renderApp('/hours');
    const table = await myTable();
    const date = within(table).getByLabelText(/^Päivämäärä: .* Rehearsal$/);
    act(() => date.focus());
    fireEvent.change(date, { target: { value: `${YEAR}-01-10` } });
    await user.tab();

    await waitFor(() => expect(column(table, 1)).toEqual(['Planning', 'Rehearsal', 'Admin']));
    expect(totalOf(table)).toBe('4,25 h');
    expect(db.hours.entries.find((e) => e.id === 'e3')?.date).toBe(`${YEAR}-01-10`);
  });

  it('moving an entry to another year shows the notice and removes it from this year', async () => {
    signInForYear();
    const { user } = renderApp('/hours');
    const table = await myTable();
    const date = within(table).getByLabelText(/^Päivämäärä: .* Rehearsal$/);
    act(() => date.focus());
    fireEvent.change(date, { target: { value: `${YEAR + 1}-03-12` } });
    await user.tab();

    expect(
      await screen.findByText(`Tallennettu vuodelle ${YEAR + 1}. Vaihda vuotta nähdäksesi kirjauksen.`),
    ).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByDisplayValue('Rehearsal')).not.toBeInTheDocument());
    expect(text(screen.getByTestId('hours-year-total'))).toBe('3,5 h');
    expect(totalOf(table)).toBe('3,5 h');
  });

  it('deletes an own entry after confirmation', async () => {
    signInForYear();
    const { user } = renderApp('/hours');
    const table = await myTable();
    await user.click(within(table).getByRole('button', { name: /^Poista: .* Rehearsal$/ }));
    const dialog = screen.getByRole('dialog', { name: 'Poistetaanko tuntikirjaus?' });
    await user.click(within(dialog).getByRole('button', { name: 'Poista' }));

    await waitFor(() => expect(screen.queryByDisplayValue('Rehearsal')).not.toBeInTheDocument());
    expect(text(screen.getByTestId('hours-year-total'))).toBe('3,5 h');
    expect(db.hours.entries.some((e) => e.id === 'e3')).toBe(false);
  });

  it('shows a translated error when the server refuses (FORBIDDEN)', async () => {
    server.use(http.delete('/api/hours/:id', () => errorResponse(403, 'FORBIDDEN', 'Not own entry')));
    signInForYear();
    const { user } = renderApp('/hours');
    const table = await myTable();
    await user.click(within(table).getByRole('button', { name: /^Poista: .* Rehearsal$/ }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Poista' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Sinulla ei ole oikeutta');
    expect(screen.queryByText('Not own entry')).not.toBeInTheDocument();
  });

  it('shows an empty state for a year without entries', async () => {
    db.hours = hoursStateWith([]);
    signInForYear();
    renderApp('/hours');
    expect(await screen.findByText(`Ei tuntikirjauksia vuonna ${YEAR}.`)).toBeInTheDocument();
    expect(text(screen.getByTestId('hours-year-total'))).toBe('0 h');
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });
});

describe('hours totals (UC-019)', () => {
  const allTable = (name = `Tuntikirjaukset ${YEAR}`) => screen.findByRole('table', { name });

  it('shows every entry of the year in one flat table, oldest first, with a total row', async () => {
    signInForYear();
    renderApp('/hours/totals');
    const table = await allTable();
    await waitFor(() => expect(bodyRows(table)).toHaveLength(5));
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((th) => text(th)),
    ).toEqual(['Päivä', 'Osakas', 'Kommentti', 'Tunnit', 'Toiminnot']);
    expect(bodyRows(table)).toEqual([
      [`${YEAR}-01-08`, 'Partner A', 'Planning', '2'],
      [`${YEAR}-01-20`, 'Partner A', 'Admin', '1,5'],
      [`01.03.${YEAR}`, 'Partner B', 'Sound check', '4 h'],
      [`${YEAR}-03-12`, 'Partner A', 'Rehearsal', '0,75'],
      [`15.03.${YEAR}`, 'Partner B', 'Meeting', '1,25 h'],
    ]);
    expect(within(table).getByRole('rowheader', { name: 'Yhteensä' }).closest('tfoot')).not.toBeNull();
    expect(totalOf(table)).toBe('9,5 h');
    // Flat: no expand/collapse, no month groups, no charts, one table.
    expect(document.querySelector('.hours-page [aria-expanded]')).toBeNull();
    expect(screen.queryByRole('region', { name: 'Maaliskuu' })).not.toBeInTheDocument();
    expect(document.querySelector('.mini-bars')).toBeNull();
    expect(screen.getAllByRole('table')).toHaveLength(1);
  });

  it('marks every cell with its column, so dates and hours stay on one line and text wraps (TASK-149)', async () => {
    signInForYear();
    renderApp('/hours/totals');
    const table = await allTable();
    await waitFor(() => expect(bodyRows(table)).toHaveLength(5));
    const columns = ['hours-col-date', 'hours-col-partner', 'hours-col-comment', 'hours-col-hours', 'hours-col-actions'];
    for (const tr of table.querySelectorAll('thead tr, tbody tr')) {
      const cells = [...tr.children];
      expect(cells.map((c) => columns.find((col) => c.classList.contains(col)))).toEqual(columns);
      // Hours: right-aligned, tabular, nowrap (shared .num); the comment is not .num.
      expect(cells[3]).toHaveClass('num');
      expect(cells[2]).not.toHaveClass('num');
    }
    // Others' (read-only) comments are plain wrapping text, not inputs.
    const other = within(table).getByText('Sound check');
    expect(other.tagName).toBe('SPAN');
    expect(other).toHaveClass('pre-wrap');
  });

  it('lists all partners with one GET per partner (parallel), no other endpoint', async () => {
    const urls: string[] = [];
    server.events.on('request:start', ({ request }) => {
      if (new URL(request.url).pathname.startsWith('/api/hours')) urls.push(request.url);
    });
    signInForYear();
    renderApp('/hours/totals');
    const table = await allTable();
    await waitFor(() => expect(bodyRows(table)).toHaveLength(5));
    const lists = urls.map((u) => new URL(u)).filter((u) => u.pathname === '/api/hours');
    expect(lists.map((u) => u.searchParams.get('partnerId')).sort()).toEqual(db.partners.map((p) => p.id).sort());
    expect(lists.every((u) => u.searchParams.get('year') === String(YEAR))).toBe(true);
    expect(urls.some((u) => new URL(u).pathname === '/api/hours/totals')).toBe(false);
    server.events.removeAllListeners();
  });

  it('filters by partner; the total row is that partner’s year hours', async () => {
    signInForYear();
    const { user } = renderApp('/hours/totals');
    const table = await allTable();
    await waitFor(() => expect(totalOf(table)).toBe('9,5 h'));
    const filter = screen.getByRole('combobox', { name: 'Osakas' });
    expect(filter).toHaveValue('');
    expect(within(filter).getAllByRole('option').map((o) => o.textContent)).toEqual([
      'Kaikki',
      'Partner A',
      'Partner B',
      'Partner C',
    ]);

    await user.selectOptions(filter, 'Partner B');
    const filtered = await allTable();
    await waitFor(() => expect(column(filtered, 2)).toEqual(['Sound check', 'Meeting']));
    expect(totalOf(filtered)).toBe('5,25 h');

    await user.selectOptions(filter, 'Partner A');
    await waitFor(() => expect(totalOf(screen.getByRole('table'))).toBe('4,25 h'));

    await user.selectOptions(filter, 'Partner C');
    expect(await screen.findByText(`Partner C: ei tuntikirjauksia vuonna ${YEAR}.`)).toBeInTheDocument();

    await user.selectOptions(filter, 'Kaikki');
    await waitFor(() => expect(totalOf(screen.getByRole('table'))).toBe('9,5 h'));
  });

  it('reads the partner filter from the URL (?partner=)', async () => {
    signInForYear();
    const b = db.partners[1]!;
    renderApp(`/hours/totals?partner=${b.id}`);
    const table = await allTable();
    expect(screen.getByRole('combobox', { name: 'Osakas' })).toHaveValue(b.id);
    await waitFor(() => expect(totalOf(table)).toBe('5,25 h'));
    expect(column(table, 1)).toEqual(['Partner B', 'Partner B']);
  });

  it('treats an unknown partner id in the URL as all partners', async () => {
    signInForYear();
    renderApp('/hours/totals?partner=nope');
    const table = await allTable();
    await waitFor(() => expect(totalOf(table)).toBe('9,5 h'));
    expect(screen.getByRole('combobox', { name: 'Osakas' })).toHaveValue('');
  });

  it('sorts by date, partner, comment and hours (asc/desc)', async () => {
    signInForYear();
    const { user } = renderApp('/hours/totals');
    const table = await allTable();
    await waitFor(() => expect(bodyRows(table)).toHaveLength(5));
    const header = (name: string) => within(table).getByRole('columnheader', { name });

    await user.click(within(header('Osakas')).getByRole('button'));
    expect(header('Osakas')).toHaveAttribute('aria-sort', 'ascending');
    expect(header('Päivä')).toHaveAttribute('aria-sort', 'none');
    expect(column(table, 2)).toEqual(['Planning', 'Admin', 'Rehearsal', 'Sound check', 'Meeting']);
    await user.click(within(header('Osakas')).getByRole('button'));
    expect(header('Osakas')).toHaveAttribute('aria-sort', 'descending');
    expect(column(table, 2)).toEqual(['Sound check', 'Meeting', 'Planning', 'Admin', 'Rehearsal']);

    await user.click(within(header('Kommentti')).getByRole('button'));
    expect(column(table, 2)).toEqual(['Admin', 'Meeting', 'Planning', 'Rehearsal', 'Sound check']);

    await user.click(within(header('Tunnit')).getByRole('button'));
    await user.click(within(header('Tunnit')).getByRole('button'));
    expect(header('Tunnit')).toHaveAttribute('aria-sort', 'descending');
    expect(column(table, 2)).toEqual(['Sound check', 'Planning', 'Admin', 'Meeting', 'Rehearsal']);

    await user.click(within(header('Päivä')).getByRole('button'));
    expect(header('Päivä')).toHaveAttribute('aria-sort', 'ascending');
    expect(column(table, 2)).toEqual(['Planning', 'Admin', 'Sound check', 'Rehearsal', 'Meeting']);
    expect(totalOf(table)).toBe('9,5 h');
  });

  it('own rows are edited inline; other partners’ rows are read-only', async () => {
    signInForYear();
    const { user } = renderApp('/hours/totals');
    const table = await allTable();
    await waitFor(() => expect(bodyRows(table)).toHaveLength(5));
    expect(screen.getByText('Vain omia kirjauksia voi muokata.')).toBeInTheDocument();

    const others = within(table).getByText('Sound check').closest('tr')!;
    expect(others.querySelector('input')).toBeNull();
    expect(within(others).queryByRole('button')).not.toBeInTheDocument();
    expect(within(table).queryByRole('textbox', { name: /Sound check/ })).not.toBeInTheDocument();
    expect(within(table).getByRole('button', { name: /^Poista: .* Planning$/ })).toBeInTheDocument();

    const hours = within(table).getByRole('textbox', { name: `Tunnit: 8.1.${YEAR} Planning` });
    await user.clear(hours);
    await user.type(hours, '4{Enter}');
    await waitFor(() => expect(totalOf(table)).toBe('11,5 h'));
    expect(db.hours.entries.find((e) => e.id === 'e1')?.hours).toBe(4);
  });

  it('moving an own entry to another year shows the notice', async () => {
    signInForYear();
    const { user } = renderApp('/hours/totals');
    const table = await allTable();
    await waitFor(() => expect(bodyRows(table)).toHaveLength(5));
    const date = within(table).getByLabelText(`Päivämäärä: 12.3.${YEAR} Rehearsal`);
    act(() => date.focus());
    fireEvent.change(date, { target: { value: `${YEAR + 1}-03-12` } });
    await user.tab();
    expect(
      await screen.findByText(`Tallennettu vuodelle ${YEAR + 1}. Vaihda vuotta nähdäksesi kirjauksen.`),
    ).toBeInTheDocument();
    await waitFor(() => expect(totalOf(table)).toBe('8,75 h'));
  });

  it('shows English texts', async () => {
    signInForYear().language = 'en';
    renderApp('/hours/totals');
    const table = await allTable(`Hour entries ${YEAR}`);
    await waitFor(() => expect(bodyRows(table)).toHaveLength(5));
    expect(within(table).getByRole('columnheader', { name: 'Date' })).toBeInTheDocument();
    expect(within(table).getByRole('columnheader', { name: 'Partner' })).toBeInTheDocument();
    expect(within(table).getByRole('rowheader', { name: 'Total' })).toBeInTheDocument();
    const filter = screen.getByRole('combobox', { name: 'Partner' });
    expect(within(filter).getByRole('option', { name: 'All' })).toBeInTheDocument();
    expect(within(table).getByText(`01/03/${YEAR}`)).toBeInTheDocument();
  });

  it('switches between my hours and totals with tabs', async () => {
    signInForYear();
    const { user } = renderApp('/hours');
    await screen.findByRole('table', { name: `Omat tunnit ${YEAR}` });
    const tabs = screen.getByRole('navigation', { name: 'Tuntinäkymä' });
    await user.click(within(tabs).getByRole('link', { name: 'Yhteenveto' }));
    expect(await allTable()).toBeInTheDocument();
    await user.click(within(tabs).getByRole('link', { name: 'Omat tunnit' }));
    expect(await screen.findByTestId('hours-year-total')).toBeInTheDocument();
  });

  it('has the add action in the page head only on my hours (no empty actions box on totals)', async () => {
    signInForYear();
    const { user } = renderApp('/hours/totals');
    await allTable();
    const head = screen.getByRole('heading', { name: `Tunnit ${YEAR}` }).closest('.page-head') as HTMLElement;
    expect(head.querySelector('.page-actions')).toBeNull();

    const tabs = screen.getByRole('navigation', { name: 'Tuntinäkymä' });
    await user.click(within(tabs).getByRole('link', { name: 'Omat tunnit' }));
    expect(await within(head).findByRole('button', { name: 'Lisää tunnit' })).toBeInTheDocument();
  });
});
