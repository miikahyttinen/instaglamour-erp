import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import type { YearPage } from '../../api/types';
import { formatHours, formatMoney, todayIso } from '../../lib/format';
import { db } from '../../mocks/data';
import { setMockBudget } from '../../mocks/budgetHandlers';
import { hoursStateWith } from '../../mocks/hoursStore';
import { errorResponse } from '../../mocks/util';
import { mockYearPage } from '../../mocks/yearHandlers';
import { server } from '../../mocks/server';
import { addMockEvent, TEST_YEAR } from '../../test/eventFixtures';
import { PARTNER_A_EMAIL, renderApp, signInMock } from '../../test/renderApp';

const fiMoney = (cents: number) => formatMoney(cents, 'fi');

/** The label/value pair (`.year-fig`) whose label is `label`. */
function figure(label: string): HTMLElement {
  const el = screen.getByText(label, { selector: '.year-fig-label' }).closest<HTMLElement>('.year-fig');
  if (!el) throw new Error(`No figure ${label}`);
  return el;
}

/** The link (tile) that holds the figure `label`. */
function tile(label: string): HTMLAnchorElement {
  const el = figure(label).closest('a');
  if (!el) throw new Error(`No tile ${label}`);
  return el;
}

/** Exact displayed value of the figure `label` (keeps the non-breaking spaces of Intl). */
function tileValue(label: string): string | null {
  return figure(label).querySelector(':scope > .year-fig-value')?.textContent ?? null;
}

const budgetTable = () => screen.getByRole('table', { name: 'Budjetti' });
const rowText = (name: RegExp) => within(budgetTable()).getByRole('row', { name }).textContent ?? '';

function daysFromToday(days: number): string {
  const now = new Date();
  return todayIso(new Date(now.getFullYear(), now.getMonth(), now.getDate() + days));
}

/** Synthetic year page with round dummy amounts (BR-090). */
function fixedYear(year: number): YearPage {
  const partners = db.partners;
  return {
    year,
    events: {
      eventCount: 6,
      cancelledCount: 1,
      soldEventsSumCents: 500000,
      budgetedCostsCents: 300000,
      actualCostsCents: 200000,
      marginBudgetCents: 200000,
      marginActualCents: 300000,
    },
    hours: {
      partners: [
        { partnerId: partners[0]!.id, total: 12.5 },
        { partnerId: partners[1]!.id, total: 8 },
      ],
      grandTotal: 20.5,
    },
    budget: {
      budgetExpenseCents: 100000,
      budgetIncomeCents: 20000,
      actualExpenseCents: 70000,
      actualIncomeCents: 10000,
    },
    yearResultCents: 240000,
    upcomingEvents: [],
  };
}

function signInFor(year: number) {
  const partner = signInMock();
  partner.selectedYear = year;
  return partner;
}

describe('year page', () => {
  it('shows event, hours and budget figures and the year result for the selected year', async () => {
    signInFor(TEST_YEAR);
    const requested: string[] = [];
    server.use(
      http.get('/api/years/:year', ({ params }) => {
        requested.push(String(params.year));
        return HttpResponse.json(fixedYear(Number(params.year)));
      }),
    );
    renderApp('/');
    expect(await screen.findByRole('heading', { name: `Vuosi ${TEST_YEAR}` })).toBeInTheDocument();
    await screen.findByText('Myytyjen keikkojen summa');
    expect(requested).toEqual([String(TEST_YEAR)]);

    expect(tileValue('Keikkoja')).toBe('6');
    expect(tileValue('Peruttuja')).toBe('1');
    expect(tileValue('Myytyjen keikkojen summa')).toBe(fiMoney(500000));
    expect(tileValue('Kulut, budjetti')).toBe(fiMoney(300000));
    expect(tileValue('Kulut, toteuma')).toBe(fiMoney(200000));
    expect(tileValue('Kate, budjetti')).toBe(fiMoney(200000));
    expect(tileValue('Kate, toteuma')).toBe(fiMoney(300000));

    // Hours: every partner (0 h when missing) and the total.
    expect(tileValue('Partner A')).toBe(formatHours(12.5, 'fi'));
    expect(tileValue('Partner B')).toBe('8 h');
    expect(tileValue('Partner C')).toBe('0 h');
    expect(tileValue('Yhteensä')).toBe(formatHours(20.5, 'fi'));

    // Budget totals and year result.
    expect(rowText(/Kulut/)).toBe(`Kulut${fiMoney(100000)}${fiMoney(70000)}`);
    expect(rowText(/Tuotot/)).toBe(`Tuotot${fiMoney(20000)}${fiMoney(10000)}`);
    expect(tileValue('Vuoden tulos')).toBe(fiMoney(240000));
  });

  it('event figures come from the events of the selected year (mock store)', async () => {
    signInFor(TEST_YEAR);
    db.events.events = [];
    addMockEvent();
    addMockEvent({ startDate: `${TEST_YEAR}-07-01` });
    addMockEvent({ startDate: `${TEST_YEAR + 1}-07-01` });
    renderApp('/');
    await screen.findByText('Myytyjen keikkojen summa');
    const expected = mockYearPage(TEST_YEAR).events;
    expect(expected.eventCount).toBe(2);
    expect(tileValue('Keikkoja')).toBe('2');
    expect(tileValue('Myytyjen keikkojen summa')).toBe(fiMoney(expected.soldEventsSumCents));
    expect(tileValue('Kulut, budjetti')).toBe(fiMoney(expected.budgetedCostsCents));
    expect(tileValue('Kate, budjetti')).toBe(fiMoney(expected.marginBudgetCents));
  });

  it('hours and budget figures come from the hours and budget mock stores', async () => {
    signInFor(TEST_YEAR);
    const [a, b] = db.partners;
    db.hours = hoursStateWith([
      { id: 'h1', partnerId: a!.id, date: `${TEST_YEAR}-02-01`, comment: 'Planning', hours: 2 },
      { id: 'h2', partnerId: a!.id, date: `${TEST_YEAR}-05-01`, comment: 'Admin', hours: 1.5 },
      { id: 'h3', partnerId: b!.id, date: `${TEST_YEAR}-03-01`, comment: 'Planning', hours: 4 },
      { id: 'h4', partnerId: b!.id, date: `${TEST_YEAR - 1}-03-01`, comment: 'Old year', hours: 8 },
    ]);
    const [catA, catB] = db.reference.budgetCategories;
    setMockBudget(TEST_YEAR, catA!.id, { budgetExpenseCents: 100000, actualExpenseCents: 20000 });
    setMockBudget(TEST_YEAR, catB!.id, { budgetIncomeCents: 30000, actualIncomeCents: 10000 });
    renderApp('/');
    await screen.findByText('Myytyjen keikkojen summa');

    expect(tileValue('Partner A')).toBe(formatHours(3.5, 'fi'));
    expect(tileValue('Partner B')).toBe('4 h');
    expect(tileValue('Partner C')).toBe('0 h');
    expect(tileValue('Yhteensä')).toBe(formatHours(7.5, 'fi'));
    expect(rowText(/Kulut/)).toBe(`Kulut${fiMoney(100000)}${fiMoney(20000)}`);
    expect(rowText(/Tuotot/)).toBe(`Tuotot${fiMoney(30000)}${fiMoney(10000)}`);
    const events = mockYearPage(TEST_YEAR).events;
    expect(tileValue('Vuoden tulos')).toBe(fiMoney(events.soldEventsSumCents - events.actualCostsCents + 10000 - 20000));
  });

  it('figures link to their pages', async () => {
    signInFor(TEST_YEAR);
    server.use(http.get('/api/years/:year', ({ params }) => HttpResponse.json(fixedYear(Number(params.year)))));
    renderApp('/');
    await screen.findByText('Myytyjen keikkojen summa');

    for (const label of ['Keikkoja', 'Peruttuja', 'Myytyjen keikkojen summa', 'Kulut, toteuma', 'Kate, budjetti']) {
      expect(tile(label)).toHaveAttribute('href', '/gigs');
    }
    for (const label of ['Partner A', 'Yhteensä']) expect(tile(label)).toHaveAttribute('href', '/hours');
    expect(tile('Vuoden tulos')).toHaveAttribute('href', '/budget');
    for (const link of within(budgetTable()).getAllByRole('link')) {
      expect(link).toHaveAttribute('href', '/budget');
    }
    expect(within(screen.getByRole('heading', { level: 2, name: /^Keikat/ })).getByRole('link')).toHaveAttribute('href', '/gigs');
    expect(within(screen.getByRole('heading', { level: 2, name: /^Tunnit/ })).getByRole('link')).toHaveAttribute('href', '/hours');
    expect(within(screen.getByRole('heading', { level: 2, name: /^Budjetti/ })).getByRole('link')).toHaveAttribute('href', '/budget');
  });

  it('shows the next 5 upcoming sold events from today with the not-fully-staffed flag; an event opens its page', async () => {
    signInFor(TEST_YEAR);
    db.events.events = [];
    addMockEvent({ startDate: daysFromToday(-5), venue: 'Venue Past' });
    const cancelled = addMockEvent({ startDate: daysFromToday(1), venue: 'Venue Cancelled' });
    cancelled.status = 'CANCELLED';
    const deleted = addMockEvent({ startDate: daysFromToday(1), venue: 'Venue Deleted' });
    deleted.deletedAt = new Date().toISOString();
    const first = addMockEvent({ startDate: daysFromToday(0), venue: 'Venue 1' });
    for (const n of [2, 3, 4, 5, 6]) addMockEvent({ startDate: daysFromToday(n * 10), venue: `Venue ${n}` });

    const { user } = renderApp('/');
    const table = await screen.findByRole('table', { name: 'Tulevat keikat' });
    const rows = within(table).getAllByRole('row').slice(1);
    const items = rows.map((row) => within(row).getByRole('link'));
    expect(items.map((a) => a.textContent)).toEqual(
      ['Venue 1', 'Venue 2', 'Venue 3', 'Venue 4', 'Venue 5'].map((v) => expect.stringContaining(v)),
    );
    // Template A events have unstaffed musician lines (BR-023).
    expect(within(rows[0]!).getByText('Miehitys kesken')).toBeInTheDocument();
    expect(items[0]).toHaveAttribute('href', `/gigs/${first.id}`);

    await user.click(items[0]!);
    expect(await screen.findByRole('heading', { level: 1, name: /Template A/ })).toBeInTheDocument();
  });

  it('changing the year updates the figures; upcoming events stay relative to today', async () => {
    signInFor(TEST_YEAR);
    db.events.events = [];
    addMockEvent();
    addMockEvent({ startDate: daysFromToday(3), venue: 'Venue Soon' });
    const { user } = renderApp('/');
    await screen.findByText('Myytyjen keikkojen summa');
    expect(tileValue('Keikkoja')).toBe('1');
    expect(screen.getByText(/Venue Soon/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Edellinen vuosi' }));
    expect(await screen.findByRole('heading', { name: `Vuosi ${TEST_YEAR - 1}` })).toBeInTheDocument();
    await waitFor(() => expect(tileValue('Keikkoja')).toBe('0'));
    expect(screen.getByText(/Venue Soon/)).toBeInTheDocument();
  });

  it('an empty year shows zeros', async () => {
    signInFor(2040);
    db.events.events = [];
    renderApp('/');
    await screen.findByText('Myytyjen keikkojen summa');
    expect(tileValue('Keikkoja')).toBe('0');
    expect(tileValue('Peruttuja')).toBe('0');
    for (const label of ['Myytyjen keikkojen summa', 'Kulut, budjetti', 'Kulut, toteuma', 'Kate, budjetti', 'Kate, toteuma', 'Vuoden tulos']) {
      expect(tileValue(label)).toBe(fiMoney(0));
    }
    for (const label of ['Partner A', 'Partner B', 'Partner C', 'Yhteensä']) {
      expect(tileValue(label)).toBe('0 h');
    }
    expect(rowText(/Kulut/)).toBe(`Kulut${fiMoney(0)}${fiMoney(0)}`);
    expect(rowText(/Tuotot/)).toBe(`Tuotot${fiMoney(0)}${fiMoney(0)}`);
    expect(screen.getByText('Ei tulevia keikkoja.')).toBeInTheDocument();
  });

  it('is the page at / after sign-in', async () => {
    vi.stubEnv('VITE_DEV_LOGIN', 'true');
    const { user } = renderApp('/login');
    await user.type(await screen.findByLabelText('Sähköposti'), PARTNER_A_EMAIL);
    await user.click(screen.getByRole('button', { name: 'Kirjaudu' }));
    expect(await screen.findByText('Myytyjen keikkojen summa')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /^Vuosi \d{4}$/ })).toBeInTheDocument();
  });

  it('shows English texts', async () => {
    signInMock('partner.b@example.com');
    renderApp('/');
    expect(await screen.findByText('Sold gigs sum')).toBeInTheDocument();
    for (const text of ['Cancelled', 'Costs, budget', 'Margin, actual', 'Year result', 'Expenses', 'Income']) {
      expect(screen.getByText(text)).toBeInTheDocument();
    }
    expect(screen.getByRole('link', { name: /^Upcoming gigs/ })).toBeInTheDocument();
  });

  it('shows a translated error, never the server message, and can retry', async () => {
    signInFor(TEST_YEAR);
    server.use(http.get('/api/years/:year', () => errorResponse(403, 'FORBIDDEN', 'Internal server text'), { once: true }));
    const { user } = renderApp('/');
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Sinulla ei ole oikeutta tähän toimintoon.');
    expect(alert).not.toHaveTextContent('Internal server text');
    await user.click(within(alert).getByRole('button', { name: 'Yritä uudelleen' }));
    expect(await screen.findByText('Myytyjen keikkojen summa')).toBeInTheDocument();
  });
});
