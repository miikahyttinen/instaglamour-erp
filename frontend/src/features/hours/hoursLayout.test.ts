import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// jsdom has no layout, so the "no sideways scroll" rules (design.md → "Full-width, responsive
// tables everywhere", TASK-149) are guarded on the stylesheet; e2e checks the real widths.
const css = readFileSync(resolve(process.cwd(), 'src/features/hours/hours.css'), 'utf8');

/** Declarations of every rule whose selector list is exactly `selector` (whitespace-normalised). */
function rules(selector: string): string[] {
  const norm = (s: string) => s.replace(/\s+/g, ' ').trim();
  const out: string[] = [];
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const sel = norm(m[1]!.replace(/\/\*[\s\S]*?\*\//g, ''));
    if (sel === norm(selector)) out.push(m[2]!);
  }
  return out;
}

describe('hours table layout (TASK-149)', () => {
  it('the comment column has no fixed minimum width (it wraps instead of widening the table)', () => {
    const comment = rules('.hours-page .hours-table td.hours-col-comment > *').join('\n');
    expect(comment).toMatch(/overflow-wrap:\s*anywhere/);
    expect(comment).not.toMatch(/min-width:\s*calc/);
  });

  it('dates and hours hug their content on one line', () => {
    const fixed = rules(
      '.hours-page .hours-table .hours-col-date, .hours-page .hours-table .hours-col-partner, .hours-page .hours-table .hours-col-hours, .hours-page .hours-table .hours-col-actions',
    ).join('\n');
    expect(fixed).toMatch(/white-space:\s*nowrap/);
    expect(fixed).toMatch(/width:\s*1%/);
  });

  it('uses the smaller gutter between columns from 600 px, like the budget table', () => {
    const gutter = rules('.hours-page .hours-table th, .hours-page .hours-table td').join('\n');
    expect(gutter).toMatch(/padding-left:\s*var\(--space-3\)/);
    expect(gutter).toMatch(/padding-right:\s*var\(--space-3\)/);
  });
});
