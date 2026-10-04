import type { Locator } from '@playwright/test';

/**
 * Value of a labelled figure on the year page. Every label/value pair there is marked
 * `.year-fig` > `.year-fig-label` + `.year-fig-value` (YearPage.tsx), whatever the visual order.
 */
export function yearFigure(scope: Locator, label: string): Locator {
  return scope
    .locator('.year-fig')
    .filter({ has: scope.page().locator('.year-fig-label').getByText(label, { exact: true }) })
    .locator(':scope > .year-fig-value');
}
