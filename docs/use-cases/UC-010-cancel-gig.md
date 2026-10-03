# UC-010: Cancel gig

- **Status:** Review
- **Phase:** 1
- **Primary actor:** Partner
- **Replaces:** renaming the gig sheet
- **Business rules:** BR-011, BR-013, BR-015, BR-017

## Goal
Mark a gig cancelled without losing data, keeping what is still billed.

## Trigger
The gig is cancelled.

## Preconditions
- Gig is SOLD.

## Main flow
1. Partner selects **Cancel**, enters a reason.
2. System sets CANCELLED and logs it.
3. System reminds: "Adjust the price to what is still billed and add a note."

## Alternative flows
- **A1 – Abort**.

## Error flows
- **E1 – No reason** → cannot confirm.

## Postconditions
- Gig CANCELLED, hidden from the default list, still counted with its price in the year (BR-082).

## Acceptance criteria
- [ ] AC-1: Reason required; logged.
- [ ] AC-2: Hidden by default; visible with the filter.
- [ ] AC-3: Its (adjusted) total price counts in the sold gigs sum.
- [ ] AC-4: Cancelled gigs don't trigger overlap warnings.

## Change log
- 2026-10-03 – First version and iterations (PM)
- 2026-10-03 – Simplified MVP (PM)
