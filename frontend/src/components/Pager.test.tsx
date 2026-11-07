import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { MemoryRouter, useLocation, useSearchParams } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { setLanguage } from '../i18n';
import { TABLET_QUERY } from '../lib/useMediaQuery';
import { installMatchMedia } from '../test/matchMedia';
import { DataTable, type DataTableColumn } from './DataTable';
import { ExcelTable } from './ExcelTable';
import { useLocalTableState, type ExcelColumn } from './excelTableState';
import { Pager } from './Pager';
import { pageSlice, parsePage, useUrlPaging, type Paging } from './pagination';

interface Row {
  id: number;
  name: string;
  city: string;
  price: number;
}

/** Synthetic rows: Item 1 … Item n, City A for odd ids, City B for even ids, price = id. */
const makeRows = (n: number): Row[] =>
  Array.from({ length: n }, (_, i) => ({
    id: i + 1,
    name: `Item ${i + 1}`,
    city: (i + 1) % 2 ? 'City A' : 'City B',
    price: i + 1,
  }));

const bodyNames = () =>
  screen
    .getAllByRole('row')
    .filter((r) => r.closest('tbody'))
    .map((r) => within(r).getAllByRole('cell')[0]!.textContent);
const pager = () => screen.queryByRole('navigation', { name: 'Sivutus' });

describe('paging helpers', () => {
  it('parses ?page= (invalid = 1)', () => {
    expect(parsePage(null)).toBe(1);
    expect(parsePage('3')).toBe(3);
    expect(parsePage('0')).toBe(1);
    expect(parsePage('-2')).toBe(1);
    expect(parsePage('x')).toBe(1);
    expect(parsePage('2.5')).toBe(1);
  });

  it('slices a page, clamps out-of-range pages and reports the range', () => {
    const rows = makeRows(342);
    const first = pageSlice(rows, 1, 100);
    expect(first.rows.map((r) => r.id).slice(0, 2)).toEqual([1, 2]);
    expect(first).toMatchObject({ page: 1, pageCount: 4, from: 1, to: 100, total: 342 });
    const last = pageSlice(rows, 4, 100);
    expect(last.rows).toHaveLength(42);
    expect(last).toMatchObject({ page: 4, from: 301, to: 342 });
    expect(pageSlice(rows, 99, 100)).toMatchObject({ page: 4, from: 301, to: 342 });
    expect(pageSlice([], 3, 100)).toMatchObject({ page: 1, pageCount: 1, from: 0, to: 0, total: 0 });
  });
});

describe('Pager', () => {
  it('is hidden when every row fits on one page', () => {
    render(<Pager slice={pageSlice(makeRows(100), 1, 100)} onPageChange={() => {}} />);
    expect(pager()).not.toBeInTheDocument();
  });

  it('shows previous / page / next and the range, FI and EN', async () => {
    const onPageChange = vi.fn();
    const user = userEvent.setup();
    const { rerender } = render(<Pager slice={pageSlice(makeRows(342), 2, 100)} onPageChange={onPageChange} />);
    const nav = pager()!;
    expect(within(nav).getByText('Sivu 2 / 4')).toBeInTheDocument();
    expect(within(nav).getByText('101–200 / 342')).toBeInTheDocument();
    await user.click(within(nav).getByRole('button', { name: 'Edellinen' }));
    expect(onPageChange).toHaveBeenLastCalledWith(1);
    await user.click(within(nav).getByRole('button', { name: 'Seuraava' }));
    expect(onPageChange).toHaveBeenLastCalledWith(3);

    rerender(<Pager slice={pageSlice(makeRows(342), 1, 100)} onPageChange={onPageChange} />);
    expect(within(pager()!).getByRole('button', { name: 'Edellinen' })).toBeDisabled();
    rerender(<Pager slice={pageSlice(makeRows(342), 4, 100)} onPageChange={onPageChange} />);
    expect(within(pager()!).getByRole('button', { name: 'Seuraava' })).toBeDisabled();

    setLanguage('en');
    rerender(<Pager slice={pageSlice(makeRows(342), 4, 100)} onPageChange={onPageChange} />);
    const en = screen.getByRole('navigation', { name: 'Pagination' });
    expect(within(en).getByText('Page 4 / 4')).toBeInTheDocument();
    expect(within(en).getByRole('button', { name: 'Previous' })).toBeEnabled();
    expect(within(en).getByText('301–342 / 342')).toBeInTheDocument();
  });
});

const DATA_COLUMNS: DataTableColumn<Row>[] = [
  { key: 'name', label: 'Name', primary: true, cell: (r) => r.name },
  { key: 'price', label: 'Price', numeric: true, cell: (r) => r.price },
];

function PagedDataTable({ rows, pageSize }: { rows: Row[]; pageSize: number }) {
  const [page, setPage] = useState(1);
  const paging: Paging = { page, pageSize, onPageChange: setPage };
  return (
    <DataTable
      caption="Items"
      columns={DATA_COLUMNS}
      rows={rows}
      rowKey={(r) => r.id}
      paging={paging}
      footer={
        <tr>
          <td data-label="Total">Total</td>
          <td data-label="Price">{rows.reduce((s, r) => s + r.price, 0)}</td>
        </tr>
      }
    />
  );
}

describe('DataTable paging', () => {
  it('shows one page at a time, the footer over every row, and scrolls to the table on a page change', async () => {
    const scroll = vi.fn();
    Element.prototype.scrollIntoView = scroll;
    const user = userEvent.setup();
    render(<PagedDataTable rows={makeRows(5)} pageSize={2} />);
    expect(bodyNames()).toEqual(['Item 1', 'Item 2']);
    expect(screen.getByText('15')).toBeInTheDocument(); // footer: 1+2+3+4+5
    await user.click(screen.getByRole('button', { name: 'Seuraava' }));
    expect(bodyNames()).toEqual(['Item 3', 'Item 4']);
    expect(screen.getByText('3–4 / 5')).toBeInTheDocument();
    expect(scroll).toHaveBeenCalledWith({ block: 'start' });
    await user.click(screen.getByRole('button', { name: 'Seuraava' }));
    expect(bodyNames()).toEqual(['Item 5']);
    delete (Element.prototype as Partial<Element>).scrollIntoView;
  });

  it('has no pager when the rows fit on one page', () => {
    render(<PagedDataTable rows={makeRows(2)} pageSize={2} />);
    expect(bodyNames()).toEqual(['Item 1', 'Item 2']);
    expect(pager()).not.toBeInTheDocument();
  });
});

const EXCEL_COLUMNS: ExcelColumn<Row>[] = [
  { key: 'name', label: 'Name', primary: true, sortValue: (r) => r.name, cell: (r) => r.name },
  { key: 'city', label: 'City', filterValue: (r) => r.city, cell: (r) => r.city },
  { key: 'price', label: 'Price', numeric: true, sortValue: (r) => r.price, cell: (r) => r.price },
];

function PagedExcelTable({ rows, pageSize }: { rows: Row[]; pageSize: number }) {
  const state = useLocalTableState({ defaultSort: { key: 'price', dir: 'desc' } });
  const [page, setPage] = useState(1);
  return (
    <>
      <button type="button" onClick={() => state.onFiltersChange({ city: ['City A'] })}>
        Only City A
      </button>
      <ExcelTable
        {...state}
        caption="Items"
        columns={EXCEL_COLUMNS}
        rows={rows}
        rowKey={(r) => r.id}
        paging={{ page, pageSize, onPageChange: setPage }}
        footer={(visible) => (
          <tr>
            <td data-label="Name">Sum</td>
            <td data-label="City" />
            <td data-label="Price">{`Sum ${visible.reduce((s, r) => s + r.price, 0)}`}</td>
          </tr>
        )}
      />
    </>
  );
}

describe('ExcelTable paging', () => {
  it('pages after filtering and sorting; the footer totals cover the whole filtered set', async () => {
    installMatchMedia({ [TABLET_QUERY]: true });
    const user = userEvent.setup();
    render(<PagedExcelTable rows={makeRows(7)} pageSize={3} />);
    // Sorted by price, descending: page 1 = the 3 most expensive.
    expect(bodyNames()).toEqual(['Item 7', 'Item 6', 'Item 5']);
    expect(screen.getByText('Sum 28')).toBeInTheDocument();
    expect(screen.getByText('Sivu 1 / 3')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Seuraava' }));
    expect(bodyNames()).toEqual(['Item 4', 'Item 3', 'Item 2']);

    // Filter: City A = 1, 3, 5, 7 (sum 16); page 2 still = rows 4… of the filtered order.
    await user.click(screen.getByRole('button', { name: 'Only City A' }));
    expect(bodyNames()).toEqual(['Item 1']);
    expect(screen.getByText('4–4 / 4')).toBeInTheDocument();
    expect(screen.getByText('Sum 16')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Edellinen' }));
    expect(bodyNames()).toEqual(['Item 7', 'Item 5', 'Item 3']);
  });

  it('clamps an out-of-range page to the last page and hides the pager on one page', () => {
    installMatchMedia({ [TABLET_QUERY]: true });
    const { rerender } = render(
      <ExcelTable
        sort={null}
        onSortChange={() => {}}
        filters={{}}
        onFiltersChange={() => {}}
        caption="Items"
        columns={EXCEL_COLUMNS}
        rows={makeRows(5)}
        rowKey={(r) => r.id}
        paging={{ page: 9, pageSize: 2, onPageChange: () => {} }}
      />,
    );
    expect(bodyNames()).toEqual(['Item 5']);
    expect(screen.getByText('Sivu 3 / 3')).toBeInTheDocument();
    rerender(
      <ExcelTable
        sort={null}
        onSortChange={() => {}}
        filters={{}}
        onFiltersChange={() => {}}
        caption="Items"
        columns={EXCEL_COLUMNS}
        rows={makeRows(2)}
        rowKey={(r) => r.id}
        paging={{ page: 1, pageSize: 2, onPageChange: () => {} }}
      />,
    );
    expect(pager()).not.toBeInTheDocument();
  });
});

function UrlPagingHarness({ resetKey }: { resetKey?: string }) {
  const paging = useUrlPaging(10, resetKey);
  const [, setParams] = useSearchParams();
  const { search } = useLocation();
  return (
    <>
      <span data-testid="page">{paging.page}</span>
      <span data-testid="search">{search}</span>
      <button type="button" onClick={() => paging.onPageChange(3)}>
        Page 3
      </button>
      <button type="button" onClick={() => paging.onPageChange(1)}>
        Page 1
      </button>
      <button type="button" onClick={() => setParams((p) => (p.set('f.city', 'City A'), p), { replace: true })}>
        Filter
      </button>
    </>
  );
}

describe('useUrlPaging', () => {
  it('keeps the page in ?page= (omitted for page 1) and keeps it on mount', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/x?sort=name&page=2']}>
        <UrlPagingHarness />
      </MemoryRouter>,
    );
    expect(screen.getByTestId('page')).toHaveTextContent('2');
    await user.click(screen.getByRole('button', { name: 'Page 3' }));
    expect(screen.getByTestId('search')).toHaveTextContent('?sort=name&page=3');
    await user.click(screen.getByRole('button', { name: 'Page 1' }));
    expect(screen.getByTestId('search')).toHaveTextContent(/^\?sort=name$/);
  });

  it('goes back to page 1 when another URL parameter or the reset key changes', async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <MemoryRouter initialEntries={['/x?page=4']}>
        <UrlPagingHarness resetKey="a" />
      </MemoryRouter>,
    );
    await user.click(screen.getByRole('button', { name: 'Filter' }));
    expect(screen.getByTestId('page')).toHaveTextContent('1');
    expect(screen.getByTestId('search').textContent).not.toContain('page=');

    await user.click(screen.getByRole('button', { name: 'Page 3' }));
    expect(screen.getByTestId('page')).toHaveTextContent('3');
    rerender(
      <MemoryRouter initialEntries={['/x?page=4']}>
        <UrlPagingHarness resetKey="b" />
      </MemoryRouter>,
    );
    expect(screen.getByTestId('page')).toHaveTextContent('1');
  });
});
