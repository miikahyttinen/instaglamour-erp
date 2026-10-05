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
const text = (el: HTMLElement) => (el.textContent ?? '').split(NBSP).join(' ');

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

beforeEach(() => {
  db.hours = hoursStateWith(entries());
});

describe('my hours (UC-018)', () => {
  it('shows own entries of the selected year by month with month and year totals', async () => {
    signInForYear();
    renderApp('/hours');
    expect(await screen.findByRole('heading', { name: `Tunnit ${YEAR}` })).toBeInTheDocument();
    const march = await screen.findByRole('region', { name: 'Maaliskuu' });
    const january = screen.getByRole('region', { name: 'Tammikuu' });
    expect(within(march).getByDisplayValue('Rehearsal')).toBeInTheDocument();
    expect(text(within(january).getByLabelText('Kuukausi yhteensä Tammikuu'))).toBe('3,5 h');
    expect(text(within(march).getByLabelText('Kuukausi yhteensä Maaliskuu'))).toBe('0,75 h');
    expect(text(screen.getByTestId('hours-year-total'))).toBe('4,25 h');
    // Newest month first; other year and other partner not shown.
    // Month groups only (the year total StatTile is a region too).
    const regions = screen
      .getAllByRole('region')
      .filter((r) => r.classList.contains('hours-month'))
      .map((r) => r.getAttribute('aria-label'));
    expect(screen.getByRole('region', { name: `Tuntisumma ${YEAR}` })).toBeInTheDocument();
    expect(regions).toEqual(['Maaliskuu', 'Tammikuu']);
    expect(screen.queryByDisplayValue('Old year')).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue('Sound check')).not.toBeInTheDocument();
    // Year total tile: figure and entry count, no month chart.
    expect(screen.getByText('Kirjauksia: 3')).toBeInTheDocument();
    expect(document.querySelector('.mini-bars')).toBeNull();
  });

  it('adds an entry with today as default date and 0.25-step hours', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date(YEAR, 1, 14, 12) });
    signInForYear();
    const { user } = renderApp('/hours');
    await screen.findByRole('region', { name: 'Maaliskuu' });

    await user.click(screen.getByRole('button', { name: 'Lisää tunnit' }));
    const dialog = screen.getByRole('dialog', { name: 'Uusi tuntikirjaus' });
    expect(within(dialog).getByLabelText('Päivämäärä')).toHaveValue(`${YEAR}-02-14`);
    await user.type(within(dialog).getByLabelText('Kommentti'), 'Admin work');
    await user.type(within(dialog).getByLabelText('Tunnit'), '1,25');
    await user.click(within(dialog).getByRole('button', { name: 'Tallenna' }));

    const february = await screen.findByRole('region', { name: 'Helmikuu' });
    expect(within(february).getByDisplayValue('Admin work')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await waitFor(() => expect(text(screen.getByTestId('hours-year-total'))).toBe('5,5 h'));
    const saved = db.hours.entries.find((e) => e.comment === 'Admin work');
    expect(saved).toMatchObject({ date: `${YEAR}-02-14`, hours: 1.25, partnerId: db.partners[0]!.id });
    vi.useRealTimers();
  });

  it('shows translated REQUIRED and INVALID_HOURS errors and does not save', async () => {
    signInForYear();
    const { user } = renderApp('/hours');
    await screen.findByRole('region', { name: 'Maaliskuu' });
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
    await screen.findByRole('region', { name: 'March' });
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
    const march = await screen.findByRole('region', { name: 'Maaliskuu' });
    expect(screen.queryByRole('button', { name: /Muokkaa/ })).not.toBeInTheDocument();
    expect(within(march).getByRole('textbox', { name: /^Kommentti: .* Rehearsal$/ })).toHaveValue('Rehearsal');
    expect(within(march).getByRole('textbox', { name: /^Tunnit: .* Rehearsal$/ })).toHaveValue('0,75');
    expect(within(march).getByLabelText(/^Päivämäärä: .* Rehearsal$/)).toHaveValue(`${YEAR}-03-12`);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('saves hours on blur with one PATCH and updates month and year totals', async () => {
    const bodies: unknown[] = [];
    server.events.on('request:start', async ({ request }) => {
      if (request.method === 'PATCH') bodies.push(await request.clone().json());
    });
    signInForYear();
    const { user } = renderApp('/hours');
    const march = await screen.findByRole('region', { name: 'Maaliskuu' });
    const hours = within(march).getByRole('textbox', { name: /^Tunnit: .* Rehearsal$/ });
    await user.clear(hours);
    await user.type(hours, '2,5');
    expect(bodies).toHaveLength(0);
    await user.click(document.body);

    await waitFor(() =>
      expect(text(within(march).getByLabelText('Kuukausi yhteensä Maaliskuu'))).toBe('2,5 h'),
    );
    expect(text(screen.getByTestId('hours-year-total'))).toBe('6 h');
    expect(db.hours.entries.find((e) => e.id === 'e3')?.hours).toBe(2.5);
    expect(bodies).toEqual([{ hours: 2.5 }]);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    server.events.removeAllListeners();
  });

  it('Enter saves the comment; Esc restores the saved value without sending', async () => {
    signInForYear();
    const { user } = renderApp('/hours');
    const january = await screen.findByRole('region', { name: 'Tammikuu' });
    const comment = within(january).getByRole('textbox', { name: /^Kommentti: .* Planning$/ });
    await user.clear(comment);
    await user.type(comment, 'Planning session{Enter}');
    await waitFor(() => expect(db.hours.entries.find((e) => e.id === 'e1')?.comment).toBe('Planning session'));

    const admin = within(january).getByRole('textbox', { name: /^Kommentti: .* Admin$/ });
    await user.type(admin, ' changed');
    await user.keyboard('{Escape}');
    expect(admin).toHaveValue('Admin');
    await user.click(document.body);
    expect(db.hours.entries.find((e) => e.id === 'e2')?.comment).toBe('Admin');
  });

  it('shows INVALID_HOURS / REQUIRED under the field and does not send', async () => {
    signInForYear();
    const { user } = renderApp('/hours');
    const march = await screen.findByRole('region', { name: 'Maaliskuu' });
    const hours = within(march).getByRole('textbox', { name: /^Tunnit: .* Rehearsal$/ });
    await user.clear(hours);
    await user.type(hours, '1,3');
    await user.click(document.body);
    expect(within(march).getByText('Tunnit 0,25–24 neljännestunnin tarkkuudella.')).toBeInTheDocument();
    expect(hours).toHaveAttribute('aria-invalid', 'true');
    expect(hours).toHaveValue('1,3');

    const comment = within(march).getByRole('textbox', { name: /^Kommentti: .* Rehearsal$/ });
    await user.clear(comment);
    await user.click(document.body);
    expect(within(march).getByText('Pakollinen tieto.')).toBeInTheDocument();
    const saved = db.hours.entries.find((e) => e.id === 'e3');
    expect(saved).toMatchObject({ hours: 0.75, comment: 'Rehearsal' });
  });

  it('shows a translated server field error under the inline field', async () => {
    server.use(
      http.patch('/api/hours/:id', () =>
        errorResponse(400, 'VALIDATION_ERROR', 'Server says no', { hours: 'INVALID_HOURS' }),
      ),
    );
    signInForYear().language = 'en';
    const { user } = renderApp('/hours');
    const march = await screen.findByRole('region', { name: 'March' });
    const hours = within(march).getByRole('textbox', { name: /^Hours: .* Rehearsal$/ });
    await user.clear(hours);
    await user.type(hours, '2{Enter}');
    expect(await within(march).findByText('Hours must be 0.25–24 in quarter-hour steps.')).toBeInTheDocument();
    expect(screen.queryByText('Server says no')).not.toBeInTheDocument();
    expect(hours).toHaveValue('2');
  });

  it('changing the date moves the entry to its new month', async () => {
    signInForYear();
    const { user } = renderApp('/hours');
    const march = await screen.findByRole('region', { name: 'Maaliskuu' });
    const date = within(march).getByLabelText(/^Päivämäärä: .* Rehearsal$/);
    act(() => date.focus());
    fireEvent.change(date, { target: { value: `${YEAR}-02-10` } });
    await user.tab();

    const february = await screen.findByRole('region', { name: 'Helmikuu' });
    expect(within(february).getByDisplayValue('Rehearsal')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Maaliskuu' })).not.toBeInTheDocument());
    expect(text(screen.getByTestId('hours-year-total'))).toBe('4,25 h');
    expect(db.hours.entries.find((e) => e.id === 'e3')?.date).toBe(`${YEAR}-02-10`);
  });

  it('moving an entry to another year shows the notice and removes it from this year', async () => {
    signInForYear();
    const { user } = renderApp('/hours');
    const march = await screen.findByRole('region', { name: 'Maaliskuu' });
    const date = within(march).getByLabelText(/^Päivämäärä: .* Rehearsal$/);
    act(() => date.focus());
    fireEvent.change(date, { target: { value: `${YEAR + 1}-03-12` } });
    await user.tab();

    expect(
      await screen.findByText(`Tallennettu vuodelle ${YEAR + 1}. Vaihda vuotta nähdäksesi kirjauksen.`),
    ).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Maaliskuu' })).not.toBeInTheDocument());
    expect(text(screen.getByTestId('hours-year-total'))).toBe('3,5 h');
  });

  it('deletes an own entry after confirmation', async () => {
    signInForYear();
    const { user } = renderApp('/hours');
    await screen.findByRole('region', { name: 'Maaliskuu' });
    await user.click(screen.getByRole('button', { name: /^Poista: .* Rehearsal$/ }));
    const dialog = screen.getByRole('dialog', { name: 'Poistetaanko tuntikirjaus?' });
    await user.click(within(dialog).getByRole('button', { name: 'Poista' }));

    await waitFor(() => expect(screen.queryByRole('region', { name: 'Maaliskuu' })).not.toBeInTheDocument());
    expect(text(screen.getByTestId('hours-year-total'))).toBe('3,5 h');
    expect(db.hours.entries.some((e) => e.id === 'e3')).toBe(false);
  });

  it('shows a translated error when the server refuses (FORBIDDEN)', async () => {
    server.use(http.delete('/api/hours/:id', () => errorResponse(403, 'FORBIDDEN', 'Not own entry')));
    signInForYear();
    const { user } = renderApp('/hours');
    await screen.findByRole('region', { name: 'Maaliskuu' });
    await user.click(screen.getByRole('button', { name: /^Poista: .* Rehearsal$/ }));
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
  });
});

describe('hours totals (UC-019)', () => {
  /** Body rows of the partner list: [name, hours]. */
  const partnerRows = (table: HTMLElement) =>
    within(table)
      .getAllByRole('rowheader')
      .filter((th) => th.closest('tbody'))
      .map((th) => [text(th).trim(), text(th.closest('tr')!.querySelector('td')!)]);

  it('shows the year total first, then every partner by hours (most first) with a total row', async () => {
    signInForYear();
    renderApp('/hours/totals');
    const table = await screen.findByRole('table', { name: 'Osakkaat' });
    expect(screen.getByRole('region', { name: 'Yhteensä' })).toBeInTheDocument();
    expect(text(screen.getByTestId('hours-grand-total'))).toBe('9,5 h');
    expect(within(table).getByRole('columnheader', { name: 'Osakas' })).toBeInTheDocument();
    expect(within(table).getByRole('columnheader', { name: `Tunnit ${YEAR}` })).toBeInTheDocument();
    expect(partnerRows(table)).toEqual([
      ['Partner B', '5,25 h'],
      ['Partner A', '4,25 h'],
      ['Partner C', '0 h'],
    ]);
    const totalRow = within(table).getByRole('rowheader', { name: 'Yhteensä' }).closest('tr')!;
    expect(text(within(totalRow).getByTestId('hours-partners-sum'))).toBe('9,5 h');
    // No charts and no month table any more.
    expect(document.querySelector('.mini-bars')).toBeNull();
    expect(screen.getAllByRole('table')).toHaveLength(1);
  });

  it("expands a partner's entries by month; other partners' entries are read-only", async () => {
    signInForYear();
    const { user } = renderApp('/hours/totals');
    const toggle = await screen.findByRole('button', { name: 'Partner B' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');

    const panel = await screen.findByRole('region', { name: `Partner B: kirjaukset ${YEAR}` });
    expect(toggle).toHaveAttribute('aria-controls', panel.id);
    const march = await within(panel).findByRole('region', { name: 'Maaliskuu' });
    expect(within(march).getByText('Sound check')).toBeInTheDocument();
    expect(within(march).getByText('Meeting')).toBeInTheDocument();
    expect(text(within(march).getByLabelText('Kuukausi yhteensä Maaliskuu'))).toBe('5,25 h');
    expect(within(panel).queryByRole('textbox')).not.toBeInTheDocument();
    expect(within(panel).queryByRole('button', { name: /Poista/ })).not.toBeInTheDocument();
    expect(panel.querySelector('input')).toBeNull();
    expect(within(panel).getByText('Vain omia kirjauksia voi muokata.')).toBeInTheDocument();

    // Tapping the row again closes it.
    await user.click(toggle);
    expect(screen.queryByRole('region', { name: `Partner B: kirjaukset ${YEAR}` })).not.toBeInTheDocument();
  });

  it('tapping anywhere on the row toggles it; one partner open at a time', async () => {
    signInForYear();
    const { user } = renderApp('/hours/totals');
    const table = await screen.findByRole('table', { name: 'Osakkaat' });
    const hoursCell = within(table).getByRole('cell', { name: '5,25 h' });
    await user.click(hoursCell);
    expect(await screen.findByRole('region', { name: `Partner B: kirjaukset ${YEAR}` })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Partner C' }));
    const panelC = await screen.findByRole('region', { name: `Partner C: kirjaukset ${YEAR}` });
    expect(await within(panelC).findByText(`Ei tuntikirjauksia vuonna ${YEAR}.`)).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: `Partner B: kirjaukset ${YEAR}` })).not.toBeInTheDocument();
  });

  it('own entries are edited inline and the list and totals update', async () => {
    signInForYear();
    const { user } = renderApp('/hours/totals');
    await user.click(await screen.findByRole('button', { name: 'Partner A' }));
    const panel = await screen.findByRole('region', { name: `Partner A: kirjaukset ${YEAR}` });
    const january = await within(panel).findByRole('region', { name: 'Tammikuu' });
    expect(within(panel).queryByRole('region', { name: 'Joulukuu' })).not.toBeInTheDocument();
    expect(within(panel).getByRole('button', { name: /^Poista: .* Planning$/ })).toBeInTheDocument();
    expect(within(panel).queryByText('Vain omia kirjauksia voi muokata.')).not.toBeInTheDocument();

    const hours = within(january).getByRole('textbox', { name: /^Tunnit: .* Planning$/ });
    await user.clear(hours);
    await user.type(hours, '4{Enter}');
    const table = screen.getByRole('table', { name: 'Osakkaat' });
    await waitFor(() => expect(text(screen.getByTestId('hours-grand-total'))).toBe('11,5 h'));
    expect(text(within(january).getByLabelText('Kuukausi yhteensä Tammikuu'))).toBe('5,5 h');
    // Partner A now has the most hours, so it moves to the top.
    expect(partnerRows(table)[0]).toEqual(['Partner A', '6,25 h']);
    expect(text(screen.getByTestId('hours-partners-sum'))).toBe('11,5 h');
  });

  it('shows English texts', async () => {
    signInForYear().language = 'en';
    renderApp('/hours/totals');
    const table = await screen.findByRole('table', { name: 'Partners' });
    expect(screen.getByRole('region', { name: 'Total' })).toBeInTheDocument();
    expect(within(table).getByRole('columnheader', { name: `Hours ${YEAR}` })).toBeInTheDocument();
    expect(within(table).getByRole('rowheader', { name: 'Total' })).toBeInTheDocument();
  });

  it('switches between my hours and totals with tabs', async () => {
    signInForYear();
    const { user } = renderApp('/hours');
    await screen.findByRole('region', { name: 'Maaliskuu' });
    const tabs = screen.getByRole('navigation', { name: 'Tuntinäkymä' });
    await user.click(within(tabs).getByRole('link', { name: 'Yhteenveto' }));
    expect(await screen.findByTestId('hours-grand-total')).toBeInTheDocument();
    await user.click(within(tabs).getByRole('link', { name: 'Omat tunnit' }));
    expect(await screen.findByTestId('hours-year-total')).toBeInTheDocument();
  });

  it('has the add action in the page head only on my hours (no empty actions box on totals)', async () => {
    signInForYear();
    const { user } = renderApp('/hours/totals');
    await screen.findByTestId('hours-grand-total');
    const head = screen.getByRole('heading', { name: `Tunnit ${YEAR}` }).closest('.page-head') as HTMLElement;
    expect(head.querySelector('.page-actions')).toBeNull();

    const tabs = screen.getByRole('navigation', { name: 'Tuntinäkymä' });
    await user.click(within(tabs).getByRole('link', { name: 'Omat tunnit' }));
    expect(await within(head).findByRole('button', { name: 'Lisää tunnit' })).toBeInTheDocument();
  });
});
