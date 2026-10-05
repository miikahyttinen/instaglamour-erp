# UC-002: Create gig

- **Status:** Approved
- **Phase:** 1
- **Primary actor:** Partner
- **Replaces:** new row on the main sheet + copied gig sheet
- **Business rules:** BR-006, BR-010, BR-015, BR-020, BR-021, BR-080

## Goal
Record a sold gig so it can be staffed and budgeted, and counted in its year.

## Trigger
A partner has sold a gig.

## Preconditions
- Signed in.

## Main flow
1. Partner selects **New gig**.
2. Partner enters: start date, venue, lineup (template or **Custom** + name), price, seller, producer (seller and producer default to self).
3. Optional: end date, technical setup (dropdown), logistics (dropdown), house technician (yes/no), additional sales amount + description, notes.
4. Partner saves.
5. System creates the gig as SOLD; its year = start date's year.
6. System creates cost lines: one per template role with default fee and no person (BR-020), plus Office, Sales (seller), Production (producer) with default fees (BR-021).
7. System logs `CREATED` and opens the gig (UC-004).

## Alternative flows
- **A1 – Custom lineup**: only Office, Sales, Production lines are created.
- **A2 – Leave without saving**: nothing saved.

## Error flows
- **E1 – Invalid input**: missing required field, negative amount, end date before start → field errors; nothing saved; input kept.

## Postconditions
- A SOLD gig exists and counts in its year (BR-082).

## Acceptance criteria
- [ ] AC-1: From a template with N roles, the gig gets N musician lines with the default fees and no person, plus Office, Sales and Production with setting defaults.
- [ ] AC-2: Sales person = seller, Production person = producer.
- [ ] AC-3: Total price = price + additional sales.
- [ ] AC-4: Invalid input shows localized field errors and saves nothing.
- [ ] AC-5: `CREATED` is logged.
- [ ] AC-6: No customer fields exist.

## Change log
- 2026-10-03 – First version and iterations (PM)
- 2026-10-03 – Simplified MVP (PM)
- 2026-10-05 – Technical setup dropdown, logistics, house technician (PM)
