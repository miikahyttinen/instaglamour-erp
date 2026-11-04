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

  it('switches to compact rows only while the list is narrower than 600 px (phones)', () => {
    const compact = containerBlock('max-width: 599px');
    expect(compact).toMatch(/grid-template-areas/);
    expect(compact).toMatch(/td\[data-label\]::before/);
  });

  it('full table from a 600 px wide list: fixed layout, narrow fixed columns, the type column takes the rest', () => {
    const full = containerBlock('min-width: 600px');
    expect(full).toMatch(/table-layout: fixed/);
    for (const col of ['cost-col-person', 'cost-col-loadin', 'cost-col-budget', 'cost-col-paid', 'cost-col-actions']) {
      expect(full).toMatch(new RegExp(`th\\.${col} \\{\\s*width:`));
    }
    expect(full).not.toMatch(/th\.cost-col-type \{\s*width:/);
  });

  it('staffing and costs groups use different surface tokens', () => {
    expect(css).toMatch(/\.cost-in-staffing :is\(td, th\) \{\s*background: var\(--surface-2\);/);
    expect(css).toMatch(/\.cost-in-expenses :is\(td, th\) \{\s*background: var\(--surface-3\);/);
    const tokens = readFileSync(resolve(process.cwd(), 'src/styles/tokens.css'), 'utf8');
    expect(tokens.match(/--surface-3: #[0-9a-f]{6};/g)).toHaveLength(2);
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
