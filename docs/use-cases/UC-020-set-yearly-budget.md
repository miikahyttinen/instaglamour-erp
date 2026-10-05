# UC-020: Manage yearly budget

- **Status:** Approved
- **Phase:** 1
- **Primary actor:** Partner
- **Replaces:** the fixed costs and income sheet
- **Business rules:** BR-060, BR-062, BR-063

## Goal
Keep the year's fixed costs and income: budget and actual per category.

## Trigger
Annual planning or follow-up.

## Preconditions
- None (rows may be empty).

## Main flow
1. Partner opens **Budget** (selected year): one row per category with budget expense, budget income, actual expense, actual income, variance; totals.
2. Partner types numbers inline and saves.

## Alternative flows
- **A1 – New year**: copy budget numbers from the previous year (actuals start empty).
- **A2 – Add row**: partner adds a row with a name; it appears in every year with zeros.
- **A3 – Rename row**: edit the name in place (saves on blur/Enter).
- **A4 – Remove row**: after confirmation the row is hidden from all years and totals; its values are kept.

## Error flows
- **E1 – Negative number** → error.
- **E2 – Empty or duplicate row name** → error, nothing saved.

## Postconditions
- Budget saved.

## Acceptance criteria
- [ ] AC-1: Totals and variance correct.
- [ ] AC-2: Copying copies budget numbers only.
- [ ] AC-3: Partners can add, rename and remove rows; removed rows disappear from all years and totals, values kept.
- [ ] AC-4: No special fuel or actuals-only rows; every row has budget and actual.

## Change log
- 2026-10-03 – First version and iterations (PM)
- 2026-10-03 – Simplified MVP (PM)
- 2026-10-05 – Partner-managed rows; fuel/actuals-only rows removed (PM)
