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
    const compact = containerBlock('max-width: 1119px');
    expect(compact).toMatch(/grid-template-areas/);
    expect(compact).toMatch(/td\[data-label\]::before/);
  });

  it('caps inline controls in the full table so they do not stretch over a wide page', () => {
    const full = containerBlock('min-width: 1120px');
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
