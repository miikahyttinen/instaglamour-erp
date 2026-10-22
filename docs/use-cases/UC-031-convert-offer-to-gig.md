# UC-031: Convert offer to gig

- **Status:** Approved (owner decisions 2026-10-07)
- **Phase:** 2
- **Primary actor:** Partner (UC-030: anonymous customer)
- **Business rules:** BR-105

## Goal
Turn a won offer into a gig in one click.

## Precondition
Offer is **accepted** (won) and its event date is today or later (BR-109). Otherwise no convert button.

## Main flow
1. Partner presses **Convert to gig#** in the offer list or on the offer page.
2. System opens a **small modal prefilled** from the offer (BR-105): start date, lineup name, venue, client, price, seller, producer — all editable. Other gig fields are edited later on the gig page. A yellow notice says **"Tarkista, että tiedot ovat oikein." / "Review that the information is correct."**
3. Partner reviews/edits and presses **Muuta keikaksi / Convert to gig**. System creates the gig from the modal values, links offer ↔ gig, sets disposition WON, logs both (gig `CREATED`, offer `CONVERTED`).
4. The button becomes a link to the gig ("Keikka →"); the gig page shows "From offer: <event>" linking back.

## Alternative flows
- **A1 – Cancel** closes the modal; nothing created.

## Error flows
- **E1 – Already converted** → 409, UI shows the gig link instead.

## Acceptance criteria
- [ ] AC-1: Gig fields per BR-105; gig counts in the year like any gig.
- [ ] AC-2: Offer disposition WON, status ACCEPTED, history entry.
- [ ] AC-3: Double-click/second request does not create a second gig.

## Change log
- 2026-10-22 – Only accepted offers with a future/today event date can be converted (owner) (PM)
- 2026-10-20 – Back to a simple modal (owner): prefilled editable key fields + yellow review notice instead of the full gig form (PM)
- 2026-10-20 – Convert opens an editable prefilled gig form with a review notice (owner) (PM)
- 2026-10-07 – First version (PM)
