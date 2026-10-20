import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { formatMoneyWhole } from '../../lib/format';
import { DESKTOP_QUERY, TABLET_QUERY } from '../../lib/useMediaQuery';
import { db } from '../../mocks/data';
import { addMockClient, partnerB, TEST_YEAR } from '../../test/gigFixtures';
import { installMatchMedia } from '../../test/matchMedia';
import { addMockOffer } from '../../test/offerFixtures';
import { renderApp, signInMock } from '../../test/renderApp';

const fiMoney = (cents: number) => formatMoneyWhole(cents, 'fi').replace(/\s/g, ' ');
/** KPI card "Avoimet tarjoukset · <year>" (BR-122; default = the selected year). */
const openCard = () => screen.getByRole('region', { name: `Avoimet tarjoukset · ${TEST_YEAR}` });
const table = () => screen.getByRole('table', { name: 'Tarjoukset' });
const bodyRows = () => within(table()).getAllByRole('row').filter((r) => r.closest('tbody'));
const eventNames = () => bodyRows().map((r) => within(r).getAllByRole('link')[0]!.textContent);
const text = (el: HTMLElement) => (el.textContent ?? '').replace(/\s/g, ' ');

describe('offer list (UC-028)', () => {
  let clientId: string;
  beforeEach(() => {
    signInMock().selectedYear = TEST_YEAR;
    clientId = addMockClient('Client X').id;
  });

  it('is the second menu item (after Vuosi) and shows the KPI cards, all columns and the default sort', async () => {
    addMockOffer({ clientId, eventName: 'Event B', eventDate: `${TEST_YEAR}-09-01`, priceCents: 200000 });
    addMockOffer({ clientId, eventName: 'Event A', eventDate: `${TEST_YEAR}-03-01`, city: 'City Y' });
    addMockOffer({ clientId, eventName: 'Event W', eventDate: `${TEST_YEAR}-04-01`, disposition: 'WON' });
    addMockOffer({ clientId, eventName: 'Event L', eventDate: `${TEST_YEAR}-05-01`, disposition: 'LOST_PRICE' });

    installMatchMedia({ [DESKTOP_QUERY]: true });
    const { user } = renderApp('/');
    const nav = await screen.findByRole('navigation', { name: 'Päävalikko' });
    const links = within(nav).getAllByRole('link');
    expect(links[0]).toHaveTextContent('Vuosi');
    const offers = links[1]!;
    expect(offers).toHaveTextContent('Tarjoukset');
    await user.click(offers);

    expect(await screen.findByRole('heading', { level: 1, name: `Tarjoukset ${TEST_YEAR}` })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Tarjoustilastot' })).toBeInTheDocument();
    expect(text(await screen.findByRole('region', { name: `Avoimet tarjoukset · ${TEST_YEAR}` }))).toContain(
      fiMoney(300000),
    );
    expect(screen.getByRole('region', { name: 'Voittoprosentti' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Uusi tarjous' })).toHaveAttribute('href', '/offers/new');

    await screen.findByRole('table', { name: 'Tarjoukset' });
    expect(within(table()).getAllByRole('columnheader').map((h) => h.textContent)).toEqual([
      'Tapahtuma',
      'Asiakas',
      'Paikka / kaupunki',
      'Tapahtumapäivä',
      'Luotu',
      'Hinta',
      'Tila',
      'Myyjä',
      'Lähde',
      'Tapahtumatyyppi',
      'Lopputulos',
      'Keikka',
      'Toiminnot',
    ]);
    // Column priorities (TASK-147): 2 hidden below 1100 px, 3 below 1400 px of table width.
    expect(within(table()).getAllByRole('columnheader').map((h) => h.getAttribute('data-priority'))).toEqual([
      '1', '1', '2', '1', '3', '1', '1', '2', '3', '3', '2', '2', '1',
    ]);
    expect(eventNames()).toEqual(['Event A', 'Event W', 'Event L', 'Event B']);
    expect(bodyRows()[0]).toHaveTextContent('Venue X, City Y');
    expect(within(table()).getByRole('columnheader', { name: /Tapahtumapäivä/ })).toHaveAttribute(
      'aria-sort',
      'ascending',
    );
  });

  it('sorts by any column header (Excel-style), toggling the direction', async () => {
    addMockOffer({ clientId, eventName: 'Event 1', priceCents: 300 });
    addMockOffer({ clientId, eventName: 'Event 2', priceCents: null });
    addMockOffer({ clientId, eventName: 'Event 3', priceCents: 100 });
    const { user } = renderApp('/offers');
    await screen.findByRole('table', { name: 'Tarjoukset' });
    await user.click(within(table()).getByRole('button', { name: /Hinta/ }));
    expect(eventNames()).toEqual(['Event 3', 'Event 1', 'Event 2']);
    await user.click(within(table()).getByRole('button', { name: /Hinta/ }));
    expect(eventNames()).toEqual(['Event 1', 'Event 3', 'Event 2']);
    expect(within(table()).getByRole('columnheader', { name: /Hinta/ })).toHaveAttribute('aria-sort', 'descending');
    await user.click(within(table()).getByRole('button', { name: /Tapahtuma$/ }));
    expect(eventNames()).toEqual(['Event 1', 'Event 2', 'Event 3']);
  });

  it('saves source, event type and disposition in place; status follows disposition (AC-3)', async () => {
    const offer = addMockOffer({ clientId, eventName: 'Event 1', priceCents: 100000 });
    const { user } = renderApp('/offers');
    await screen.findByRole('table', { name: 'Tarjoukset' });

    await user.selectOptions(screen.getByRole('combobox', { name: 'Lähde: Event 1' }), 'Instagram');
    await waitFor(() => expect(offer.source).toBe('INSTAGRAM'));
    await user.selectOptions(screen.getByRole('combobox', { name: 'Tapahtumatyyppi: Event 1' }), 'Häät');
    await waitFor(() => expect(offer.eventType).toBe('WEDDING'));
    await user.selectOptions(screen.getByRole('combobox', { name: 'Lopputulos: Event 1' }), 'Hävitty: hinta');
    await waitFor(() => expect(offer.disposition).toBe('LOST_PRICE'));
    await waitFor(() => expect(bodyRows()[0]).toHaveTextContent('Hylätty'));
    // The open value KPI follows (BR-122).
    await waitFor(() => expect(text(openCard())).toContain(fiMoney(0)));
    expect(db.offers.events.filter((e) => e.offerId === offer.id).map((e) => e.type)).toEqual([
      'CREATED',
      'UPDATED',
      'UPDATED',
      'DISPOSITION_CHANGED',
    ]);
  });

  it('filters in the column headers (status incl. expired, seller, outcome), combined with AND and the search', async () => {
    // A past year: the pending offer is expired.
    db.partners[0]!.selectedYear = 2020;
    addMockOffer({ clientId, eventName: 'Expired one', eventDate: '2020-02-01' });
    addMockOffer({ clientId, eventName: 'Lost one', eventDate: '2020-02-15', disposition: 'LOST_OTHER' });
    addMockOffer({ clientId, eventName: 'Won one', eventDate: '2020-03-01', disposition: 'WON', sellerId: partnerB().id });
    installMatchMedia({ [TABLET_QUERY]: true });
    const { user } = renderApp('/offers');
    await screen.findByRole('table', { name: 'Tarjoukset' });
    expect(eventNames()).toHaveLength(3);
    // No filter dropdowns above the table any more.
    expect(screen.queryByRole('combobox', { name: 'Tila' })).not.toBeInTheDocument();
    for (const column of ['Asiakas', 'Paikka / kaupunki', 'Tila', 'Myyjä', 'Lähde', 'Tapahtumatyyppi', 'Lopputulos', 'Keikka']) {
      expect(within(table()).getByRole('button', { name: `Suodata: ${column}` })).toBeInTheDocument();
    }

    // Status: only "Vanhentunut".
    await user.click(within(table()).getByRole('button', { name: 'Suodata: Tila' }));
    let popover = screen.getByRole('dialog', { name: 'Suodata: Tila' });
    // Distinct values of the data, in status order.
    expect(within(popover).getAllByRole('checkbox').map((c) => c.closest('label')!.textContent)).toEqual([
      'Vanhentunut',
      'Hyväksytty',
      'Hylätty',
    ]);
    await user.click(within(popover).getByRole('button', { name: 'Tyhjennä' }));
    await user.click(within(popover).getByRole('checkbox', { name: 'Vanhentunut' }));
    await user.click(within(popover).getByRole('button', { name: 'OK' }));
    expect(eventNames()).toEqual(['Expired one']);
    expect(bodyRows()[0]).toHaveTextContent('Vanhentunut');
    expect(within(table()).getByRole('button', { name: 'Suodata: Tila' })).toHaveClass('is-active');
    expect(screen.getByText('Näytetään 1 / 3')).toHaveAttribute('role', 'status');

    await user.click(screen.getByRole('button', { name: 'Tyhjennä suodattimet' }));
    expect(eventNames()).toHaveLength(3);

    // Seller + outcome combine (AND).
    await user.click(within(table()).getByRole('button', { name: 'Suodata: Myyjä' }));
    popover = screen.getByRole('dialog', { name: 'Suodata: Myyjä' });
    await user.click(within(popover).getByRole('checkbox', { name: 'Partner B' }));
    await user.click(within(popover).getByRole('button', { name: 'OK' }));
    expect(eventNames()).toEqual(['Expired one', 'Lost one']);
    await user.click(within(table()).getByRole('button', { name: 'Suodata: Lopputulos' }));
    popover = screen.getByRole('dialog', { name: 'Suodata: Lopputulos' });
    // Only the values left by the other filters are offered (Excel).
    expect(within(popover).queryByRole('checkbox', { name: 'Voitettu' })).not.toBeInTheDocument();
    await user.click(within(popover).getByRole('checkbox', { name: 'Odottaa' }));
    await user.click(within(popover).getByRole('button', { name: 'OK' }));
    expect(eventNames()).toEqual(['Lost one']);

    // The search still narrows the rows; everything filtered away → message + clear.
    await user.type(screen.getByRole('searchbox', { name: 'Haku' }), 'expired');
    expect(await screen.findByText('Ei suodattimia vastaavia rivejä.')).toBeInTheDocument();
    await user.click(screen.getAllByRole('button', { name: 'Tyhjennä suodattimet' })[0]!);
    await waitFor(() => expect(eventNames()).toEqual(['Expired one']));
    await user.type(screen.getByRole('searchbox', { name: 'Haku' }), ' nothing');
    expect(await screen.findByText('Ei hakua vastaavia tarjouksia.')).toBeInTheDocument();
  });

  it('keeps the column filters and sort in the URL; the KPI cards ignore them', async () => {
    addMockOffer({ clientId, eventName: 'Event 1', priceCents: 100000, source: 'INSTAGRAM' });
    addMockOffer({ clientId, eventName: 'Event 2', priceCents: 200000 });
    installMatchMedia({ [TABLET_QUERY]: true });
    const { user } = renderApp('/offers?sort=price&dir=desc&f.source=');
    await screen.findByRole('table', { name: 'Tarjoukset' });
    // "(tyhjä)" = offers without a source.
    expect(eventNames()).toEqual(['Event 2']);
    expect(text(await screen.findByRole('region', { name: `Avoimet tarjoukset · ${TEST_YEAR}` }))).toContain(
      fiMoney(300000),
    );
    expect(within(table()).getByRole('columnheader', { name: /Hinta/ })).toHaveAttribute('aria-sort', 'descending');

    await user.click(within(table()).getByRole('button', { name: 'Suodata: Lähde' }));
    const popover = screen.getByRole('dialog', { name: 'Suodata: Lähde' });
    expect(within(popover).getByRole('checkbox', { name: '(tyhjä)' })).toBeChecked();
    expect(within(popover).getByRole('checkbox', { name: 'Instagram' })).not.toBeChecked();
    await user.click(within(popover).getByRole('button', { name: 'Valitse kaikki' }));
    await user.click(within(popover).getByRole('button', { name: 'OK' }));
    expect(eventNames()).toEqual(['Event 2', 'Event 1']);
    expect(within(table()).getByRole('button', { name: 'Suodata: Lähde' })).not.toHaveClass('is-active');

    // Only Instagram; the filter survives a trip to the Deleted view (it lives in the URL).
    await user.click(within(table()).getByRole('button', { name: 'Suodata: Lähde' }));
    await user.click(within(screen.getByRole('dialog', { name: 'Suodata: Lähde' })).getByRole('checkbox', { name: '(tyhjä)' }));
    await user.click(screen.getByRole('button', { name: 'OK' }));
    expect(eventNames()).toEqual(['Event 1']);
    await user.click(screen.getByRole('button', { name: 'Poistetut' }));
    expect(await screen.findByText(`Ei poistettuja tarjouksia vuodelle ${TEST_YEAR}.`)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Tarjoukset' }));
    await screen.findByRole('table', { name: 'Tarjoukset' });
    expect(eventNames()).toEqual(['Event 1']);
  });

  it('shows an empty state with New offer (E1)', async () => {
    renderApp('/offers');
    expect(await screen.findByText(`Ei tarjouksia vuodelle ${TEST_YEAR}.`)).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Uusi tarjous' })).toHaveLength(2);
  });

  it('converts to a gig in the modal; the row then links to the gig (UC-031)', async () => {
    const offer = addMockOffer({ clientId, eventName: 'Event 1', city: 'City Y', priceCents: 120000 });
    const { user } = renderApp('/offers');
    await screen.findByRole('table', { name: 'Tarjoukset' });
    await user.click(screen.getByRole('button', { name: 'Muuta keikaksi: Event 1' }));
    const dialog = screen.getByRole('dialog', { name: 'Muuta keikaksi' });
    expect(await within(dialog).findByRole('textbox', { name: 'Paikka' })).toHaveValue('Venue X, City Y');
    await user.click(within(dialog).getByRole('button', { name: 'Muuta keikaksi' }));

    expect(await screen.findByText('Keikka luotu tarjouksesta Event 1.', { exact: false })).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    const link = await screen.findByRole('link', { name: 'Keikka: Event 1' });
    expect(link).toHaveTextContent('Keikka →');
    expect(link).toHaveAttribute('href', `/gigs/${offer.gigId}`);
    expect(screen.getByRole('link', { name: 'Avaa keikka' })).toHaveAttribute('href', `/gigs/${offer.gigId}`);
    expect(db.gigs.gigs.filter((g) => g.offerId === offer.id)).toHaveLength(1);
    expect(bodyRows()[0]).toHaveTextContent('Hyväksytty');
  });

  it('copies the absolute public link', async () => {
    const offer = addMockOffer({ clientId, eventName: 'Event 1' });
    const { user } = renderApp('/offers');
    await screen.findByRole('table', { name: 'Tarjoukset' });
    await user.click(screen.getByRole('button', { name: 'Kopioi julkinen linkki: Event 1' }));
    expect(await screen.findByText('Julkinen linkki kopioitu leikepöydälle.')).toBeInTheDocument();
    expect(await navigator.clipboard.readText()).toBe(`${window.location.origin}/o/${offer.shareToken}`);
  });

  it('deletes after confirmation and restores from the Deleted view (A4)', async () => {
    const offer = addMockOffer({ clientId, eventName: 'Event 1' });
    const { user } = renderApp('/offers');
    await screen.findByRole('table', { name: 'Tarjoukset' });
    await user.click(screen.getByRole('button', { name: 'Poista tarjous: Event 1' }));
    const dialog = screen.getByRole('dialog', { name: 'Poista tarjous' });
    expect(dialog).toHaveTextContent('Poistetaanko tarjous Event 1?');
    await user.click(within(dialog).getByRole('button', { name: 'Poista tarjous' }));
    expect(await screen.findByText('Tarjous poistettu: Event 1.')).toBeInTheDocument();
    expect(offer.deletedAt).not.toBeNull();
    expect(await screen.findByText(`Ei tarjouksia vuodelle ${TEST_YEAR}.`)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Poistetut' }));
    const deleted = await screen.findByRole('table', { name: 'Poistetut' });
    // Deleted view: every column always shown (no priorities).
    expect(deleted.querySelector('.excel-prio-2, .excel-prio-3')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Palauta: Event 1' }));
    expect(await screen.findByText('Tarjous palautettu:')).toBeInTheDocument();
    expect(offer.deletedAt).toBeNull();
  });
});
