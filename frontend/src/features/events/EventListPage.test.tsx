import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import { App } from '../../App';
import { createQueryClient } from '../../queryClient';
import { formatMoney } from '../../lib/format';
import { DESKTOP_QUERY, TABLET_QUERY, WIDE_QUERY } from '../../lib/useMediaQuery';
import { db } from '../../mocks/data';
import { addInvoiceRow, logEvent } from '../../mocks/eventStore';
import type { InvoiceRowStatus } from '../../api/enums';
import { addMockClient, addMockEvent, partnerA, partnerB, staffMockEvent, TEST_YEAR } from '../../test/eventFixtures';
import { installMatchMedia } from '../../test/matchMedia';
import { renderApp, signInMock } from '../../test/renderApp';

const fi = (cents: number) => formatMoney(cents, 'fi').replace(/\s/g, ' ');
const table = () => screen.getByRole('table', { name: 'Keikkalista' });
const rows = () => within(table()).getAllByRole('row').filter((r) => r.closest('tbody'));
/** Accessible names of the event links, in row order ("Lineup · Venue"). */
const eventNames = () =>
  rows().map((r) => within(r).getByRole('link', { name: /·/ }).textContent!.replace(/\s+/g, ' ').trim());
const venues = () => eventNames().map((n) => n.split(' · ')[1]);

const FULL = ['Person 1', 'Person 2', 'Person 3', 'Person 4'];

function UrlProbe() {
  const { pathname, search } = useLocation();
  return <output data-testid="url">{decodeURIComponent(pathname + search)}</output>;
}

/** Like `renderApp`, plus `url()`: the current path + query (decoded), to "reload" with it. */
function renderAppWithUrl(path: string) {
  const user = userEvent.setup();
  const result = render(
    <MemoryRouter initialEntries={[path]}>
      <App queryClient={createQueryClient({ retry: false })} />
      <UrlProbe />
    </MemoryRouter>,
  );
  return { ...result, user, url: () => screen.getByTestId('url').textContent };
}

describe('event list (UC-003)', () => {
  beforeEach(() => {
    signInMock().selectedYear = TEST_YEAR;
  });

  it('lists the SOLD events of the year by date (Tila filter on by default); the year summary is unfiltered', async () => {
    addMockEvent({ startDate: `${TEST_YEAR}-09-01`, venue: 'Venue Y', priceCents: 200000 });
    const full = addMockEvent({ startDate: `${TEST_YEAR}-03-01`, venue: 'Venue X', additionalSalesCents: 10000 });
    staffMockEvent(full, FULL);
    const cancelled = addMockEvent({ startDate: `${TEST_YEAR}-05-01`, venue: 'Venue V', priceCents: 10000 });
    cancelled.status = 'CANCELLED';
    addMockEvent({ startDate: `${TEST_YEAR + 1}-01-10`, venue: 'Venue Next' });

    installMatchMedia({ [TABLET_QUERY]: true, [DESKTOP_QUERY]: true, [WIDE_QUERY]: true });
    renderApp('/gigs');
    await screen.findByRole('heading', { name: `Keikat ${TEST_YEAR}` });
    await waitFor(() => expect(venues()).toEqual(['Venue X', 'Venue Y']));
    // Header titles (the sort buttons; the filter buttons are icons).
    expect(within(table()).getAllByRole('columnheader').map((h) => within(h).getAllByRole('button')[0]!.textContent)).toEqual([
      'Kokoonpano',
      'Päivä',
      'Paikka',
      'Asiakas',
      'Tila',
      'Laskutus',
      'Miehitys kesken',
      'Myyjä',
      'Tuottaja',
      'Kokonaishinta',
      'Laskuttamatta',
      'Kulut, budjetti',
      'Kulut, toteuma',
      'Kate-%',
    ]);
    // Column priorities (TASK-147): 2 hidden below 1100 px, 3 below 1400 px of table width.
    expect(within(table()).getAllByRole('columnheader').map((h) => h.getAttribute('data-priority'))).toEqual([
      '1', '1', '1', '2', '1', '2', '2', '2', '3', '1', '3', '3', '3', '1',
    ]);
    expect(within(rows()[0]!).getAllByRole('cell').map((c) => c.getAttribute('data-priority'))).toEqual([
      '1', '1', '1', '2', '1', '2', '2', '2', '3', '1', '3', '3', '3', '1',
    ]);
    expect(within(table()).getByRole('columnheader', { name: /Päivä/ })).toHaveAttribute('aria-sort', 'ascending');
    expect(rows()[0]).toHaveTextContent(fi(110000));
    expect(rows()[0]).not.toHaveTextContent('Miehitys kesken');
    expect(rows()[1]).toHaveTextContent('Miehitys kesken');
    expect(within(rows()[0]!).getByRole('link', { name: 'Template A · Venue X' })).toHaveAttribute(
      'href',
      `/gigs/${full.id}`,
    );
    // The default "SOLD" = Tuleva + Soitettu: the Tila filter is on, cancelled are hidden.
    expect(within(table()).getByRole('button', { name: 'Suodata: Tila' })).toHaveClass('is-active');
    expect(screen.getByText('Näytetään 2 / 3')).toHaveAttribute('role', 'status');

    const summary = screen.getByRole('region', { name: 'Vuosi yhteensä' });
    // Sold gigs sum includes the cancelled event (BR-082) even though the list hides it.
    expect(within(summary).getByText('Myytyjen keikkojen summa').nextSibling).toHaveTextContent(
      fi(110000 + 200000 + 10000),
    );
    expect(within(summary).getByText('Keikkoja').nextSibling).toHaveTextContent('2');
    expect(summary).toHaveTextContent('Lisäksi peruttuja keikkoja: 1');
    // No filter dropdowns / toggles above the table any more; the search stays.
    expect(screen.queryByRole('combobox', { name: 'Myyjä' })).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: 'Näytä myös perutut' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Tulevat' })).not.toBeInTheDocument();
    expect(screen.getByRole('searchbox', { name: 'Haku' })).toBeInTheDocument();
  });

  it('shows played and cancelled events through the Tila filter (Tuleva / Soitettu / Peruttu)', async () => {
    signInMock().selectedYear = 2020;
    addMockEvent({ startDate: '2020-02-01', venue: 'Venue Old' });
    const cancelled = addMockEvent({ startDate: '2020-03-01', venue: 'Venue Gone' });
    cancelled.status = 'CANCELLED';
    installMatchMedia({ [TABLET_QUERY]: true });
    const { user } = renderApp('/gigs');
    await waitFor(() => expect(venues()).toEqual(['Venue Old']));
    expect(within(rows()[0]!).getByText('Soitettu')).toHaveClass('tag-ok');

    await user.click(within(table()).getByRole('button', { name: 'Suodata: Tila' }));
    const popover = screen.getByRole('dialog', { name: 'Suodata: Tila' });
    // Values of the data plus the selected ones (the default Tuleva), in status order.
    expect(within(popover).getAllByRole('checkbox').map((c) => c.closest('label')!.textContent)).toEqual([
      'Tuleva',
      'Soitettu',
      'Peruttu',
    ]);
    expect(within(popover).getByRole('checkbox', { name: 'Soitettu' })).toBeChecked();
    expect(within(popover).getByRole('checkbox', { name: 'Peruttu' })).not.toBeChecked();
    await user.click(within(popover).getByRole('checkbox', { name: 'Peruttu' }));
    await user.click(within(popover).getByRole('button', { name: 'OK' }));
    expect(venues()).toEqual(['Venue Old', 'Venue Gone']);
    expect(within(rows()[1]!).getByText('Peruttu')).toHaveClass('tag-danger');
    // Every value selected = no filter.
    expect(within(table()).getByRole('button', { name: 'Suodata: Tila' })).not.toHaveClass('is-active');
  });

  it('keeps an explicit "every status" Tila choice in the URL, so it survives a reload (F-008)', async () => {
    signInMock().selectedYear = 2020;
    addMockEvent({ startDate: '2020-02-01', venue: 'Venue Old' });
    const cancelled = addMockEvent({ startDate: '2020-03-01', venue: 'Venue Gone' });
    cancelled.status = 'CANCELLED';
    installMatchMedia({ [TABLET_QUERY]: true });

    // Tick "Peruttu" (= every status): the URL gets the "all" marker, the table shows no filter.
    const first = renderAppWithUrl('/gigs');
    await waitFor(() => expect(venues()).toEqual(['Venue Old']));
    await first.user.click(within(table()).getByRole('button', { name: 'Suodata: Tila' }));
    const popover = screen.getByRole('dialog', { name: 'Suodata: Tila' });
    await first.user.click(within(popover).getByRole('checkbox', { name: 'Peruttu' }));
    await first.user.click(within(popover).getByRole('button', { name: 'OK' }));
    expect(venues()).toEqual(['Venue Old', 'Venue Gone']);
    expect(first.url()).toBe('/gigs?f.allStatuses=1');
    expect(screen.queryByRole('button', { name: 'Tyhjennä suodattimet' })).not.toBeInTheDocument();
    const reloadUrl = first.url();
    first.unmount();

    // "Reload": the same rows; the Tila filter is not active and no "Clear filters" is offered.
    const second = renderAppWithUrl(reloadUrl);
    await waitFor(() => expect(venues()).toEqual(['Venue Old', 'Venue Gone']));
    expect(within(table()).getByRole('button', { name: 'Suodata: Tila' })).not.toHaveClass('is-active');
    expect(screen.queryByRole('button', { name: 'Tyhjennä suodattimet' })).not.toBeInTheDocument();
    second.unmount();

    // "Tyhjennä suodattimet" also shows every status, and so does a reload after it.
    const third = renderAppWithUrl('/gigs?f.status=CANCELLED');
    await waitFor(() => expect(venues()).toEqual(['Venue Gone']));
    await third.user.click(screen.getByRole('button', { name: 'Tyhjennä suodattimet' }));
    expect(venues()).toEqual(['Venue Old', 'Venue Gone']);
    const clearedUrl = third.url();
    expect(clearedUrl).toBe('/gigs?f.allStatuses=1');
    third.unmount();
    renderAppWithUrl(clearedUrl);
    await waitFor(() => expect(venues()).toEqual(['Venue Old', 'Venue Gone']));
  });

  it('a plain /events link still opens with the default Tila filter (F-008)', async () => {
    signInMock().selectedYear = 2020;
    addMockEvent({ startDate: '2020-02-01', venue: 'Venue Old' });
    const cancelled = addMockEvent({ startDate: '2020-03-01', venue: 'Venue Gone' });
    cancelled.status = 'CANCELLED';
    installMatchMedia({ [TABLET_QUERY]: true });
    const { url } = renderAppWithUrl('/gigs');
    await waitFor(() => expect(venues()).toEqual(['Venue Old']));
    expect(within(table()).getByRole('button', { name: 'Suodata: Tila' })).toHaveClass('is-active');
    expect(url()).toBe('/gigs');
  });

  it('filters in the column headers (seller, staffing, client, lineup, venue, producer), AND with the search', async () => {
    const clientId = addMockClient('Client X').id;
    const staffed = addMockEvent({ venue: 'Venue X', notes: 'Outdoor stage', clientId });
    staffMockEvent(staffed, FULL);
    addMockEvent({ venue: 'Venue Y', sellerId: partnerB().id, startDate: `${TEST_YEAR}-07-01` });
    addMockEvent({ venue: 'Venue Z', producerId: partnerB().id, startDate: `${TEST_YEAR}-08-01`, clientId });
    installMatchMedia({ [TABLET_QUERY]: true });
    const { user } = renderApp('/gigs');
    await waitFor(() => expect(rows()).toHaveLength(3));
    for (const column of ['Kokoonpano', 'Paikka', 'Asiakas', 'Tila', 'Miehitys kesken', 'Myyjä', 'Tuottaja']) {
      expect(within(table()).getByRole('button', { name: `Suodata: ${column}` })).toBeInTheDocument();
    }

    const pick = async (column: string, ...values: string[]) => {
      await user.click(within(table()).getByRole('button', { name: `Suodata: ${column}` }));
      const popover = screen.getByRole('dialog', { name: `Suodata: ${column}` });
      await user.click(within(popover).getByRole('button', { name: 'Tyhjennä' }));
      for (const v of values) await user.click(within(popover).getByRole('checkbox', { name: v }));
      await user.click(within(popover).getByRole('button', { name: 'OK' }));
    };

    await pick('Myyjä', 'Partner B');
    expect(venues()).toEqual(['Venue Y']);
    await user.click(screen.getByRole('button', { name: 'Tyhjennä suodattimet' }));
    // "Clear filters" clears the default status filter too (every status shown).
    expect(rows()).toHaveLength(3);

    await pick('Miehitys kesken', 'Kyllä');
    expect(venues()).toEqual(['Venue Y', 'Venue Z']);
    await pick('Asiakas', 'Client X');
    expect(venues()).toEqual(['Venue Z']);
    await user.click(screen.getByRole('button', { name: 'Tyhjennä suodattimet' }));

    await pick('Asiakas', '(tyhjä)');
    expect(venues()).toEqual(['Venue Y']);
    await user.click(screen.getByRole('button', { name: 'Tyhjennä suodattimet' }));

    await pick('Tuottaja', 'Partner B');
    expect(venues()).toEqual(['Venue Z']);
    await user.click(screen.getByRole('button', { name: 'Tyhjennä suodattimet' }));
    await pick('Paikka', 'Venue X', 'Venue Y');
    await pick('Kokoonpano', 'Template A');
    expect(venues()).toEqual(['Venue X', 'Venue Y']);

    // The search narrows the rows from the API; the column filters still apply.
    await user.type(screen.getByRole('searchbox', { name: 'Haku' }), 'outdoor');
    await waitFor(() => expect(venues()).toEqual(['Venue X']));
    await user.clear(screen.getByRole('searchbox', { name: 'Haku' }));
    await user.type(screen.getByRole('searchbox', { name: 'Haku' }), 'nothing at all');
    expect(await screen.findByText('Ei hakuehtoja vastaavia keikkoja.')).toBeInTheDocument();
  });

  it('keeps the filters and sort in the URL and shows a message when the filters hide every row', async () => {
    addMockEvent({ venue: 'Venue X', priceCents: 100000 });
    addMockEvent({ venue: 'Venue Y', priceCents: 300000, startDate: `${TEST_YEAR}-07-01` });
    installMatchMedia({ [TABLET_QUERY]: true });
    const { user } = renderApp(`/gigs?sort=total&dir=desc&f.seller=${partnerA().id}`);
    await waitFor(() => expect(venues()).toEqual(['Venue Y', 'Venue X']));
    expect(within(table()).getByRole('columnheader', { name: /Kokonaishinta/ })).toHaveAttribute(
      'aria-sort',
      'descending',
    );
    // A URL with filters but no status filter still gets the default.
    expect(within(table()).getByRole('button', { name: 'Suodata: Tila' })).toHaveClass('is-active');
    expect(within(table()).getByRole('button', { name: 'Suodata: Myyjä' })).toHaveClass('is-active');

    await user.click(within(table()).getByRole('button', { name: 'Suodata: Tila' }));
    const popover = screen.getByRole('dialog', { name: 'Suodata: Tila' });
    await user.click(within(popover).getByRole('button', { name: 'Tyhjennä' }));
    // Values of the data + the selected ones: no cancelled events, so no "Peruttu".
    expect(within(popover).getAllByRole('checkbox').map((c) => c.closest('label')!.textContent)).toEqual([
      'Tuleva',
      'Soitettu',
    ]);
    await user.click(within(popover).getByRole('checkbox', { name: 'Soitettu' }));
    await user.click(within(popover).getByRole('button', { name: 'OK' }));
    expect(await screen.findByText('Ei suodattimia vastaavia keikkoja.')).toBeInTheDocument();
    await user.click(screen.getAllByRole('button', { name: 'Tyhjennä suodattimet' })[0]!);
    await waitFor(() => expect(rows()).toHaveLength(2));

    // The filters live in the URL: they survive a trip to the Deleted view.
    await user.click(within(table()).getByRole('button', { name: 'Suodata: Paikka' }));
    await user.click(within(screen.getByRole('dialog', { name: 'Suodata: Paikka' })).getByRole('checkbox', { name: 'Venue X' }));
    await user.click(screen.getByRole('button', { name: 'OK' }));
    expect(venues()).toEqual(['Venue Y']);
    await user.click(screen.getByRole('button', { name: 'Poistetut' }));
    expect(await screen.findByText(`Ei poistettuja keikkoja vuonna ${TEST_YEAR}.`)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Keikat' }));
    await waitFor(() => expect(venues()).toEqual(['Venue Y']));
  });

  it('shows "Laskutus" as one invoicing state tag, sorted, with one Laskutus filter', async () => {
    signInMock().selectedYear = 2020;
    // Default mock gig total: 1 000,00 €.
    const add = (day: string, venue: string, rows: [InvoiceRowStatus, number][], priceCents = 100000) => {
      const e = addMockEvent({ startDate: `2020-${day}`, venue, priceCents });
      for (const [status, amountCents] of rows) {
        addInvoiceRow(db.events, e, { description: 'Invoice', amountCents, status }, partnerA().id);
      }
      return e;
    };
    add('01-05', 'Venue Full', [['SENT', 120000]]);
    add('01-04', 'Venue Partly', [['SENT', 40000]]);
    add('01-03', 'Venue Open', [['SENT', 40000], ['NOT_SENT', 60000]]);
    add('01-02', 'Venue New', []);
    add('01-01', 'Venue Zero', [], 0);
    installMatchMedia({ [TABLET_QUERY]: true, [DESKTOP_QUERY]: true, [WIDE_QUERY]: true });
    const { user, url } = renderAppWithUrl(`/gigs`);
    await waitFor(() => expect(venues()).toHaveLength(5));
    const cell = (venue: string, label: string) => {
      const row = rows()[venues().indexOf(venue)]!;
      return within(row).getAllByRole('cell').find((c) => c.getAttribute('data-label') === label)!;
    };
    /** The single tag of the Laskutus cell (tone class + text), or '–'. */
    const tag = (venue: string) => {
      const c = cell(venue, 'Laskutus');
      const tags = c.querySelectorAll('.tag');
      expect(tags.length).toBeLessThanOrEqual(1);
      const t = tags[0];
      return t ? `${[...t.classList].find((k) => k.startsWith('tag-'))} ${t.textContent}` : c.textContent;
    };
    expect(tag('Venue Zero')).toBe('–');
    expect(tag('Venue New')).toBe('tag-info Osittain laskutettu');
    expect(tag('Venue Open')).toBe('tag-yellow Avoimia laskuja');
    expect(tag('Venue Partly')).toBe('tag-info Osittain laskutettu');
    expect(tag('Venue Full')).toBe('tag-ok-strong Laskutettu');
    // Laskuttamatta = total − sent rows; negative in warn colour.
    expect(cell('Venue New', 'Laskuttamatta')).toHaveTextContent(/1\s000,00\s€/);
    expect(cell('Venue Open', 'Laskuttamatta')).toHaveTextContent(/600,00\s€/);
    expect(cell('Venue Full', 'Laskuttamatta').querySelector('.event-balance-negative')).toHaveTextContent(/[-−]200,00\s€/);

    await user.click(within(table()).getByRole('button', { name: /^Laskutus/ }));
    expect(venues()).toEqual(['Venue Zero', 'Venue Open', 'Venue New', 'Venue Partly', 'Venue Full']);

    // One filter button in the Laskutus header; no Maksut filter.
    expect(within(table()).queryByRole('button', { name: 'Suodata: Maksut' })).not.toBeInTheDocument();
    await user.click(within(table()).getByRole('button', { name: 'Suodata: Laskutus' }));
    let popover = screen.getByRole('dialog', { name: 'Suodata: Laskutus' });
    const options = () => within(popover).getAllByRole('checkbox').map((c) => c.closest('label')!.textContent);
    expect(options()).toEqual(['–', 'Avoimia laskuja', 'Osittain laskutettu', 'Laskutettu']);
    await user.click(within(popover).getByRole('button', { name: 'Tyhjennä' }));
    await user.click(within(popover).getByRole('checkbox', { name: 'Avoimia laskuja' }));
    await user.click(within(popover).getByRole('button', { name: 'OK' }));
    expect(venues()).toEqual(['Venue Open']);
    expect(url()).toContain('f.invoiceState=OPEN_INVOICES');

    await user.click(within(table()).getByRole('button', { name: 'Suodata: Laskutus' }));
    popover = screen.getByRole('dialog', { name: 'Suodata: Laskutus' });
    await user.click(within(popover).getByRole('button', { name: 'Tyhjennä' }));
    await user.click(within(popover).getByRole('checkbox', { name: 'Osittain laskutettu' }));
    await user.click(within(popover).getByRole('checkbox', { name: 'Laskutettu' }));
    await user.click(within(popover).getByRole('button', { name: 'OK' }));
    expect(venues().sort()).toEqual(['Venue Full', 'Venue New', 'Venue Partly']);
    expect(url()).toContain('f.invoiceState=PARTLY_INVOICED');
    expect(url()).toContain('FULLY_INVOICED');
    expect(within(table()).getByRole('button', { name: 'Suodata: Laskutus' })).toHaveAccessibleDescription('Suodatin käytössä');
  });

  it('phone rows (TASK-175): lineup, status tag, total and invoicing tag on line 1, the one invoicing state tag, low-priority money hidden', async () => {
    signInMock().selectedYear = 2020;
    const e = addMockEvent({ startDate: '2020-02-01', venue: 'Venue Card', priceCents: 100000 });
    addInvoiceRow(db.events, e, { description: 'Invoice', amountCents: 100000, status: 'NOT_SENT' }, partnerA().id);
    installMatchMedia({});
    renderApp('/gigs');
    await waitFor(() => expect(venues()).toEqual(['Venue Card']));
    const card = rows()[0]!; // one compact row
    const invoicing = within(card).getAllByRole('cell').find((c) => c.getAttribute('data-label') === 'Laskutus')!;
    expect(invoicing.querySelectorAll('.tag')).toHaveLength(1);
    expect(within(invoicing).getByText('Avoimia laskuja')).toHaveClass('tag', 'tag-yellow');
    // Line 1: lineup, status tag … invoicing tag, total (price last, at the right edge).
    expect(invoicing).toHaveClass('cell-end');
    const cellOf = (label: string) => within(card).getAllByRole('cell').find((c) => c.getAttribute('data-label') === label)!;
    expect(cellOf('Kokoonpano')).toHaveClass('cell-primary');
    expect(within(cellOf('Kokoonpano')).getByRole('link')).toBeInTheDocument();
    expect(cellOf('Kokonaishinta')).toHaveClass('cell-main');
    expect(cellOf('Tila')).toHaveClass('cell-inline');
    expect(cellOf('Tila').querySelector('.tag')).not.toBeNull();
    // Visual order on line 1 comes from the CSS order: title 0 · inline 1 · end 2 · main 3.
    const rank = (c: Element) => ['cell-primary', 'cell-inline', 'cell-end', 'cell-main'].findIndex((k) => c.classList.contains(k));
    const line1 = within(card).getAllByRole('cell').filter((c) => rank(c) >= 0).sort((a, b) => rank(a) - rank(b));
    expect(line1.map((c) => c.getAttribute('data-label'))).toEqual(['Kokoonpano', 'Tila', 'Laskutus', 'Kokonaishinta']);
    // The full lineup name stays available when the title truncates.
    expect(within(cellOf('Kokoonpano')).getByRole('link')).toHaveAttribute('title');
    // Line 2 values without labels; Kate-% too (just "x % tot. y %").
    for (const line2 of ['Päivä', 'Paikka', 'Kate-%']) expect(cellOf(line2), line2).toHaveClass('cell-bare');
    // The client name is shown bare (no "Asiakas" label) and stays visible on phones.
    expect(cellOf('Asiakas')).toHaveClass('cell-bare');
    expect(cellOf('Asiakas')).not.toHaveClass('hide-phone');
    for (const hidden of ['Myyjä', 'Tuottaja', 'Laskuttamatta', 'Kulut, budjetti', 'Kulut, toteuma']) {
      expect(cellOf(hidden), hidden).toHaveClass('hide-phone');
    }
  });

  it('sorts by any column header', async () => {
    addMockEvent({ venue: 'Venue B', startDate: `${TEST_YEAR}-03-01`, priceCents: 300000 });
    addMockEvent({ venue: 'Venue A', startDate: `${TEST_YEAR}-04-01`, priceCents: 100000 });
    installMatchMedia({ [TABLET_QUERY]: true });
    const { user } = renderApp('/gigs');
    await waitFor(() => expect(venues()).toEqual(['Venue B', 'Venue A']));
    await user.click(within(table()).getByRole('button', { name: /^Paikka/ }));
    expect(venues()).toEqual(['Venue A', 'Venue B']);
    await user.click(within(table()).getByRole('button', { name: /^Kokonaishinta/ }));
    expect(venues()).toEqual(['Venue A', 'Venue B']);
    await user.click(within(table()).getByRole('button', { name: /^Kokonaishinta/ }));
    expect(venues()).toEqual(['Venue B', 'Venue A']);
  });

  it('shows cards with every figure and a Filters sheet on phones', async () => {
    addMockEvent({ venue: 'Venue X' });
    const { user } = renderApp('/gigs');
    await waitFor(() => expect(rows()).toHaveLength(1));
    expect(rows()[0]).toHaveTextContent('Template A · Venue X');
    // Every column is a labelled line of the card (economics included).
    expect(within(rows()[0]!).getAllByRole('cell').map((c) => c.getAttribute('data-label'))).toEqual(
      expect.arrayContaining(['Kate-%', 'Laskutus', 'Laskuttamatta']),
    );
    // Kate-%: budget and actual ("tot. x %") are separate lines (block elements, eventList.css).
    const margin = within(rows()[0]!).getAllByRole('cell').find((c) => c.getAttribute('data-label') === 'Kate-%')!;
    expect(margin.querySelector('.event-margin-budget')).toHaveTextContent(/^\S+\s%$/);
    expect(margin.querySelector('.event-margin-actual')).toHaveTextContent(/^tot\. \S+\s%$/);
    await user.click(screen.getByRole('button', { name: 'Suodattimet' }));
    const sheet = screen.getByRole('dialog', { name: 'Suodattimet' });
    for (const column of ['Kokoonpano', 'Paikka', 'Asiakas', 'Tila', 'Laskutus', 'Miehitys kesken', 'Myyjä', 'Tuottaja']) {
      expect(within(sheet).getByRole('button', { name: column })).toBeInTheDocument();
    }
    expect(within(sheet).queryByRole('button', { name: 'Maksut' })).not.toBeInTheDocument();
  });

  it('scrolls the first upcoming event into view once (UC-003 step 1)', async () => {
    const year = new Date().getFullYear();
    signInMock().selectedYear = year;
    db.events.events.length = 0; // only this test's events in the current year
    addMockEvent({ startDate: `${year}-01-01`, venue: 'Venue Past' });
    addMockEvent({ startDate: `${year}-12-31`, venue: 'Venue Upcoming' });
    const scrolled: Element[] = [];
    const original = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = function (this: Element) {
      scrolled.push(this);
    };
    try {
      installMatchMedia({ [TABLET_QUERY]: true });
      renderApp('/gigs');
      await waitFor(() => expect(scrolled).toHaveLength(1));
      expect(scrolled[0]).toHaveTextContent('Venue Upcoming');
      expect(scrolled[0]).toHaveClass('is-first-upcoming');
    } finally {
      Element.prototype.scrollIntoView = original;
    }
  });

  it('shows an empty state with a New gig action', async () => {
    renderApp('/gigs');
    expect(await screen.findByText(`Ei keikkoja vuonna ${TEST_YEAR}.`)).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Uusi keikka' }).length).toBeGreaterThan(0);
  });

  it('lists deleted events separately and restores them (UC-025)', async () => {
    addMockEvent({ venue: 'Venue X' });
    const deleted = addMockEvent({ venue: 'Venue Deleted' });
    deleted.status = 'CANCELLED';
    deleted.deletedAt = new Date().toISOString();
    logEvent(db.events, deleted.id, 'DELETED', partnerA().id, {}, 'Duplicate');

    const { user } = renderApp('/gigs');
    await waitFor(() => expect(rows()).toHaveLength(1));
    await user.click(screen.getByRole('button', { name: 'Poistetut' }));
    const deletedList = await screen.findByRole('list', { name: 'Poistetut' });
    expect(deletedList).toHaveTextContent('Venue Deleted');
    expect(deletedList).toHaveTextContent('Peruttu');

    await user.click(within(deletedList).getByRole('button', { name: /Palauta/ }));
    expect(await screen.findByText(/Keikka palautettu/)).toBeInTheDocument();
    expect(await screen.findByText(`Ei poistettuja keikkoja vuonna ${TEST_YEAR}.`)).toBeInTheDocument();
    expect(deleted.deletedAt).toBeNull();
  });

  it('works in English', async () => {
    signInMock('partner.b@example.com').selectedYear = TEST_YEAR;
    addMockEvent();
    installMatchMedia({ [TABLET_QUERY]: true });
    renderApp('/gigs');
    expect(await screen.findByRole('heading', { name: `Gigs ${TEST_YEAR}` })).toBeInTheDocument();
    expect(await screen.findByText('Sold gigs sum')).toBeInTheDocument();
    expect(screen.getByText('Not fully staffed', { selector: '.tag' })).toBeInTheDocument();
    const eventTable = screen.getByRole('table', { name: 'Gig list' });
    expect(within(eventTable).getByRole('button', { name: 'Filter: Status' })).toHaveClass('is-active');
    expect(within(eventTable).getByRole('button', { name: 'Filter: Not fully staffed' })).toBeInTheDocument();
  });
});
