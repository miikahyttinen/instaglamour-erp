# TASK-182: Gig page cost table — ~20 % narrower, numbers aligned with headers

- **owner:** ui
- **status:** done
- **spec:** owner request 2026-11-05
- **depends on:** none

## Goal
The cost table ("Kulut ja miehitys") on the gig page wastes horizontal space: the inline fields
(type, person, description, budget, actual) are wider and more padded than their content needs.
Make the table at least 20 % narrower at desktop width, and align the budget and actual amounts
exactly with their column titles.

## Contract
None.

## Acceptance criteria
- [ ] At desktop width (1280) the cost table's natural content width is ≥ 20 % smaller than now (measure before/after and report both numbers). Achieve it by removing excess width/padding of the inline fields and cells (fixed/min widths sized to content, e.g. money fields ~ width of "12 345,00 €"), not by shrinking font size.
- [ ] Budget and actual columns: header text and the amounts (inline inputs, paid amount, "Merkitse maksetuksi" button / its input, read-only amounts) share the same right edge — numbers right-aligned under a right-aligned header, no extra inner padding offsetting them. Same for the totals row if present.
- [ ] Nothing else changes: same columns, order (musicians first, lighter shade), font size, row height feel, phone stacked layout unchanged and no horizontal scroll at 375.
- [ ] Inline field focus/error states still readable (error text may wrap).
- [ ] Note: an earlier "compact" attempt was reverted by the owner (commits a7ac9df/9cc7827, reverted in aaec5b5) — do NOT reintroduce that grouping/shading; only trim widths/padding and fix the alignment.
- [ ] Tests, lint, build pass; e2e 02 passes. Attach before/after screenshots (desktop) to the worktree (gitignored path, e.g. `frontend/tmp-screens/`, not committed) and give their paths.

## Out of scope
Other tables; layout of the page columns.
