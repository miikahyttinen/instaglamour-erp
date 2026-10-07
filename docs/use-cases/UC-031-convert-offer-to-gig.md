# UC-031: Convert offer to gig

- **Status:** Approved (owner decisions 2026-10-07)
- **Phase:** 2
- **Primary actor:** Partner (UC-030: anonymous customer)
- **Business rules:** BR-105

## Goal
Turn a won offer into a gig in one click.

## Main flow
1. Partner presses **Convert to gig#** in the offer list or on the offer page.
2. System creates the gig per BR-105, links offer ↔ gig, sets disposition WON, logs both (gig `CREATED`, offer `CONVERTED`).
3. The button becomes a link to the gig ("Keikka →"); the gig page shows "From offer: <event>" linking back.

## Alternative flows
- **A1 – Confirm dialog** shows what will be created (date, venue, client, price, seller).

## Error flows
- **E1 – Already converted** → 409, UI shows the gig link instead.

## Acceptance criteria
- [ ] AC-1: Gig fields per BR-105; gig counts in the year like any gig.
- [ ] AC-2: Offer disposition WON, status ACCEPTED, history entry.
- [ ] AC-3: Double-click/second request does not create a second gig.

## Change log
- 2026-10-07 – First version (PM)
