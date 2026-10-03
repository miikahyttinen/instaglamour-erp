# UC-014: Manage people

- **Status:** Review
- **Phase:** 1
- **Primary actor:** Partner
- **Replaces:** names typed on gig sheets
- **Business rules:** BR-024

## Goal
Each person exists once.

## Trigger
A new person is used or someone stops.

## Preconditions
- None.

## Main flow
1. Partner opens **People**: list of names (active by default).
2. Partner adds a person (name) or edits a name.

## Alternative flows
- **A1 – Deactivate/activate**: inactive people are hidden from pickers, kept on old gigs.
- **A2 – Person's gigs**: list of their cost lines in the selected year with budgeted, actual and paid status.

## Error flows
- **E1 – Empty name** → error. Duplicate name → warning only.

## Postconditions
- Person saved.

## Acceptance criteria
- [ ] AC-1: Name required; duplicate warns.
- [ ] AC-2: Inactive people not offered in UC-005 but shown on old gigs.
- [ ] AC-3: Person's gigs list for the selected year with totals.

## Change log
- 2026-10-03 – First version and iterations (PM)
- 2026-10-03 – Simplified MVP (PM)
