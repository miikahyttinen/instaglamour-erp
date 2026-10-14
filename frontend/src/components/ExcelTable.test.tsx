import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { TABLET_QUERY } from '../lib/useMediaQuery';
import { installMatchMedia } from '../test/matchMedia';
import { ExcelTable } from './ExcelTable';
import {
  BLANK,
  filterOptions,
  filterRows,
  readTableParams,
  sortRows,
  useUrlTableState,
  writeFilterParams,
  type ExcelColumn,
} from './excelTableState';

interface Row {
  id: number;
  name: string;
  city: string | null;
  price: number | null;
  tags: string[];
}

const ROWS: Row[] = [
  { id: 1, name: 'Gig 10', city: 'City A', price: 300, tags: ['x'] },
  { id: 2, name: 'Gig 2', city: null, price: null, tags: [] },
  { id: 3, name: 'gig 1', city: 'City B', price: 100, tags: ['x', 'y'] },
  { id: 4, name: 'Gig 3', city: 'City A', price: 200, tags: ['y'] },
];

const COLUMNS: ExcelColumn<Row>[] = [
  { key: 'name', label: 'Name', primary: true, sortValue: (r) => r.name, cell: (r) => r.name },
  {
    key: 'city',
    label: 'City',
    sortValue: (r) => r.city,
    filterValue: (r) => r.city,
    cell: (r) => r.city ?? '–',
  },
  { key: 'price', label: 'Price', numeric: true, sortValue: (r) => r.price, cell: (r) => r.price ?? '–' },
  {
    key: 'tags',
    label: 'Tags',
    filterValue: (r) => r.tags,
    filterLabel: (v) => `Tag ${v.toUpperCase()}`,
    cell: (r) => r.tags.join(', '),
  },
];

const ids = (rows: Row[]) => rows.map((r) => r.id);

describe('excel table state (pure)', () => {
  it('filters with OR inside a column, AND across columns, blank and list values', () => {
    expect(ids(filterRows(ROWS, COLUMNS, { city: ['City A', 'City B'] }))).toEqual([1, 3, 4]);
    expect(ids(filterRows(ROWS, COLUMNS, { city: [BLANK] }))).toEqual([2]);
    expect(ids(filterRows(ROWS, COLUMNS, { tags: ['y'] }))).toEqual([3, 4]);
    expect(ids(filterRows(ROWS, COLUMNS, { tags: [BLANK] }))).toEqual([2]);
    expect(ids(filterRows(ROWS, COLUMNS, { city: ['City A'], tags: ['y'] }))).toEqual([4]);
    // Unknown or unfilterable keys are ignored.
    expect(ids(filterRows(ROWS, COLUMNS, { nope: ['x'], name: ['Gig 2'] }))).toEqual([1, 2, 3, 4]);
  });

  it('offers the values left by the other filters plus the selected ones, blank last', () => {
    const city = COLUMNS[1]!;
    expect(filterOptions(ROWS, COLUMNS, {}, city, '(blank)')).toEqual([
      { value: 'City A', label: 'City A' },
      { value: 'City B', label: 'City B' },
      { value: BLANK, label: '(blank)' },
    ]);
    // Tag Y rows are in City A and City B; the selected blank stays offered.
    expect(filterOptions(ROWS, COLUMNS, { tags: ['y'], city: [BLANK] }, city, '(blank)').map((o) => o.value)).toEqual([
      'City A',
      'City B',
      BLANK,
    ]);
    expect(filterOptions(ROWS, COLUMNS, { city: ['City B'] }, COLUMNS[3]!, '(blank)')).toEqual([
      { value: 'x', label: 'Tag X' },
      { value: 'y', label: 'Tag Y' },
    ]);
  });

  it('sorts naturally, case-insensitively, empty last in both directions, ties stable', () => {
    expect(ids(sortRows(ROWS, COLUMNS, { key: 'name', dir: 'asc' }))).toEqual([3, 2, 4, 1]);
    expect(ids(sortRows(ROWS, COLUMNS, { key: 'name', dir: 'desc' }))).toEqual([1, 4, 2, 3]);
    expect(ids(sortRows(ROWS, COLUMNS, { key: 'price', dir: 'asc' }))).toEqual([3, 4, 1, 2]);
    expect(ids(sortRows(ROWS, COLUMNS, { key: 'price', dir: 'desc' }))).toEqual([1, 4, 3, 2]);
    expect(ids(sortRows(ROWS, COLUMNS, { key: 'city', dir: 'asc' }))).toEqual([1, 4, 3, 2]);
    expect(ids(sortRows(ROWS, COLUMNS, { key: 'city', dir: 'asc' }, (a, b) => b.id - a.id))).toEqual([4, 1, 3, 2]);
  });

  it('reads and writes the URL parameters', () => {
    const params = writeFilterParams(new URLSearchParams('q=x&f.old=1'), { city: ['City A', BLANK], tags: ['y'] });
    expect(params.toString()).toBe('q=x&f.city=City+A&f.city=&f.tags=y');
    expect(readTableParams(params)).toEqual({ sort: null, filters: { city: ['City A', ''], tags: ['y'] } });
    expect(readTableParams(new URLSearchParams('sort=price'), { defaultSort: { key: 'name', dir: 'desc' } }).sort).toEqual({
      key: 'price',
      dir: 'asc',
    });
    expect(readTableParams(new URLSearchParams(''), { defaultSort: { key: 'name', dir: 'desc' } }).sort).toEqual({
      key: 'name',
      dir: 'desc',
    });
    expect(readTableParams(new URLSearchParams('t.sort=name&t.dir=desc&t.f.city=City+B'), { prefix: 't.' })).toEqual({
      sort: { key: 'name', dir: 'desc' },
      filters: { city: ['City B'] },
    });
  });
});

function Location() {
  return <output data-testid="location">{useLocation().search}</output>;
}

function Demo({ rows = ROWS, columns = COLUMNS }: { rows?: Row[]; columns?: ExcelColumn<Row>[] }) {
  const state = useUrlTableState();
  return (
    <>
      <button type="button">Outside</button>
      <ExcelTable {...state} caption="Demo" columns={columns} rows={rows} rowKey={(r) => r.id} />
      <Location />
    </>
  );
}

function renderDemo(path = '/', props: { rows?: Row[]; columns?: ExcelColumn<Row>[] } = {}) {
  const user = userEvent.setup();
  render(
    <MemoryRouter initialEntries={[path]}>
      <Demo {...props} />
    </MemoryRouter>,
  );
  return { user };
}

const table = () => screen.getByRole('table', { name: 'Demo' });
const names = () =>
  within(table())
    .getAllByRole('row')
    .filter((r) => r.closest('tbody'))
    .map((r) => r.querySelector('td')!.textContent);
const location = () => decodeURIComponent(screen.getByTestId('location').textContent ?? '').replace(/\+/g, ' ');

describe('<ExcelTable> from 600 px', () => {
  it('filters through the header popover; the icon shows the active filter; the URL keeps it', async () => {
    installMatchMedia({ [TABLET_QUERY]: true });
    const { user } = renderDemo();
    expect(names()).toEqual(['Gig 10', 'Gig 2', 'gig 1', 'Gig 3']);
    // Only filterable columns get an icon.
    expect(within(table()).queryByRole('button', { name: 'Suodata: Name' })).not.toBeInTheDocument();
    const button = within(table()).getByRole('button', { name: 'Suodata: City' });
    expect(button).toHaveAttribute('aria-haspopup', 'dialog');
    expect(button).toHaveAttribute('aria-expanded', 'false');

    await user.click(button);
    const popover = screen.getByRole('dialog', { name: 'Suodata: City' });
    expect(button).toHaveAttribute('aria-expanded', 'true');
    // ≤ 8 values: no search; focus on the first control.
    expect(within(popover).queryByRole('searchbox')).not.toBeInTheDocument();
    expect(within(popover).getByRole('button', { name: 'Valitse kaikki' })).toHaveFocus();
    expect(within(popover).getAllByRole('checkbox').map((c) => c.closest('label')!.textContent)).toEqual([
      'City A',
      'City B',
      '(tyhjä)',
    ]);
    expect(within(popover).getAllByRole('checkbox').every((c) => (c as HTMLInputElement).checked)).toBe(true);

    await user.click(within(popover).getByRole('checkbox', { name: 'City B' }));
    await user.click(within(popover).getByRole('button', { name: 'OK' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(names()).toEqual(['Gig 10', 'Gig 2', 'Gig 3']);
    expect(button).toHaveClass('is-active');
    expect(button).toHaveAccessibleDescription('Suodatin käytössä');
    expect(button).toHaveFocus();
    expect(location()).toBe('?f.city=City A&f.city=');
    expect(screen.getByText('Näytetään 3 / 4')).toBeInTheDocument();

    // Combine with a list column (AND).
    await user.click(within(table()).getByRole('button', { name: 'Suodata: Tags' }));
    const tags = screen.getByRole('dialog', { name: 'Suodata: Tags' });
    await user.click(within(tags).getByRole('button', { name: 'Tyhjennä' }));
    expect(within(tags).getByRole('button', { name: 'OK' })).toBeDisabled();
    await user.click(within(tags).getByRole('checkbox', { name: 'Tag Y' }));
    await user.click(within(tags).getByRole('button', { name: 'OK' }));
    expect(names()).toEqual(['Gig 3']);

    await user.click(screen.getByRole('button', { name: 'Tyhjennä suodattimet' }));
    expect(names()).toEqual(['Gig 10', 'Gig 2', 'gig 1', 'Gig 3']);
    expect(location()).toBe('');
    expect(button).not.toHaveClass('is-active');
  });

  it('restores filters and sort from the URL; selecting every value removes the filter', async () => {
    installMatchMedia({ [TABLET_QUERY]: true });
    const { user } = renderDemo('/?sort=price&dir=desc&f.city=');
    expect(names()).toEqual(['Gig 2']);
    expect(within(table()).getByRole('columnheader', { name: /Price/ })).toHaveAttribute('aria-sort', 'descending');
    await user.click(within(table()).getByRole('button', { name: 'Suodata: City' }));
    const popover = screen.getByRole('dialog', { name: 'Suodata: City' });
    expect(within(popover).getByRole('checkbox', { name: '(tyhjä)' })).toBeChecked();
    expect(within(popover).getByRole('checkbox', { name: 'City A' })).not.toBeChecked();
    await user.click(within(popover).getByRole('button', { name: 'Valitse kaikki' }));
    await user.click(within(popover).getByRole('button', { name: 'OK' }));
    expect(names()).toEqual(['Gig 10', 'Gig 3', 'gig 1', 'Gig 2']);
    expect(location()).toBe('?sort=price&dir=desc');

    await user.click(within(table()).getByRole('button', { name: /^Price/ }));
    expect(location()).toBe('?sort=price&dir=asc');
    await user.click(within(table()).getByRole('button', { name: /^Name/ }));
    expect(names()).toEqual(['gig 1', 'Gig 2', 'Gig 3', 'Gig 10']);
  });

  it('is keyboard accessible: Esc / Cancel / outside click discard, Enter applies, Tab stays inside', async () => {
    installMatchMedia({ [TABLET_QUERY]: true });
    const { user } = renderDemo();
    const button = within(table()).getByRole('button', { name: 'Suodata: City' });
    button.focus();
    await user.keyboard('{Enter}');
    let popover = screen.getByRole('dialog', { name: 'Suodata: City' });
    await user.click(within(popover).getByRole('checkbox', { name: 'City A' }));
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(button).toHaveFocus();
    expect(names()).toHaveLength(4);

    await user.keyboard('{Enter}');
    popover = screen.getByRole('dialog', { name: 'Suodata: City' });
    // Tab cycles inside: … OK, Peruuta → back to Valitse kaikki.
    within(popover).getByRole('button', { name: 'Peruuta' }).focus();
    await user.tab();
    expect(within(popover).getByRole('button', { name: 'Valitse kaikki' })).toHaveFocus();
    await user.click(within(popover).getByRole('button', { name: 'Peruuta' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await user.click(button);
    popover = screen.getByRole('dialog', { name: 'Suodata: City' });
    await user.click(within(popover).getByRole('checkbox', { name: 'City A' }));
    await user.click(screen.getByRole('button', { name: 'Outside' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(names()).toHaveLength(4);

    await user.click(button);
    popover = screen.getByRole('dialog', { name: 'Suodata: City' });
    const cityA = within(popover).getByRole('checkbox', { name: 'City A' });
    await user.click(cityA);
    cityA.focus();
    await user.keyboard('{Enter}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(names()).toEqual(['Gig 2', 'gig 1']);
  });

  it('shows a search box for more than 8 values; Select all / Clear act on the visible values', async () => {
    installMatchMedia({ [TABLET_QUERY]: true });
    const many: Row[] = Array.from({ length: 10 }, (_, i) => ({
      id: i + 1,
      name: `Gig ${i + 1}`,
      city: `City ${i + 1}`,
      price: i,
      tags: [],
    }));
    const { user } = renderDemo('/', { rows: many });
    await user.click(within(table()).getByRole('button', { name: 'Suodata: City' }));
    const popover = screen.getByRole('dialog', { name: 'Suodata: City' });
    const search = within(popover).getByRole('searchbox', { name: 'Hae arvoja' });
    expect(search).toHaveFocus();
    await user.type(search, 'city 1');
    expect(within(popover).getAllByRole('checkbox').map((c) => c.closest('label')!.textContent)).toEqual([
      'City 1',
      'City 10',
    ]);
    await user.click(within(popover).getByRole('button', { name: 'Tyhjennä' }));
    await user.clear(search);
    await user.type(search, 'nothing');
    expect(within(popover).getByText('Ei vastaavia arvoja.')).toBeInTheDocument();
    await user.clear(search);
    await user.click(within(popover).getByRole('button', { name: 'OK' }));
    expect(names()).toHaveLength(8);
    expect(names()).not.toContain('Gig 10');
  });

  it('shows a message with Clear filters when the filters hide every row', async () => {
    installMatchMedia({ [TABLET_QUERY]: true });
    const { user } = renderDemo('/?f.city=Nowhere');
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.getByText('Ei suodattimia vastaavia rivejä.')).toBeInTheDocument();
    await user.click(screen.getAllByRole('button', { name: 'Tyhjennä suodattimet' })[0]!);
    expect(names()).toHaveLength(4);
  });
});

describe('<ExcelTable> on phones (< 600 px)', () => {
  it('has no header filter icons; "Suodattimet" opens the filters and the sort in a sheet', async () => {
    const { user } = renderDemo();
    expect(within(table()).queryByRole('button', { name: /Suodata:/ })).not.toBeInTheDocument();
    const open = screen.getByRole('button', { name: 'Suodattimet' });
    await user.click(open);
    let sheet = screen.getByRole('dialog', { name: 'Suodattimet' });
    expect(within(sheet).getByRole('button', { name: 'City' })).toHaveAccessibleDescription('Kaikki');
    expect(within(sheet).getByRole('button', { name: 'Tags' })).toBeInTheDocument();
    expect(within(sheet).queryByRole('button', { name: 'Name' })).not.toBeInTheDocument();

    await user.selectOptions(within(sheet).getByRole('combobox', { name: 'Järjestys' }), 'Price');
    await user.selectOptions(within(sheet).getByRole('combobox', { name: 'Suunta' }), 'Laskeva');
    expect(location()).toBe('?sort=price&dir=desc');

    await user.click(within(sheet).getByRole('button', { name: 'City' }));
    expect(within(sheet).getByRole('heading', { name: 'City' })).toBeInTheDocument();
    await user.click(within(sheet).getByRole('button', { name: 'Tyhjennä' }));
    await user.click(within(sheet).getByRole('checkbox', { name: 'City B' }));
    await user.click(within(sheet).getByRole('button', { name: 'OK' }));
    sheet = screen.getByRole('dialog', { name: 'Suodattimet' });
    const city = within(sheet).getByRole('button', { name: 'City' });
    expect(city).toHaveAccessibleDescription('1 valittu');
    expect(city).toHaveFocus();
    await user.click(within(sheet).getByRole('button', { name: 'Valmis' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(names()).toEqual(['gig 1']);
    expect(open).toHaveFocus();

    await user.click(open);
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Tyhjennä suodattimet' }));
    await user.click(screen.getByRole('button', { name: 'Valmis' }));
    expect(names()).toHaveLength(4);
  });
});
