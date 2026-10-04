export interface MiniBar {
  /** Short x-axis label (e.g. month or year). */
  label: string;
  /** Bar size; negative values are drawn as 0. */
  value: number;
  /** Highlight (current / selected) — drawn in --accent. */
  current?: boolean;
  /** Formatted value for screen readers (defaults to the number). */
  valueText?: string;
}

export interface MiniBarsProps {
  bars: readonly MiniBar[];
  /** Accessible name of the chart, e.g. "Sales per month". */
  label: string;
  /** Show the x-axis labels under the bars (default true). */
  showLabels?: boolean;
  /** Bar area height in px (default 48). */
  height?: number;
}

/**
 * Tiny bar chart: bars in --surface-2, the current one in --accent. Visual only;
 * screen readers get a list "label: value" instead.
 */
export function MiniBars({ bars, label, showLabels = true, height = 48 }: MiniBarsProps) {
  const max = Math.max(0, ...bars.map((b) => b.value));
  return (
    <figure className="mini-bars">
      <ul className="visually-hidden" aria-label={label}>
        {bars.map((bar) => (
          <li key={bar.label}>
            {bar.label}: {bar.valueText ?? bar.value}
          </li>
        ))}
      </ul>
      <div className="mini-bars-plot" style={{ height }} aria-hidden="true">
        {bars.map((bar) => {
          const pct = max > 0 ? (Math.max(0, bar.value) / max) * 100 : 0;
          return (
            <div key={bar.label} className="mini-bars-col">
              <div
                className={bar.current ? 'mini-bar is-current' : 'mini-bar'}
                style={{ height: `${pct}%` }}
                data-testid="mini-bar"
              />
            </div>
          );
        })}
      </div>
      {showLabels && (
        <div className="mini-bars-labels" aria-hidden="true">
          {bars.map((bar) => (
            <span key={bar.label} className={bar.current ? 'is-current' : undefined}>
              {bar.label}
            </span>
          ))}
        </div>
      )}
    </figure>
  );
}
