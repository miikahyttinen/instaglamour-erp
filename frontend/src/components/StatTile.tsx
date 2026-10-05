import { useId, type ReactNode } from 'react';
import { spanStyle, type GridSpan } from './grid';
import { MiniBars, type MiniBar } from './MiniBars';

export interface StatTileProps {
  /** Mono uppercase label at the top. */
  label: string;
  /** Big figure (already formatted, e.g. formatMoney(...)). */
  value: ReactNode;
  /** Mono caption under the figure. */
  caption?: ReactNode;
  /** Optional second, smaller figure (e.g. a total) … */
  secondaryValue?: ReactNode;
  /** … and its mono caption, shown to the right of it. */
  secondaryCaption?: string;
  /** Optional mini bar chart under the figures. */
  bars?: readonly MiniBar[];
  /** Accessible name of the chart (defaults to `label`). */
  barsLabel?: string;
  /** Mono caption under the chart. */
  barsCaption?: string;
  /** Columns in the 12-column StatGrid (see `GridSpan`). Default 12 / 6 / 6 / 3. */
  span?: GridSpan;
  className?: string;
}

/** Stat card: label, big number, optional secondary figure, optional mini bars. */
export function StatTile({
  label,
  value,
  caption,
  secondaryValue,
  secondaryCaption,
  bars,
  barsLabel,
  barsCaption,
  span,
  className,
}: StatTileProps) {
  const labelId = useId();
  return (
    <section
      className={['stat-tile', className].filter(Boolean).join(' ')}
      aria-labelledby={labelId}
      style={spanStyle(span)}
    >
      <p id={labelId} className="label stat-tile-label">
        {label}
      </p>
      <p className="stat-tile-value">{value}</p>
      {caption && <p className="meta stat-tile-caption">{caption}</p>}
      {secondaryValue !== undefined && (
        <p className="stat-tile-secondary">
          <span className="stat-tile-secondary-value">{secondaryValue}</span>
          {secondaryCaption && <span className="meta">{secondaryCaption}</span>}
        </p>
      )}
      {bars && bars.length > 0 && (
        <div className="stat-tile-bars">
          <MiniBars bars={bars} label={barsLabel ?? label} />
          {barsCaption && <p className="meta">{barsCaption}</p>}
        </div>
      )}
    </section>
  );
}

export interface StatGridProps {
  children: ReactNode;
  className?: string;
}

/**
 * 12-column grid for StatTiles and Cards (gap `--grid-gap`, equal heights per row). Give each
 * child a `span` (StatTile / Card) or `style={spanStyle(...)}` (hand-written). Without spans:
 * 1 per row on phones, 2 from 600 px, 4 from 1200 px.
 */
export function StatGrid({ children, className }: StatGridProps) {
  return <div className={['stat-grid', className].filter(Boolean).join(' ')}>{children}</div>;
}
