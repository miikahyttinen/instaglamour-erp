# UC-018: Log own hours

- **Status:** Approved
- **Phase:** 1
- **Primary actor:** Partner
- **Replaces:** the hours sheet
- **Business rules:** BR-050, BR-051, BR-083

## Goal
Record work hours and see your own year total.

## Trigger
A partner has done work.

## Preconditions
- None.

## Main flow
1. Partner opens **Hours**: own entries of the selected year by month, month totals, year total.
2. Partner adds: date (default today), comment, hours.

## Alternative flows
- **A1 – Edit / delete own entry**.

## Error flows
- **E1 – Invalid hours or no comment** → error.
- **E2 – Others' entries** can't be edited.

## Postconditions
- Totals updated.

## Acceptance criteria
- [ ] AC-1: Hours 0.25…24 in 0.25 steps; comment required.
- [ ] AC-2: Only own entries editable (UI and API).
- [ ] AC-3: Year total = Σ own hours in the selected year.

## Change log
- 2026-10-03 – First version and iterations (PM)
- 2026-10-03 – Simplified MVP (PM)
