# UC-013: View gig history

- **Status:** Approved
- **Phase:** 1
- **Primary actor:** Partner
- **Replaces:** —
- **Business rules:** BR-015

## Goal
See who changed what and when.

## Trigger
Partner opens a gig's history.

## Preconditions
- Gig exists.

## Main flow
1. System lists all events newest first: time, partner, readable description in the user's language with old → new values.

## Alternative flows
- **A1 – Filter**: status/dates, price, costs/payments, attachments.

## Error flows
- None.

## Postconditions
- None.

## Acceptance criteria
- [ ] AC-1: Every event type in BR-015 appears.
- [ ] AC-2: History can't be edited or deleted (UI and API).
- [ ] AC-3: Localized descriptions.

## Change log
- 2026-10-03 – First version and iterations (PM)
- 2026-10-03 – Simplified MVP (PM)
