import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// jsdom has no layout: the lineup editor's phone rules are guarded on the stylesheet (e2e checks 375 px).
const css = readFileSync(resolve(process.cwd(), 'src/features/settings/settings.css'), 'utf8').replace(
  /\/\*[\s\S]*?\*\//g,
  '',
);

describe('lineup editor layout', () => {
  it('the lines table follows its container width', () => {
    expect(css).toMatch(/\.settings-page \.lineup-lines \{\s*container: lineup-lines \/ inline-size;/);
  });

  it('narrow containers get two-row lines: type + amount, then description + actions', () => {
    const start = css.indexOf('@container lineup-lines (max-width: 599px)');
    expect(start).toBeGreaterThanOrEqual(0);
    const block = css.slice(start);
    expect(block).toMatch(/grid-template-areas:\s*'type amount'\s*'description actions';/);
    expect(block).toMatch(/thead \{\s*display: none;/);
  });
});
