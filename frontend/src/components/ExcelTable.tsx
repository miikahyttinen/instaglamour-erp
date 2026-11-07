import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, Filter, X } from 'lucide-react';
import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { TABLET_QUERY, useMediaQuery } from '../lib/useMediaQuery';
import { Button } from './Button';
import { ColumnFilterPanel, ColumnFilterPopover } from './ColumnFilter';
import { Dialog } from './Dialog';
import { Pager } from './Pager';
import { pageSlice, scrollToTable, type Paging } from './pagination';
import {
  activeFilterCount,
  applyTableState,
  filterOptions,
  nextSort,
  type ExcelColumn,
  type ExcelTableState,
  type SortDir,
  type TableFilters,
} from './excelTableState';
import './excelTable.css';

export interface ExcelTableProps<T> extends ExcelTableState {
  columns: readonly ExcelColumn<T>[];
  /** All rows (e.g. the selected year's, after the page's own search). Filtered + sorted here. */
  rows: readonly T[];
  rowKey: (row: T) => string | number;
  /** Table caption = accessible name of the table (visually hidden). */
  caption: string;
  /** Ties within the sorted column (and the order without a sort). */
  tieBreak?: (a: T, b: T) => number;
  rowClassName?: (row: T) => string | undefined;
  /** Footer `<tr>`s, given the visible (filtered) rows, e.g. totals. `data-label` on each `<td>`. */
  footer?: (visibleRows: readonly T[]) => ReactNode;
  /** Shown when `rows` is empty (default: the empty table). */
  empty?: ReactNode;
  /** Shown (with "Clear filters") when filters hide every row. Default: `table.emptyFiltered`. */
  emptyFiltered?: ReactNode;
  /** Client-side paging (TASK-193) after filtering and sorting; the footer still gets every
   *  filtered row. A pager is shown under the table when the rows don't fit on one page. */
  paging?: Paging;
  className?: string;
}

const ARIA_SORT = { asc: 'ascending', desc: 'descending' } as const;

function cellClass<T>(col: ExcelColumn<T>): string | undefined {
  return (
    [
      col.numeric && 'num',
      col.primary && 'cell-primary',
      col.phoneMain && 'cell-main',
      col.phoneInline && 'cell-inline',
      col.phoneEnd && 'cell-end',
      col.phoneBare && 'cell-bare',
      col.hideOnPhone && 'hide-phone',
      (col.priority ?? 1) > 1 && `excel-prio-${col.priority}`,
      col.className,
    ]
      .filter(Boolean)
      .join(' ') || undefined
  );
}

/**
 * Excel-style table (docs/design.md → "Excel-style tables"): sortable headers, a filter icon per
 * filterable column with an Excel-like value popover, numbers right-aligned. From 600 px the table
 * fills its container and never scrolls sideways: text cells wrap and lower-priority columns
 * (`ExcelColumn.priority`) are hidden by container queries as the table narrows. Phones
 * (< 600 px): compact rows (title + main figure, then the other columns) + a "Suodattimet" button that opens the same
 * filters (and the sort) in a sheet. Controlled: give it the state from `useUrlTableState()` (or
 * `useLocalTableState()`). See frontend/README.md → "ExcelTable".
 */
export function ExcelTable<T>(props: ExcelTableProps<T>) {
  const { columns, rows, rowKey, caption, tieBreak, rowClassName, footer, empty, emptyFiltered, paging, className } = props;
  const { sort, onSortChange, filters, onFiltersChange } = props;
  const { t } = useTranslation();
  const wide = useMediaQuery(TABLET_QUERY);
  const [openFilter, setOpenFilter] = useState<{ key: string; anchor: HTMLElement } | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const visible = useMemo(
    () => applyTableState(rows, columns, { sort, filters }, tieBreak),
    [rows, columns, sort, filters, tieBreak],
  );
  const slice = paging ? pageSlice(visible, paging.page, paging.pageSize) : null;
  const pageRows = slice ? slice.rows : visible;
  const changePage = (page: number) => {
    paging?.onPageChange(page);
    scrollToTable(rootRef.current);
  };
  const activeCount = activeFilterCount(columns, filters);
  const blankLabel = t('table.blank');

  const setColumnFilter = useCallback(
    (key: string, values: string[] | undefined) => {
      const next: Record<string, readonly string[]> = { ...filters };
      if (values === undefined) delete next[key];
      else next[key] = values;
      onFiltersChange(next);
    },
    [filters, onFiltersChange],
  );
  const clearFilters = () => onFiltersChange({});
  const closePopover = useCallback(() => setOpenFilter(null), []);

  // The popover belongs to the header layout: not shown with phone rows (< 600 px).
  const popoverColumn = wide && openFilter?.anchor.isConnected ? columns.find((c) => c.key === openFilter.key && c.filterValue) : undefined;

  const rowCount =
    activeCount > 0 && rows.length > 0 ? (
      <p className="excel-table-count meta" role="status">
        {t('table.rowCount', { shown: visible.length, total: rows.length })}
      </p>
    ) : null;
  const clearButton =
    activeCount > 0 ? (
      <Button size="sm" icon={X} onClick={clearFilters}>
        {t('table.clearFilters')}
      </Button>
    ) : null;
  const hasFilters = columns.some((c) => c.filterValue);
  // filterOnly columns: no header / cell, only a filter button in their host column's header.
  const shown = columns.filter((c) => !c.filterOnly);
  const filterColumn = (key: string) => columns.find((c) => c.key === key && c.filterValue);
  const showBar = rowCount || clearButton || (!wide && hasFilters);

  return (
    <div ref={rootRef} className={['excel-table', paging && 'is-paged', className].filter(Boolean).join(' ')}>
      {showBar && (
        <div className="excel-table-bar">
          {rowCount}
          <div className="excel-table-bar-actions">
            {!wide && hasFilters && (
              <Button size="sm" icon={Filter} onClick={() => setSheetOpen(true)} className={activeCount ? 'is-active' : undefined}>
                {t('table.filters')}
                {activeCount > 0 && (
                  <span className="excel-table-badge" aria-hidden="true">
                    {activeCount}
                  </span>
                )}
              </Button>
            )}
            {clearButton}
          </div>
        </div>
      )}

      {rows.length === 0 && empty !== undefined ? (
        <div className="table-empty">{empty}</div>
      ) : rows.length > 0 && visible.length === 0 && !wide ? (
        // Phones: no header to keep; the "Suodattimet" button stays in the bar.
        <div className="excel-table-empty">
          <p>{emptyFiltered ?? t('table.emptyFiltered')}</p>
          {clearButton}
        </div>
      ) : (
        <div className="table-wrap excel-table-wrap">
          <table
            className={['data-table data-table-cards excel-table-grid', visible.length === 0 && 'is-empty']
              .filter(Boolean)
              .join(' ')}
          >
            <caption className="visually-hidden">{caption}</caption>
            <thead>
              <tr>
                {shown.map((col) => (
                  <HeaderCell
                    key={col.key}
                    column={col}
                    sortDir={sort?.key === col.key ? sort.dir : undefined}
                    onSort={() => onSortChange(nextSort(sort, col.key))}
                    filters={
                      wide
                        ? [col, ...(col.extraFilters ?? []).map(filterColumn)]
                            .filter((c): c is ExcelColumn<T> => Boolean(c?.filterValue))
                            .map((c) => ({
                              key: c.key,
                              label: c.label,
                              active: filters[c.key] !== undefined,
                              open: openFilter?.key === c.key,
                            }))
                        : []
                    }
                    onFilter={(key, anchor) => setOpenFilter((cur) => (cur?.key === key ? null : { key, anchor }))}
                  />
                ))}
              </tr>
            </thead>
            <tbody>
              {pageRows.map((row) => (
                <tr key={rowKey(row)} className={rowClassName?.(row)}>
                  {shown.map((col) => (
                    <td key={col.key} className={cellClass(col)} data-label={col.label} data-priority={col.priority ?? 1}>
                      {col.cell(row)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
            {footer && <tfoot>{footer(visible)}</tfoot>}
          </table>
          {/* Filters hide every row (from 600 px): the header and its filter buttons stay, so one
              filter can be loosened (F-009); the message sits under the header, outside the rows. */}
          {visible.length === 0 && rows.length > 0 && (
            <div className="excel-table-empty excel-table-empty-inline">
              <p>{emptyFiltered ?? t('table.emptyFiltered')}</p>
              {clearButton}
            </div>
          )}
        </div>
      )}

      {slice && visible.length > 0 && <Pager slice={slice} onPageChange={changePage} />}

      {popoverColumn && openFilter && (
        <ColumnFilterPopover
          key={popoverColumn.key}
          anchor={openFilter.anchor}
          columnLabel={popoverColumn.label}
          options={filterOptions(rows, columns, filters, popoverColumn, blankLabel)}
          selected={filters[popoverColumn.key]}
          onApply={(values) => {
            setColumnFilter(popoverColumn.key, values);
            closePopover();
          }}
          onCancel={closePopover}
        />
      )}

      {sheetOpen && !wide && (
        <FilterSheet
          columns={columns}
          rows={rows}
          filters={filters}
          sort={sort}
          onSortChange={onSortChange}
          onColumnFilter={setColumnFilter}
          onClear={clearFilters}
          onClose={() => setSheetOpen(false)}
        />
      )}
    </div>
  );
}

/** One filter button of a header: the column's own filter and any `extraFilters`. */
interface HeaderFilter {
  key: string;
  label: string;
  active: boolean;
  open: boolean;
}

interface HeaderCellProps<T> {
  column: ExcelColumn<T>;
  sortDir: SortDir | undefined;
  onSort: () => void;
  /** Filter buttons to show (none on phones). */
  filters: HeaderFilter[];
  onFilter: (key: string, anchor: HTMLElement) => void;
}

function HeaderCell<T>({ column, sortDir, onSort, filters, onFilter }: HeaderCellProps<T>) {
  const title = column.header ?? column.label;
  const sortable = Boolean(column.sortValue);
  return (
    <th
      scope="col"
      className={cellClass(column)}
      data-priority={column.priority ?? 1}
      aria-sort={sortable ? (sortDir ? ARIA_SORT[sortDir] : 'none') : undefined}
    >
      <div className="excel-th">
        {sortable ? (
          <button type="button" className="th-sort" onClick={onSort}>
            {title}
            <SortIcon dir={sortDir} />
          </button>
        ) : (
          <span className="excel-th-label">{title}</span>
        )}
        {filters.map((f) => (
          <FilterButton key={f.key} filter={f} onFilter={(anchor) => onFilter(f.key, anchor)} />
        ))}
      </div>
    </th>
  );
}

function FilterButton({ filter, onFilter }: { filter: HeaderFilter; onFilter: (anchor: HTMLElement) => void }) {
  const { t } = useTranslation();
  const activeId = useId();
  const name = t('table.filterColumn', { column: filter.label });
  return (
    <button
      type="button"
      className={['excel-filter-btn', filter.active && 'is-active'].filter(Boolean).join(' ')}
      aria-label={name}
      title={name}
      aria-haspopup="dialog"
      aria-expanded={filter.open}
      aria-describedby={filter.active ? activeId : undefined}
      data-filter={filter.key}
      onClick={(e) => onFilter(e.currentTarget)}
    >
      <Filter />
      {filter.active && (
        <span id={activeId} className="visually-hidden">
          {t('table.filterActive')}
        </span>
      )}
    </button>
  );
}

function SortIcon({ dir }: { dir?: SortDir }) {
  if (dir === 'asc') return <ArrowUp className="th-sort-icon is-active" />;
  if (dir === 'desc') return <ArrowDown className="th-sort-icon is-active" />;
  return <ArrowUpDown className="th-sort-icon" />;
}

interface FilterSheetProps<T> {
  columns: readonly ExcelColumn<T>[];
  rows: readonly T[];
  filters: TableFilters;
  sort: ExcelTableState['sort'];
  onSortChange: ExcelTableState['onSortChange'];
  onColumnFilter: (key: string, values: string[] | undefined) => void;
  onClear: () => void;
  onClose: () => void;
}

/**
 * Phones: "Suodattimet" bottom sheet. Lists the filterable columns (with "Kaikki" / "N valittu");
 * choosing one shows the same filter form; OK / Cancel come back to the list. Sort select on top,
 * because the phone row layout has no headers.
 */
function FilterSheet<T>({ columns, rows, filters, sort, onSortChange, onColumnFilter, onClear, onClose }: FilterSheetProps<T>) {
  const { t } = useTranslation();
  const id = useId();
  const [current, setCurrent] = useState<string | null>(null);
  const lastColumn = useRef<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const filterable = columns.filter((c) => c.filterValue);
  const sortable = columns.filter((c) => c.sortValue);
  const column = current ? filterable.find((c) => c.key === current) : undefined;
  const activeCount = activeFilterCount(columns, filters);

  // Focus: into the form when a column opens; back on that column's button when it closes.
  useEffect(() => {
    if (column) {
      panelRef.current?.querySelector<HTMLElement>('input, button')?.focus();
    } else if (lastColumn.current) {
      listRef.current?.querySelector<HTMLElement>(`[data-column="${lastColumn.current}"]`)?.focus();
    }
  }, [column]);

  const open = (key: string) => {
    lastColumn.current = key;
    setCurrent(key);
  };

  return (
    <Dialog title={t('table.filters')} onClose={onClose}>
      {column ? (
        <div ref={panelRef} className="excel-sheet-panel">
          <Button size="sm" icon={ChevronLeft} onClick={() => setCurrent(null)}>
            {t('table.back')}
          </Button>
          <h3 className="excel-sheet-title">{column.label}</h3>
          <ColumnFilterPanel
            columnLabel={column.label}
            options={filterOptions(rows, columns, filters, column, t('table.blank'))}
            selected={filters[column.key]}
            onApply={(values) => {
              onColumnFilter(column.key, values);
              setCurrent(null);
            }}
            onCancel={() => setCurrent(null)}
          />
        </div>
      ) : (
        <div ref={listRef} className="excel-sheet-list">
          {sortable.length > 0 && (
            <div className="excel-sheet-sort">
              <div className="field">
                <label htmlFor={`${id}-sort`}>{t('table.sortBy')}</label>
                <select
                  id={`${id}-sort`}
                  value={sort?.key ?? ''}
                  onChange={(e) => onSortChange({ key: e.target.value, dir: sort?.dir ?? 'asc' })}
                >
                  {!sort && <option value="">–</option>}
                  {sortable.map((c) => (
                    <option key={c.key} value={c.key}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor={`${id}-dir`}>{t('table.sortDir')}</label>
                <select
                  id={`${id}-dir`}
                  value={sort?.dir ?? 'asc'}
                  disabled={!sort}
                  onChange={(e) => sort && onSortChange({ key: sort.key, dir: e.target.value as SortDir })}
                >
                  <option value="asc">{t('table.asc')}</option>
                  <option value="desc">{t('table.desc')}</option>
                </select>
              </div>
            </div>
          )}
          <ul className="excel-sheet-columns">
            {filterable.map((c) => {
              const selected = filters[c.key];
              return (
                <li key={c.key}>
                  <button
                    type="button"
                    className={['excel-sheet-column', selected && 'is-active'].filter(Boolean).join(' ')}
                    data-column={c.key}
                    aria-describedby={`${id}-${c.key}`}
                    onClick={() => open(c.key)}
                  >
                    <span>{c.label}</span>
                    {/* Hidden from the name ("City"), read as its description ("Kaikki"). */}
                    <span id={`${id}-${c.key}`} className="excel-sheet-state" aria-hidden="true">
                      {selected ? t('table.selectedCount', { count: selected.length }) : t('table.all')}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="form-actions">
            {activeCount > 0 && (
              <Button icon={X} onClick={onClear}>
                {t('table.clearFilters')}
              </Button>
            )}
            <Button variant="primary" onClick={onClose}>
              {t('table.done')}
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  );
}
