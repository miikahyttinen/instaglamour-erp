import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import type { ReactNode } from 'react';

export type SortDirection = 'asc' | 'desc';
export type CardsBreakpoint = 'sm' | 'lg';

export interface DataTableColumn<T> {
  /** Stable column id (React key). */
  key: string;
  /** Header text; also the label in the phone row layout. */
  label: string;
  /** Custom header content instead of `label` (the card label still uses `label`). */
  header?: ReactNode;
  /** Cell content for one row. */
  cell: (row: T) => ReactNode;
  /** Right-aligned, tabular figures (money, hours, counts). */
  numeric?: boolean;
  /** Phone rows: the row title (line 1, no label). Use on one column, e.g. the name; a link in it
   *  makes the whole row tappable. */
  primary?: boolean;
  /** Phone rows: the main figure / tag at the right end of line 1 (no label, one line). */
  phoneMain?: boolean;
  /** Phone rows: on line 1 between the title and the `phoneMain` cell (no label, one line, e.g.
   *  status tags). The title then stays on one line and truncates with an ellipsis instead. */
  phoneInline?: boolean;
  /** Phone rows: on line 1 after the `phoneMain` cell, at the far right end of the row (no label,
   *  one line, e.g. a secondary tag). Truncates like `phoneInline`. */
  phoneEnd?: boolean;
  /** Phone rows: shown on line 2 without its label (self-explanatory values: dates, tags). */
  phoneBare?: boolean;
  /** Not shown in the phone row layout. */
  hideOnPhone?: boolean;
  /** Sortable column: current direction (undefined = sortable but not sorted). Needs `onSort`. */
  sort?: SortDirection;
  /** Makes the header a sort button. Called on click; the caller owns the sort state. */
  onSort?: () => void;
  /** Optional header/cell class (e.g. a width). */
  className?: string;
}

export interface DataTableProps<T> {
  columns: readonly DataTableColumn<T>[];
  rows: readonly T[];
  rowKey: (row: T) => string | number;
  /** Table caption (accessible name). Visually hidden unless `showCaption`. */
  caption: string;
  showCaption?: boolean;
  /** Shown instead of the table when there are no rows. */
  empty?: ReactNode;
  /** Phones (< 600 px): each row becomes a compact one- or two-line row (default true). */
  cardsOnPhone?: boolean;
  /**
   * Viewport breakpoint below which rows use the compact row layout (with `cardsOnPhone`): `'sm'` = < 600 px
   * (default), `'lg'` = < 1200 px, for wide tables that don't fit next to the sidebar at 900–1199.
   */
  cardsBelow?: CardsBreakpoint;
  rowClassName?: (row: T) => string | undefined;
  /** Optional <tr> elements for a totals footer. Give each <td> a `data-label` for phones. */
  footer?: ReactNode;
  className?: string;
}

const ARIA_SORT = { asc: 'ascending', desc: 'descending' } as const;

/**
 * Hairline table on --surface: mono uppercase header on --surface-2 with sort icons, numbers
 * right-aligned. The same look is available as plain CSS (`.table-wrap > table.data-table`) for
 * hand-written tables.
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  caption,
  showCaption,
  empty,
  cardsOnPhone = true,
  cardsBelow = 'sm',
  rowClassName,
  footer,
  className,
}: DataTableProps<T>) {
  if (rows.length === 0 && empty !== undefined) return <div className="table-empty">{empty}</div>;

  const cellClass = (col: DataTableColumn<T>) =>
    [
      col.numeric && 'num',
      col.primary && 'cell-primary',
      col.phoneMain && 'cell-main',
      col.phoneInline && 'cell-inline',
      col.phoneEnd && 'cell-end',
      col.phoneBare && 'cell-bare',
      col.hideOnPhone && 'hide-phone',
      col.className,
    ]
      .filter(Boolean)
      .join(' ') || undefined;

  return (
    <div className="table-wrap">
      <table
        className={[
          'data-table',
          cardsOnPhone && 'data-table-cards',
          cardsOnPhone && cardsBelow === 'lg' && 'data-table-cards-lg',
          className,
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <caption className={showCaption ? 'table-caption' : 'visually-hidden'}>{caption}</caption>
        <thead>
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                scope="col"
                className={cellClass(col)}
                aria-sort={col.onSort ? (col.sort ? ARIA_SORT[col.sort] : 'none') : undefined}
              >
                {col.onSort ? (
                  <button type="button" className="th-sort" onClick={col.onSort}>
                    {col.header ?? col.label}
                    <SortIcon sort={col.sort} />
                  </button>
                ) : (
                  (col.header ?? col.label)
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={rowKey(row)} className={rowClassName?.(row)}>
              {columns.map((col) => (
                <td key={col.key} className={cellClass(col)} data-label={col.label}>
                  {col.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        {footer && <tfoot>{footer}</tfoot>}
      </table>
    </div>
  );
}

function SortIcon({ sort }: { sort?: SortDirection }) {
  if (sort === 'asc') return <ArrowUp className="th-sort-icon is-active" />;
  if (sort === 'desc') return <ArrowDown className="th-sort-icon is-active" />;
  return <ArrowUpDown className="th-sort-icon" />;
}
