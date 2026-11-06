# TASK-184: Cost table on phone — two rows per line, no expand; PO tag replaces the lock hint

- **owner:** ui
- **status:** todo
- **spec:** owner request 2026-11-06
- **depends on:** TASK-183 (replaces its expand/chevron design)

## Goal
1. On phone (< 600 px cost-list width) every cost line shows **everything in two rows**, with no
   chevron/expand area. Keep the 13 px font from TASK-183.
2. The blue PO tag (now in the type cell, `.cost-po-tag`) moves to where the lock hint
   "Ostotilauksella <PO number>" is shown (actions cell, `.cost-po-hint`) and **replaces** that hint
   text — on every layout (desktop, compact, phone). The tag keeps its title/aria (lock hint) so the
   explanation is still available on hover / to screen readers.

## Contract
None.

## Acceptance criteria
- [ ] Phone, each line = exactly two visual rows (checked at 375 and 414, no horizontal page scroll):
  - **Row 1:** type (bold, truncate) · person picker (compact, truncate) · budget (right) · actual: paid amount or the icon-only ✓ pay button / in-place input (right).
  - **Row 2:** description field (fills remaining width) · load-in switch (musician roles only, compact, no long text label — keep accessible name) · remove button — or, for lines on a purchase order, the blue PO tag in place of the remove button.
- [ ] Chevron button, `expanded` state and the hidden detail area from TASK-183 are removed; the phone summary cell ("Type · Person") is removed (person is now the picker in row 1).
- [ ] Header row on phone stays one compact row aligned with row 1 (Tyyppi / Henkilö / Budjetti / Toteuma).
- [ ] PO tag: no longer in the type cell; shown in the actions cell instead of the "Ostotilauksella …" text on all layouts; `.cost-po-hint` text removed. Tag title = lock hint.
- [ ] Draft "Lisää rivi" row uses the same two-row phone layout (type select in row 1), same save/drop rules.
- [ ] Musician shade/order kept; touch targets ≥ 32 px; desktop/tablet layout otherwise unchanged.
- [ ] Update unit tests (remove chevron tests, add two-row/PO tag tests) and e2e (remove `expandCostLine()` helper usage; update 12-layout-v2 phone test to check two rows per line ≤ ~80 px and no chevron); tests, lint, build, affected e2e pass. Before/after 375 screenshots in gitignored `frontend/tmp-screens/`. Stop any e2e servers you start when done.

## Out of scope
Other tables.
