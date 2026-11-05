import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// jsdom has no layout, so the cost table's responsive rules (design.md → "Full-width, responsive
// tables everywhere", TASK-149) are guarded on the stylesheet; e2e checks the real widths.
const css = readFileSync(resolve(process.cwd(), 'src/features/events/eventPage.css'), 'utf8').replace(
  /\/\*[\s\S]*?\*\//g,
  '',
);

/** The body of the first `@container cost-list (<condition>) { … }` block (balanced braces). */
function containerBlock(condition: string): string {
  const start = css.indexOf(`@container cost-list (${condition})`);
  expect(start, `@container cost-list (${condition})`).toBeGreaterThanOrEqual(0);
  let depth = 0;
  const open = css.indexOf('{', start);
  for (let i = open; i < css.length; i++) {
    if (css[i] === '{') depth++;
    if (css[i] === '}' && --depth === 0) return css.slice(open + 1, i);
  }
  throw new Error('unbalanced block');
}

describe('cost table layout (TASK-149)', () => {
  it('the list is a size container, so the layout follows its real width (sidebar, full page)', () => {
    expect(css).toMatch(/\.event-page \.cost-list \{\s*container: cost-list \/ inline-size;/);
  });

  it('switches to compact rows while the list is narrower than the full table', () => {
    const compact = containerBlock('max-width: 679px');
    expect(compact).toMatch(/grid-template-areas/);
    expect(compact).toMatch(/td\[data-label\]::before/);
  });

  it('caps inline controls in the full table so they do not stretch over a wide page', () => {
    const full = containerBlock('min-width: 680px');
    for (const selector of [
      'td.cost-person .inline-field',
      'td.cost-budget .inline-field',
      '.cost-paid-edit',
      '.cost-description',
    ]) {
      expect(full).toContain(selector);
    }
    expect(full).toMatch(/max-width: calc\(var\(--label-w\) \* 1\.5\)/);
  });
});

describe('cost table widths and amount alignment (TASK-182)', () => {
  it('trims the full table: half cell padding between columns, text inputs sized by min-width', () => {
    const full = containerBlock('min-width: 680px');
    expect(full).toMatch(/\.cost-table :is\(th, td\) \{\s*padding-left: var\(--space-2\);\s*padding-right: var\(--space-2\);/);
    expect(full).toMatch(/:is\(td\.cost-type, td\.cost-person\) \.inline-control > :is\(input, select\) \{\s*width: 0;/);
  });

  it('from 600 px the budget and actual amounts end on the right edge of their column title', () => {
    const wide = containerBlock('min-width: 600px');
    expect(wide).toMatch(/--cost-money-w:/);
    expect(wide).toMatch(/td\.cost-paid \{\s*text-align: right;/);
    expect(wide).toMatch(
      /:is\(td\.cost-budget, td\.cost-paid\) \.inline-numeric > \.inline-control \{\s*flex-direction: row-reverse;\s*margin-left: 0;\s*margin-right: calc\(-1 \* \(var\(--inline-pad-x\) \+ var\(--hairline\)\)\);/,
    );
  });
});

describe('gig page columns (owner request)', () => {
  it('the page is a size container; two columns (costs ~60 % left) only from a 1080 px wide page', () => {
    expect(css).toMatch(/\.event-page \{\s*container: event-page \/ inline-size;/);
    const start = css.indexOf('@container event-page (min-width: 1080px)');
    expect(start).toBeGreaterThanOrEqual(0);
    const block = css.slice(start, css.indexOf('@container', start + 1));
    expect(block).toMatch(/grid-template-columns: minmax\(0, 3fr\) minmax\(28rem, 2fr\)/);
    expect(block).toMatch(/\.event-section-history \{\s*grid-column: 1 \/ -1;/);
  });
});
