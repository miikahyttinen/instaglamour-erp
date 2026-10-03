# TASK-003: Backend year page, people, tasks, hours, budget

- **owner:** backend
- **status:** todo
- **spec:** UC-014, UC-017, UC-018, UC-019, UC-020, UC-022; business-rules.md
- **depends on:** TASK-002

## Goal
Remaining endpoints, including the year page totals.

## Contract
`docs/api-contract.md`: Year page, People, Tasks, Hours, Budget.

## Acceptance criteria
- [ ] `GET /api/years/{year}`: gig sums identical to `GET /api/gigs` yearSummary; hours identical to `/api/hours/totals`; budget totals identical to `/api/budget`; year result per BR-063; upcoming = next 5 SOLD from today.
- [ ] People: list/create/update, duplicate-name warning (case-insensitive), person's cost lines for a year with totals.
- [ ] Tasks: ordering (overdue first, due date, nulls last), `overdue`, `completedAt` handling, default owner = me.
- [ ] Hours: 0.25 steps 0.25…24, comment required, only own entries editable (403), totals per partner by month with zeros for every partner.
- [ ] Budget: one row per active category (zeros if none), actuals-only categories reject budget numbers, copy-from-previous copies budget fields only and 409s if target not empty.
- [ ] Tests for each endpoint and rule; tests and lint pass.

## Out of scope
Frontend.
