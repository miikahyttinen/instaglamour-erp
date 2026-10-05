# UC-019: View hours totals

- **Status:** Approved
- **Phase:** 1
- **Primary actor:** Partner
- **Replaces:** sums of the hours sheet
- **Business rules:** BR-083

## Goal
See each partner's hours per year and per month.

## Trigger
Year-end or meeting.

## Preconditions
- None.

## Main flow
1. Partner opens **Hours → Totals**: a plain list of partners with their year hours (all partners, 0 h included, most hours first) and a total row. No charts.
2. Partner taps a partner to see that partner's entries for the year, grouped by month with month totals.

## Alternative flows
- **A1 – Change year**.

## Error flows
- None.

## Postconditions
- None.

## Acceptance criteria
- [ ] AC-1: Partners' year hours add up to the total row; month totals in a partner's entries add up to that partner's year hours.
- [ ] AC-3: No bar charts on the hours pages.
- [ ] AC-2: Matches the hours on the year page.

## Change log
- 2026-10-03 – First version and iterations (PM)
- 2026-10-03 – Simplified MVP (PM)
- 2026-10-05 – Plain list of partners' hours with total; no charts (owner request) (PM)
