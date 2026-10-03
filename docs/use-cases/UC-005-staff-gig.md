# UC-005: Manage gig costs and staffing

- **Status:** Review
- **Phase:** 1
- **Primary actor:** Partner
- **Replaces:** gig sheet rows (musicians, office, sales, production, other costs)
- **Business rules:** BR-001, BR-002, BR-008, BR-015, BR-020…BR-027

## Goal
One list per gig for who plays/works and what everything costs, budget vs. actual, and what is paid.

## Trigger
Staffing a gig, planning a cost, or paying.

## Preconditions
- Gig exists.

## Main flow
1. The cost list shows per line: type, person, description, budgeted amount, load-in switch (musician roles), actual amount, paid (with time and partner).
2. Partner picks a person for a line; active people are offered. Overlap check (BR-022) may warn.
3. Partner edits budgeted amount / description and saves; totals update; change logged.

## Alternative flows
- **A1 – Add line**: any type (role or expense category).
- **A2 – Remove line**: confirmation if paid; logged.
- **A3 – Load-in switch off/on** (musician roles): budgeted amount −/+ deduction (BR-026); logged.
- **A4 – Mark paid**: actual amount defaults to budgeted (editable); paid time and partner recorded automatically (BR-025); logged.
- **A5 – Unmark paid**: clears it; logged.
- **A6 – Fuel**: budgeted only; no paid action (BR-008).
- **A7 – Same person on several lines / split role** (BR-024).
- **A8 – New person**: create inline with a name (UC-014).

## Error flows
- **E1 – Negative amount, or OTHER without description** → error.

## Postconditions
- Lines saved; economics and "not fully staffed" updated.

## Acceptance criteria
- [ ] AC-1: Totals update after every change (BR-001, BR-002).
- [ ] AC-2: With line amount A and deduction D, switching load-in off gives max(A − D, 0); switching on restores A exactly, even if the setting changed in between.
- [ ] AC-3: Mark paid stores actual amount, paid time and partner; shown on the line; logged.
- [ ] AC-4: FUEL lines cannot be marked paid (UI and API).
- [ ] AC-5: Overlap warning names the other gig and doesn't block.
- [ ] AC-6: "Not fully staffed" disappears when every musician-role line has a person.
- [ ] AC-7: Every change is in the history.

## Change log
- 2026-10-03 – First version and iterations (PM)
- 2026-10-03 – Simplified MVP (PM)
