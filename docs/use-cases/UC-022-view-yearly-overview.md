# UC-022: Year page (home)

- **Status:** Review
- **Phase:** 1
- **Primary actor:** Partner
- **Replaces:** adding up across sheets
- **Business rules:** BR-080…BR-083, BR-063, BR-023

## Goal
See the selected year at a glance; this is the home page.

## Trigger
Sign-in or **Home**.

## Preconditions
- None.

## Main flow
1. System shows for the selected year:
   - **Gigs:** number of gigs, **sold gigs sum**, budgeted costs, actual costs, margin
   - **Hours:** per partner and total
   - **Budget:** budget vs. actual totals (expense, income) and the year result (BR-063)
   - **Upcoming gigs:** next 5, with "not fully staffed" flag
2. Tapping a figure opens the related list.

## Alternative flows
- **A1 – Change year**: figures change; upcoming gigs always relate to today.

## Error flows
- **E1 – No data** → zeroes.

## Postconditions
- None.

## Acceptance criteria
- [ ] AC-1: Sold gigs sum equals UC-003's for the same year.
- [ ] AC-2: Hours equal UC-019.
- [ ] AC-3: Budget totals equal UC-020.
- [ ] AC-4: Year result per BR-063.
- [ ] AC-5: Fits a phone.

## Change log
- 2026-10-03 – First version and iterations (PM)
- 2026-10-03 – Simplified MVP (PM)
