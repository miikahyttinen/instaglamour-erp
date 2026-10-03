# TASK-103: UI year page, people, tasks, hours, budget

- **owner:** ui
- **status:** superseded by TASK-103-ui-year-page, TASK-104…TASK-107 (split for parallel work)
- **spec:** UC-014, UC-017, UC-018, UC-019, UC-020, UC-022
- **depends on:** TASK-102

## Goal
Remaining screens; the year page becomes the home page.

## Contract
`docs/api-contract.md`: Year page, People, Tasks, Hours, Budget.

## Acceptance criteria
- [ ] Year page: gig sums, hours per partner, budget totals, year result, next 5 gigs with flags; figures link to their lists (UC-022).
- [ ] People: list, add (duplicate warning), rename, activate/deactivate, person's gigs for the year with totals (UC-014).
- [ ] Tasks: open list with overdue highlight, add/edit/delete, one-tap done/reopen, filters (UC-017).
- [ ] Hours: own entries by month with month and year totals, add/edit/delete own; totals view per partner × month (UC-018, UC-019).
- [ ] Budget: editable grid per category (budget/actual, expense/income), variance, totals, actuals-only categories without budget cells, copy from previous year (UC-020).
- [ ] Tests; tests and lint pass; works at 375 px.
