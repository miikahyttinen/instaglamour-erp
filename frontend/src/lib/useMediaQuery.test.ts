import { describe, expect, it } from 'vitest';
import { DESKTOP_QUERY, WIDE_QUERY } from './useMediaQuery';

describe('shared breakpoints', () => {
  it('match the CSS breakpoints (900 px sidebar, 1200 px wide)', () => {
    expect(DESKTOP_QUERY).toBe('(min-width: 900px)');
    expect(WIDE_QUERY).toBe('(min-width: 1200px)');
  });
});
