// Placement of the Excel table's column filter popover (ColumnFilter.tsx). Pure, so it is testable.

const POPOVER_W = 280;
const GAP = 4;
const EDGE = 8;
/** Room below the icon that is enough for a normal value list; with less, the larger side wins. */
const PREFERRED_H = 320;
/** Smallest height the popover is given, even when the icon is at the very edge. */
const MIN_H = 160;

/** Fixed-position placement of the popover: `top` (opens down) or `bottom` (opens up). */
export interface PopoverPlacement {
  left: number;
  top?: number;
  bottom?: number;
  maxHeight: number;
}

/**
 * Where the filter popover goes so it always fits in the viewport (OK / Peruuta reachable): under
 * the icon when there is room (or more room than above), otherwise above it, opening upwards. The
 * height is capped to the space on that side; the value list scrolls inside.
 */
export function placeColumnFilterPopover(
  anchor: Pick<DOMRect, 'top' | 'bottom' | 'left'>,
  viewport: { width: number; height: number },
): PopoverPlacement {
  const { width: vw, height: vh } = viewport;
  const left = Math.max(EDGE, Math.min(anchor.left, vw - POPOVER_W - EDGE));
  const maxAll = Math.max(MIN_H, vh - 2 * EDGE);
  const below = vh - anchor.bottom - GAP - EDGE;
  const above = anchor.top - GAP - EDGE;
  if (below >= PREFERRED_H || below >= above) {
    const maxHeight = Math.min(maxAll, Math.max(MIN_H, below));
    // An icon scrolled (partly) out of view: keep the whole popover on screen.
    const top = Math.max(EDGE, Math.min(anchor.bottom + GAP, vh - EDGE - maxHeight));
    return { left, top, maxHeight };
  }
  const maxHeight = Math.min(maxAll, Math.max(MIN_H, above));
  const bottom = Math.max(EDGE, Math.min(vh - anchor.top + GAP, vh - EDGE - maxHeight));
  return { left, bottom, maxHeight };
}
