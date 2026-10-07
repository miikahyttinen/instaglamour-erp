# UC-028: Offer list

- **Status:** Approved (owner decisions 2026-10-07)
- **Phase:** 2
- **Primary actor:** Partner (UC-030: anonymous customer)
- **Business rules:** BR-102, BR-106

## Goal
See and manage the selected year's offers, and the open value and win rate.

## Main flow
1. Partner opens **Tarjoukset / Offers** (first item in the menu).
2. Page head: open offers value and win rate for the selected year (BR-106) + "New offer" button.
3. Table (Excel-style, sortable by every column, default event date ascending): Event (link) · Client · Venue/City · Event date · Created · Price · Status (incl. expired) · Seller · Source · Event type · Disposition · Gig.
4. Source, event type and disposition are editable in place (select, saves on change).
5. **Gig column:** "Convert to gig#" button (UC-031), or a link to the created gig.

## Alternative flows
- **A1 – Search** event, client, venue, city.
- **A2 – Filters:** status (incl. expired), seller, disposition, event type, source.
- **A3 – Copy public link** of an offer (UC-030).
- **A4 – Delete** (soft, confirmation) / restore from a Deleted view.

## Error flows
- **E1 – No offers** → empty state with "New offer".

## Acceptance criteria
- [ ] AC-1: Rows = non-deleted offers whose event date is in the selected year.
- [ ] AC-2: Open value and win rate per BR-106 and equal to the table data.
- [ ] AC-3: Inline selects save on change and are logged; status follows disposition.
- [ ] AC-4: Expired shown for open offers past their date.
- [ ] AC-5: No email sync anywhere.

## Change log
- 2026-10-07 – First version (PM)
