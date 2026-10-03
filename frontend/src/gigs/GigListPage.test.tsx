import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { formatMoney } from '../lib/format';
import { db } from '../mocks/data';
import { logEvent } from '../mocks/gigStore';
import { addMockGig, partnerA, partnerB, staffMockGig, TEST_YEAR } from '../test/gigFixtures';
import { renderApp, signInMock } from '../test/renderApp';

const fi = (cents: number) => formatMoney(cents, 'fi').replace(/\s/g, ' ');
const rows = () => within(screen.getByRole('list', { name: 'Keikkalista' })).getAllByRole('listitem');

describe('gig list (UC-003)', () => {
  beforeEach(() => {
    signInMock().selectedYear = TEST_YEAR;
  });

  it('lists SOLD gigs of the selected year by date with the year summary on top', async () => {
    addMockGig({ startDate: `${TEST_YEAR}-09-01`, venue: 'Venue Y', priceCents: 200000 });
    const full = addMockGig({ startDate: `${TEST_YEAR}-03-01`, venue: 'Venue X', additionalSalesCents: 10000 });
    staffMockGig(full, ['Person 1', 'Person 2', 'Person 3', 'Person 4']);
    const cancelled = addMockGig({ startDate: `${TEST_YEAR}-05-01`, venue: 'Venue V', priceCents: 10000 });
    cancelled.status = 'CANCELLED';
    addMockGig({ startDate: `${TEST_YEAR + 1}-01-10`, venue: 'Venue Next' });

    renderApp('/gigs');
    await screen.findByRole('heading', { name: `Keikat ${TEST_YEAR}` });
    await waitFor(() => expect(rows()).toHaveLength(2));
    expect(rows()[0]).toHaveTextContent('Template A · Venue X');
    expect(rows()[0]).toHaveTextContent(fi(110000));
    expect(rows()[0]).not.toHaveTextContent('Miehitys kesken');
    expect(rows()[1]).toHaveTextContent('Venue Y');
    expect(rows()[1]).toHaveTextContent('Miehitys kesken');
    expect(rows()[1]).toHaveTextContent('Myyjä: Partner A · Tuottaja: Partner A');

    const summary = screen.getByRole('region', { name: 'Vuosi yhteensä' });
    // Sold gigs sum includes the cancelled gig (BR-082) even though the list hides it.
    expect(within(summary).getByText('Myytyjen keikkojen summa').nextSibling).toHaveTextContent(
      fi(110000 + 200000 + 10000),
    );
    expect(within(summary).getByText('Keikkoja').nextSibling).toHaveTextContent('2');
    expect(summary).toHaveTextContent('Lisäksi peruttuja keikkoja: 1');
  });

  it('marks past SOLD gigs as played and shows cancelled gigs with the filter', async () => {
    signInMock().selectedYear = 2020;
    addMockGig({ startDate: '2020-02-01', venue: 'Venue Old' });
    const cancelled = addMockGig({ startDate: '2020-03-01', venue: 'Venue Gone' });
    cancelled.status = 'CANCELLED';
    const { user } = renderApp('/gigs');
    await waitFor(() => expect(rows()).toHaveLength(1));
    expect(within(rows()[0]!).getByText('Soitettu')).toBeInTheDocument();

    await user.click(screen.getByRole('checkbox', { name: 'Näytä myös perutut' }));
    await waitFor(() => expect(rows()).toHaveLength(2));
    expect(within(rows()[1]!).getByText('Peruttu')).toBeInTheDocument();
  });

  it('filters by search, seller and not fully staffed', async () => {
    const staffed = addMockGig({ venue: 'Venue X', notes: 'Outdoor stage' });
    staffMockGig(staffed, ['Person 1', 'Person 2', 'Person 3', 'Person 4']);
    addMockGig({ venue: 'Venue Y', sellerId: partnerB().id, startDate: `${TEST_YEAR}-07-01` });
    const { user } = renderApp('/gigs');
    await waitFor(() => expect(rows()).toHaveLength(2));

    await user.type(screen.getByRole('searchbox', { name: 'Haku' }), 'outdoor');
    await waitFor(() => expect(rows()).toHaveLength(1));
    expect(rows()[0]).toHaveTextContent('Venue X');
    await user.clear(screen.getByRole('searchbox', { name: 'Haku' }));
    await waitFor(() => expect(rows()).toHaveLength(2));

    await user.selectOptions(screen.getByRole('combobox', { name: 'Myyjä' }), partnerB().id);
    await waitFor(() => expect(rows()).toHaveLength(1));
    expect(rows()[0]).toHaveTextContent('Venue Y');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Myyjä' }), '');

    await user.click(screen.getByRole('checkbox', { name: 'Miehitys kesken' }));
    await waitFor(() => expect(rows()).toHaveLength(1));
    expect(rows()[0]).toHaveTextContent('Venue Y');
  });

  it('filters upcoming and past', async () => {
    addMockGig({ venue: 'Venue X' }); // TEST_YEAR is in the future
    const { user } = renderApp('/gigs');
    await waitFor(() => expect(rows()).toHaveLength(1));
    await user.click(screen.getByRole('button', { name: 'Menneet' }));
    expect(await screen.findByText('Ei hakuehtoja vastaavia keikkoja.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Tulevat' }));
    await waitFor(() => expect(rows()).toHaveLength(1));
    expect(screen.getByRole('button', { name: 'Tulevat' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('shows economics on tap on phones', async () => {
    addMockGig();
    const { user } = renderApp('/gigs');
    await waitFor(() => expect(rows()).toHaveLength(1));
    const toggle = within(rows()[0]!).getByRole('button', { name: 'Näytä talous' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await user.click(toggle);
    expect(within(rows()[0]!).getByRole('button', { name: 'Piilota talous' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    expect(within(rows()[0]!).getByText('Kate-%')).toBeInTheDocument();
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
    renderApp('/gigs');
    expect(await screen.findByRole('heading', { name: `Gigs ${TEST_YEAR}` })).toBeInTheDocument();
    expect(await screen.findByText('Sold gigs sum')).toBeInTheDocument();
    expect(screen.getByText('Not fully staffed', { selector: '.badge' })).toBeInTheDocument();
  });
});
