# UC-025: Delete and restore gig

- **Status:** Approved
- **Phase:** 1
- **Primary actor:** Partner
- **Replaces:** deleting a row/sheet
- **Business rules:** BR-015, BR-018

## Goal
Remove a gig created by mistake without losing it.

## Trigger
A wrong or duplicate gig.

## Preconditions
- Gig not deleted.

## Main flow
1. Partner selects **Delete** (separate from Cancel), enters a reason, confirms.
2. Gig is hidden everywhere and logged.

## Alternative flows
- **A1 – Restore** from **Gigs → Deleted**; logged.

## Error flows
- **E1 – No reason** → cannot confirm.

## Postconditions
- Gig hidden but recoverable.

## Acceptance criteria
- [ ] AC-1: Reason required; logged.
- [ ] AC-2: Excluded from lists, sums and overlap warnings.
- [ ] AC-3: Restore brings back all data.
- [ ] AC-4: No API physically deletes a gig.

## Change log
- 2026-10-03 – First version and iterations (PM)
- 2026-10-03 – Simplified MVP (PM)
