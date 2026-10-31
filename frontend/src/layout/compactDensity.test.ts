import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// TASK-175 (docs/design.md → "Compact density"). jsdom has no layout, so these guard the
// stylesheets; the real widths and row heights are checked in the browser (e2e 10, 12, 18).

const src = resolve(process.cwd(), 'src');
const read = (path: string) => readFileSync(join(src, path), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const tokens = read('styles/tokens.css');
const styles = read('styles.css');

/** Value of a custom property in the first block that matches `blockStart` … `}`. */
function tokenIn(css: string, blockStart: string, name: string): string | undefined {
  const start = css.indexOf(blockStart);
  const block = css.slice(start, css.indexOf('}', start));
  return new RegExp(`${name}:\\s*([^;]+);`).exec(block)?.[1]?.trim();
}

/** Body of the first `@media (<condition>) { … }` that contains `marker` (balanced braces). */
function mediaBlock(css: string, condition: string, marker: string): string {
  let from = 0;
  for (;;) {
    const start = css.indexOf(`@media (${condition})`, from);
    if (start < 0) return '';
    const open = css.indexOf('{', start);
    let depth = 0;
    for (let i = open; i < css.length; i++) {
      if (css[i] === '{') depth++;
      if (css[i] === '}' && --depth === 0) {
        const body = css.slice(open + 1, i);
        if (body.includes(marker)) return body;
        from = i;
        break;
      }
    }
  }
}

const px = (v: string | undefined) => Number.parseFloat(v ?? 'NaN');

describe('compact density tokens', () => {
  it('desktop spacing is tighter than Layout v2 (40 / 40 / 20 / 36 / 48 px)', () => {
    const desktop = '@media (min-width: 900px)';
    expect(px(tokenIn(tokens, desktop, '--page-pad'))).toBeLessThan(40);
    expect(px(tokenIn(tokens, desktop, '--section-gap'))).toBeLessThan(40);
    expect(px(tokenIn(tokens, desktop, '--card-pad'))).toBeLessThan(20);
    expect(px(tokenIn(tokens, desktop, '--control-h'))).toBe(32);
    expect(px(tokenIn(tokens, ':root {', '--row-h'))).toBeLessThan(48);
  });

  it('touch targets stay at least 40 px on phones', () => {
    expect(px(tokenIn(tokens, ':root {', '--tap'))).toBeGreaterThanOrEqual(40);
    expect(px(tokenIn(tokens, ':root {', '--control-h'))).toBeGreaterThanOrEqual(40);
  });
});

describe('phone rows instead of cards (< 600 px)', () => {
  const phone = mediaBlock(styles, 'max-width: 599px', '.data-table-cards tr');

  it('rows sit in one frame, separated by hairlines (no card margin / own border box)', () => {
    expect(phone).not.toBe('');
    expect(phone).not.toMatch(/\.table-wrap:has\(\.data-table-cards\)\s*\{[^}]*border:\s*0/);
    const row = /\.data-table-cards tr\s*\{([^}]*)\}/.exec(phone)?.[1] ?? '';
    expect(row).toMatch(/display:\s*flex/);
    expect(row).toMatch(/flex-wrap:\s*wrap/);
    expect(row).toMatch(/border-bottom:/);
    expect(row).not.toMatch(/margin-bottom/);
    expect(row).toMatch(/min-height:\s*var\(--tap\)/);
  });

  it('line 1 = title + main figure; the other cells follow on line 2', () => {
    const orderOf = (sel: string) => Number(new RegExp(`${sel}\\s*\\{[^}]*?[\\s;]order:\\s*(\\d+)`).exec(phone)?.[1]);
    // 0 title · 1 inline cells · 2 spacer + end cells · 3 main figure, then the line break · 4 line 2.
    expect(orderOf('\\.data-table-cards td\\.cell-primary')).toBe(0);
    expect(orderOf('\\.data-table-cards td:is\\(\\.cell-inline, \\.cell-end\\)')).toBe(1);
    expect(orderOf('\\.data-table-cards td\\.cell-end')).toBe(2);
    expect(orderOf('\\.data-table-cards tr:has\\(> td:is\\(\\.cell-inline, \\.cell-end\\):not\\(\\.hide-phone\\)\\)::before')).toBe(2);
    expect(orderOf('\\.data-table-cards td\\.cell-main')).toBe(3);
    expect(orderOf('\\.data-table-cards tr::after')).toBe(3);
    expect(orderOf('\\.data-table-cards td,\\s*\\.data-table-cards tfoot th')).toBe(4);
    expect(phone).toMatch(/\.data-table-cards tr::after\s*\{[^}]*flex:\s*0 0 100%/);
    expect(phone).toMatch(/\.cell-bare/);
  });

  it('inline cells hug the title, end cells + main figure hug the right edge; the title truncates instead', () => {
    const inline = /\.data-table-cards td:is\(\.cell-inline, \.cell-end\)\s*\{([^}]*)\}/.exec(phone)?.[1] ?? '';
    expect(inline).toMatch(/white-space:\s*nowrap/);
    // Zero basis + capped growth: line 1 never wraps, the title shrinks first.
    expect(inline).toMatch(/flex:\s*1000000 1 0/);
    expect(inline).toMatch(/max-width:\s*max-content/);
    const title = /tr:has\(> td:is\(\.cell-inline, \.cell-end\)[^{]*td\.cell-primary\s*\{([^}]*)\}/.exec(phone)?.[1] ?? '';
    expect(title).toMatch(/text-overflow:\s*ellipsis/);
    expect(title).toMatch(/white-space:\s*nowrap/);
    expect(title).toMatch(/min-width:\s*1\.5em/);
    // The title only takes its content width (grows after the tags), so inline cells hug it on
    // the left; the spacer (grow 1) takes the rest, so the end cells and the main figure hug the
    // right edge.
    expect(title).toMatch(/flex:\s*1000 1 0/);
    expect(title).toMatch(/max-width:\s*max-content/);
    const spacer = /tr:has\(> td:is\(\.cell-inline, \.cell-end\):not\(\.hide-phone\)\)::before\s*\{([^}]*)\}/.exec(phone)?.[1] ?? '';
    expect(spacer).toMatch(/flex:\s*1 1 0/);
    expect(spacer).toMatch(/margin-left:\s*calc\(-1 \* var\(--space-2\)\)/);
    // Rows without inline / end cells keep the main figure right-aligned with its auto margin.
    expect(phone).toMatch(/\.data-table-cards td\.cell-main\s*\{[^}]*margin-left:\s*auto/);
  });

  it('the title link covers the whole row; other controls stay on top', () => {
    expect(phone).toMatch(/td\.cell-primary a:first-of-type::after\s*\{[^}]*inset:\s*0/);
    expect(phone).toMatch(/td:not\(\.cell-primary\) :is\([^)]*button[^)]*\)\s*\{[^}]*z-index:\s*1/);
  });

  it('cardsBelow="lg" uses the same row layout up to 1199 px', () => {
    const lg = mediaBlock(styles, 'max-width: 1199px', '.data-table-cards-lg tr');
    expect(lg).toMatch(/\.data-table-cards-lg td\.cell-main/);
    expect(lg).toMatch(/\.data-table-cards-lg tr::after/);
  });
});
