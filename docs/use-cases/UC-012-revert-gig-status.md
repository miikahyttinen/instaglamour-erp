# UC-012: Uncancel gig

- **Status:** Review
- **Phase:** 1
- **Primary actor:** Partner
- **Replaces:** —
- **Business rules:** BR-011, BR-015

## Goal
Undo a cancellation.

## Trigger
A cancelled gig is back on, or was cancelled by mistake.

## Preconditions
- Gig is CANCELLED.

## Main flow
1. Partner selects **Uncancel**, enters a reason.
2. System sets SOLD and logs `UNCANCELLED`.

## Alternative flows
- **A1 – New date**: then Move (UC-009).

## Error flows
- **E1 – No reason** → cannot confirm.

## Postconditions
- Gig SOLD.

## Acceptance criteria
- [ ] AC-1: Reason required; the original cancel stays in the history.

## Change log
- 2026-10-03 – First version and iterations (PM)
- 2026-10-03 – Simplified MVP (PM)
