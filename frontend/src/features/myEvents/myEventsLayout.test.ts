import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// jsdom has no layout, so the phone row placement (TASK-199) is guarded on the stylesheet; e2e 25 /
// 27 check the real positions at 375 / 414 px.
const css = readFileSync(resolve(process.cwd(), 'src/features/myEvents/myEvents.css'), 'utf8');
const phone = css.slice(css.indexOf('@media (max-width: 599px)'));

/** Declarations of every phone rule whose selector is exactly `selector` (whitespace-normalised). */
function rules(selector: string): string {
  const norm = (s: string) => s.replace(/\s+/g, ' ').trim();
  const out: string[] = [];
  for (const m of phone.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const sel = norm(m[1]!.replace(/\/\*[\s\S]*?\*\//g, ''));
    if (sel === norm(selector)) out.push(m[2]!);
  }
  return out.join('\n');
}

describe('My gigs phone rows (TASK-199)', () => {
  it('role chips wrap right-aligned within at most 45 % of the row (never into the title)', () => {
    const cell = rules('.my-events-table.data-table-cards td.cell-main.my-events-roles-cell');
    expect(cell).toMatch(/max-width:\s*45%/);
    expect(cell).toMatch(/white-space:\s*normal/);
    expect(cell).toMatch(/justify-content:\s*flex-end/);
    const chips = rules('.my-events-table.data-table-cards td.my-events-roles-cell .my-events-roles');
    expect(chips).toMatch(/justify-content:\s*flex-end/);
    expect(css).toMatch(/\.my-events-roles\s*\{[^}]*flex-wrap:\s*wrap/);
    // A chip wider than the area truncates instead of overflowing towards the title.
    const chip = rules('.my-events-table.data-table-cards td.my-events-roles-cell .my-events-role');
    expect(chip).toMatch(/max-width:\s*100%/);
    expect(chip).toMatch(/text-overflow:\s*ellipsis/);
  });

  it('line 2 shows client before venue', () => {
    expect(rules('.my-events-table.data-table-cards .my-events-place')).toMatch(/display:\s*inline-flex/);
    expect(rules('.my-events-table.data-table-cards .my-events-client')).toMatch(/order:\s*-2/);
    expect(rules('.my-events-table.data-table-cards .my-events-sep')).toMatch(/order:\s*-1/);
  });

  it('hides the empty staffing cell of a fully staffed gig', () => {
    expect(rules('.my-events-table td:empty')).toMatch(/display:\s*none/);
  });
});

describe('My gigs offers table, narrow desktop range', () => {
  // e2e 12 ("full-width pages") checks the real widths at 600–1920 px.
  const narrow = css.slice(css.indexOf('@container my-offers (max-width: 759.98px)'));

  it('the offers section is a size container', () => {
    expect(css).toMatch(/\.my-offers\s*\{[^}]*container:\s*my-offers\s*\/\s*inline-size/);
  });

  it('only from 600 px (phone rows untouched): hides the Tila column and lets the date wrap', () => {
    expect(css).toMatch(/@media \(min-width: 600px\)\s*\{\s*@container my-offers \(max-width: 759\.98px\)/);
    expect(narrow).toMatch(/\.my-offers-table \.my-offers-status\s*\{\s*display:\s*none/);
    expect(narrow).toMatch(/\.my-offers-table \.my-events-date\s*\{\s*white-space:\s*normal/);
  });
});
