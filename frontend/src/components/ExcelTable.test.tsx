import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { TABLET_QUERY } from '../lib/useMediaQuery';
import { installMatchMedia } from '../test/matchMedia';
import { placeColumnFilterPopover } from './columnFilterPlacement';
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
  { id: 1, name: 'Event 10', city: 'City A', price: 300, tags: ['x'] },
  { id: 2, name: 'Event 2', city: null, price: null, tags: [] },
  { id: 3, name: 'event 1', city: 'City B', price: 100, tags: ['x', 'y'] },
  { id: 4, name: 'Event 3', city: 'City A', price: 200, tags: ['y'] },
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
    expect(ids(filterRows(ROWS, COLUMNS, { nope: ['x'], name: ['Event 2'] }))).toEqual([1, 2, 3, 4]);
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
    expect(names()).toEqual(['Event 10', 'Event 2', 'event 1', 'Event 3']);
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
    expect(names()).toEqual(['Event 10', 'Event 2', 'Event 3']);
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
    expect(names()).toEqual(['Event 3']);

    await user.click(screen.getByRole('button', { name: 'Tyhjennä suodattimet' }));
    expect(names()).toEqual(['Event 10', 'Event 2', 'event 1', 'Event 3']);
    expect(location()).toBe('');
    expect(button).not.toHaveClass('is-active');
  });

  it('restores filters and sort from the URL; selecting every value removes the filter', async () => {
    installMatchMedia({ [TABLET_QUERY]: true });
    const { user } = renderDemo('/?sort=price&dir=desc&f.city=');
    expect(names()).toEqual(['Event 2']);
    expect(within(table()).getByRole('columnheader', { name: /Price/ })).toHaveAttribute('aria-sort', 'descending');
    await user.click(within(table()).getByRole('button', { name: 'Suodata: City' }));
    const popover = screen.getByRole('dialog', { name: 'Suodata: City' });
    expect(within(popover).getByRole('checkbox', { name: '(tyhjä)' })).toBeChecked();
    expect(within(popover).getByRole('checkbox', { name: 'City A' })).not.toBeChecked();
    await user.click(within(popover).getByRole('button', { name: 'Valitse kaikki' }));
    await user.click(within(popover).getByRole('button', { name: 'OK' }));
    expect(names()).toEqual(['Event 10', 'Event 3', 'event 1', 'Event 2']);
    expect(location()).toBe('?sort=price&dir=desc');

    await user.click(within(table()).getByRole('button', { name: /^Price/ }));
    expect(location()).toBe('?sort=price&dir=asc');
    await user.click(within(table()).getByRole('button', { name: /^Name/ }));
    expect(names()).toEqual(['event 1', 'Event 2', 'Event 3', 'Event 10']);
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
    expect(names()).toEqual(['Event 2', 'event 1']);
  });

  it('shows a search box for more than 8 values; Select all / Clear act on the visible values', async () => {
    installMatchMedia({ [TABLET_QUERY]: true });
    const many: Row[] = Array.from({ length: 10 }, (_, i) => ({
      id: i + 1,
      name: `Event ${i + 1}`,
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
    expect(names()).not.toContain('Event 10');
  });

  it('shows a message with Clear filters when the filters hide every row', async () => {
    installMatchMedia({ [TABLET_QUERY]: true });
    const { user } = renderDemo('/?f.city=Nowhere');
    expect(screen.getByText('Ei suodattimia vastaavia rivejä.')).toBeInTheDocument();
    await user.click(screen.getAllByRole('button', { name: 'Tyhjennä suodattimet' })[0]!);
    expect(names()).toHaveLength(4);
  });

  it('keeps the header and its filter buttons when the filters hide every row (F-009)', async () => {
    installMatchMedia({ [TABLET_QUERY]: true });
    const { user } = renderDemo('/?f.city=City A&f.tags=');
    // City A rows have tags, so nothing matches: no data rows, the header stays, message below it.
    expect(within(table()).queryAllByRole('cell')).toHaveLength(0);
    expect(within(table()).getAllByRole('columnheader')).toHaveLength(COLUMNS.length);
    expect(screen.getByText('Ei suodattimia vastaavia rivejä.').closest('.excel-table-wrap')).toContainElement(table());

    // Loosen one filter from its header: the rows come back, the other filter stays.
    await user.click(within(table()).getByRole('button', { name: 'Suodata: Tags' }));
    const tags = screen.getByRole('dialog', { name: 'Suodata: Tags' });
    await user.click(within(tags).getByRole('button', { name: 'Valitse kaikki' }));
    await user.click(within(tags).getByRole('button', { name: 'OK' }));
    expect(names()).toEqual(['Event 10', 'Event 3']);
    expect(location()).toBe('?f.city=City A');
  });

  it('phones: the message replaces the cards; "Suodattimet" stays in the bar', () => {
    renderDemo('/?f.city=Nowhere');
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.getByText('Ei suodattimia vastaavia rivejä.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Suodattimet/ })).toBeInTheDocument();
  });
});

describe('filter popover placement: always inside the viewport', () => {
  const VIEW = { width: 1280, height: 800 };
  const rect = (top: number, left = 900) => ({ top, bottom: top + 24, left });
  /** The popover's box for a placement and a content height (fixed position). */
  const box = (p: ReturnType<typeof placeColumnFilterPopover>, contentH: number) => {
    const h = Math.min(contentH, p.maxHeight);
    const top = p.top ?? VIEW.height - p.bottom! - h;
    return { top, bottom: top + h };
  };

  it('opens under the icon when there is room', () => {
    const p = placeColumnFilterPopover(rect(100), VIEW);
    expect(p.top).toBe(128);
    expect(p.bottom).toBeUndefined();
    expect(p.top! + p.maxHeight).toBeLessThanOrEqual(VIEW.height - 8);
  });

  it('opens above the icon, upwards, when the icon is low (header near the bottom edge)', () => {
    // The e2e case: the header row at ~645 px of an 800 px window.
    const p = placeColumnFilterPopover(rect(621), VIEW);
    expect(p.top).toBeUndefined();
    expect(p.bottom).toBe(800 - 621 + 4);
    for (const contentH of [200, 400, 1000]) {
      const b = box(p, contentH);
      expect(b.top).toBeGreaterThanOrEqual(8);
      expect(b.bottom).toBeLessThanOrEqual(621);
    }
  });

  it('keeps the whole popover on screen even when the icon is scrolled out of view', () => {
    for (const top of [-200, 790, 1200]) {
      const p = placeColumnFilterPopover(rect(top), VIEW);
      const b = box(p, 1000);
      expect(b.top, `icon at ${top}`).toBeGreaterThanOrEqual(8);
      expect(b.bottom, `icon at ${top}`).toBeLessThanOrEqual(VIEW.height - 8);
    }
  });

  it('stays inside the width and caps the height to a short window', () => {
    const p = placeColumnFilterPopover(rect(100, 1200), { width: 1280, height: 300 });
    expect(p.left).toBe(1280 - 280 - 8);
    expect(p.maxHeight).toBeLessThanOrEqual(300 - 16);
  });

  it('the rendered popover flips above a low filter icon', async () => {
    installMatchMedia({ [TABLET_QUERY]: true });
    const { user } = renderDemo();
    const button = within(table()).getByRole('button', { name: 'Suodata: City' });
    const h = window.innerHeight;
    button.getBoundingClientRect = () => ({ top: h - 60, bottom: h - 36, left: 200, right: 224, width: 24, height: 24, x: 200, y: h - 60, toJSON: () => ({}) });
    await user.click(button);
    const popover = screen.getByRole('dialog', { name: 'Suodata: City' });
    expect(popover).toHaveAttribute('data-placement', 'above');
    expect(popover.style.top).toBe('');
    expect(popover.style.bottom).toBe('64px');
    expect(parseFloat(popover.style.maxHeight)).toBeLessThanOrEqual(h - 60 - 4 - 8);
  });
});

// City = priority 3 (hidden below 1400 px of table width), Price = priority 2 (below 1100 px).
const PRIORITY_COLUMNS: ExcelColumn<Row>[] = COLUMNS.map((c) =>
  c.key === 'city' ? { ...c, priority: 3 } : c.key === 'price' ? { ...c, priority: 2 } : c,
);

describe('<ExcelTable> column priorities (TASK-147)', () => {
  const headerOf = (label: string) => within(table()).getByRole('columnheader', { name: new RegExp(`^${label}`) });

  it('marks header and body cells with the priority (default 1); hiding is CSS only', () => {
    installMatchMedia({ [TABLET_QUERY]: true });
    renderDemo('/', { columns: PRIORITY_COLUMNS });
    expect(headerOf('Name')).toHaveAttribute('data-priority', '1');
    expect(headerOf('Name')).not.toHaveClass('excel-prio-2', 'excel-prio-3');
    expect(headerOf('City')).toHaveAttribute('data-priority', '3');
    expect(headerOf('City')).toHaveClass('excel-prio-3');
    expect(headerOf('Price')).toHaveAttribute('data-priority', '2');
    expect(headerOf('Price')).toHaveClass('excel-prio-2', 'num');
    const firstRow = within(table()).getAllByRole('row')[1]!;
    const cells = within(firstRow).getAllByRole('cell');
    expect(cells.map((c) => c.getAttribute('data-priority'))).toEqual(['1', '3', '2', '1']);
    expect(cells[1]).toHaveClass('excel-prio-3');
    expect(cells[2]).toHaveClass('excel-prio-2');
    // Rendered (not removed): the column is hidden by the container query in excelTable.css.
    expect(within(firstRow).getByText('City A')).toBeInTheDocument();
  });

  it('applies and clears the filter of a hidden column, and sorts by it', async () => {
    installMatchMedia({ [TABLET_QUERY]: true });
    const { user } = renderDemo('/?f.city=City A&sort=price&dir=desc', { columns: PRIORITY_COLUMNS });
    // Filter on the priority 3 column + sort by the priority 2 column, both from the URL.
    expect(names()).toEqual(['Event 10', 'Event 3']);
    expect(screen.getByText('Näytetään 2 / 4')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Tyhjennä suodattimet' }));
    expect(names()).toEqual(['Event 10', 'Event 3', 'event 1', 'Event 2']);
    expect(location()).toBe('?sort=price&dir=desc');
  });

  it('phone rows keep every column (priority hiding is only from 600 px)', () => {
    renderDemo('/', { columns: PRIORITY_COLUMNS });
    const firstRow = within(table()).getAllByRole('row')[1]!;
    expect(within(firstRow).getAllByRole('cell').map((c) => c.getAttribute('data-label'))).toEqual([
      'Name',
      'City',
      'Price',
      'Tags',
    ]);
  });
});

describe('<ExcelTable> on phones (< 600 px)', () => {
  it('lays rows out as compact rows: title, main figure, bare and hidden cells (TASK-175)', () => {
    const columns: ExcelColumn<Row>[] = [
      { ...COLUMNS[0]!, cell: (r) => <a href={`/rows/${r.id}`}>{r.name}</a> },
      { ...COLUMNS[1]!, phoneBare: true },
      { ...COLUMNS[2]!, phoneMain: true },
      { ...COLUMNS[3]!, hideOnPhone: true },
    ];
    renderDemo('/', { columns });
    expect(table()).toHaveClass('data-table-cards');
    const cells = within(within(table()).getAllByRole('row')[1]!).getAllByRole('cell');
    expect(cells[0]).toHaveClass('cell-primary');
    expect(within(cells[0]!).getByRole('link', { name: 'Event 10' })).toBeInTheDocument();
    expect(cells[1]).toHaveClass('cell-bare');
    expect(cells[1]).not.toHaveClass('cell-main');
    expect(cells[2]).toHaveClass('cell-main', 'num');
    expect(cells[3]).toHaveClass('hide-phone');
    // Labels stay on every cell (CSS decides where they are shown).
    expect(cells.map((c) => c.getAttribute('data-label'))).toEqual(['Name', 'City', 'Price', 'Tags']);
  });

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
    expect(names()).toEqual(['event 1']);
    expect(open).toHaveFocus();

    await user.click(open);
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Tyhjennä suodattimet' }));
    await user.click(screen.getByRole('button', { name: 'Valmis' }));
    expect(names()).toHaveLength(4);
  });
});

// A second filter in one column's header (generic option; currently unused by the app).
const EXTRA_COLUMNS: ExcelColumn<Row>[] = [
  ...COLUMNS.map((c) => (c.key === 'city' ? { ...c, extraFilters: ['hasPrice'] } : c)),
  {
    key: 'hasPrice',
    label: 'Priced',
    filterOnly: true,
    filterValue: (r) => (r.price === null ? 'no' : 'yes'),
    cell: () => null,
  },
];

describe('<ExcelTable> filterOnly columns', () => {
  it('shows the filter button in the host header, no header / cell of its own, filters and keeps the URL', async () => {
    installMatchMedia({ [TABLET_QUERY]: true });
    const { user } = renderDemo('/', { columns: EXTRA_COLUMNS });
    expect(within(table()).getAllByRole('columnheader')).toHaveLength(4);
    expect(within(table()).getAllByRole('row')[1]!.querySelectorAll('td')).toHaveLength(4);
    const host = within(table()).getByRole('columnheader', { name: /City/ });
    expect(within(host).getAllByRole('button').map((b) => b.getAttribute('aria-label') ?? b.textContent)).toEqual([
      'City',
      'Suodata: City',
      'Suodata: Priced',
    ]);
    await user.click(within(host).getByRole('button', { name: 'Suodata: Priced' }));
    const popover = screen.getByRole('dialog', { name: 'Suodata: Priced' });
    await user.click(within(popover).getByRole('checkbox', { name: 'no' }));
    await user.click(within(popover).getByRole('button', { name: 'OK' }));
    expect(names()).toEqual(['Event 10', 'event 1', 'Event 3']);
    expect(location()).toBe('?f.hasPrice=yes');
    expect(within(host).getByRole('button', { name: 'Suodata: Priced' })).toHaveAccessibleDescription('Suodatin käytössä');
    expect(within(host).getByRole('button', { name: 'Suodata: City' })).not.toHaveClass('is-active');
  });

  it('phones: listed in the Filters sheet, not a card line', async () => {
    installMatchMedia({});
    const { user } = renderDemo('/', { columns: EXTRA_COLUMNS });
    expect(within(table()).getAllByRole('row')[1]!.querySelectorAll('td[data-label="Priced"]')).toHaveLength(0);
    await user.click(screen.getByRole('button', { name: 'Suodattimet' }));
    const sheet = screen.getByRole('dialog', { name: 'Suodattimet' });
    expect(within(sheet).getByRole('button', { name: 'Priced' })).toBeInTheDocument();
  });
});
