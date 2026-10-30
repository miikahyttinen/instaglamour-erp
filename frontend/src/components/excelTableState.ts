// State, pure helpers and hooks of the Excel-style table (components/ExcelTable.tsx,
// docs/design.md → "Excel-style tables"). Kept apart from the components so pages and tests can
// filter / sort the same way without rendering.
import { useCallback, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';

export type SortDir = 'asc' | 'desc';

/** Current sort: one column (`ExcelColumn.key`) and a direction. */
export interface TableSort {
  key: string;
  dir: SortDir;
}

/**
 * Active column filters: column key → the selected filter values (row keeps when its value is one
 * of them). A missing key = no filter on that column. `BLANK` ('') stands for "(blank)".
 */
export type TableFilters = Readonly<Record<string, readonly string[]>>;

/** Filter value of an empty cell (null, undefined, '' or an empty list). */
export const BLANK = '';

export type SortValue = string | number | null | undefined;
export type FilterValue = string | null | undefined | readonly string[];

/** See `ExcelColumn.priority`. */
export type ColumnPriority = 1 | 2 | 3;

export interface ExcelColumn<T> {
  /** Stable column id: React key, sort key and URL filter key (`f.<key>`). */
  key: string;
  /** Header text; also the phone card label and the filter name ("Suodata: <label>"). */
  label: string;
  /** Custom header content instead of `label` (e.g. visually hidden text for an actions column). */
  header?: ReactNode;
  /** Cell content for one row. */
  cell: (row: T) => ReactNode;
  /** Right-aligned, tabular figures (money, hours, counts). */
  numeric?: boolean;
  /** Phone cards: the card title. Use on one column (normally the first one). */
  primary?: boolean;
  /** Not shown in the phone card layout. */
  hideOnPhone?: boolean;
  /** Header / cell class (e.g. a width). */
  className?: string;
  /**
   * Column priority from 600 px (design.md → "Excel-style tables", TASK-147): instead of scrolling
   * sideways, lower priorities are hidden as the table container narrows. 1 (default) = always
   * shown; 2 = hidden below 1100 px; 3 = hidden below 1400 px of table container width. Hiding is
   * CSS only: a hidden column's filter and sort still apply. Phone cards show every column.
   */
  priority?: ColumnPriority;
  /**
   * Makes the column sortable. Numbers compare as numbers, strings with a natural, case-insensitive
   * collator. Empty (null / undefined / '') is always last, in both directions.
   */
  sortValue?: (row: T) => SortValue;
  /**
   * Makes the column filterable (filter icon in the header). Returns the row's filter value: a
   * stable key such as an id or a code (labels come from `filterLabel`). null / undefined / '' =
   * blank. A list = the row matches when any of its values is selected (empty list = blank).
   */
  filterValue?: (row: T) => FilterValue;
  /** Display text of a filter value in the popover (default: the value itself). */
  filterLabel?: (value: string) => string;
  /** Order of the values in the popover (default: by label; blank is always last). */
  filterCompare?: (a: string, b: string) => number;
  /**
   * A second filter on the data of a visible column (generic; currently unused by the app):
   * not rendered as a header, cell or card line; only its filter, whose button sits in the header
   * of the column listing this key in `extraFilters` (and in the phone filter sheet). Filters with
   * `filterValue` like any column; the URL key is `f.<key>`.
   */
  filterOnly?: boolean;
  /** Keys of `filterOnly` columns whose filter buttons are shown in this column's header. */
  extraFilters?: readonly string[];
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

function filterValuesOf<T>(column: ExcelColumn<T>, row: T): string[] {
  const value = column.filterValue?.(row);
  if (value === null || value === undefined) return [BLANK];
  if (typeof value === 'string') return [value];
  return value.length === 0 ? [BLANK] : [...value];
}

function matches<T>(column: ExcelColumn<T>, row: T, selected: readonly string[]): boolean {
  return filterValuesOf(column, row).some((v) => selected.includes(v));
}

/** Number of columns with an active filter (unknown keys are ignored). */
export function activeFilterCount<T>(columns: readonly ExcelColumn<T>[], filters: TableFilters): number {
  return columns.filter((c) => c.filterValue && filters[c.key] !== undefined).length;
}

/**
 * Rows that pass every active filter (AND across columns; OR within one column's values).
 * `except` skips one column (used for the values offered in that column's popover).
 */
export function filterRows<T>(
  rows: readonly T[],
  columns: readonly ExcelColumn<T>[],
  filters: TableFilters,
  except?: string,
): T[] {
  const active = columns.filter((c) => c.filterValue && c.key !== except && filters[c.key] !== undefined);
  if (active.length === 0) return [...rows];
  return rows.filter((row) => active.every((c) => matches(c, row, filters[c.key]!)));
}

export interface FilterOption {
  value: string;
  label: string;
}

/**
 * Values offered in a column's filter popover, like Excel: the distinct values of the rows that
 * pass the *other* columns' filters, plus the values selected now (so a selection never
 * disappears). Sorted by `filterCompare` or label; blank last, labelled `blankLabel`.
 */
export function filterOptions<T>(
  rows: readonly T[],
  columns: readonly ExcelColumn<T>[],
  filters: TableFilters,
  column: ExcelColumn<T>,
  blankLabel: string,
): FilterOption[] {
  const values = new Set<string>();
  for (const row of filterRows(rows, columns, filters, column.key)) {
    for (const v of filterValuesOf(column, row)) values.add(v);
  }
  for (const v of filters[column.key] ?? []) values.add(v);
  const label = (v: string) => (v === BLANK ? blankLabel : (column.filterLabel?.(v) ?? v));
  const compare = column.filterCompare ?? ((a: string, b: string) => collator.compare(label(a), label(b)));
  return [...values]
    .sort((a, b) => (a === BLANK ? 1 : b === BLANK ? -1 : compare(a, b)))
    .map((value) => ({ value, label: label(value) }));
}

const isEmpty = (v: SortValue) => v === null || v === undefined || v === '';

/**
 * Excel-style sort by one column: empty values last in both directions; ties by `tieBreak`, then
 * the original order. Returns a new array. Unknown / unsortable column = original order.
 */
export function sortRows<T>(
  rows: readonly T[],
  columns: readonly ExcelColumn<T>[],
  sort: TableSort | null,
  tieBreak?: (a: T, b: T) => number,
): T[] {
  const column = sort ? columns.find((c) => c.key === sort.key && c.sortValue) : undefined;
  if (!column || !sort) return tieBreak ? [...rows].sort(tieBreak) : [...rows];
  const sign = sort.dir === 'asc' ? 1 : -1;
  const value = column.sortValue!;
  return rows
    .map((row, index) => ({ row, index, v: value(row) }))
    .sort((a, b) => {
      const aEmpty = isEmpty(a.v);
      const bEmpty = isEmpty(b.v);
      if (aEmpty !== bEmpty) return aEmpty ? 1 : -1;
      let cmp = 0;
      if (!aEmpty && !bEmpty) {
        cmp =
          typeof a.v === 'number' && typeof b.v === 'number'
            ? a.v - b.v
            : collator.compare(String(a.v), String(b.v));
      }
      if (cmp !== 0) return cmp * sign;
      return (tieBreak?.(a.row, b.row) ?? 0) || a.index - b.index;
    })
    .map((x) => x.row);
}

/** Filter, then sort: the rows the table shows. */
export function applyTableState<T>(
  rows: readonly T[],
  columns: readonly ExcelColumn<T>[],
  state: { sort: TableSort | null; filters: TableFilters },
  tieBreak?: (a: T, b: T) => number,
): T[] {
  return sortRows(filterRows(rows, columns, state.filters), columns, state.sort, tieBreak);
}

/** Next sort when a header is clicked: the same column flips, another column starts ascending. */
export function nextSort(current: TableSort | null, key: string): TableSort {
  if (current?.key === key) return { key, dir: current.dir === 'asc' ? 'desc' : 'asc' };
  return { key, dir: 'asc' };
}

/** What the table needs from a state hook; spread it on `<ExcelTable>`. */
export interface ExcelTableState {
  sort: TableSort | null;
  onSortChange: (sort: TableSort) => void;
  filters: TableFilters;
  onFiltersChange: (filters: TableFilters) => void;
}

export interface TableStateOptions {
  /** Sort when the URL / state has none. */
  defaultSort?: TableSort | null;
  /** URL only: prefix of the parameter names, for two tables on one page (default ''). */
  prefix?: string;
}

const FILTER_PARAM = 'f.';

/** Reads sort and filters from URL parameters (`sort`, `dir`, `f.<key>` repeated per value). */
export function readTableParams(params: URLSearchParams, options: TableStateOptions = {}) {
  const prefix = options.prefix ?? '';
  const sortKey = params.get(`${prefix}sort`);
  const sort: TableSort | null = sortKey
    ? { key: sortKey, dir: params.get(`${prefix}dir`) === 'desc' ? 'desc' : 'asc' }
    : (options.defaultSort ?? null);
  const filters: Record<string, string[]> = {};
  const filterPrefix = `${prefix}${FILTER_PARAM}`;
  for (const [name, value] of params) {
    if (!name.startsWith(filterPrefix)) continue;
    const key = name.slice(filterPrefix.length);
    if (key) (filters[key] ??= []).push(value);
  }
  return { sort, filters };
}

/** Writes filters into URL parameters (replacing every `f.*` of this prefix). */
export function writeFilterParams(params: URLSearchParams, filters: TableFilters, prefix = ''): URLSearchParams {
  const next = new URLSearchParams(params);
  const filterPrefix = `${prefix}${FILTER_PARAM}`;
  for (const name of [...new Set(next.keys())]) if (name.startsWith(filterPrefix)) next.delete(name);
  for (const [key, values] of Object.entries(filters)) for (const v of values) next.append(`${filterPrefix}${key}`, v);
  return next;
}

/**
 * Table state kept in the URL (`?sort=price&dir=desc&f.seller=<id>&f.seller=<id>&f.source=`), so
 * a filtered list can be bookmarked, shared and survives a reload / back navigation. Updates
 * replace the history entry. Other parameters (search, view, …) are kept.
 */
export function useUrlTableState(options: TableStateOptions = {}): ExcelTableState {
  const [params, setParams] = useSearchParams();
  const { prefix = '', defaultSort = null } = options;
  const defaultKey = defaultSort?.key;
  const defaultDir = defaultSort?.dir;
  const raw = params.toString();
  const state = useMemo(
    () =>
      readTableParams(new URLSearchParams(raw), {
        prefix,
        defaultSort: defaultKey && defaultDir ? { key: defaultKey, dir: defaultDir } : null,
      }),
    [raw, prefix, defaultKey, defaultDir],
  );
  const onSortChange = useCallback(
    (sort: TableSort) =>
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set(`${prefix}sort`, sort.key);
          next.set(`${prefix}dir`, sort.dir);
          return next;
        },
        { replace: true },
      ),
    [setParams, prefix],
  );
  const onFiltersChange = useCallback(
    (filters: TableFilters) => setParams((prev) => writeFilterParams(prev, filters, prefix), { replace: true }),
    [setParams, prefix],
  );
  return { sort: state.sort, filters: state.filters, onSortChange, onFiltersChange };
}

/** The same state in React state only (demos, tables that should not touch the URL). */
export function useLocalTableState(options: TableStateOptions = {}): ExcelTableState {
  const [sort, onSortChange] = useState<TableSort | null>(options.defaultSort ?? null);
  const [filters, onFiltersChange] = useState<TableFilters>({});
  return { sort, onSortChange, filters, onFiltersChange };
}
