import { screen, waitFor, within } from '@testing-library/react';
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
    expect(within(march).getByText('Rehearsal')).toBeInTheDocument();
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
    expect(screen.queryByText('Old year')).not.toBeInTheDocument();
    expect(screen.queryByText('Sound check')).not.toBeInTheDocument();
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
    expect(within(february).getByText('Admin work')).toBeInTheDocument();
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

  it('edits an own entry', async () => {
    signInForYear();
    const { user } = renderApp('/hours');
    await screen.findByRole('region', { name: 'Maaliskuu' });
    await user.click(screen.getByRole('button', { name: /^Muokkaa: .* Rehearsal$/ }));
    const dialog = screen.getByRole('dialog', { name: 'Muokkaa tuntikirjausta' });
    const hours = within(dialog).getByLabelText('Tunnit');
    expect(hours).toHaveValue('0,75');
    await user.clear(hours);
    await user.type(hours, '2,5');
    await user.click(within(dialog).getByRole('button', { name: 'Tallenna' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    const march = screen.getByRole('region', { name: 'Maaliskuu' });
    await waitFor(() =>
      expect(text(within(march).getByLabelText('Kuukausi yhteensä Maaliskuu'))).toBe('2,5 h'),
    );
    expect(db.hours.entries.find((e) => e.id === 'e3')?.hours).toBe(2.5);
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
  it('shows every partner with year total, 12 monthly totals and the grand total', async () => {
    signInForYear();
    renderApp('/hours/totals');
    const partnerA = await screen.findByRole('region', { name: 'Partner A' });
    const partnerB = screen.getByRole('region', { name: 'Partner B' });
    const partnerC = screen.getByRole('region', { name: 'Partner C' });

    expect(text(within(partnerA).getByLabelText('Yhteensä Partner A'))).toBe('4,25 h');
    expect(text(within(partnerB).getByLabelText('Yhteensä Partner B'))).toBe('5,25 h');
    expect(text(within(partnerC).getByLabelText('Yhteensä Partner C'))).toBe('0 h');
    expect(within(partnerA).getAllByRole('button')).toHaveLength(12);
    expect(within(partnerA).getByRole('button', { name: 'Partner A, Tammikuu: 3,5 h' })).toBeInTheDocument();
    expect(within(partnerA).getByRole('button', { name: 'Partner A, Helmikuu: 0 h' })).toBeInTheDocument();
    expect(within(partnerB).getByRole('button', { name: 'Partner B, Maaliskuu: 5,25 h' })).toBeInTheDocument();
    expect(text(screen.getByTestId('hours-grand-total'))).toBe('9,5 h');
  });

  it("tapping a month shows the entries; other partners' entries are read-only", async () => {
    signInForYear();
    const { user } = renderApp('/hours/totals');
    const partnerB = await screen.findByRole('region', { name: 'Partner B' });
    await user.click(within(partnerB).getByRole('button', { name: /^Partner B, Maaliskuu/ }));

    const detail = await screen.findByRole('region', { name: `Partner B: Maaliskuu ${YEAR}` });
    expect(await within(detail).findByText('Sound check')).toBeInTheDocument();
    expect(within(detail).getByText('Meeting')).toBeInTheDocument();
    expect(within(detail).queryByRole('button', { name: /Muokkaa|Poista/ })).not.toBeInTheDocument();
    expect(within(detail).getByText('Vain omia kirjauksia voi muokata.')).toBeInTheDocument();

    // Tapping the same month again closes it.
    await user.click(within(partnerB).getByRole('button', { name: /^Partner B, Maaliskuu/ }));
    expect(screen.queryByRole('region', { name: `Partner B: Maaliskuu ${YEAR}` })).not.toBeInTheDocument();
  });

  it('own entries in the month view can be edited', async () => {
    signInForYear();
    const { user } = renderApp('/hours/totals');
    const partnerA = await screen.findByRole('region', { name: 'Partner A' });
    await user.click(within(partnerA).getByRole('button', { name: /^Partner A, Tammikuu/ }));
    const detail = await screen.findByRole('region', { name: `Partner A: Tammikuu ${YEAR}` });
    expect(await within(detail).findByText('Planning')).toBeInTheDocument();
    expect(within(detail).getByRole('button', { name: /^Muokkaa: .* Planning$/ })).toBeInTheDocument();
    expect(within(detail).queryByText('Rehearsal')).not.toBeInTheDocument();
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
});
