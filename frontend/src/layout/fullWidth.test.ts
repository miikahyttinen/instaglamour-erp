import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// TASK-148 (docs/design.md → "Full-width, responsive tables everywhere"). jsdom has no layout, so
// these guard the stylesheet itself; the widths are checked in the browser by e2e 10 and 12.

const src = resolve(process.cwd(), 'src');
const read = (path: string) => readFileSync(join(src, path), 'utf8');
const styles = read('styles.css');

/** Declarations of every rule whose selector list is exactly `selector` (comments stripped). */
function rulesFor(css: string, selector: string): string[] {
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const out: string[] = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  for (let m = re.exec(clean); m; m = re.exec(clean)) {
    const selectors = m[1]!.split(',').map((s) => s.trim().replace(/\s+/g, ' '));
    if (selectors.includes(selector)) out.push(m[2]!);
  }
  return out;
}

/** Block of an at-rule, e.g. `@media (min-width: 600px)` that contains `marker`. */
function atRuleBlock(css: string, prelude: string, marker: string): string {
  let from = 0;
  for (;;) {
    const start = css.indexOf(prelude, from);
    if (start < 0) return '';
    let depth = 0;
    let i = css.indexOf('{', start);
    const open = i;
    for (; i < css.length; i++) {
      if (css[i] === '{') depth++;
      else if (css[i] === '}' && --depth === 0) break;
    }
    const block = css.slice(open + 1, i);
    if (block.includes(marker)) return block;
    from = i;
  }
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(tsx?|css)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

describe('full-width app pages', () => {
  it('.page-container and .topbar-inner have no max width (no --content-max cap)', () => {
    for (const selector of ['.page-container', '.topbar-inner']) {
      const rules = rulesFor(styles, selector);
      expect(rules.length, selector).toBeGreaterThan(0);
      for (const body of rules) expect(body, selector).not.toMatch(/max-width/);
    }
    expect(styles).not.toMatch(/\.page-container[^{]*\{[^}]*content-max/);
  });

  it('keeps the page padding', () => {
    expect(rulesFor(styles, '.page-container').join()).toMatch(/padding:[^;]*var\(--page-pad\)/);
  });

  it('the old .page-wide opt-in is gone everywhere', () => {
    for (const file of sourceFiles(src)) expect(readFileSync(file, 'utf8'), file).not.toContain('page-wide');
  });

  it('forms that would get too wide keep their own max width', () => {
    expect(rulesFor(read('features/events/newEvent.css'), '.new-event-page .new-event-form').join()).toMatch(
      /max-width:\s*var\(--content-max\)/,
    );
    expect(rulesFor(read('features/offers/offers.css'), '.new-offer-page .new-offer-form').join()).toMatch(/max-width/);
    expect(read('features/clients/clients.css')).toMatch(/\.client-form,[\s\S]*?max-width:\s*var\(--client-form-w\)/);
  });

  it('the public offer page keeps its own reading width', () => {
    expect(read('features/offers/publicOffer.css')).toMatch(/max-width:\s*var\(--doc-max\)/);
  });
});

describe('responsive data tables (≥ 600 px)', () => {
  const wide = atRuleBlock(styles, '@media (min-width: 600px)', '.data-table thead th');

  it('tables are 100 % wide', () => {
    expect(rulesFor(styles, '.data-table').join()).toMatch(/width:\s*100%/);
    expect(rulesFor(styles, '.table-wrap').join()).toMatch(/width:\s*100%/);
  });

  it('text cells and headers wrap; numbers and tags stay on one line', () => {
    expect(wide).not.toBe('');
    expect(rulesFor(wide, '.data-table thead th').join()).toMatch(/white-space:\s*normal/);
    expect(rulesFor(wide, '.data-table td').join()).toMatch(/overflow-wrap:\s*break-word/);
    expect(wide).toMatch(/\.data-table :is\(\.num, \.tag\) \{[^}]*white-space:\s*nowrap/);
  });
});
