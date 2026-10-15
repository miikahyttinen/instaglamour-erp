import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { formatMoney } from '../../lib/format';
import { DESKTOP_QUERY, TABLET_QUERY, WIDE_QUERY } from '../../lib/useMediaQuery';
import { db } from '../../mocks/data';
import { logEvent } from '../../mocks/gigStore';
import { addMockClient, addMockGig, partnerA, partnerB, staffMockGig, TEST_YEAR } from '../../test/gigFixtures';
import { installMatchMedia } from '../../test/matchMedia';
import { renderApp, signInMock } from '../../test/renderApp';

const fi = (cents: number) => formatMoney(cents, 'fi').replace(/\s/g, ' ');
const table = () => screen.getByRole('table', { name: 'Keikkalista' });
const rows = () => within(table()).getAllByRole('row').filter((r) => r.closest('tbody'));
/** Accessible names of the gig links, in row order ("Lineup · Venue"). */
const gigNames = () =>
  rows().map((r) => within(r).getByRole('link', { name: /·/ }).textContent!.replace(/\s+/g, ' ').trim());
const venues = () => gigNames().map((n) => n.split(' · ')[1]);

const FULL = ['Person 1', 'Person 2', 'Person 3', 'Person 4'];

describe('gig list (UC-003)', () => {
  beforeEach(() => {
    signInMock().selectedYear = TEST_YEAR;
  });

  it('lists the SOLD gigs of the year by date (Tila filter on by default); the year summary is unfiltered', async () => {
    addMockGig({ startDate: `${TEST_YEAR}-09-01`, venue: 'Venue Y', priceCents: 200000 });
    const full = addMockGig({ startDate: `${TEST_YEAR}-03-01`, venue: 'Venue X', additionalSalesCents: 10000 });
    staffMockGig(full, FULL);
    const cancelled = addMockGig({ startDate: `${TEST_YEAR}-05-01`, venue: 'Venue V', priceCents: 10000 });
    cancelled.status = 'CANCELLED';
    addMockGig({ startDate: `${TEST_YEAR + 1}-01-10`, venue: 'Venue Next' });

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
      'Miehitys kesken',
      'Myyjä',
      'Tuottaja',
      'Kokonaishinta',
      'Kulut, budjetti',
      'Kulut, toteuma',
      'Kate-%',
    ]);
    // Column priorities (TASK-147): 2 hidden below 1100 px, 3 below 1400 px of table width.
    expect(within(table()).getAllByRole('columnheader').map((h) => h.getAttribute('data-priority'))).toEqual([
      '1', '1', '1', '2', '1', '2', '2', '3', '1', '3', '3', '1',
    ]);
    expect(within(rows()[0]!).getAllByRole('cell').map((c) => c.getAttribute('data-priority'))).toEqual([
      '1', '1', '1', '2', '1', '2', '2', '3', '1', '3', '3', '1',
    ]);
    // Full content width (no --content-max cap on this page).
    expect(table().closest('.page')).toHaveClass('page-wide');
    expect(within(table()).getByRole('columnheader', { name: /Päivä/ })).toHaveAttribute('aria-sort', 'ascending');
    expect(rows()[0]).toHaveTextContent(fi(110000));
    expect(rows()[0]).not.toHaveTextContent('Miehitys kesken');
    expect(rows()[1]).toHaveTextContent('Miehitys kesken');
    expect(within(rows()[0]!).getByRole('link', { name: 'Template A · Venue X' })).toHaveAttribute(
      'href',
      `/gigs/${full.id}`,
    );
    // The default "SOLD" = Myyty + Soitettu: the Tila filter is on, cancelled are hidden.
    expect(within(table()).getByRole('button', { name: 'Suodata: Tila' })).toHaveClass('is-active');
    expect(screen.getByText('Näytetään 2 / 3')).toHaveAttribute('role', 'status');

    const summary = screen.getByRole('region', { name: 'Vuosi yhteensä' });
    // Sold gigs sum includes the cancelled gig (BR-082) even though the list hides it.
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

  it('shows played and cancelled gigs through the Tila filter (Myyty / Soitettu / Peruttu)', async () => {
    signInMock().selectedYear = 2020;
    addMockGig({ startDate: '2020-02-01', venue: 'Venue Old' });
    const cancelled = addMockGig({ startDate: '2020-03-01', venue: 'Venue Gone' });
    cancelled.status = 'CANCELLED';
    installMatchMedia({ [TABLET_QUERY]: true });
    const { user } = renderApp('/gigs');
    await waitFor(() => expect(venues()).toEqual(['Venue Old']));
    expect(within(rows()[0]!).getByText('Soitettu')).toBeInTheDocument();

    await user.click(within(table()).getByRole('button', { name: 'Suodata: Tila' }));
    const popover = screen.getByRole('dialog', { name: 'Suodata: Tila' });
    // Values of the data plus the selected ones (the default Myyty), in status order.
    expect(within(popover).getAllByRole('checkbox').map((c) => c.closest('label')!.textContent)).toEqual([
      'Myyty',
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

  it('filters in the column headers (seller, staffing, client, lineup, venue, producer), AND with the search', async () => {
    const clientId = addMockClient('Client X').id;
    const staffed = addMockGig({ venue: 'Venue X', notes: 'Outdoor stage', clientId });
    staffMockGig(staffed, FULL);
    addMockGig({ venue: 'Venue Y', sellerId: partnerB().id, startDate: `${TEST_YEAR}-07-01` });
    addMockGig({ venue: 'Venue Z', producerId: partnerB().id, startDate: `${TEST_YEAR}-08-01`, clientId });
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
    addMockGig({ venue: 'Venue X', priceCents: 100000 });
    addMockGig({ venue: 'Venue Y', priceCents: 300000, startDate: `${TEST_YEAR}-07-01` });
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
    // Values of the data + the selected ones: no cancelled gigs, so no "Peruttu".
    expect(within(popover).getAllByRole('checkbox').map((c) => c.closest('label')!.textContent)).toEqual([
      'Myyty',
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

  it('sorts by any column header', async () => {
    addMockGig({ venue: 'Venue B', startDate: `${TEST_YEAR}-03-01`, priceCents: 300000 });
    addMockGig({ venue: 'Venue A', startDate: `${TEST_YEAR}-04-01`, priceCents: 100000 });
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
    addMockGig({ venue: 'Venue X' });
    const { user } = renderApp('/gigs');
    await waitFor(() => expect(rows()).toHaveLength(1));
    expect(rows()[0]).toHaveTextContent('Template A · Venue X');
    // Every column is a labelled line of the card (economics included).
    expect(within(rows()[0]!).getAllByRole('cell').map((c) => c.getAttribute('data-label'))).toContain('Kate-%');
    await user.click(screen.getByRole('button', { name: 'Suodattimet' }));
    const sheet = screen.getByRole('dialog', { name: 'Suodattimet' });
    for (const column of ['Kokoonpano', 'Paikka', 'Asiakas', 'Tila', 'Miehitys kesken', 'Myyjä', 'Tuottaja']) {
      expect(within(sheet).getByRole('button', { name: column })).toBeInTheDocument();
    }
  });

  it('scrolls the first upcoming gig into view once (UC-003 step 1)', async () => {
    const year = new Date().getFullYear();
    signInMock().selectedYear = year;
    db.gigs.gigs.length = 0; // only this test's gigs in the current year
    addMockGig({ startDate: `${year}-01-01`, venue: 'Venue Past' });
    addMockGig({ startDate: `${year}-12-31`, venue: 'Venue Upcoming' });
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

  it('lists deleted gigs separately and restores them (UC-025)', async () => {
    addMockGig({ venue: 'Venue X' });
    const deleted = addMockGig({ venue: 'Venue Deleted' });
    deleted.status = 'CANCELLED';
    deleted.deletedAt = new Date().toISOString();
    logEvent(db.gigs, deleted.id, 'DELETED', partnerA().id, {}, 'Duplicate');

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
    addMockGig();
    installMatchMedia({ [TABLET_QUERY]: true });
    renderApp('/gigs');
    expect(await screen.findByRole('heading', { name: `Gigs ${TEST_YEAR}` })).toBeInTheDocument();
    expect(await screen.findByText('Sold gigs sum')).toBeInTheDocument();
    expect(screen.getByText('Not fully staffed', { selector: '.tag' })).toBeInTheDocument();
    const gigTable = screen.getByRole('table', { name: 'Gig list' });
    expect(within(gigTable).getByRole('button', { name: 'Filter: Status' })).toHaveClass('is-active');
    expect(within(gigTable).getByRole('button', { name: 'Filter: Not fully staffed' })).toBeInTheDocument();
  });
});
