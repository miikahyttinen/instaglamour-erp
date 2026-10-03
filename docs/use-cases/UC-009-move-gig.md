# UC-009: Move gig

- **Status:** Review
- **Phase:** 1
- **Primary actor:** Partner
- **Replaces:** editing the date
- **Business rules:** BR-012, BR-015, BR-022

## Goal
Reschedule a gig and keep a record of the original date.

## Trigger
A new date is agreed.

## Preconditions
- Gig is SOLD.

## Main flow
1. Partner selects **Move**, enters new start (and end) date and an optional reason.
2. System updates dates, logs `MOVED` (old → new), and shows overlap warnings for assigned people.

## Alternative flows
- **A1 – Abort**.

## Error flows
- **E1 – Invalid dates** → error.
- **E2 – Cancelled gig** → uncancel first (UC-012).

## Postconditions
- New dates; may change the gig's year.

## Acceptance criteria
- [ ] AC-1: Dates change, status stays SOLD, staff stay assigned.
- [ ] AC-2: History shows old and new dates.
- [ ] AC-3: Overlap warnings shown.

## Change log
- 2026-10-03 – First version and iterations (PM)
- 2026-10-03 – Simplified MVP (PM)
