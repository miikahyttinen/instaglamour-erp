# UC-004: View and edit gig

- **Status:** Review
- **Phase:** 1
- **Primary actor:** Partner
- **Replaces:** a gig sheet
- **Business rules:** BR-001…BR-006, BR-015, BR-027

## Goal
See everything about a gig on one page and edit it.

## Trigger
Partner opens a gig.

## Preconditions
- Gig exists and is not deleted.

## Main flow
1. Page shows: header (dates, lineup, venue, status / played), basic info (technical setup, seller, producer, notes), price + additional sales, economics (total price, budgeted and actual costs, margin, margin %), cost list (UC-005), attachments (UC-008), actions (Move, Cancel/Uncancel, Delete), history (UC-013).
2. Partner edits any of: lineup name, venue, technical setup, seller, producer, price, additional sales amount/description, notes.
3. Partner saves.
4. System saves (last save wins), applies BR-027 if seller/producer changed, and logs `UPDATED` with old → new values.

## Alternative flows
- **A1 – Dates** change only via Move (UC-009).
- **A2 – Cancelled gig**: price and notes stay editable (BR-013).

## Error flows
- **E1 – Invalid input** → field errors; nothing saved.

## Postconditions
- Changes saved and logged.

## Acceptance criteria
- [ ] AC-1: Economics follow BR-001…BR-006.
- [ ] AC-2: Each save logs every changed field with old and new value.
- [ ] AC-3: Seller change moves the old seller's unpaid Sales lines to the new seller (same for producer/Production); paid lines and other people's split lines are unchanged; the partner sees which lines moved.
- [ ] AC-4: Usable on a phone; sections collapsible.

## Change log
- 2026-10-03 – First version and iterations (PM)
- 2026-10-03 – Simplified MVP (PM)
