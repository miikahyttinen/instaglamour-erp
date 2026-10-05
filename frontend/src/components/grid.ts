import type { CSSProperties } from 'react';

/**
 * Columns an item spans in the 12-column `StatGrid` (`.stat-grid`).
 * - a number: the same span at every width;
 * - an object: per breakpoint. A missing one falls back to the next smaller one
 *   (`base` < 600 px, `sm` ≥ 600, `md` ≥ 900, `lg` ≥ 1200 viewport width).
 * Without a span an item gets the default 12 / 6 / 6 / 3 (1, 2, 2, 4 per row).
 */
export type GridSpan = number | { base?: number; sm?: number; md?: number; lg?: number };

const VARS = { base: '--span', sm: '--span-sm', md: '--span-md', lg: '--span-lg' } as const;

function clamp(n: number): number {
  return Math.min(12, Math.max(1, Math.round(n)));
}

/** Inline style that sets the `--span*` custom properties. Use on hand-written grid items. */
export function spanStyle(span: GridSpan | undefined): CSSProperties | undefined {
  if (span === undefined) return undefined;
  const parts = typeof span === 'number' ? { base: span } : span;
  const style: Record<string, number> = {};
  for (const key of Object.keys(VARS) as (keyof typeof VARS)[]) {
    const value = parts[key];
    if (value !== undefined) style[VARS[key]] = clamp(value);
  }
  return style as CSSProperties;
}
