import { screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setLanguage } from '../../i18n';
import { formatMoneyWhole } from '../../lib/format';
import { db } from '../../mocks/data';
import { offerStats } from '../../mocks/offerStore';
import { server } from '../../mocks/server';
import { addMockClient, TEST_YEAR } from '../../test/eventFixtures';
import { addMockOffer } from '../../test/offerFixtures';
import { renderApp, signInMock } from '../../test/renderApp';

// Synthetic data only (BR-090). The mock seed's offers are removed so the figures are exact.

const plain = (s: string | null | undefined) => (s ?? '').replace(/\s/g, ' ');
const fiMoney = (cents: number) => plain(formatMoneyWhole(cents, 'fi'));
const region = (name: RegExp) => screen.getByRole('region', { name });

/** `YYYY-MM` of `n` months before the current month (local time ≈ Helsinki in tests). */
function monthsAgo(n: number): string {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() - n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
/** A mid-month, mid-day timestamp in `YYYY-MM` (no timezone edge). */
const inMonth = (month: string) => `${month}-15T10:00:00.000Z`;

describe('offer KPI cards (BR-122, TASK-157)', () => {
  let clientId: string;
  beforeEach(() => {
    // "Now" is in TEST_YEAR, before the fixtures' event dates (so they are open). The year cards
    // follow the current year, not the partner's selected year (contract "Year is no longer global").
    vi.useFakeTimers({ toFake: ['Date'], now: new Date(`${TEST_YEAR}-03-15T12:00:00.000Z`) });
    signInMock().selectedYear = TEST_YEAR - 10;
    db.offers.offers.length = 0;
    clientId = addMockClient('Client X').id;
  });

  function seed() {
    const last = monthsAgo(1);
    const earlier = monthsAgo(3);
    const a = addMockOffer({ clientId, eventName: 'Event A', priceCents: 200000, eventType: 'WEDDING' });
    a.createdAt = inMonth(last);
    const b = addMockOffer({ clientId, eventName: 'Event B', priceCents: 100000, eventType: 'CORPORATE' });
    b.createdAt = inMonth(last);
    const c = addMockOffer({ clientId, eventName: 'Event C', priceCents: 50000, eventType: 'CORPORATE' });
    c.createdAt = inMonth(earlier);
    const w = addMockOffer({
      clientId,
      eventName: 'Event W',
      eventDate: `${TEST_YEAR - 1}-05-01`,
      priceCents: 300000,
      eventType: 'WEDDING',
      disposition: 'WON',
    });
    w.createdAt = `${TEST_YEAR - 2}-03-15T10:00:00.000Z`;
    const l = addMockOffer({
      clientId,
      eventName: 'Event L',
      priceCents: null,
      eventType: 'WEDDING',
      disposition: 'LOST_PRICE',
    });
    l.createdAt = `${TEST_YEAR - 2}-04-15T10:00:00.000Z`;
    return { last, earlier };
  }

  afterEach(() => {
    vi.useRealTimers();
  });

  it('asks for the stats without a year', async () => {
    const urls: string[] = [];
    const listener = ({ request }: { request: Request }) => {
      if (new URL(request.url).pathname === '/api/offers/stats') urls.push(request.url);
    };
    server.events.on('request:start', listener);
    renderApp('/offers');
    await screen.findByRole('region', { name: /^Luodut tarjoukset/ });
    expect(urls.length).toBeGreaterThan(0);
    for (const url of urls) expect(new URL(url).searchParams.has('year')).toBe(false);
    server.events.removeListener('request:start', listener);
  });

  it('shows the six cards with their figures, in FI', async () => {
    const { last } = seed();
    renderApp('/offers');
    expect(await screen.findByRole('heading', { level: 2, name: 'Tarjoustilastot' })).toBeInTheDocument();

    // 1 Offers created: the latest completed month is selected by default.
    const created = await screen.findByRole('region', { name: /^Luodut tarjoukset · / });
    expect(within(created).getByRole('heading', { level: 3 }).textContent).toContain(String(Number(last.slice(0, 4))));
    expect(plain(created.textContent)).toContain(`2${fiMoney(300000)}Yhteensä`);
    const monthBars = within(created).getAllByRole('button');
    expect(monthBars).toHaveLength(6);
    expect(monthBars[5]).toHaveAttribute('aria-pressed', 'true');
    expect(plain(monthBars[5]!.getAttribute('aria-label'))).toContain(`2 kpl, ${fiMoney(300000)}`);
    expect(monthBars[5]).toHaveAttribute('title', monthBars[5]!.getAttribute('aria-label'));

    // 2 Average: the current year (TEST_YEAR) has A and B created last month; TEST_YEAR-2 has one priced offer.
    const avg = region(new RegExp(`^Keskiarvo · ${TEST_YEAR}$`));
    expect(plain(avg.textContent)).toContain(fiMoney(150000));
    expect(within(avg).getAllByRole('button')).toHaveLength(6);
    expect(plain(within(avg).getByRole('button', { name: new RegExp(`^${TEST_YEAR - 2}:`) }).getAttribute('aria-label'))).toBe(
      `${TEST_YEAR - 2}: ${fiMoney(300000)}`,
    );

    // 3 Offers for the year by event date: all statuses.
    const byYear = region(new RegExp(`^Tarjoukset vuodelle \\(tapahtuman päivä\\) · ${TEST_YEAR}$`));
    expect(plain(byYear.textContent)).toContain(`4${fiMoney(350000)}Yhteensä`);

    // 4 Open offers value: current year − 3 … + 2, the current year selected.
    const open = region(new RegExp(`^Avoimet tarjoukset · ${TEST_YEAR}$`));
    expect(plain(open.textContent)).toContain(fiMoney(350000));
    expect(open).toHaveTextContent('Määrä 3');
    const openBars = within(open).getAllByRole('button');
    expect(openBars.map((b) => b.getAttribute('aria-label')?.slice(0, 4))).toEqual(
      [-3, -2, -1, 0, 1, 2].map((i) => String(TEST_YEAR + i)),
    );
    expect(openBars[3]).toHaveAttribute('aria-pressed', 'true');
    // The other year cards use the same range.
    for (const card of [avg, byYear]) {
      expect(within(card).getAllByRole('button').map((b) => b.getAttribute('aria-label')?.slice(0, 4))).toEqual(
        [-3, -2, -1, 0, 1, 2].map((i) => String(TEST_YEAR + i)),
      );
    }

    // 5 By event type (open offers), value desc.
    const types = region(/^Tapahtumatyypeittäin$/);
    const typeRows = within(types).getAllByRole('listitem').map((li) => plain(li.textContent));
    expect(typeRows).toEqual([`Häät1 / ${fiMoney(200000)}`, `Yritystilaisuus2 / ${fiMoney(150000)}`]);

    // 6 Win rate: all years, per event type in EVENT_TYPES order.
    const win = region(/^Voittoprosentti$/);
    expect(plain(win.textContent)).toContain('50 %');
    expect(win).toHaveTextContent('1 / 2');
    const winRows = within(win).getAllByRole('listitem').map((li) => plain(li.textContent));
    expect(winRows).toEqual(['Yksityisjuhla– · 0 / 0', 'Häät50 % · 1 / 2', 'Yritystilaisuus– · 0 / 0']);
  });

  it('selects a month and years by clicking (or keyboard on) a bar', async () => {
    const { earlier } = seed();
    const { user } = renderApp('/offers');
    const created = await screen.findByRole('region', { name: /^Luodut tarjoukset · / });
    const bars = within(created).getAllByRole('button');
    await user.click(bars[3]!); // three months ago
    expect(bars[3]).toHaveAttribute('aria-pressed', 'true');
    expect(bars[5]).toHaveAttribute('aria-pressed', 'false');
    expect(plain(created.textContent)).toContain(`1${fiMoney(50000)}Yhteensä`);
    expect(within(created).getByRole('heading', { level: 3 }).textContent).toContain(earlier.slice(0, 4));

    // Keyboard: focus a bar and press Enter.
    const avg = region(new RegExp(`^Keskiarvo · ${TEST_YEAR}$`));
    const y2 = within(avg).getByRole('button', { name: new RegExp(`^${TEST_YEAR - 2}:`) });
    y2.focus();
    await user.keyboard('{Enter}');
    expect(region(new RegExp(`^Keskiarvo · ${TEST_YEAR - 2}$`))).toHaveTextContent(fiMoney(300000));
    expect(y2).toHaveAttribute('aria-pressed', 'true');

    const byYear = region(/^Tarjoukset vuodelle/);
    await user.click(within(byYear).getByRole('button', { name: new RegExp(`^${TEST_YEAR - 1}:`) }));
    const selected = region(new RegExp(`^Tarjoukset vuodelle \\(tapahtuman päivä\\) · ${TEST_YEAR - 1}$`));
    expect(plain(selected.textContent)).toContain(`1${fiMoney(300000)}Yhteensä`);

    const open = region(/^Avoimet tarjoukset · /);
    await user.click(within(open).getByRole('button', { name: new RegExp(`^${TEST_YEAR + 1}:`) }));
    expect(region(new RegExp(`^Avoimet tarjoukset · ${TEST_YEAR + 1}$`))).toHaveTextContent('Määrä 0');
  });

  it('shows empty states and dashes without any offers', async () => {
    renderApp('/offers');
    const created = await screen.findByRole('region', { name: /^Luodut tarjoukset · / });
    expect(plain(created.textContent)).toContain(`0${fiMoney(0)}`);
    expect(region(/^Keskiarvo · /)).toHaveTextContent('–');
    expect(region(/^Tapahtumatyypeittäin$/)).toHaveTextContent('Ei avoimia tarjouksia');
    const win = region(/^Voittoprosentti$/);
    expect(win).toHaveTextContent('0 / 0');
    expect(within(win).getAllByRole('listitem')).toHaveLength(3);
    expect(within(win).getAllByText('–', { exact: false }).length).toBeGreaterThan(0);
  });

  it('ignores deleted offers and counts all years in the mock (contract)', () => {
    seed();
    const deleted = addMockOffer({ clientId, eventName: 'Event D', priceCents: 999900 });
    deleted.deletedAt = new Date().toISOString();
    const stats = offerStats(db.offers, TEST_YEAR);
    expect(stats.byEventYear.map((y) => y.year)).toEqual([0, 1, 2, 3, 4, 5].map((i) => TEST_YEAR - 3 + i));
    expect(stats.byEventYear.find((y) => y.year === TEST_YEAR)).toEqual({ year: TEST_YEAR, count: 4, valueCents: 350000 });
    expect(stats.averageByCreatedYear.find((y) => y.year === TEST_YEAR - 2)).toEqual({
      year: TEST_YEAR - 2,
      count: 1, // priced offers only
      averageCents: 300000,
    });
    expect(stats.createdByMonth.map((m) => m.month)).toEqual([6, 5, 4, 3, 2, 1].map(monthsAgo));
    expect(stats.winRate).toMatchObject({ pct: 50, won: 1, decided: 2 });
  });

  it('orders open offers by type: value desc, then count, "no type" last; untyped only in the overall rate', async () => {
    addMockOffer({ clientId, eventName: 'Event N', priceCents: 100000, eventType: null });
    addMockOffer({ clientId, eventName: 'Event P', priceCents: 100000, eventType: 'PRIVATE' });
    addMockOffer({ clientId, eventName: 'Event K', priceCents: 50000, eventType: 'CORPORATE' });
    addMockOffer({ clientId, eventName: 'Event K2', priceCents: 50000, eventType: 'CORPORATE' });
    addMockOffer({ clientId, eventName: 'Event U', eventType: null, disposition: 'WON' });
    const stats = offerStats(db.offers, TEST_YEAR);
    expect(stats.openByEventType.map((r) => r.eventType)).toEqual(['CORPORATE', 'PRIVATE', null]);
    expect(stats.winRate).toMatchObject({ pct: 100, won: 1, decided: 1 });
    expect(stats.winRate.byEventType.every((r) => r.decided === 0)).toBe(true);

    renderApp('/offers');
    const types = await screen.findByRole('region', { name: /^Tapahtumatyypeittäin$/ });
    expect(within(types).getAllByRole('listitem').at(-1)).toHaveTextContent(/^Ei tyyppiä1 \/ /);
  });

  it('is in English for English users', async () => {
    seed();
    signInMock('partner.b@example.com').selectedYear = TEST_YEAR - 10;
    setLanguage('en');
    renderApp('/offers');
    expect(await screen.findByRole('heading', { level: 2, name: 'Offer statistics' })).toBeInTheDocument();
    const created = await screen.findByRole('region', { name: /^Offers created · / });
    expect(created).toHaveTextContent(`2${formatMoneyWhole(300000, 'en')}Total value`);
    expect(region(new RegExp(`^Average value · ${TEST_YEAR}$`))).toBeInTheDocument();
    expect(region(new RegExp(`^Offers for the year \\(event date\\) · ${TEST_YEAR}$`))).toBeInTheDocument();
    expect(region(new RegExp(`^Open offers value · ${TEST_YEAR}$`))).toHaveTextContent('€3,500');
    expect(region(/^By event type$/)).toHaveTextContent(`Wedding1 / €2,000`);
    expect(region(/^Win rate$/)).toHaveTextContent('50%');
  });
});
