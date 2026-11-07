import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { formatDate, formatMoneyWhole } from '../../lib/format';
import { DESKTOP_QUERY, TABLET_QUERY } from '../../lib/useMediaQuery';
import { db } from '../../mocks/data';
import { server } from '../../mocks/server';
import { addMockClient, partnerB, TEST_YEAR } from '../../test/eventFixtures';
import { installMatchMedia } from '../../test/matchMedia';
import { addMockOffer } from '../../test/offerFixtures';
import { currentSearch, renderApp, signInMock } from '../../test/renderApp';

const fiMoney = (cents: number) => formatMoneyWhole(cents, 'fi').replace(/\s/g, ' ');
const table = () => screen.getByRole('table', { name: 'Tarjoukset' });
const bodyRows = () => within(table()).getAllByRole('row').filter((r) => r.closest('tbody'));
const eventNames = () => bodyRows().map((r) => within(r).getAllByRole('link')[0]!.textContent);
const text = (el: HTMLElement) => (el.textContent ?? '').replace(/\s/g, ' ');

describe('offer list (UC-028)', () => {
  let clientId: string;
  beforeEach(() => {
    // The list is not tied to the selected year (contract "Year is no longer global").
    signInMock().selectedYear = TEST_YEAR - 10;
    db.offers.offers.length = 0;
    clientId = addMockClient('Client X').id;
  });

  it('is the second menu item (after Vuosi) and shows the KPI cards, all columns and the default sort', async () => {
    addMockOffer({ clientId, eventName: 'Event B', eventDate: `${TEST_YEAR}-09-01`, priceCents: 200000 });
    addMockOffer({ clientId, eventName: 'Event A', eventDate: `${TEST_YEAR}-03-01`, city: 'City Y' });
    addMockOffer({ clientId, eventName: 'Event W', eventDate: `${TEST_YEAR}-04-01`, disposition: 'WON' });
    addMockOffer({ clientId, eventName: 'Event L', eventDate: `${TEST_YEAR}-05-01`, disposition: 'LOST_PRICE' });
    // Another year, created long ago: listed too (all years), last by creation.
    addMockOffer({ clientId, eventName: 'Event Old', eventDate: `${TEST_YEAR - 5}-05-01` }).createdAt =
      `${TEST_YEAR - 6}-01-15T10:00:00.000Z`;
    const listUrls: string[] = [];
    const onRequest = ({ request }: { request: Request }) => {
      if (new URL(request.url).pathname === '/api/offers') listUrls.push(request.url);
    };
    server.events.on('request:start', onRequest);

    installMatchMedia({ [DESKTOP_QUERY]: true });
    const { user } = renderApp('/');
    const nav = await screen.findByRole('navigation', { name: 'Päävalikko' });
    const links = within(nav).getAllByRole('link');
    expect(links[0]).toHaveTextContent('Vuosi');
    const offers = links[1]!;
    expect(offers).toHaveTextContent('Tarjoukset');
    await user.click(offers);

    expect(await screen.findByRole('heading', { level: 1, name: 'Tarjoukset' })).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Valittu vuosi' })).toBeNull();
    expect(screen.getByRole('heading', { level: 2, name: 'Tarjoustilastot' })).toBeInTheDocument();
    // Open offers (by type, all years; Event Old is past): B 2 000 € + A 1 000 €.
    expect(text(await screen.findByRole('region', { name: 'Tapahtumatyypeittäin' }))).toContain(fiMoney(300000));
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
      'Linkitetty keikka',
      'Toiminnot',
    ]);
    // Column priorities (TASK-147): 2 hidden below 1100 px, 3 below 1400 px of table width.
    expect(within(table()).getAllByRole('columnheader').map((h) => h.getAttribute('data-priority'))).toEqual([
      '1', '1', '2', '1', '1', '1', '1', '2', '3', '3', '2', '2', '1',
    ]);
    // Default sort (UC-028 change 2026-10-22): newest created first.
    expect(eventNames()).toEqual(['Event L', 'Event W', 'Event A', 'Event B', 'Event Old']);
    // No year is sent (contract "Year is no longer global").
    expect(listUrls.length).toBeGreaterThan(0);
    for (const url of listUrls) expect(new URL(url).searchParams.has('year')).toBe(false);
    server.events.removeListener('request:start', onRequest);
    expect(bodyRows()[2]).toHaveTextContent('Venue X, City Y');
    expect(within(table()).getByRole('columnheader', { name: /Luotu/ })).toHaveAttribute('aria-sort', 'descending');
    // Created date formatted like the other dates (local date of the creation time).
    const created = db.offers.offers.find((o) => o.eventName === 'Event L')!.createdAt;
    expect(bodyRows()[0]).toHaveTextContent(formatDate(created, 'fi'));
    // Phone rows show it too (not hidden below 600 px).
    expect(bodyRows()[0]!.querySelector('td[data-label="Luotu"]')).not.toHaveClass('hide-phone');
  });

  it('phone rows (< 600 px): name + status tag … price on line 1; date, client, created bare on line 2', async () => {
    addMockOffer({ clientId, eventName: 'Event 1', priceCents: 120000, disposition: 'WON', city: 'City Y' });
    renderApp('/offers');
    await screen.findByRole('table', { name: 'Tarjoukset' });
    const row = bodyRows()[0]!;
    const cellOf = (label: string) => row.querySelector<HTMLElement>(`td[data-label="${label}"]`)!;
    expect(cellOf('Tapahtuma')).toHaveClass('cell-primary');
    // The full name stays available when the title truncates.
    expect(within(cellOf('Tapahtuma')).getByRole('link', { name: 'Event 1' })).toHaveAttribute('title', 'Event 1');
    expect(cellOf('Tila')).toHaveClass('cell-inline');
    expect(cellOf('Tila').querySelector('.tag')).toHaveTextContent('Hyväksytty');
    expect(cellOf('Hinta')).toHaveClass('cell-main');
    // Line 1 order from the CSS order: title 0 · inline 1 · end 2 · main 3 (price last).
    const rank = (c: Element) => ['cell-primary', 'cell-inline', 'cell-end', 'cell-main'].findIndex((k) => c.classList.contains(k));
    const line1 = [...row.querySelectorAll('td')].filter((c) => rank(c) >= 0).sort((x, y) => rank(x) - rank(y));
    expect(line1.map((c) => c.getAttribute('data-label'))).toEqual(['Tapahtuma', 'Tila', 'Hinta']);
    // Line 2: bare values (no labels).
    for (const label of ['Tapahtumapäivä', 'Asiakas', 'Luotu']) {
      expect(cellOf(label), label).toHaveClass('cell-bare');
      expect(cellOf(label), label).not.toHaveClass('hide-phone');
    }
    // Left out of the phone rows (on the offer page): disposition select, convert button, icons.
    for (const label of ['Paikka / kaupunki', 'Myyjä', 'Lähde', 'Tapahtumatyyppi', 'Lopputulos', 'Linkitetty keikka', 'Toiminnot']) {
      expect(cellOf(label), label).toHaveClass('hide-phone');
    }
    expect(within(cellOf('Linkitetty keikka')).getByRole('button', { name: 'Muuta keikaksi: Event 1' })).toBeInTheDocument();
  });

  it('a sort in the URL overrides the default (newest created first)', async () => {
    addMockOffer({ clientId, eventName: 'Event B', eventDate: `${TEST_YEAR}-09-01` });
    addMockOffer({ clientId, eventName: 'Event A', eventDate: `${TEST_YEAR}-03-01` });
    addMockOffer({ clientId, eventName: 'Event C', eventDate: `${TEST_YEAR}-05-01` });
    renderApp('/offers?sort=eventDate&dir=asc');
    await screen.findByRole('table', { name: 'Tarjoukset' });
    expect(eventNames()).toEqual(['Event A', 'Event C', 'Event B']);
    expect(within(table()).getByRole('columnheader', { name: /Tapahtumapäivä/ })).toHaveAttribute(
      'aria-sort',
      'ascending',
    );
    expect(within(table()).getByRole('columnheader', { name: /Luotu/ })).not.toHaveAttribute(
      'aria-sort',
      'descending',
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
    await waitFor(() => expect(screen.getByRole('region', { name: 'Tapahtumatyypeittäin' })).toHaveTextContent('Ei avoimia tarjouksia'));
    expect(db.offers.events.filter((e) => e.offerId === offer.id).map((e) => e.type)).toEqual([
      'CREATED',
      'UPDATED',
      'UPDATED',
      'DISPOSITION_CHANGED',
    ]);
  });

  it('filters in the column headers (status incl. expired, seller, outcome), combined with AND and the search', async () => {
    // A past year: the pending offer is expired.
    addMockOffer({ clientId, eventName: 'Expired one', eventDate: '2020-02-01' });
    addMockOffer({ clientId, eventName: 'Lost one', eventDate: '2020-02-15', disposition: 'LOST_OTHER' });
    addMockOffer({ clientId, eventName: 'Won one', eventDate: '2020-03-01', disposition: 'WON', sellerId: partnerB().id });
    installMatchMedia({ [TABLET_QUERY]: true });
    const { user } = renderApp('/offers');
    await screen.findByRole('table', { name: 'Tarjoukset' });
    expect(eventNames()).toHaveLength(3);
    // A won offer whose date has passed can't be converted (BR-109): no button, "–".
    expect(screen.queryByRole('button', { name: /^Muuta keikaksi:/ })).not.toBeInTheDocument();
    // No filter dropdowns above the table any more.
    expect(screen.queryByRole('combobox', { name: 'Tila' })).not.toBeInTheDocument();
    for (const column of ['Asiakas', 'Paikka / kaupunki', 'Tila', 'Myyjä', 'Lähde', 'Tapahtumatyyppi', 'Lopputulos', 'Linkitetty keikka']) {
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
    expect(eventNames()).toEqual(['Lost one', 'Expired one']);
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
    expect(text(await screen.findByRole('region', { name: 'Tapahtumatyypeittäin' }))).toContain(fiMoney(300000));
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
    expect(await screen.findByText('Ei poistettuja tarjouksia.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Tarjoukset' }));
    await screen.findByRole('table', { name: 'Tarjoukset' });
    expect(eventNames()).toEqual(['Event 1']);
  });

  it('shows an empty state with New offer (E1)', async () => {
    renderApp('/offers');
    expect(await screen.findByText('Ei tarjouksia.')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Uusi tarjous' })).toHaveLength(2);
  });

  it('converts to an event in the modal; the row then links to the event (UC-031)', async () => {
    const offer = addMockOffer({
      clientId,
      eventName: 'Event 1',
      city: 'City Y',
      priceCents: 120000,
      disposition: 'WON',
    });
    const { user } = renderApp('/offers');
    await screen.findByRole('table', { name: 'Tarjoukset' });
    await user.click(screen.getByRole('button', { name: 'Muuta keikaksi: Event 1' }));
    const dialog = screen.getByRole('dialog', { name: 'Muuta keikaksi' });
    expect(await within(dialog).findByRole('textbox', { name: 'Paikka' })).toHaveValue('Venue X, City Y');
    await user.selectOptions(within(dialog).getByRole('combobox', { name: 'Kokoonpano' }), 'Template A');
    await user.click(within(dialog).getByRole('button', { name: 'Muuta keikaksi' }));

    expect(await screen.findByText('Keikka luotu tarjouksesta Event 1.', { exact: false })).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    const link = await screen.findByRole('link', { name: 'Keikka: Event 1' });
    expect(link).toHaveTextContent('Keikka →');
    expect(link).toHaveAttribute('href', `/gigs/${offer.eventId}`);
    expect(screen.getByRole('link', { name: 'Avaa keikka' })).toHaveAttribute('href', `/gigs/${offer.eventId}`);
    expect(db.events.events.filter((g) => g.offerId === offer.id)).toHaveLength(1);
    expect(bodyRows()[0]).toHaveTextContent('Hyväksytty');
  });

  it('shows Convert only for accepted, upcoming offers without an event; Voitettu inline shows it at once (BR-109)', async () => {
    addMockOffer({ clientId, eventName: 'Pending 1' });
    addMockOffer({ clientId, eventName: 'Lost 1', disposition: 'LOST_PRICE' });
    addMockOffer({ clientId, eventName: 'Won 1', disposition: 'WON' });
    const converted = addMockOffer({ clientId, eventName: 'Converted 1', disposition: 'WON' });
    converted.eventId = '00000000-0000-4000-8000-00000000ffff';
    const { user } = renderApp('/offers');
    await screen.findByRole('table', { name: 'Tarjoukset' });
    const linkedEventCell = (event: string) => {
      const row = bodyRows().find((r) => within(r).queryByRole('link', { name: event }))!;
      return row.querySelector<HTMLElement>('td[data-label="Linkitetty keikka"]')!;
    };
    expect(within(linkedEventCell('Won 1')).getByRole('button', { name: 'Muuta keikaksi: Won 1' })).toBeInTheDocument();
    expect(linkedEventCell('Pending 1')).toHaveTextContent(/^–$/);
    expect(linkedEventCell('Lost 1')).toHaveTextContent(/^–$/);
    expect(within(linkedEventCell('Converted 1')).getByRole('link', { name: 'Keikka: Converted 1' })).toHaveTextContent(
      'Keikka →',
    );
    expect(screen.getAllByRole('button', { name: /^Muuta keikaksi:/ })).toHaveLength(1);

    await user.selectOptions(screen.getByRole('combobox', { name: 'Lopputulos: Pending 1' }), 'Voitettu');
    expect(
      await within(linkedEventCell('Pending 1')).findByRole('button', { name: 'Muuta keikaksi: Pending 1' }),
    ).toBeInTheDocument();
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
    expect(await screen.findByText('Ei tarjouksia.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Poistetut' }));
    const deleted = await screen.findByRole('table', { name: 'Poistetut' });
    // Deleted view: every column always shown (no priorities).
    expect(deleted.querySelector('.excel-prio-2, .excel-prio-3')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Palauta: Event 1' }));
    expect(await screen.findByText('Tarjous palautettu:')).toBeInTheDocument();
    expect(offer.deletedAt).toBeNull();
  });
});

describe('offer list paging (TASK-193)', () => {
  beforeEach(() => {
    signInMock();
  });

  const pager = () => screen.queryByRole('navigation', { name: 'Sivutus' });

  it('shows 100 offers a page with the page in the URL; a search goes back to page 1', async () => {
    const client = addMockClient('Client X');
    for (let i = 1; i <= 101; i++) addMockOffer({ clientId: client.id, eventName: `Paged Offer ${String(i).padStart(3, '0')}` });
    const total = db.offers.offers.filter((o) => !o.deletedAt).length;
    installMatchMedia({ [TABLET_QUERY]: true });
    const { user } = renderApp('/offers');
    await waitFor(() => expect(bodyRows()).toHaveLength(100));
    expect(within(pager()!).getByText(`1–100 / ${total}`)).toBeInTheDocument();
    const page1 = eventNames();

    await user.click(within(pager()!).getByRole('button', { name: 'Seuraava' }));
    expect(currentSearch().get('page')).toBe('2');
    expect(bodyRows()).toHaveLength(total - 100);
    expect(eventNames().filter((n) => page1.includes(n!))).toEqual([]);

    await user.type(screen.getByRole('searchbox', { name: 'Haku' }), 'Paged Offer');
    await waitFor(() => expect(currentSearch().get('q')).toBe('Paged Offer'));
    expect(currentSearch().has('page')).toBe(false);
    await waitFor(() => expect(within(pager()!).getByText('1–100 / 101')).toBeInTheDocument());
  });
});
