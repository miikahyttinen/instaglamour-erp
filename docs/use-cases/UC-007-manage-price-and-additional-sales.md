# UC-007: Manage price and additional sales

- **Status:** Approved
- **Phase:** 1
- **Primary actor:** Partner
- **Replaces:** price column + breakdowns in notes
- **Business rules:** BR-006, BR-013, BR-015

## Goal
Keep the price and any additional sales correct so totals and margin are right.

## Trigger
Price agreed or changed, or something extra sold.

## Preconditions
- Gig exists.

## Main flow
1. On the gig, partner edits price, additional sales amount and description.
2. System saves; total price and margin update; old → new logged.

## Alternative flows
- **A1 – Cancelled gig**: set to what is still billed (0 if nothing) and explain in notes (BR-013).

## Error flows
- **E1 – Negative amount** → error.

## Postconditions
- Total price updated.

## Acceptance criteria
- [ ] AC-1: Total price = price + additional sales.
- [ ] AC-2: Changes are logged with old and new values.

## Change log
- 2026-10-03 – First version and iterations (PM)
- 2026-10-03 – Simplified MVP (PM)
