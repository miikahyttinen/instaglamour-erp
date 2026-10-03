# UC-020: Manage yearly budget

- **Status:** Review
- **Phase:** 1
- **Primary actor:** Partner
- **Replaces:** the fixed costs and income sheet
- **Business rules:** BR-060, BR-062, BR-063

## Goal
Keep the year's fixed costs and income: budget and actual per category.

## Trigger
Annual planning or follow-up.

## Preconditions
- Budget categories exist (seed).

## Main flow
1. Partner opens **Budget** (selected year): one row per category with budget expense, budget income, actual expense, actual income, variance; totals.
2. Partner types numbers inline and saves.

## Alternative flows
- **A1 – New year**: copy budget numbers from the previous year (actuals start empty).
- **A2 – Actuals-only category** (e.g. fuel): budget cells hidden.

## Error flows
- **E1 – Negative number** → error.

## Postconditions
- Budget saved.

## Acceptance criteria
- [ ] AC-1: Totals and variance correct.
- [ ] AC-2: Copying copies budget numbers only.
- [ ] AC-3: Categories cannot be added in the UI.

## Change log
- 2026-10-03 – First version and iterations (PM)
- 2026-10-03 – Simplified MVP (PM)
