# UC-003: View gig list

- **Status:** Review
- **Phase:** 1
- **Primary actor:** Partner
- **Replaces:** the main sheet
- **Business rules:** BR-001…BR-006, BR-010, BR-017, BR-023, BR-080…BR-082

## Goal
See the selected year's gigs and the year's sold gigs sum.

## Trigger
Partner opens **Gigs**.

## Preconditions
- Signed in.

## Main flow
1. System lists SOLD gigs of the selected year by date, scrolled to today. Past SOLD gigs are marked "played".
2. Row: date(s), lineup, venue, seller, producer, total price, budgeted costs, actual costs, margin %, "not fully staffed" flag.
3. Top: year summary — number of gigs, **sold gigs sum** (BR-082), budgeted costs, actual costs, margin.
4. Partner opens a gig (UC-004).

## Alternative flows
- **A1 – Change year** (header).
- **A2 – Filter**: upcoming / past, include cancelled, seller, producer, not fully staffed.
- **A3 – Search**: venue, lineup, notes.
- **A4 – Phone**: cards; economics on tap.
- **A5 – Deleted gigs**: separate view (UC-025).

## Error flows
- **E1 – No gigs** → "No gigs in <year>" + **New gig**.

## Postconditions
- None.

## Acceptance criteria
- [ ] AC-1: Default = SOLD gigs of the current year.
- [ ] AC-2: A gig belongs to its start date's year.
- [ ] AC-3: Sold gigs sum = Σ total price of all non-deleted gigs of the year (incl. cancelled, BR-082), regardless of list filters.
- [ ] AC-4: Margin % per BR-004.
- [ ] AC-5: Past SOLD gigs show as "played".
- [ ] AC-6: Under 2 s with 500 gigs.

## Change log
- 2026-10-03 – First version and iterations (PM)
- 2026-10-03 – Simplified MVP (PM)
