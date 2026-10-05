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
1. Partner opens **Hours → Totals**: one flat, spreadsheet-style table of **all entries of the selected year** — Date | Partner | Comment | Hours — oldest first, with a **total row**. No grouping, no collapsing, no charts.
2. Partner filters by partner (All / one partner); the total row shows the filtered sum (= that partner's year hours).
3. Partner sorts by clicking a column header.

## Alternative flows
- **A1 – Change year**.

## Error flows
- None.

## Postconditions
- None.

## Acceptance criteria
- [ ] AC-1: Every entry of the year appears once; the total row equals the sum of the shown rows and, unfiltered, the year page's hours total.
- [ ] AC-2: Partner filter: total row = that partner's year hours; filter kept in the URL.
- [ ] AC-3: Sorting by date, partner, comment, hours (asc/desc).
- [ ] AC-4: Own rows editable inline (date, comment, hours), others read-only; no collapsing, no charts.

## Change log
- 2026-10-03 – First version and iterations (PM)
- 2026-10-03 – Simplified MVP (PM)
- 2026-10-05 – Plain list of partners' hours with total; no charts (owner request) (PM)
- 2026-10-05 – Spreadsheet-style flat table of all entries with partner filter and total row; no collapsing (owner choice) (PM)
